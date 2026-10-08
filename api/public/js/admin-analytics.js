import { api, escapeText as e } from './ui.js';
const events = { home_visit: 'Visita a la portada (opcional)', locked_tool_open: 'Apertura de herramienta bloqueada (opcional)', access_requested: 'Solicitud de acceso', contact_verified: 'Contacto verificado', first_expanded_query: 'Primera consulta ampliada', agricultural_profile_completed: 'Perfil agrícola completado', commercial_authorized: 'Primera autorización comercial', installation_interest: 'Primer interés en instalación' };
const percent = (r) => `${r.numerator} / ${r.denominator} · ${r.percent == null ? 'sin denominador' : `${r.percent}%`}`;
export async function mountAdminAnalytics(root) {
  const today = new Date().toISOString().slice(0, 10);
  const month = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  root.innerHTML = `<h2>Captación y activación</h2><form class="rule-form" data-period>
    <label>Desde<input name="from" type="date" required value="${month}"></label>
    <label>Hasta<input name="to" type="date" required value="${today}"></label><button>Consultar métricas</button></form>
    <p class="error" role="alert" data-error></p><div data-report></div>`;
  async function load() {
    const form = root.querySelector('form'), button = form.querySelector('button');
    if (button.disabled) return;
    button.disabled = true; root.querySelector('[data-error]').textContent = '';
    try {
      const result = await api(`/api/v1/admin/analytics?${new URLSearchParams(new FormData(form))}`);
      const { total, rates } = result;
      root.querySelector('[data-report]').innerHTML = `<h3>Eventos del período</h3>
        <p>Medición nueva desde el despliegue, sin reconstruir eventos históricos. Solicitudes de enlace son emisiones nuevas, no personas únicas; solicitudes web se deduplican.</p>
        <div class="table-wrap"><table><thead><tr><th>Evento</th><th>Total</th><th>Unidad / denominador</th></tr></thead><tbody>${Object.entries(events).map(([key, label]) => `<tr><th scope="row">${label}</th><td>${total.events[key]}</td><td>${['home_visit', 'locked_tool_open'].includes(key) ? 'Aperturas consentidas, una por carga; no usuarios únicos ni tasa de conversión' : 'Primera ocurrencia por sujeto; solicitudes de enlace por emisión. Conteo, sin porcentaje secuencial'}</td></tr>`).join('')}</tbody></table></div>
        <h3>Cohorte de cuentas registradas en el período · estado actual</h3>
        <p>${total.registered} cuentas. Correo o canal verificado: ${percent(rates.verified)}. Activación: ${percent(rates.activated)}. Perfil agrícola completo y verificado: ${percent(rates.agricultural)}. Autorización vigente: ${percent(rates.authorized)}. Instalación: ${percent(rates.installation)}.</p>
        <p>Denominador: cuentas viewer creadas en el mismo período y canal. Cada porcentaje es independiente, no una etapa condicionada por la anterior. Los registros borrados dejan de formar parte de esta cohorte.</p>
        <p>Público relevante: ${total.verifiedAgriculturalAuthorized} perfiles agrícolas completos y verificados con permiso comercial vigente; ${total.agriculturalInstallation} perfiles agrícolas completos con interés en instalación. La exportación comercial aplica además el canal y alcance de la bandeja.</p>
        <div class="table-wrap"><table><caption>Origen permitido: source · medium · campaign</caption><thead><tr><th>Canal</th><th>Visitas consentidas</th><th>Solicitudes</th><th>Cuentas</th><th>Verificadas / cuentas</th><th>Agrícolas verificadas / cuentas</th><th>Permiso vigente / cuentas</th><th>Instalación / cuentas</th></tr></thead><tbody>${result.channels.map((r) => `<tr><th scope="row">${e(r.bucket.split('|').join(' · '))}</th><td>${r.events.home_visit}</td><td>${r.events.access_requested}</td><td>${r.registered}</td><td>${percent(r.rates.verified)}</td><td>${percent(r.rates.agricultural)}</td><td>${percent(r.rates.authorized)}</td><td>${percent(r.rates.installation)}</td></tr>`).join('') || '<tr><td colspan="8">Sin datos en este período.</td></tr>'}</tbody></table></div>
        ${Object.values(result.definitions).map((text) => `<p class="hint">${e(text)}</p>`).join('')}`;
      root.querySelector('[data-report]').insertAdjacentHTML('beforeend', `<h3>Interesados agrícolas por canal</h3><div class="table-wrap"><table><thead><tr><th>Canal</th><th>Agrícolas verificados con permiso vigente</th><th>Agrícolas con interés en instalación</th></tr></thead><tbody>${result.channels.map((r) => `<tr><th scope="row">${e(r.bucket.split('|').join(' · '))}</th><td>${r.verifiedAgriculturalAuthorized}</td><td>${r.agriculturalInstallation}</td></tr>`).join('') || '<tr><td colspan="3">Sin datos.</td></tr>'}</tbody></table></div>`);
    } catch (err) { root.querySelector('[data-error]').textContent = `No se pudieron cargar las métricas: ${err.message}`; }
    finally { button.disabled = false; }
  }
  root.querySelector('form').addEventListener('submit', (event) => { event.preventDefault(); event.stopPropagation(); load(); });
  await load();
}
