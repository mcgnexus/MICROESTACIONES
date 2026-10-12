// Cola de entrega de avisos, códigos y mensajes de lead.
//
// El motor de avisos solo encola; quien envía es `dispatchOutbox`, que reintenta
// con espera creciente y deja constancia del intento y del error. Los proveedores
// concretos viven en whatsapp.js y email.js; sin proveedor configurado el envío no
// se finge: queda pendiente y acaba en `failed`, visible en administración.
import { timingSafeEqual } from 'node:crypto';
import { sql } from './db.js';
import { sendWhatsApp, whatsappProvider, whatsappRequiresTemplate } from './whatsapp.js';
import { sendEmail, emailProvider } from './email.js';
import { whatsappTemplate, templateCategory } from './message-templates.js';
import { isQuietHour, recipientWants } from './alert-preferences.js';
import { COMMERCIAL_KIND, hasCommercialConsent, revokeCommercialConsent } from './consent.js';
import { messageExpiresAt, messageTtlMinutes, isExpired } from './message-ttl.js';
import { sha256 } from './security.js';
// La misma taxonomía que usa la pantalla: el mensaje describe un aviso con sus
// cinco datos (categoría, fuente, fecha, estado y vigencia) y su naturaleza.
import { classifyNotice, validityText } from '../public/js/notice-taxonomy.js';

// Reexportados para quien consume la entrega desde un solo punto.
export { sendWhatsApp, whatsappProvider, sendEmail, emailProvider, isQuietHour, recipientWants };

export const MAX_ATTEMPTS = 5;
// Supera el peor caso del lote local (20 × 15 s + escritura en Neon) para no
// robar un reclamo a un trabajador que aún puede terminar.
export const SENDING_TIMEOUT_MS = 10 * 60 * 1000;

// ---- Caducidad de los mensajes ---------------------------------------------
// Vive en su propio módulo para que consent.js también pueda encolar con
// vigencia sin crear un ciclo de importaciones. Se reexporta aquí.
export { messageExpiresAt, messageTtlMinutes, isExpired };

// Identidad del trabajador que reclama filas de la cola. Permite recuperar los
// reclamos de un proceso que murió sin soltarlos.
export function outboxWorkerId(prefix = 'outbox') {
  return `${prefix}:${process.pid}:${Math.random().toString(36).slice(2, 10)}`;
}

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

// Mensaje para no técnicos: qué pasa, dónde, qué valor se midió y de qué clase
// de afirmación se trata (real, previsto, calculado o simulado). Sin jerga y sin
// promesas: siempre cita el dato o la previsión que origina el aviso.
export function renderAlertMessage({
  farmName, deviceName, metric, value, message, level, observedAt, ageSeconds,
  source = 'station_measurement', category = 'general', ruleSnapshot = null, ruleId = null,
}) {
  const headline = Number(level) === 1 ? 'ALERTA PRIORITARIA' : 'AVISO';
  const meta = classifyNotice({ source, category, ruleSnapshot, ruleId, observedAt, value });
  const lines = [`${headline}: ${message}`];
  if (farmName) lines.push(`Finca: ${farmName}`);
  if (deviceName) lines.push(`Estación: ${deviceName}`);
  const formatted = formatValue(metric, value);
  if (formatted) lines.push(`Valor medido: ${formatted}`);
  const when = formatDateTime(observedAt);
  if (when) lines.push(`Momento: ${when} (${agingText(ageSeconds)})`);
  lines.push(`Origen: ${meta.sourceLabel} · Tipo: ${meta.natureLabel}`);
  lines.push(`Categoría: ${meta.categoryLabel}`);
  lines.push(`Vigencia: ${validityText(meta.category)}`);
  lines.push('');
  lines.push('Es un aviso orientativo, no oficial. Responde BAJA para dejar de recibirlos.');
  return { subject: `${headline}: ${message}`, body: lines.join('\n') };
}

export function renderVerificationMessage({ code, ttlMinutes = 10 }) {
  const body = [
    `Tu código de verificación de TecRural: ${code}`,
    `Caduca en ${ttlMinutes} minutos. Si no lo has pedido, ignora este mensaje.`,
    'Es una comunicación necesaria para verificar tu contacto: no es un aviso meteorológico ni una novedad comercial.',
  ].join('\n');
  return { subject: 'Código de verificación TecRural', body };
}

// Confirmación al visitante que deja sus datos: no hace falta crear cuenta.
export function renderLeadConfirmation({ name }) {
  const body = [
    `${name ? `${name}, ` : ''}hemos recibido tu solicitud en TecRural.`,
    '',
    'No necesitas crear ninguna cuenta todavía. Te contactaremos por el canal que hayas elegido para conocer tu finca y explicarte los siguientes pasos.',
    '',
    'Si no has solicitado esto, puedes ignorar este mensaje.',
  ].join('\n');
  return { subject: 'Hemos recibido tu solicitud · TecRural', body };
}

