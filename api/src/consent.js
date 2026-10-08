// Consentimiento y captación.
//
// El acceso al servicio y la publicidad son dos cosas distintas: registrarse o
// entrar en la demo nunca exige aceptar novedades y ofertas. Este módulo guarda
// cada autorización comercial como un registro inmutable (libro de
// consentimientos) con finalidad, canal, fecha y versión del texto, de modo que
// se puede demostrar qué se aceptó y cuándo. La revocación se registra igual y,
// al revocar, se cancelan los mensajes comerciales que aún estén en cola.
import { messageExpiresAt } from './message-ttl.js';

// Finalidades del tratamiento. `service` cubre lo necesario para atender la
// solicitud y prestar el servicio; `commercial` es la publicidad opcional.
export const CONSENT_PURPOSES = ['service', 'commercial'];
export const CONSENT_CHANNELS = ['email', 'whatsapp'];
export const CONSENT_ACTIONS = ['granted', 'revoked'];
export const CONSENT_SOURCES = ['web', 'account', 'magic_link', 'admin', 'lead', 'whatsapp', 'migration'];
export const COMMERCIAL_KIND = 'commercial';

// Versión del texto informativo que acompaña a la casilla. Debe coincidir con la
// publicada en la política de privacidad; al cambiarla, se sube aquí.
export const CONSENT_TEXT_VERSION = '2026-10-07';

export const PURPOSE_LABELS = {
  service: 'Prestación del servicio',
  commercial: 'Novedades y ofertas',
};

export const CHANNEL_LABELS = { email: 'Correo', whatsapp: 'WhatsApp' };

// La captación se limita a un conjunto pequeño de parámetros conocidos, con
// formato de "slug". Cualquier otro campo o carácter se descarta antes de
// guardarse: nunca entra basura de campaña en la base de datos.
const ACQUISITION_KEYS = ['source', 'medium', 'campaign', 'content', 'term', 'ref'];

export function cleanCampaignValue(value) {
  if (typeof value !== 'string') return null;
  const clean = value.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 80);
  return clean || null;
}

export function normalizeAcquisition(input) {
  const out = {};
  if (!input || typeof input !== 'object') return out;
  for (const key of ACQUISITION_KEYS) {
    const value = cleanCampaignValue(input[key] ?? input[`utm_${key}`]);
    if (value) out[key] = value;
  }
  return out;
}

// Registra una transición de consentimiento. Es la única forma de escribir en el
// libro: no se actualiza ni se borra, se añade un hecho nuevo con su fecha.
export async function recordConsent(client, {
  subscriberId = null, leadId = null, purpose, channel, action,
  textVersion = CONSENT_TEXT_VERSION, source = 'web', ip = null, userAgent = null,
}) {
  if (!CONSENT_PURPOSES.includes(purpose)) throw new Error('invalid_consent_purpose');
  if (!CONSENT_CHANNELS.includes(channel)) throw new Error('invalid_consent_channel');
  if (!CONSENT_ACTIONS.includes(action)) throw new Error('invalid_consent_action');
  if (!CONSENT_SOURCES.includes(source)) throw new Error('invalid_consent_source');
  await client`INSERT INTO consent_records
    (subscriber_id, lead_id, purpose, channel, action, text_version, source, ip_address, user_agent)
    VALUES (${subscriberId}, ${leadId}, ${purpose}, ${channel}, ${action},
      ${textVersion}, ${source}, ${ip}, ${userAgent})`;
  return true;
}

// Estado vigente de una finalidad y canal: el último hecho registrado manda.
export async function latestConsent(client, { subscriberId = null, leadId = null, purpose, channel }) {
  const [row] = await client`SELECT action, text_version, source, recorded_at
    FROM consent_records
    WHERE purpose = ${purpose} AND channel = ${channel}
      AND subscriber_id IS NOT DISTINCT FROM ${subscriberId}
      AND lead_id IS NOT DISTINCT FROM ${leadId}
    ORDER BY recorded_at DESC, id DESC LIMIT 1`;
  if (!row) return null;
  return {
    action: row.action,
    granted: row.action === 'granted',
    textVersion: row.textVersion ?? row.text_version ?? null,
    source: row.source ?? null,
    recordedAt: row.recordedAt ?? row.recorded_at ?? null,
  };
}

