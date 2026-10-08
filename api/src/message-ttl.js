// Vigencia de los mensajes de la cola.
//
// Un aviso o un código que lleva horas en cola ya no sirve: enviarlo confunde en
// lugar de ayudar. Cada tipo de mensaje declara sus minutos de vigencia; se
// guardan en `expires_at` al encolarlo y quien entrega lo comprueba antes de
// llamar al proveedor, apartándolo como `expired` si ya no toca.

export const MESSAGE_TTL_MINUTES = {
  alert: 240,
  contact_verification: 10,
  lead_confirmation: 10080,
  lead_notice: 10080,
  commercial: 10080,
};

const TTL_ENV_KEYS = {
  alert: 'ALERT_MESSAGE_TTL_MINUTES',
  contact_verification: 'VERIFICATION_TTL_MINUTES',
  commercial: 'COMMERCIAL_MESSAGE_TTL_MINUTES',
};

export function messageTtlMinutes(kind, env = process.env) {
  const key = TTL_ENV_KEYS[kind];
  const configured = key ? Number(env?.[key]) : NaN;
  const fallback = MESSAGE_TTL_MINUTES[kind] ?? MESSAGE_TTL_MINUTES.lead_notice;
  return Number.isFinite(configured) && configured > 0 ? configured : fallback;
}

export function messageExpiresAt(kind, env = process.env, from = new Date()) {
  return new Date(from.getTime() + messageTtlMinutes(kind, env) * 60 * 1000);
}

// ¿Sigue vigente este mensaje en el instante dado?
export function isExpired(expiresAt, now = new Date()) {
  if (!expiresAt) return false;
  const at = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  if (Number.isNaN(at.getTime())) return false;
  return at.getTime() <= now.getTime();
}
