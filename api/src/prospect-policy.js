export const COMMERCIAL_STATES = ['registrado', 'interes_declarado', 'contacto_solicitado', 'contactado', 'archivado'];
export function filterProspects(rows, filters = {}) {
  return rows.filter((r) => (!filters.municipality || (r.municipality || '').toLowerCase().includes(filters.municipality.toLowerCase()))
    && (!filters.activity || r.activity === filters.activity)
    && (!filters.interest || r.interest === filters.interest)
    && (!filters.status || r.status === filters.status)
    && (!filters.verified || r.verified === (filters.verified === 'yes'))
    && (!filters.permission || Object.values(r.commercial).some(Boolean) === (filters.permission === 'yes'))
    && (!filters.installation || r.installationInterest));
}
export function authorizedExport(rows, channel) {
  return rows.filter((r) => r.commercial[channel] === true && r[channel] && r.status !== 'archivado'
    && r.accountActive !== false && (!r.retainUntil || new Date(r.retainUntil) > new Date()));
}