export async function hasCommercialConsent(client, { subscriberId = null, leadId = null, channel }) {
  const current = await latestConsent(client, { subscriberId, leadId, purpose: 'commercial', channel });
  return Boolean(current?.granted);
}

// Resumen por finalidad y canal para administración y cuenta. Devuelve solo la
// situación vigente de cada combinación, no el histórico completo.
export async function consentSummary(client, { subscriberId = null, leadId = null } = {}) {
  const rows = await client`SELECT DISTINCT ON (purpose, channel)
      purpose, channel, action, text_version, source, recorded_at
    FROM consent_records
    WHERE subscriber_id IS NOT DISTINCT FROM ${subscriberId}
      AND lead_id IS NOT DISTINCT FROM ${leadId}
    ORDER BY purpose, channel, recorded_at DESC, id DESC`;
  const summary = {};
  for (const row of rows) {
    summary[row.purpose] ??= {};
    summary[row.purpose][row.channel] = {
      granted: row.action === 'granted',
      textVersion: row.textVersion ?? row.text_version ?? null,
      source: row.source ?? null,
      recordedAt: row.recordedAt ?? row.recorded_at ?? null,
    };
  }
  return summary;
}

// Publicidad vigente por canal: { email: true, whatsapp: false, ... }.
export async function commercialChannels(client, { subscriberId = null, leadId = null } = {}) {
  const summary = await consentSummary(client, { subscriberId, leadId });
  const commercial = summary.commercial ?? {};
  return Object.fromEntries(CONSENT_CHANNELS.map((channel) => [channel, Boolean(commercial[channel]?.granted)]));
}

// Cancela los mensajes comerciales que aún no han salido. Se llama al revocar:
// un consentimiento retirado no puede seguir dando lugar a envíos en cola.
export async function cancelPendingCommercialMessages(client, {
  subscriberId = null, leadId = null, channel = null,
}) {
  const rows = await client`UPDATE notification_outbox
    SET status = 'cancelled', updated_at = now(),
        last_error = 'consentimiento revocado'
    WHERE kind = ${COMMERCIAL_KIND}
      AND status IN ('pending', 'sending', 'manual')
      AND subscriber_id IS NOT DISTINCT FROM ${subscriberId}
      AND lead_id IS NOT DISTINCT FROM ${leadId}
      AND (${channel}::text IS NULL OR channel = ${channel})
    RETURNING id`;
  return rows.length;
}

export async function grantCommercialConsent(client, options) {
  return recordConsent(client, { ...options, purpose: 'commercial', action: 'granted' });
}

// Revoca y, en la misma transacción, aparta lo que ya estuviera en cola.
export async function revokeCommercialConsent(client, options) {
  await recordConsent(client, { ...options, purpose: 'commercial', action: 'revoked' });
  return cancelPendingCommercialMessages(client, options);
}

// Encola un mensaje comercial (novedades y ofertas). Quien lo envía revalidará
// el consentimiento antes de entregarlo, por si se revocó entre medias.
export async function enqueueCommercialMessage(client, {
  subscriberId = null, leadId = null, channel, address, subject, body, env = process.env,
}) {
  if (!CONSENT_CHANNELS.includes(channel)) throw new Error('invalid_consent_channel');
  await client`INSERT INTO notification_outbox
    (kind, subscriber_id, lead_id, channel, address, subject, body, expires_at)
    VALUES (${COMMERCIAL_KIND}, ${subscriberId}, ${leadId}, ${channel}, ${address}, ${subject}, ${body},
      ${messageExpiresAt(COMMERCIAL_KIND, env)})`;
  return true;
}

// Mensaje comercial con pie de baja: recuerda siempre cómo retirar el permiso y
// deja claro que llega por una autorización específica, no como un aviso.
export function renderCommercialMessage({ title = 'Novedades de TecRural', body, textVersion = null }) {
  const footer = [
    '',
    'Novedades comerciales: recibes esto por una autorización específica que diste para este canal,',
    'no como parte de los avisos de la estación. Vigente mientras tu autorización siga activa;',
    'la revocación cancela los envíos pendientes.',
    textVersion ? `Texto informativo vigente: ${textVersion}.` : null,
    'Puedes darte de baja en cualquier momento desde tu cuenta o respondiendo BAJA.',
  ].filter(Boolean).join('\n');
  return { subject: title, body: `${body}${footer}` };
}