// Aviso interno: resume la solicitud para que administración contacte al lead.
// El contacto puede ser solo email o solo WhatsApp: cada línea aparece si hay dato.
export function renderLeadNotice({ name, preferred_channel, request_type, phone, email, activity, zone, interest, notes }) {
  const CHANNEL_LABELS = { email: 'Email', whatsapp: 'WhatsApp' };
  const REQUEST_LABELS = { installation_info: 'Consulta de instalación', pilot: 'Entrada en el piloto' };
  const lines = [
    'Nueva solicitud en la web.',
    '',
    `Nombre: ${name}`,
    request_type ? `Modalidad: ${REQUEST_LABELS[request_type] || request_type}` : null,
    preferred_channel ? `Canal preferido: ${CHANNEL_LABELS[preferred_channel] || preferred_channel}` : null,
    phone ? `Teléfono (WhatsApp): ${phone}` : null,
    email ? `Email: ${email}` : null,
    zone ? `Municipio: ${zone}` : null,
    activity ? `Actividad: ${activity}` : null,
    interest ? `Interés principal: ${interest}` : null,
    notes ? `Notas: ${notes}` : null,
  ].filter(Boolean);
  return { subject: `Nueva solicitud · ${name}`, body: lines.join('\n') };
}

// Encola la confirmación al visitante (si dejó email) y el aviso interno, que va
// a los administradores activos y, si se configura, también a ADMIN_NOTICE_EMAIL.
// Nunca bloquea el guardado del lead: quien la llama decide cómo tratar el fallo.
export async function enqueueLeadMessages(client, lead, env = process.env) {
  let queued = 0;
  if (lead.email) {
    const { subject, body } = renderLeadConfirmation({ name: lead.name });
    await client`INSERT INTO notification_outbox (kind, channel, address, subject, body, expires_at)
      VALUES ('lead_confirmation', 'email', ${lead.email}, ${subject}, ${body},
        ${messageExpiresAt('lead_confirmation', env)})`;
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
      await client`INSERT INTO notification_outbox (kind, channel, address, subject, body, expires_at)
        VALUES ('lead_notice', 'email', ${address}, ${subject}, ${body},
          ${messageExpiresAt('lead_notice', env)})`;
      queued += 1;
    }
  }
  return queued;
}

// ---- Destinatarios y cola --------------------------------------------------

// Contactos verificados y autorizados de las estaciones del dispositivo, ya sea
// por acceso directo o por finca, filtrados por las preferencias del suscriptor.
export async function recipientsForDevice(client, deviceId, { category = 'general', level = 2, at = new Date() } = {}) {
  // Dos audiencias sobre la misma estación: privado (acceso a estación/finca,
  // categorías de `alert_preferences`) y público (suscripción explícita a una
  // estación habilitada, con sus propias categorías y canal). Consultar datos o
  // gráficos no crea ninguna de las dos filas.
  const rows = await client`SELECT sc.subscriber_id, sc.channel, sc.address,
      p.receive_frost, p.receive_heat, p.receive_storm, p.receive_wind, p.receive_humidity,
      p.receive_general, p.channel_whatsapp, p.channel_email, p.quiet_start, p.quiet_end,
      NULL::text[] AS public_categories
    FROM subscriber_contacts sc
    JOIN subscribers s ON s.id = sc.subscriber_id AND s.active
    LEFT JOIN alert_preferences p ON p.subscriber_id = sc.subscriber_id
    WHERE sc.opted_in_at IS NOT NULL AND sc.opted_out_at IS NULL AND sc.verified_at IS NOT NULL
      AND sc.subscriber_id IN (
        SELECT subscriber_id FROM subscriber_devices WHERE device_id = ${deviceId}
        UNION
        SELECT f.subscriber_id FROM farm_devices fd JOIN farms f ON f.id = fd.farm_id WHERE fd.device_id = ${deviceId}
      )
    UNION ALL
    SELECT sc.subscriber_id, sc.channel, sc.address,
      p.receive_frost, p.receive_heat, p.receive_storm, p.receive_wind, p.receive_humidity,
      p.receive_general, p.channel_whatsapp, p.channel_email, p.quiet_start, p.quiet_end,
      pas.categories AS public_categories
    FROM public_alert_subscriptions pas
    JOIN devices d ON d.id = pas.device_id AND d.active AND d.public_alerts_enabled
    JOIN subscribers s ON s.id = pas.subscriber_id AND s.active
    JOIN subscriber_contacts sc ON sc.subscriber_id = pas.subscriber_id AND sc.channel = pas.channel
    LEFT JOIN alert_preferences p ON p.subscriber_id = pas.subscriber_id
    WHERE pas.unsubscribed_at IS NULL
      AND sc.opted_in_at IS NOT NULL AND sc.opted_out_at IS NULL AND sc.verified_at IS NOT NULL
    UNION ALL
    -- Identidad de servicio solo por WhatsApp: sin cuenta, sin contactos de
    -- cuenta. El destinatario es el propio teléfono verificado.
    SELECT NULL::bigint AS subscriber_id, 'whatsapp' AS channel, pas.wa_phone AS address,
      NULL::boolean, NULL::boolean, NULL::boolean, NULL::boolean, NULL::boolean,
      NULL::boolean, NULL::boolean, NULL::boolean, NULL::text, NULL::text,
      pas.categories AS public_categories
    FROM public_alert_subscriptions pas
    JOIN devices d ON d.id = pas.device_id AND d.active AND d.public_alerts_enabled
    JOIN wa_alert_identities w ON w.phone = pas.wa_phone
    WHERE pas.unsubscribed_at IS NULL
      AND w.verified_at IS NOT NULL AND w.opted_out_at IS NULL`;

  // Si el mismo suscriptor+canal entra por privado y por público, gana el privado:
  // una fila por destinatario, nunca dos envíos del mismo aviso.
  const deduped = rows.filter((row) => {
    if (row.publicCategories == null) return true;
    return !rows.some((other) => other.publicCategories == null
      && other.subscriberId === row.subscriberId && other.channel === row.channel);
  });

  return deduped
    .filter((row) => {
      if (row.publicCategories != null) {
        // La suscripción pública manda sus propias categorías; solo se respetan
        // el horario silencioso y el nivel prioritario de las preferencias.
        if (!Array.isArray(row.publicCategories) || !row.publicCategories.includes(category)) return false;
        if (Number(level) !== 1 && isQuietHour(row.quietStart ?? row.quiet_start, row.quietEnd ?? row.quiet_end, at)) return false;
        return true;
      }
      return recipientWants(row, category, level, at);
    })
    .map((row) => ({
      subscriberId: row.subscriberId,
      channel: row.channel,
      address: row.address,
      audience: row.publicCategories != null ? 'public' : 'private',
    }));
}

