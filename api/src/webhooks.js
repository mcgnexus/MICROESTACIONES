// Webhooks de los proveedores: firma autenticada y estado de entrega.
//
// Un webhook sin verificar cualquiera lo puede llamar, así que el cuerpo se
// comprueba contra la firma del proveedor con el secreto que solo vive en el
// servidor. Dos estados distintos y nunca confundidos:
//
//   sent      el proveedor aceptó la petición de envío (2xx + id)
//   delivered el proveedor confirmó que llegó al destinatario (webhook)
//   failed    rechazo o entrega fallida (webhook o reintentos agotados)
//
import { createHmac, timingSafeEqual } from 'node:crypto';

function toBuffer(rawBody) {
  if (Buffer.isBuffer(rawBody)) return rawBody;
  if (rawBody == null) return Buffer.alloc(0);
  return Buffer.from(String(rawBody), 'utf8');
}

function safeEqual(expected, actual) {
  const a = Buffer.from(String(expected), 'utf8');
  const b = Buffer.from(String(actual), 'utf8');
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

// Meta (WhatsApp Cloud API): cabecera `X-Hub-Signature-256` con el valor
// `sha256=` + HMAC-SHA256 del cuerpo crudo con el App Secret.
export function verifyMetaSignature(rawBody, header, appSecret) {
  if (!appSecret || !header) return false;
  const digest = createHmac('sha256', appSecret).update(toBuffer(rawBody)).digest('hex');
  return safeEqual(`sha256=${digest}`, String(header));
}

// Resend (esquema SVIX): firma sobre `${svix-id}.${svix-timestamp}.{cuerpo}` con
// HMAC-SHA256 en base64, prefijado por `v1,`. Se acepta con tolerancia temporal
// para que un rebobinado viejo no sirva.
export function verifySvixSignature({
  rawBody, id, timestamp, signature, secret, toleranceSeconds = 300, nowMs = Date.now(),
}) {
  if (!secret || !id || !timestamp || !signature) return false;
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds)) return false;
  if (Math.abs(Math.floor(nowMs / 1000) - seconds) > toleranceSeconds) return false;
  const signed = `${id}.${timestamp}.${toBuffer(rawBody).toString('utf8')}`;
  const digest = createHmac('sha256', secret).update(signed, 'utf8').digest('base64');
  const expected = `v1,${digest}`;
  return String(signature).split(' ').some((candidate) => safeEqual(expected, candidate));
}

// Twilio: cabecera `X-Twilio-Signature`, HMAC-SHA1 de la URL más los parámetros
// POST ordenados por clave, en base64.
export function verifyTwilioSignature(url, params, signature, authToken) {
  if (!authToken || !signature) return false;
  const data = Object.keys(params || {}).sort()
    .reduce((acc, key) => `${acc}${key}${params[key]}`, String(url || ''));
  const digest = createHmac('sha1', authToken).update(Buffer.from(data, 'utf8')).digest('base64');
  return safeEqual(digest, String(signature));
}

// Normaliza el estado que reporta cada proveedor a los tres que manejamos.
export function normalizeDeliveryStatus(rawStatus) {
  const value = String(rawStatus || '').toLowerCase();
  if (['delivered', 'read', 'completed', 'opened'].includes(value)) return 'delivered';
  if (['sent', 'queued', 'accepted', 'scheduled', 'sending'].includes(value)) return 'sent';
  if (['failed', 'undelivered', 'bounced', 'complained', 'rejected', 'expired', 'failure'].includes(value)) {
    return 'failed';
  }
  return null;
}

function walk(value, visit) {
  if (Array.isArray(value)) { for (const item of value) walk(item, visit); return; }
  if (value && typeof value === 'object') { visit(value); for (const item of Object.values(value)) walk(item, visit); }
}

