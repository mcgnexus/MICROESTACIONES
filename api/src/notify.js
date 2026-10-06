// Cola de entrega de avisos, códigos y mensajes de lead.
//
// El motor de avisos solo encola; quien envía es `dispatchOutbox`, que reintenta
// con espera creciente y deja constancia del intento y del error. Los proveedores
// concretos viven en whatsapp.js y email.js; sin proveedor configurado el envío no
// se finge: queda pendiente y acaba en `failed`, visible en administración.
import { sql } from './db.js';
import { sendWhatsApp, whatsappProvider } from './whatsapp.js';
import { sendEmail, emailProvider } from './email.js';
import { isQuietHour, recipientWants } from './alert-preferences.js';

// Reexportados para quien consume la entrega desde un solo punto.
export { sendWhatsApp, whatsappProvider, sendEmail, emailProvider, isQuietHour, recipientWants };

export const MAX_ATTEMPTS = 5;
export const SENDING_TIMEOUT_MS = 5 * 60 * 1000;

export const METRIC_UNITS = {
  temperature: '°C', humidity: '%', pressure: 'hPa', battery: 'mV', lux: 'lx', connectivity: 's',
};

// Espera creciente: 30s, 60s, 120s, 240s, 480s… con tope de una hora.
export function backoffSeconds(attempts) {
  const exponent = Math.max(0, Number(attempts) || 0);
  return Math.min(3600, 30 * 2 ** exponent);
}

export function agingText(ageSeconds) {
  if (ageSeconds == null) return 'sin referencia de hora';
  if (ageSeconds < 60) return 'hace unos segundos';
  const minutes = Math.round(ageSeconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `hace ${hours} h` : `hace ${Math.round(hours / 24)} días`;
}

function formatDateTime(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid',
  }).format(date);
}

function formatValue(metric, value) {
  if (value == null) return null;
  const unit = METRIC_UNITS[metric] || '';
  const number = Number(value);
  if (!Number.isFinite(number)) return `${value} ${unit}`.trim();
  const digits = metric === 'battery' || metric === 'lux' ? 0 : 1;
  return `${number.toLocaleString('es-ES', { maximumFractionDigits: digits })} ${unit}`.trim();
}

// Mensaje para no técnicos: qué pasa, dónde y qué valor se midió. Sin jerga.
export function renderAlertMessage({ farmName, deviceName, metric, value, message, level, observedAt, ageSeconds }) {
  const headline = Number(level) === 1 ? 'ALERTA PRIORITARIA' : 'AVISO';
  const lines = [`${headline}: ${message}`];
  if (farmName) lines.push(`Finca: ${farmName}`);
  if (deviceName) lines.push(`Estación: ${deviceName}`);
  const formatted = formatValue(metric, value);
  if (formatted) lines.push(`Valor medido: ${formatted}`);
  const when = formatDateTime(observedAt);
  if (when) lines.push(`Momento: ${when} (${agingText(ageSeconds)})`);
  lines.push('');
  lines.push('Es un aviso orientativo, no oficial. Responde BAJA para dejar de recibirlos.');
  return { subject: `${headline}: ${message}`, body: lines.join('\n') };
}

export function renderVerificationMessage({ code, ttlMinutes = 10 }) {
  const body = [
    `Tu código de verificación de TecRural: ${code}`,
    `Caduca en ${ttlMinutes} minutos. Si no lo has pedido, ignora este mensaje.`,
  ].join('\n');
  return { subject: 'Código de verificación TecRural', body };
}

// Confirmación al visitante que deja sus datos: no hace falta crear cuenta.
export function renderLeadConfirmation({ name }) {
  const body = [
    `${name ? `${name}, ` : ''}hemos recibido tu solicitud de piloto de TecRural.`,
    '',
    'No necesitas crear ninguna cuenta todavía. Te contactaremos por WhatsApp o teléfono para conocer tu finca y explicarte los siguientes pasos.',
    '',
    'Si no has solicitado esto, puedes ignorar este mensaje.',
  ].join('\n');
  return { subject: 'Hemos recibido tu solicitud · TecRural', body };
}