// Encola un aviso para todos sus destinatarios. Devuelve cuántos se encolaron.
export async function enqueueAlertNotifications(client, {
  alertId, deviceId, metric, value, message, level, category = 'general', observedAt, ageSeconds,
  source = 'station_measurement', ruleId = null,
}) {
  const recipients = await recipientsForDevice(client, deviceId, { category, level, at: new Date() });
  if (!recipients.length) return 0;
  const [device] = await client`SELECT d.name,
      (SELECT f.name FROM farm_devices fd JOIN farms f ON f.id = fd.farm_id
        WHERE fd.device_id = d.id ORDER BY f.name LIMIT 1) AS farm_name
    FROM devices d WHERE d.id = ${deviceId}`;
  // Parámetros de la plantilla de aviso: el mismo contenido que el mensaje largo,
  // ordenado como la plantilla aprobada (título, finca, estación, valor, momento).
  const alertParams = [
    `${Number(level) === 1 ? 'ALERTA PRIORITARIA' : 'AVISO'}: ${message}`,
    device?.farmName ?? 'Sin finca',
    device?.name ?? 'Sin estación',
    formatValue(metric, value) ?? 'Sin valor',
    formatDateTime(observedAt) ?? 'Sin referencia de hora',
  ];
  for (const recipient of recipients) {
    const { subject, body } = renderAlertMessage({
      farmName: device?.farmName ?? null, deviceName: device?.name ?? null,
      metric, value, message, level, observedAt, ageSeconds, source, category, ruleId,
    });
    const template = recipient.channel === 'whatsapp'
      ? whatsappTemplate('alert', { params: alertParams }) : null;
    await client`INSERT INTO notification_outbox
      (kind, alert_id, subscriber_id, channel, address, subject, body, expires_at, audience,
        template_name, template_language, template_params)
      VALUES ('alert', ${alertId}, ${recipient.subscriberId}, ${recipient.channel}, ${recipient.address}, ${subject}, ${body},
        ${messageExpiresAt('alert')}, ${recipient.audience},
        ${template?.name ?? null}, ${template?.language ?? null},
        ${template ? JSON.stringify(template.params) : null}::jsonb)`;
  }
  await client`UPDATE alerts SET channel = ${recipients[0].channel} WHERE id = ${alertId}`;
  return recipients.length;
}

export async function enqueueVerificationCode(client, { verificationId, subscriberId, channel, address, code, ttlMinutes, env = process.env }) {
  const { subject, body } = renderVerificationMessage({ code, ttlMinutes });
  const expiresAt = Number(ttlMinutes) > 0
    ? new Date(Date.now() + Number(ttlMinutes) * 60 * 1000)
    : messageExpiresAt('contact_verification', env);
  // Por WhatsApp el código viaja como parámetro de una plantilla de
  // autenticación; el cuerpo de texto queda solo para el envío manual y el correo.
  const template = channel === 'whatsapp' ? whatsappTemplate('contact_verification', { env, params: [code] }) : null;
  await client`INSERT INTO notification_outbox
    (kind, contact_verification_id, subscriber_id, channel, address, subject, body, expires_at,
      template_name, template_language, template_params)
    VALUES ('contact_verification', ${verificationId}, ${subscriberId}, ${channel}, ${address}, ${subject}, ${body},
      ${expiresAt}, ${template?.name ?? null}, ${template?.language ?? null}, ${template ? JSON.stringify(template.params) : null}::jsonb)`;
  return true;
}

