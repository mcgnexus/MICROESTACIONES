export const COMMERCIAL_STATES = ['registrado', 'interes_declarado', 'contacto_solicitado', 'contactado', 'archivado'];
// Ventanas de «Solicitado»: para localizar las consultas pendientes del día sin
// confundirlas con cuentas que solo consultan el histórico.
export const CREATED_SINCE_OPTIONS = ['today', '7d', '30d'];
function createdSinceStart(since) {
  if (since === 'today') { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }
  if (since === '7d') return Date.now() - 7 * 86400000;
  return Date.now() - 30 * 86400000;
}
export function filterProspects(rows, filters = {}) {
  return rows.filter((r) => (!filters.municipality || (r.municipality || '').toLowerCase().includes(filters.municipality.toLowerCase()))
    && (!filters.activity || r.activity === filters.activity)
    && (!filters.interest || r.interest === filters.interest)
    && (!filters.status || r.status === filters.status)
    && (!filters.verified || r.verified === (filters.verified === 'yes'))
    && (!filters.permission || Object.values(r.commercial).some(Boolean) === (filters.permission === 'yes'))
    && (!filters.request_type || r.requestType === filters.request_type)
    && (!filters.preferred_channel || r.preferredChannel === filters.preferred_channel)
    && (!filters.installation || r.installationInterest)
    && (!filters.created_since || (r.createdAt
      && new Date(r.createdAt).getTime() >= createdSinceStart(filters.created_since))));
}
// Un canal es exportable solo si su permiso comercial vigente es una concesión y
// la dirección existe. En cuentas, además, el contacto debe estar verificado y
// autorizado (ni dado de baja): un permiso no resucita un canal sin verificar.
// En solicitudes no hay verificación posible (queda null) y basta permiso + contacto.
export function authorizedExport(rows, channel) {
  const ready = channel === 'whatsapp' ? 'whatsappReady' : 'emailReady';
  return rows.filter((r) => r.commercial?.[channel] === true && r[channel] && r.status !== 'archivado'
    && r.accountActive !== false && (!r.retainUntil || new Date(r.retainUntil) > new Date())
    && (r.kind === 'lead' || r[ready] === true));
}