// Extrae { messageId, status, error } de los distintos formatos de webhook.
export function parseDeliveryEvents(payload) {
  const events = [];
  if (!payload || typeof payload !== 'object') return events;

  // Meta: entry[].changes[].value.statuses[] -> { id, status, errors }
  if (Array.isArray(payload.entry)) {
    for (const entry of payload.entry) {
      for (const change of entry?.changes || []) {
        for (const status of change?.value?.statuses || []) {
          events.push({
            messageId: status.id ?? null,
            status: normalizeDeliveryStatus(status.status),
            error: status.errors?.[0]?.title ?? status.errors?.[0]?.error_data?.details ?? null,
          });
        }
      }
    }
  }

  // Resend: [{ type: 'email.delivered', data: { id } }] o { type, data }
  const resendList = Array.isArray(payload) ? payload : (Array.isArray(payload.data) ? payload.data : [payload]);
  for (const event of resendList) {
    const type = event?.type ?? '';
    if (!/^email\./.test(type)) continue;
    events.push({
      messageId: event.data?.id ?? null,
      status: normalizeDeliveryStatus(type.replace(/^email\./, '')),
      error: event.data?.reason ?? null,
    });
  }

  // Twilio: campos planos en form-urlencoded.
  if (payload.MessageSid || payload.SmsSid) {
    events.push({
      messageId: payload.MessageSid ?? payload.SmsSid ?? null,
      status: normalizeDeliveryStatus(payload.MessageStatus ?? payload.SmsStatus),
      error: payload.ErrorCode ?? null,
    });
  }

  // Defensa: si el proveedor envía un árbol con `id` + `status`, se recoge.
  if (!events.length) {
    walk(payload, (node) => {
      if (node.id && node.status && (node.status === 'sent' || node.status === 'delivered' || node.status === 'failed')) {
        events.push({ messageId: node.id, status: normalizeDeliveryStatus(node.status), error: null });
      }
    });
  }
  return events.filter((event) => event.messageId && event.status);
}

// Aplica el estado confirmado por el proveedor al mensaje y a su aviso. Nunca
// desciende de `delivered` y nunca toca mensajes ya cancelados o caducados.
export async function applyProviderStatus(client, { providerMessageId, status, now = new Date(), error = null }) {
  const normalized = normalizeDeliveryStatus(status);
  if (!providerMessageId || !normalized) return { updated: 0, status: null };

  if (normalized === 'delivered') {
    const rows = await client`UPDATE notification_outbox
        SET status = 'delivered', delivered_at = ${now}, updated_at = ${now}, last_error = NULL,
            claimed_by = NULL, claimed_at = NULL
      WHERE provider_message_id = ${providerMessageId}
        AND status NOT IN ('delivered', 'cancelled', 'expired')
      RETURNING id, alert_id`;
    for (const row of rows) {
      await client`UPDATE alerts SET delivery_status = 'delivered', delivered_at = ${now}
        WHERE id = ${row.alertId} AND delivery_status <> 'bounced'`;
    }
    return { updated: rows.length, status: 'delivered' };
  }

  if (normalized === 'sent') {
    const rows = await client`UPDATE notification_outbox
        SET status = 'sent', sent_at = COALESCE(sent_at, ${now}), updated_at = ${now},
            claimed_by = NULL, claimed_at = NULL
      WHERE provider_message_id = ${providerMessageId}
        AND status IN ('pending', 'sending', 'manual')
      RETURNING id, alert_id`;
    for (const row of rows) {
      await client`UPDATE alerts SET delivery_status = 'sent'
        WHERE id = ${row.alertId} AND delivery_status = 'pending'`;
    }
    return { updated: rows.length, status: 'sent' };
  }

  const rows = await client`UPDATE notification_outbox
      SET status = 'failed', updated_at = ${now}, last_error = ${error || 'provider_failed'},
          claimed_by = NULL, claimed_at = NULL
    WHERE provider_message_id = ${providerMessageId}
      AND status NOT IN ('delivered', 'cancelled', 'expired')
    RETURNING id, alert_id`;
  for (const row of rows) {
    await client`UPDATE alerts SET delivery_status = 'failed'
      WHERE id = ${row.alertId} AND delivery_status NOT IN ('delivered', 'bounced')`;
  }
  return { updated: rows.length, status: 'failed' };
}