// ---- Reclamo exclusivo de la cola -------------------------------------------
// `FOR UPDATE SKIP LOCKED` más `claimed_by`: dos trabajadores que corran a la vez
// no reciben la misma fila. Un reclamo que supera el tiempo máximo NO se reenvía
// a ciegas: se marca fallido por resultado ambiguo. Un webhook tardío aún puede
// resolverlo a delivered; un operador puede revisarlo sin crear duplicados.
async function expireQueuedMessages(client, now) {
  return client`UPDATE notification_outbox
      SET status = 'expired', last_error = 'caducado', updated_at = ${now},
          claimed_by = NULL, claimed_at = NULL
    WHERE expires_at IS NOT NULL AND expires_at <= ${now}
      AND status IN ('pending','manual')
    RETURNING id, alert_id`;
}

async function failAbandonedClaims(client, now) {
  const staleBefore = new Date(now.getTime() - SENDING_TIMEOUT_MS);
  return client`UPDATE notification_outbox
      SET status = 'failed', last_error = 'reclamo vencido; aceptación del proveedor incierta',
          updated_at = ${now}, claimed_by = NULL, claimed_at = NULL
    WHERE status = 'sending' AND coalesce(claimed_at, updated_at) <= ${staleBefore}
    RETURNING id, alert_id`;
}

export async function claimOutboxMessages({
  client = sql, limit = 20, now = new Date(), workerId = outboxWorkerId(),
} = {}) {
  limit = Math.max(1, Math.min(100, Number.parseInt(limit, 10) || 20));
  return client`
    WITH claimed AS (
      SELECT id FROM notification_outbox
      WHERE (status = 'pending' AND next_attempt_at <= ${now})
        AND (expires_at IS NULL OR expires_at > ${now})
      -- Primero lo que antes caduca: el código de verificación (10 min) sale por
      -- delante del aviso (4 h) sin reglas fijas que envejezcan mal con nuevos
      -- tipos de mensaje. A igualdad de caducidad, prioridad de tipo.
      ORDER BY expires_at ASC NULLS LAST,
        CASE kind
          WHEN 'contact_verification' THEN 0
          WHEN 'alert' THEN 1
          WHEN 'commercial' THEN 3
          ELSE 2 END,
        next_attempt_at
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE notification_outbox o
      SET status = 'sending', claimed_by = ${workerId}, claimed_at = ${now}, updated_at = ${now}
      FROM claimed
      WHERE o.id = claimed.id
    RETURNING o.id, o.kind, o.channel, o.address, o.subject, o.body, o.attempts,
              o.alert_id, o.subscriber_id, o.lead_id, o.contact_verification_id, o.audience,
              o.template_name, o.template_language, o.template_params,
              o.expires_at, o.claimed_by`;
}

// Revalidación previa al envío: consentimiento vigente para la publicidad y
// contacto autorizado y verificado para los avisos. Lo que ya no está vigente se
// aparta; no se envía nada revocado.
async function deliveryGate(client, row) {
  if (row.kind === COMMERCIAL_KIND) {
    const authorized = await hasCommercialConsent(client, {
      subscriberId: row.subscriberId ?? null, leadId: row.leadId ?? null, channel: row.channel,
    });
    return authorized
      ? { ok: true }
      : { ok: false, status: 'cancelled', reason: 'consentimiento revocado', alertState: 'failed' };
  }
  if (row.kind === 'alert') return alertRecipientAllowed(client, row);
  if (row.kind === 'contact_verification') return verificationStillValid(client, row);
  return { ok: true };
}

async function verificationStillValid(client, row) {
  if (row.contactVerificationId == null || row.subscriberId == null) {
    return { ok: false, status: 'cancelled', reason: 'verificación inexistente' };
  }
  // Los contactos y las direcciones de cola están en E.164: se comparan tal cual.
  const sameAddress = row.channel === 'whatsapp'
    ? sql`sc.address = ${row.address}`
    : sql`lower(sc.address) = ${String(row.address).toLowerCase()}`;
  const [active] = await client`
    SELECT 1 AS ok
    FROM contact_verifications cv
    JOIN subscriber_contacts sc ON sc.id = cv.contact_id
    JOIN subscribers s ON s.id = sc.subscriber_id AND s.active
    WHERE cv.id = ${row.contactVerificationId}
      AND cv.consumed_at IS NULL AND cv.expires_at > now()
      AND sc.subscriber_id = ${row.subscriberId}
      AND sc.channel = ${row.channel} AND ${sameAddress}
      AND sc.opted_out_at IS NULL`;
  return active.length
    ? { ok: true }
    : { ok: false, status: 'cancelled', reason: 'código de verificación consumido o caducado' };
}