// Aviso interno: resume la solicitud para que administración contacte al lead.
export function renderLeadNotice({ name, phone, email, activity, zone, interest, notes }) {
  const lines = [
    'Nueva solicitud de piloto en la web.',
    '',
    `Nombre: ${name}`,
    `Teléfono: ${phone}`,
    email ? `Email: ${email}` : null,
    activity ? `Actividad: ${activity}` : null,
    zone ? `Zona: ${zone}` : null,
    interest ? `Interés principal: ${interest}` : null,
    notes ? `Notas: ${notes}` : null,
  ].filter(Boolean);
  return { subject: `Nueva solicitud de piloto · ${name}`, body: lines.join('\n') };
}

// Encola la confirmación al visitante (si dejó email) y el aviso interno, que va
// a los administradores activos y, si se configura, también a ADMIN_NOTICE_EMAIL.
// Nunca bloquea el guardado del lead: quien la llama decide cómo tratar el fallo.
export async function enqueueLeadMessages(client, lead, env = process.env) {
  let queued = 0;
  if (lead.email) {
    const { subject, body } = renderLeadConfirmation({ name: lead.name });
    await client`INSERT INTO notification_outbox (kind, channel, address, subject, body)
      VALUES ('lead_confirmation', 'email', ${lead.email}, ${subject}, ${body})`;
    queued += 1;
  }
  const [admins, extra] = await Promise.all([
    client`SELECT email FROM subscribers WHERE role = 'admin' AND active`,
    Promise.resolve(env.ADMIN_NOTICE_EMAIL ? [env.ADMIN_NOTICE_EMAIL] : []),
  ]);
  const addresses = new Set([...admins.map((row) => row.email).filter(Boolean), ...extra]);
  if (addresses.size) {
    const { subject, body } = renderLeadNotice(lead);
    for (const address of addresses) {
      await client`INSERT INTO notification_outbox (kind, channel, address, subject, body)
        VALUES ('lead_notice', 'email', ${address}, ${subject}, ${body})`;
      queued += 1;
    }
  }
  return queued;
}

// ---- Destinatarios y cola --------------------------------------------------

// Contactos verificados y autorizados de las estaciones del dispositivo, ya sea
// por acceso directo o por finca, filtrados por las preferencias del suscriptor.
export async function recipientsForDevice(client, deviceId, { category = 'general', level = 2, at = new Date() } = {}) {
  const rows = await client`SELECT sc.subscriber_id, sc.channel, sc.address,
      p.receive_frost, p.receive_heat, p.receive_storm, p.receive_wind, p.receive_humidity,
      p.receive_general, p.channel_whatsapp, p.channel_email, p.quiet_start, p.quiet_end
    FROM subscriber_contacts sc
    JOIN subscribers s ON s.id = sc.subscriber_id AND s.active
    LEFT JOIN alert_preferences p ON p.subscriber_id = sc.subscriber_id
    WHERE sc.opted_in_at IS NOT NULL AND sc.opted_out_at IS NULL AND sc.verified_at IS NOT NULL
      AND sc.subscriber_id IN (
        SELECT subscriber_id FROM subscriber_devices WHERE device_id = ${deviceId}
        UNION
        SELECT f.subscriber_id FROM farm_devices fd JOIN farms f ON f.id = fd.farm_id WHERE fd.device_id = ${deviceId}
      )`;
  return rows.filter((row) => recipientWants(row, category, level, at))
    .map((row) => ({ subscriberId: row.subscriberId, channel: row.channel, address: row.address }));
}

// Encola un aviso para todos sus destinatarios. Devuelve cuántos se encolaron.
export async function enqueueAlertNotifications(client, {
  alertId, deviceId, metric, value, message, level, category = 'general', observedAt, ageSeconds,
}) {
  const recipients = await recipientsForDevice(client, deviceId, { category, level, at: new Date() });
  if (!recipients.length) return 0;
  const [device] = await client`SELECT d.name,
      (SELECT f.name FROM farm_devices fd JOIN farms f ON f.id = fd.farm_id
        WHERE fd.device_id = d.id ORDER BY f.name LIMIT 1) AS farm_name
    FROM devices d WHERE d.id = ${deviceId}`;
  for (const recipient of recipients) {
    const { subject, body } = renderAlertMessage({
      farmName: device?.farmName ?? null, deviceName: device?.name ?? null,
      metric, value, message, level, observedAt, ageSeconds,
    });
    await client`INSERT INTO notification_outbox
      (kind, alert_id, subscriber_id, channel, address, subject, body)
      VALUES ('alert', ${alertId}, ${recipient.subscriberId}, ${recipient.channel}, ${recipient.address}, ${subject}, ${body})`;
  }
  await client`UPDATE alerts SET channel = ${recipients[0].channel} WHERE id = ${alertId}`;
  return recipients.length;
}

