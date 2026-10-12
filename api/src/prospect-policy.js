export const COMMERCIAL_STATES = ['registrado', 'interes_declarado', 'contacto_solicitado', 'contactado', 'archivado'];
export function filterProspects(rows, filters = {}) {
  return rows.filter((r) => (!filters.municipality || (r.municipality || '').toLowerCase().includes(filters.municipality.toLowerCase()))
    && (!filters.activity || r.activity === filters.activity)
    && (!filters.interest || r.interest === filters.interest)
    && (!filters.status || r.status === filters.status)
    && (!filters.verified || r.verified === (filters.verified === 'yes'))
    && (!filters.permission || Object.values(r.commercial).some(Boolean) === (filters.permission === 'yes'))
    && (!filters.request_type || r.requestType === filters.request_type)
    && (!filters.preferred_channel || r.preferredChannel === filters.preferred_channel)
    && (!filters.installation || r.installationInterest));
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