async function alertRecipientAllowed(client, row) {
  // Suscripción pública solo por WhatsApp: sin suscriptor de cuenta, el sujeto
  // es la identidad del teléfono.
  if (row.audience === 'public' && row.subscriberId == null) {
    const [sub] = await client`
      SELECT pas.unsubscribed_at, w.verified_at, w.opted_out_at, d.public_alerts_enabled, d.active
      FROM public_alert_subscriptions pas
      JOIN devices d ON d.id = pas.device_id
      JOIN wa_alert_identities w ON w.phone = pas.wa_phone
      WHERE pas.wa_phone = ${row.address}
        AND pas.device_id = (SELECT device_id FROM alerts WHERE id = ${row.alertId})`;
    if (!sub || sub.unsubscribedAt) return { ok: false, status: 'cancelled', reason: 'suscripción revocada', alertState: 'failed' };
    if (!sub.verifiedAt) return { ok: false, status: 'cancelled', reason: 'teléfono sin verificar', alertState: 'failed' };
    if (sub.optedOutAt) return { ok: false, status: 'cancelled', reason: 'baja por WhatsApp', alertState: 'failed' };
    if (!sub.publicAlertsEnabled || !sub.active) return { ok: false, status: 'cancelled', reason: 'estación sin avisos públicos', alertState: 'failed' };
    return { ok: true };
  }
  if (row.subscriberId == null) {
    return { ok: false, status: 'cancelled', reason: 'sin suscriptor', alertState: 'failed' };
  }
  const sameAddress = row.channel === 'whatsapp'
    ? sql`sc.address = ${row.address}`
    : sql`lower(sc.address) = ${String(row.address).toLowerCase()}`;
  const [state] = await client`
    SELECT s.active AS subscriber_active,
           (sc.opted_in_at IS NOT NULL AND sc.opted_out_at IS NULL AND sc.verified_at IS NOT NULL) AS contact_ok
    FROM subscribers s
    LEFT JOIN subscriber_contacts sc
      ON sc.subscriber_id = s.id AND sc.channel = ${row.channel} AND ${sameAddress}
    WHERE s.id = ${row.subscriberId}
    LIMIT 1`;
  if (!state) return { ok: false, status: 'cancelled', reason: 'suscriptor eliminado', alertState: 'failed' };
  if (!state.subscriberActive) return { ok: false, status: 'cancelled', reason: 'suscriptor inactivo', alertState: 'failed' };
  if (!state.contactOk) return { ok: false, status: 'cancelled', reason: 'contacto revocado', alertState: 'failed' };
  // Suscripción pública: además, que siga activa y la estación habilitada hoy.
  if (row.audience === 'public') {
    const [sub] = await client`
      SELECT pas.unsubscribed_at, d.public_alerts_enabled, d.active
      FROM public_alert_subscriptions pas
      JOIN devices d ON d.id = pas.device_id
      WHERE pas.subscriber_id = ${row.subscriberId} AND pas.channel = ${row.channel}
        AND pas.device_id = (SELECT device_id FROM alerts WHERE id = ${row.alertId})`;
    if (!sub || sub.unsubscribedAt) return { ok: false, status: 'cancelled', reason: 'suscripción revocada', alertState: 'failed' };
    if (!sub.publicAlertsEnabled || !sub.active) return { ok: false, status: 'cancelled', reason: 'estación sin avisos públicos', alertState: 'failed' };
  }
  return { ok: true };
}

// Baja de una suscripción pública: aparta los avisos pendientes de esa estación
// que ya no están autorizados, sin tocar los privados del mismo suscriptor.
// Por cuenta (`subscriberId` + estación) o por teléfono (identidad wa).
export async function cancelPendingPublicAlerts(client, { subscriberId = null, deviceId = null, phone = null }) {
  const rows = await client`UPDATE notification_outbox o
      SET status = 'cancelled', last_error = 'suscripción revocada', updated_at = now(),
          claimed_by = NULL, claimed_at = NULL
    WHERE o.kind = 'alert' AND o.audience = 'public'
      AND o.status IN ('pending', 'manual')
      AND (${subscriberId}::bigint IS NOT NULL AND o.subscriber_id = ${subscriberId}
        OR ${phone}::text IS NOT NULL
          AND o.subscriber_id IS NULL
          AND regexp_replace(o.address, '[^0-9]', '', 'g') = regexp_replace(${phone}, '[^0-9]', '', 'g'))
      AND (${deviceId}::text IS NULL OR o.alert_id IN (SELECT id FROM alerts WHERE device_id = ${deviceId}))
    RETURNING o.id, o.alert_id`;
  for (const row of rows) {
    await writeAlertDelivery(client, { alertId: row.alertId, state: 'failed' });
  }
  return rows.length;
}

// Hash del código de verificación de una identidad wa: ata el código al teléfono,
// igual que el de contacto se ata a la fila de contacto.
export function waVerificationHash(phone, code) {
  return sha256(`wa-otp:${phone}:${code}`);
}