export async function enqueueVerificationCode(client, { verificationId, subscriberId, channel, address, code, ttlMinutes }) {
  const { subject, body } = renderVerificationMessage({ code, ttlMinutes });
  await client`INSERT INTO notification_outbox
    (kind, contact_verification_id, subscriber_id, channel, address, subject, body)
    VALUES ('contact_verification', ${verificationId}, ${subscriberId}, ${channel}, ${address}, ${subject}, ${body})`;
  return true;
}

// Toma los envíos vencidos, intenta enviarlos y reintenta con espera creciente.
export async function dispatchOutbox({ client = sql, limit = 20, now = new Date() } = {}) {
  const staleBefore = new Date(now.getTime() - SENDING_TIMEOUT_MS);
  const claimed = await client`UPDATE notification_outbox SET status = 'sending', updated_at = now()
    WHERE id IN (
      SELECT id FROM notification_outbox
      WHERE (status = 'pending' AND next_attempt_at <= ${now})
         OR (status = 'sending' AND updated_at <= ${staleBefore})
      ORDER BY next_attempt_at LIMIT ${limit}
    )
    RETURNING id, channel, address, subject, body, attempts, alert_id`;
  let sent = 0;
  let failed = 0;
  let manual = 0;
  for (const row of claimed) {
    const result = row.channel === 'whatsapp'
      ? await sendWhatsApp(row.address, row.body)
      : await sendEmail(row.address, row.subject, row.body);
    if (result.manual) {
      // Se aparta de la cola automática: aparece en la bandeja de envíos manuales.
      manual += 1;
      await client`UPDATE notification_outbox SET status = 'manual', updated_at = now(),
          last_error = 'envío manual pendiente' WHERE id = ${row.id}`;
      continue;
    }
    if (result.ok) {
      sent += 1;
      await client`UPDATE notification_outbox SET status = 'sent', sent_at = now(), updated_at = now(),
          provider_message_id = ${result.messageId ?? null}, last_error = null WHERE id = ${row.id}`;
      if (row.alertId) {
        await client`UPDATE alerts SET delivery_status = 'delivered', delivered_at = now() WHERE id = ${row.alertId}`;
      }
      continue;
    }
    const attempts = row.attempts + 1;
    if (result.permanent || attempts >= MAX_ATTEMPTS) {
      failed += 1;
      await client`UPDATE notification_outbox SET status = 'failed', attempts = ${attempts},
          updated_at = now(), last_error = ${result.error ?? 'send_failed'} WHERE id = ${row.id}`;
      if (row.alertId) {
        await client`UPDATE alerts SET delivery_status = 'failed'
          WHERE id = ${row.alertId} AND delivery_status <> 'delivered'`;
      }
    } else {
      const next = new Date(now.getTime() + backoffSeconds(attempts) * 1000);
      await client`UPDATE notification_outbox SET status = 'pending', attempts = ${attempts},
          next_attempt_at = ${next}, updated_at = now(), last_error = ${result.error ?? 'send_failed'}
        WHERE id = ${row.id}`;
    }
  }
  return { processed: claimed.length, sent, failed, manual };
}

// Procesa un mensaje entrante de WhatsApp: "BAJA"/"STOP" revoca el consentimiento
// de ese contacto. Se usa desde el webhook del proveedor.
export async function handleInboundWhatsApp(client, fromAddress, text) {
  const target = String(fromAddress || '').replace(/[^\d]/g, '');
  const command = String(text || '').trim().toUpperCase();
  if (!/^(BAJA|STOP|CANCELAR|ALTA_CANCELADA)$/.test(command)) return { action: 'ignored' };
  // Se comparan solo los dígitos: da igual que el número se guarde con o sin "+".
  const rows = await client`UPDATE subscriber_contacts SET opted_in_at = null, opted_out_at = now(), updated_at = now()
    WHERE channel = 'whatsapp' AND regexp_replace(address, '[^0-9]', '', 'g') = ${target}
    RETURNING id`;
  return { action: 'opted_out', affected: rows.length };
}
