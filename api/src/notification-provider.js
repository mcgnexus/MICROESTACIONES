// Utilidades comunes de los proveedores de mensajería. Cada envío devuelve
// { ok, permanent, messageId, error, manual? }. `permanent` distingue un rechazo
// definitivo (número o dirección inválidos) de uno reintentable (caída del servicio).

export function classifyHttp(status) {
  if (status === 429) return { permanent: false, error: 'rate_limited' };
  if (status >= 500) return { permanent: false, error: `provider_${status}` };
  return { permanent: true, error: `provider_${status}` };
}

export function providerNotConfigured() {
  return { ok: false, permanent: false, error: 'provider_not_configured' };
}

export function manualPending() {
  return { ok: false, permanent: false, manual: true, error: 'manual' };
}