// Cada transición se escribe con su estado en texto fijo: los operadores y las
// pruebas leen `status = 'sent'` sin depender de parámetros. Salir del estado
// `sending` suelta siempre el reclamo del trabajador.
async function writeOutboxStatus(client, {
  id, status, now, workerId, reason = null, attempts = null, nextAttemptAt = null, messageId = null, providerDetail = null,
}) {
  const detailJson = providerDetail ? JSON.stringify(providerDetail) : null;
  if (status === 'sent') {
    const rows = await client`UPDATE notification_outbox SET status = 'sent', sent_at = ${now},
        provider_message_id = ${messageId}, last_error = NULL, provider_detail = NULL,
        claimed_by = NULL, claimed_at = NULL, updated_at = ${now}
      WHERE id = ${id} AND status = 'sending' AND claimed_by = ${workerId} RETURNING id`;
    return rows.length > 0;
  } else if (status === 'manual') {
    const rows = await client`UPDATE notification_outbox SET status = 'manual', last_error = ${reason ?? 'envío manual pendiente'},
        provider_detail = ${detailJson}::jsonb,
        claimed_by = NULL, claimed_at = NULL, updated_at = ${now}
      WHERE id = ${id} AND status = 'sending' AND claimed_by = ${workerId} RETURNING id`;
    return rows.length > 0;
  } else if (status === 'failed') {
    const rows = await client`UPDATE notification_outbox SET status = 'failed', attempts = ${attempts}, last_error = ${reason},
        provider_detail = ${detailJson}::jsonb,
        claimed_by = NULL, claimed_at = NULL, updated_at = ${now}
      WHERE id = ${id} AND status = 'sending' AND claimed_by = ${workerId} RETURNING id`;
    return rows.length > 0;
  } else if (status === 'expired') {
    const rows = await client`UPDATE notification_outbox SET status = 'expired', last_error = 'caducado',
        claimed_by = NULL, claimed_at = NULL, updated_at = ${now}
      WHERE id = ${id} AND status = 'sending' AND claimed_by = ${workerId} RETURNING id`;
    return rows.length > 0;
  } else if (status === 'cancelled') {
    const rows = await client`UPDATE notification_outbox SET status = 'cancelled', last_error = ${reason},
        claimed_by = NULL, claimed_at = NULL, updated_at = ${now}
      WHERE id = ${id} AND status = 'sending' AND claimed_by = ${workerId} RETURNING id`;
    return rows.length > 0;
  } else {
    const rows = await client`UPDATE notification_outbox SET status = 'pending', attempts = ${attempts},
        next_attempt_at = ${nextAttemptAt}, last_error = ${reason},
        provider_detail = ${detailJson}::jsonb,
        claimed_by = NULL, claimed_at = NULL, updated_at = ${now}
      WHERE id = ${id} AND status = 'sending' AND claimed_by = ${workerId} RETURNING id`;
    return rows.length > 0;
  }
}

async function inTransaction(client, action) {
  return typeof client.begin === 'function' ? client.begin(action) : action(client);
}

// El estado del AVISO sigue al del mensaje, con una salvedad: `delivered` solo
// lo pone el proveedor por webhook. Aceptar la llamada es `sent`, no `delivered`.
async function writeAlertDelivery(client, { alertId, state, now = new Date() }) {
  if (!alertId) return;
  if (state === 'sent') {
    await client`UPDATE alerts SET delivery_status = 'sent' WHERE id = ${alertId}
      AND delivery_status IN ('pending', 'sent')`;
  } else if (state === 'delivered') {
    await client`UPDATE alerts SET delivery_status = 'delivered', delivered_at = ${now} WHERE id = ${alertId}`;
  } else if (state === 'failed') {
    await client`UPDATE alerts SET delivery_status = 'failed'
      WHERE id = ${alertId} AND delivery_status NOT IN ('delivered', 'bounced')`;
  }
}

