// Analítica pública opcional. Solo la preferencia se persiste: no hay ID de visita.
const key = 'tecrural-analytics-choice-v1';
let choice = 'unset';
try { choice = localStorage.getItem(key) || 'unset'; } catch { /* sin almacenamiento, se decide para esta página */ }
let campaigns = [];
let ready = false;
let currentHome = false;
let currentLocked = false;
const sent = new Set();
const sources = ['google', 'bing', 'facebook', 'instagram', 'whatsapp', 'qr', 'newsletter', 'partner'];
const media = ['organic', 'social', 'email', 'cpc', 'qr', 'referral'];
function campaign() {
  const params = new URLSearchParams(location.search);
  const pick = (name) => (params.get(`utm_${name}`) || params.get(name) || '').toLowerCase();
  const source = pick('source'), medium = pick('medium'), value = pick('campaign');
  return { source: sources.includes(source) ? source : source ? 'other' : '',
    medium: media.includes(medium) ? medium : '', campaign: campaigns.includes(value) ? value : '' };
}
export async function publicMetric(event) {
  if (choice !== 'accepted' || !ready || sent.has(event) || !navigator.onLine) return;
  sent.add(event);
  try {
    const response = await fetch('/api/v1/metrics/events', {
      method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
      body: JSON.stringify({ event, consent: true, campaign: campaign() }),
    });
    if (!response.ok) throw new Error('metric_unavailable');
  } catch {
    sent.delete(event);
    console.warn('No se pudo guardar la métrica agregada.');
  }
}
export function homeMetric(isHome) {
  currentHome = isHome;
  if (isHome) publicMetric('home_visit');
}
export function lockedMetric(isLocked) {
  currentLocked = isLocked;
  if (isLocked) publicMetric('locked_tool_open');
}
export async function initAnalyticsChoice() {
  const container = document.createElement('section');
  container.className = 'analytics-choice';
  container.setAttribute('aria-label', 'Preferencias de medición opcional');
  container.innerHTML = `<div data-choice><p>¿Permites contar visitas y aperturas de herramientas de forma agregada? Es opcional. No guardamos identificadores de visitante ni datos de contacto. <a href="/privacidad">Más información</a>.</p>
    <div class="row-actions"><button type="button" data-accept>Aceptar medición</button><button type="button" data-reject>Rechazar medición</button></div></div>
    <button type="button" data-change>Preferencias de medición</button><p role="status" data-status></p>`;
  document.querySelector('.site-footer')?.append(container);
  function render() {
    container.querySelector('[data-choice]').classList.toggle('hidden', choice !== 'unset');
    container.querySelector('[data-change]').classList.toggle('hidden', choice === 'unset');
    container.querySelector('[data-status]').textContent = choice === 'accepted' ? 'Medición opcional aceptada. Puedes retirarla.' : choice === 'rejected' ? 'Medición opcional rechazada.' : '';
  }
  async function prepare() {
    if (ready || choice !== 'accepted') return;
    try {
      const response = await fetch('/api/v1/metrics/config', { credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' });
      if (!response.ok) throw new Error('metric_config_unavailable');
      campaigns = (await response.json()).campaigns; ready = true;
      if (currentHome) publicMetric('home_visit');
      if (currentLocked) publicMetric('locked_tool_open');
    } catch { console.warn('La medición opcional no está disponible.'); }
  }
  container.addEventListener('click', (event) => {
    if (event.target.closest('[data-change]')) { container.querySelector('[data-choice]').classList.remove('hidden'); return; }
    if (!event.target.closest('[data-accept], [data-reject]')) return;
    choice = event.target.closest('[data-accept]') ? 'accepted' : 'rejected';
    try { localStorage.setItem(key, choice); } catch { /* se conserva solo en memoria */ }
    render(); prepare();
  });
  render(); await prepare();
}
