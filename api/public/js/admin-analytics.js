import { api, escapeText as e, prepareResponsiveTables } from './ui.js';
const events = {
  home_visit: 'Apertura consentida de portada (carga de página; no visitantes únicos)',
  locked_tool_open: 'Apertura de herramienta bloqueada (opcional)',
  access_requested: 'Solicitud de acceso',
  contact_verified: 'Contacto verificado (total)',
  contact_verified_email: 'Contacto verificado · correo',
  contact_verified_whatsapp: 'Contacto verificado · WhatsApp',
  first_expanded_query: 'Primera consulta útil (con datos mostrados)',
  agricultural_profile_completed: 'Perfil agrícola completado',
  commercial_authorized: 'Primera autorización comercial',
  installation_interest: 'Primer interés en instalación (intención explícita)',
};
const percent = (r) => `${r.numerator} / ${r.denominator} · ${r.percent == null ? 'sin denominador' : `${r.percent}%`}`;
const euro = (value) => `${value.toFixed(2)} €`;
export async function mountAdminAnalytics(root) {
  const today = new Date().toISOString().slice(0, 10);
  const month = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  root.innerHTML = `<h2>Captación y activación</h2><form class="rule-form" data-period>
    <label>Desde<input name="from" type="date" required value="${month}"></label>
    <label>Hasta<input name="to" type="date" required value="${today}"></label>
    <label>Coste publicitario del período (€)<input name="cost" type="number" step="0.01" min="0" value=""></label>
    <button>Consultar métricas</button></form>
    <p class="error" role="alert" data-error></p><div data-report></div>`;
  async function load() {
    const form = root.querySelector('form'), button = form.querySelector('button');
    if (button.disabled) return;
    button.disabled = true; root.querySelector('[data-error]').textContent = '';
    try {
      const data = new FormData(form);
      const cost = Number(data.get('cost') || 0);
      const result = await api(`/api/v1/admin/analytics?${new URLSearchParams(new FormData(form))}`);
      const { total, rates } = result;
      const costLine = cost > 0
        ? `<p>Coste por registro confirmado (cuenta verificada): ${cost > 0 && total.verified > 0 ? euro(cost / total.verified) : 'sin denominador'} · Coste por solicitud cualificada (perfil agrícola completo): ${result.leads?.total?.qualified > 0 ? euro(cost / result.leads.total.qualified) : 'sin denominador'}. Ejemplo aritmético, no previsión de resultados.</p>`
        : '';
      root.querySelector('[data-report]').innerHTML = `<h3>Eventos del período</h3>
        <p>Medición nueva desde el despliegue, sin reconstruir eventos históricos. Solicitudes de enlace son emisiones nuevas, no personas únicas; solicitudes web se deduplican.</p>
        <div class="table-wrap"><table><thead><tr><th>Evento</th><th>Total</th><th>Unidad / denominador</th></tr></thead><tbody>${Object.entries(events).map(([key, label]) => `<tr><th scope="row">${label}</th><td>${total.events[key]}</td><td>${['home_visit', 'locked_tool_open'].includes(key) ? 'Aperturas consentidas, una por carga; no usuarios únicos ni tasa de conversión' : 'Primera ocurrencia por sujeto; solicitudes de enlace por emisión. Conteo, sin porcentaje secuencial'}</td></tr>`).join('')}</tbody></table></div>
        <h3>Cohorte de cuentas registradas en el período · estado actual</h3>
        <p>${total.registered} cuentas. Correo o canal verificado: ${percent(rates.verified)}. Activación: ${percent(rates.activated)}. Perfil agrícola completo y verificado: ${percent(rates.agricultural)}. Autorización vigente: ${percent(rates.authorized)}. Instalación: ${percent(rates.installation)}.</p>
        <p>Denominador: cuentas viewer creadas en el mismo período y canal. Cada porcentaje es independiente, no una etapa condicionada por la anterior. Los registros borrados dejan de formar parte de esta cohorte.</p>
        <p>Público relevante: ${total.verifiedAgriculturalAuthorized} perfiles agrícolas completos y verificados con permiso comercial vigente; ${total.agriculturalInstallation} perfiles agrícolas completos con interés en instalación. La exportación comercial aplica además el canal y alcance de la bandeja.</p>
        <div class="table-wrap"><table><caption>Origen permitido: source · medium · campaign. Los valores fuera de ANALYTICS_CAMPAIGNS se agrupan como «none»</caption><thead><tr><th>Canal</th><th>Visitas consentidas</th><th>Solicitudes</th><th>Cuentas</th><th>Verificadas / cuentas</th><th>Agrícolas verificadas / cuentas</th><th>Permiso vigente / cuentas</th><th>Instalación / cuentas</th></tr></thead><tbody>${result.channels.map((r) => `<tr><th scope="row">${e(r.bucket.split('|').join(' · '))}</th><td>${r.events.home_visit}</td><td>${r.events.access_requested}</td><td>${r.registered}</td><td>${percent(r.rates.verified)}</td><td>${percent(r.rates.agricultural)}</td><td>${percent(r.rates.authorized)}</td><td>${percent(r.rates.installation)}</td></tr>`).join('') || '<tr><td colspan="8">Sin datos en este período.</td></tr>'}</tbody></table></div>
        ${costLine}
        ${Object.values(result.definitions).map((text) => `<p class="hint">${e(text)}</p>`).join('')}`;
      root.querySelector('[data-report]').insertAdjacentHTML('beforeend', `<h3>Interesados agrícolas por canal</h3><div class="table-wrap"><table><thead><tr><th>Canal</th><th>Agrícolas verificados con permiso vigente</th><th>Agrícolas con interés en instalación</th></tr></thead><tbody>${result.channels.map((r) => `<tr><th scope="row">${e(r.bucket.split('|').join(' · '))}</th><td>${r.verifiedAgriculturalAuthorized}</td><td>${r.agriculturalInstallation}</td></tr>`).join('') || '<tr><td colspan="3">Sin datos.</td></tr>'}</tbody></table></div>`);
      const leads = result.leads;
      if (leads) {
        root.querySelector('[data-report]').insertAdjacentHTML('beforeend', `<h3>Solicitudes de finca (leads) · serie separada, no se suman a las cuentas</h3>
          <p>${leads.total.registered} solicitudes. Cualificadas (perfil agrícola completo): ${percent(leads.rates.qualified)}. Permiso comercial vigente: ${percent(leads.rates.authorized)}.</p>
          <div class="table-wrap"><table><thead><tr><th>Canal</th><th>Solicitudes</th><th>Cualificadas / solicitudes</th><th>Permiso vigente / solicitudes</th></tr></thead><tbody>${leads.channels.map((r) => `<tr><th scope="row">${e(r.bucket.split('|').join(' · '))}</th><td>${r.registered}</td><td>${percent(r.rates.qualified)}</td><td>${percent(r.rates.authorized)}</td></tr>`).join('') || '<tr><td colspan="4">Sin datos en este período.</td></tr>'}</tbody></table></div>
          <p class="hint">Una solicitud de finca sin cuenta aparece solo en esta serie. La relación lead↔cuenta no se resuelve aquí, así que no se suman como personas.</p>`);
      }
      prepareResponsiveTables(root);
    } catch (err) { root.querySelector('[data-error]').textContent = `No se pudieron cargar las métricas: ${err.message}`; }
    finally { button.disabled = false; }
  }
  root.querySelector('form').addEventListener('submit', (event) => { event.preventDefault(); event.stopPropagation(); load(); });
  await load();
}