// Toma los envíos vencidos, comprueba vigencia y consentimiento, intenta
// enviarlos y reintenta con espera creciente. Nunca envía dos veces la misma
// fila ni un mensaje caducado o revocado.
export async function dispatchOutbox({
  client = sql, limit = 20, now = new Date(), workerId = outboxWorkerId(), env = process.env,
} = {}) {
  const counts = { processed: 0, sent: 0, failed: 0, manual: 0, cancelled: 0, expired: 0 };

  // Barre caducados y reclamos abandonados antes de tomar filas nuevas. Un
  // reclamo cuyo resultado externo sea incierto se marca failed y NO se vuelve
  // a enviar automáticamente: esa decisión evita duplicados tras un crash.
  const expiredRows = await expireQueuedMessages(client, now);
  counts.expired += expiredRows.length;
  const abandonedRows = await failAbandonedClaims(client, now);
  counts.failed += abandonedRows.length;
  for (const row of [...expiredRows, ...abandonedRows]) {
    await writeAlertDelivery(client, { alertId: row.alertId, state: 'failed' });
  }

  const claimed = await claimOutboxMessages({ client, limit, now, workerId });
  counts.processed = claimed.length;
  for (const row of claimed) {
    // 1) Caducidad: un aviso o un código viejo ya no se envía.
    if (isExpired(row.expiresAt, now)) {
      counts.expired += 1;
      await inTransaction(client, async (tx) => {
        const updated = await writeOutboxStatus(tx, {
          id: row.id, status: 'expired', now, workerId: row.claimedBy,
        });
        if (updated) await writeAlertDelivery(tx, { alertId: row.alertId, state: 'failed' });
      });
      continue;
    }
    // 2) Vigencia del consentimiento y del contacto.
    const gate = await deliveryGate(client, row);
    if (!gate.ok) {
      counts[gate.status] = (counts[gate.status] ?? 0) + 1;
      await inTransaction(client, async (tx) => {
        const updated = await writeOutboxStatus(tx, {
          id: row.id, status: gate.status, now, workerId: row.claimedBy, reason: gate.reason,
        });
        if (updated) await writeAlertDelivery(tx, { alertId: row.alertId, state: gate.alertState ?? 'failed' });
      });
      continue;
    }
    // 3) Envío con el tiempo máximo del proveedor.
    // WhatsApp automático (meta/twilio) exige plantilla aprobada: sin ella no se
    // manda texto ni se finge envío, queda pendiente para una persona.
    const params = Array.isArray(row.templateParams) ? row.templateParams : [];
    const template = row.channel === 'whatsapp' ? whatsappTemplate(row.kind, { env, params }) : null;
    if (row.channel === 'whatsapp' && whatsappRequiresTemplate(env) && !template) {
      counts.manual += 1;
      await writeOutboxStatus(client, {
        id: row.id, status: 'manual', now, workerId: row.claimedBy,
        reason: 'sin plantilla configurada', providerDetail: { error: 'template_required' },
      });
      continue;
    }
    const result = row.channel === 'whatsapp'
      ? await sendWhatsApp(row.address, row.body, env, { template: template ? { ...template, category: templateCategory(row.kind) } : null })
      : await sendEmail(row.address, row.subject, row.body, env);
    const providerDetail = result.ok ? null : {
      error: result.error ?? null,
      code: result.providerErrorCode ?? null,
      title: result.providerErrorTitle ?? null,
      message: result.providerErrorMessage ?? null,
    };
    if (result.manual) {
      counts.manual += 1;
      await writeOutboxStatus(client, { id: row.id, status: 'manual', now, workerId: row.claimedBy, providerDetail });
      continue;
    }
    // 4) Aceptado por el proveedor: estado `sent`. `delivered` llega después,
    //    por webhook del proveedor.
    if (result.ok) {
      counts.sent += 1;
      await inTransaction(client, async (tx) => {
        const updated = await writeOutboxStatus(tx, {
          id: row.id, status: 'sent', now, workerId: row.claimedBy, messageId: result.messageId ?? null,
        });
        if (updated) await writeAlertDelivery(tx, { alertId: row.alertId, state: 'sent', now });
      });
      continue;
    }
    // 5) Reintentos limitados: lo permanente o agotado acaba en `failed`.
    const attempts = row.attempts + 1;
    const reason = result.error ?? 'send_failed';
    if (result.permanent || attempts >= MAX_ATTEMPTS) {
      counts.failed += 1;
      await inTransaction(client, async (tx) => {
        const updated = await writeOutboxStatus(tx, {
          id: row.id, status: 'failed', now, workerId: row.claimedBy, reason, attempts, providerDetail,
        });
        if (updated) await writeAlertDelivery(tx, { alertId: row.alertId, state: 'failed' });
      });
    } else {
      await writeOutboxStatus(client, {
        id: row.id, status: 'pending', now, workerId: row.claimedBy, reason, attempts, providerDetail,
        nextAttemptAt: new Date(now.getTime() + backoffSeconds(attempts - 1) * 1000),
      });
    }
  }
  return counts;
}

// Procesa un mensaje entrante de WhatsApp:
//   · «BAJA»/«STOP» revoca el consentimiento y da de baja contactos e
//     identidades solo-WhatsApp, apartando lo que estuviera en cola.
//   · «ALTA» responde con el enlace al formulario público (elección de estación
//     y categorías); no crea nada por su cuenta.
//   · Un código de 6 dígitos confirma la verificación de una identidad con
//     código vivo (equivale a `wa/confirm`).
// Se usa desde el webhook del proveedor. `reply` envía texto libre en ventana
// (la persona acaba de escribir); `siteUrl` construye el enlace del ALTA.
export async function handleInboundWhatsApp(client, fromAddress, text, { reply = null, siteUrl = '' } = {}) {
  const target = String(fromAddress || '').replace(/[^\d]/g, '');
  const command = String(text || '').trim().toUpperCase();
  const code = /^(\d{6})$/.exec(command)?.[1] ?? null;
  const isBaja = /^(BAJA|STOP|CANCELAR|ALTA_CANCELADA)$/.test(command);
  const isAlta = command === 'ALTA';
  if (!isBaja && !isAlta && !code) return { action: 'ignored' };
  const answer = async (message) => {
    if (!reply) return;
    try { await reply(message); } catch { /* la respuesta nunca rompe el webhook */ }
  };

  if (isBaja) {
    // Se comparan solo los dígitos: da igual que el número se guarde con o sin "+".
    const rows = await client`UPDATE subscriber_contacts SET opted_in_at = null, opted_out_at = now(), updated_at = now()
      WHERE channel = 'whatsapp' AND regexp_replace(address, '[^0-9]', '', 'g') = ${target}
      RETURNING id, subscriber_id`;
    // Una baja por WhatsApp retira también la publicidad y aparta lo que estuviera
    // en cola: no basta con dejar de recibir avisos operativos.
    const subscriberIds = [...new Set(rows.map((row) => row.subscriberId).filter(Boolean))];
    for (const subscriberId of subscriberIds) {
      await revokeCommercialConsent(client, { subscriberId, channel: 'whatsapp', source: 'whatsapp' });
    }
    const leads = await client`SELECT id FROM farm_leads
      WHERE regexp_replace(phone, '[^0-9]', '', 'g') = ${target}`;
    for (const lead of leads) {
      await revokeCommercialConsent(client, { leadId: lead.id, channel: 'whatsapp', source: 'whatsapp' });
    }
    // Baja de las identidades solo por WhatsApp y de sus suscripciones públicas.
    const waRows = await client`UPDATE wa_alert_identities SET opted_out_at = now(), updated_at = now()
      WHERE regexp_replace(phone, '[^0-9]', '', 'g') = ${target} AND opted_out_at IS NULL
      RETURNING phone`;
    if (waRows.length) {
      await client`UPDATE public_alert_subscriptions SET unsubscribed_at = now(), updated_at = now()
        WHERE wa_phone IN (SELECT phone FROM wa_alert_identities
          WHERE regexp_replace(phone, '[^0-9]', '', 'g') = ${target}) AND unsubscribed_at IS NULL`;
      await cancelPendingPublicAlerts(client, { phone: target });
    }
    return {
      action: 'opted_out',
      affected: rows.length,
      commercialRevoked: subscriberIds.length + leads.length,
      waIdentities: waRows.length,
    };
  }

  if (isAlta) {
    // Nada se crea por mensaje: la elección de estación, categorías y canal se
    // hace en el formulario público, y la identidad se verifica con código.
    const [{ n }] = await client`SELECT count(*)::integer AS n
      FROM devices WHERE active = true AND public_alerts_enabled = true`;
    const link = `${String(siteUrl || '').replace(/\/$/, '')}/#avisos-whatsapp`;
    await answer(n > 0
      ? `Para recibir avisos elige estación y tipos aquí: ${link}`
      : `El servicio de avisos públicos aún no tiene estaciones habilitadas. Puedes apuntarte a la lista de interés aquí: ${link}`);
    return { action: 'signup_link_sent', enabledStations: n };
  }

  // Código de verificación de una identidad solo por WhatsApp.
  const [identity] = await client`SELECT phone, code_hash, code_expires_at, code_attempts, verified_at
    FROM wa_alert_identities WHERE regexp_replace(phone, '[^0-9]', '', 'g') = ${target}`;
  if (!identity?.codeHash) return { action: 'ignored' };
  if (identity.verifiedAt) {
    await answer('Tu número ya estaba verificado.');
    return { action: 'already_verified' };
  }
  if (isExpired(identity.codeExpiresAt)) {
    await client`UPDATE wa_alert_identities SET code_hash = NULL, code_expires_at = NULL, updated_at = now()
      WHERE phone = ${identity.phone}`;
    await answer('El código ha caducado. Pide uno nuevo en el formulario.');
    return { action: 'code_expired' };
  }
  if (identity.codeAttempts >= 5) {
    await answer('Demasiados intentos. Pide un código nuevo en el formulario.');
    return { action: 'code_exhausted' };
  }
  const expected = Buffer.from(String(identity.codeHash), 'hex');
  const provided = Buffer.from(waVerificationHash(identity.phone, code), 'hex');
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    await client`UPDATE wa_alert_identities SET code_attempts = code_attempts + 1, updated_at = now()
      WHERE phone = ${identity.phone}`;
    await answer('Código incorrecto. Compruébalo e inténtalo de nuevo.');
    return { action: 'invalid_code' };
  }
  await client`UPDATE wa_alert_identities SET verified_at = now(), code_hash = NULL,
      code_expires_at = NULL, code_attempts = 0, updated_at = now()
    WHERE phone = ${identity.phone}`;
  await answer('Número verificado: tus avisos públicos quedan activos. Puedes darte de baja respondiendo BAJA.');
  return { action: 'verified' };
}
