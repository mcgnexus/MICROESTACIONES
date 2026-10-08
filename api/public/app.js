import { $, api, session, setUnauthorizedHandler, roleLabel, renderSupport } from './js/ui.js';
import { initAnalyticsChoice, homeMetric, lockedMetric } from './js/analytics.js';
import { PRIVATE_SECTIONS, PUBLIC_SECTIONS, scrollToPublicSection, initLanding } from './js/landing.js';

const landingView = $('#landing-view');
const loginView = $('#login-view');
const viewRoot = $('#view-root');
const logoutButton = $('#logout');
const mainNav = $('#main-nav');
const publicNav = $('#public-nav');
const mobileNav = $('#mobile-nav');
const sessionChip = $('#session-chip');
const installButton = $('#install-app');
const iosInstallHint = $('#ios-install-hint');
let deferredInstallPrompt = null;
let viewTeardown = () => {};

const connectionNotice = document.createElement('p');
connectionNotice.className = 'connection-notice hidden';
connectionNotice.setAttribute('role', 'status');
connectionNotice.setAttribute('aria-live', 'polite');
document.body.prepend(connectionNotice);
let connectionFailed = false;
function showConnection() {
  const offline = !navigator.onLine || connectionFailed;
  connectionNotice.classList.toggle('hidden', !offline);
  const times = [...document.querySelectorAll('time[datetime], [data-observed-at]')]
    .map((el) => new Date(el.getAttribute('datetime') || el.dataset.observedAt).getTime()).filter(Number.isFinite);
  const last = times.length ? ` Último dato visible: ${new Date(Math.max(...times)).toLocaleString('es-ES')}.` : ' Consulta la hora indicada junto a cada lectura visible.';
  connectionNotice.textContent = offline ? `Sin conexión con datos actualizados. Las lecturas visibles son anteriores y no representan el estado actual.${last}` : '';
  document.body.classList.toggle('data-offline', offline);
}
window.addEventListener('offline', showConnection);
window.addEventListener('online', () => { connectionFailed = false; showConnection(); route(); });
window.addEventListener('api-unavailable', () => { connectionFailed = true; showConnection(); });
showConnection();
if ('serviceWorker' in navigator) {
  const pwaError = () => {
    const notice = document.createElement('p'); notice.className = 'error'; notice.setAttribute('role', 'alert');
    notice.textContent = 'No se pudo preparar o actualizar la aplicación sin conexión. Recarga con conexión para reintentar.';
    connectionNotice.after(notice);
  };
  navigator.serviceWorker.register('/service-worker.js').then((registration) => {
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => { if (worker.state === 'redundant') pwaError(); });
    });
    registration.update().catch(pwaError);
  }).catch(pwaError);
}

const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
if (isIos && !isStandalone) iosInstallHint.classList.remove('hidden');

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installButton.classList.remove('hidden');
});

installButton.addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installButton.classList.add('hidden');
});

window.addEventListener('appinstalled', () => installButton.classList.add('hidden'));

function showLanding() {
  viewTeardown();
  viewTeardown = () => {};
  session.me = null;
  landingView.classList.remove('hidden');
  loginView.classList.add('hidden');
  viewRoot.classList.add('hidden');
  mainNav.classList.add('hidden');
  publicNav.classList.remove('hidden');
  mobileNav.classList.add('hidden');
  logoutButton.classList.add('hidden');
  sessionChip.classList.add('hidden');
}

function showLogin() {
  viewTeardown();
  viewTeardown = () => {};
  session.me = null;
  landingView.classList.add('hidden');
  loginView.classList.remove('hidden');
  viewRoot.classList.add('hidden');
  mainNav.classList.add('hidden');
  publicNav.classList.add('hidden');
  mobileNav.classList.add('hidden');
  logoutButton.classList.add('hidden');
  sessionChip.classList.add('hidden');
}

function showApp() {
  landingView.classList.add('hidden');
  loginView.classList.add('hidden');
  viewRoot.classList.remove('hidden');
  publicNav.classList.add('hidden');
  mainNav.classList.remove('hidden');
  mobileNav.classList.remove('hidden');
  logoutButton.classList.remove('hidden');
  sessionChip.classList.remove('hidden');
  sessionChip.textContent = `${session.me.email} · ${roleLabel(session.me.role)}`;
  document.body.dataset.role = session.me.role;
  $('.admin-only', mainNav).classList.toggle('hidden', session.me.role !== 'admin');
}

async function loadMe() {
  session.me = await api('/api/v1/me');
}

function currentRoute() {
  const raw = location.hash.replace(/^#\/?/, '');
  const parts = raw.split('/').filter(Boolean);
  return { section: parts[0] || 'landing', id: parts[1] ? decodeURIComponent(parts[1]) : null, tab: parts[2] || null };
}

function highlightNav(section) {
  const key = section === 'estaciones' ? 'stations' : section === 'avisos' ? 'alerts' : section;
  mainNav.querySelectorAll('[data-nav]').forEach((link) => link.classList.toggle('active', link.dataset.nav === key));
  mobileNav.querySelectorAll('[data-mobile-nav]').forEach((link) => {
    const active = link.dataset.mobileNav === key;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

// Herramienta que el visitante quería abrir antes de autenticarse; se conserva
// para devolverlo ahí tras verificar el enlace (destino interno validado).
let pendingReturn = 'panel';

async function route() {
  const { section, id, tab } = currentRoute();
  homeMetric(!session.me && section === 'landing');
  lockedMetric(!session.me && ['panel', 'estaciones', 'avisos'].includes(section));
  if (!session.me) {
    // La portada y las páginas públicas no piden sesión. Solo el panel y el
    // resto de secciones privadas muestran el login.
    if (section === 'entrar' || PRIVATE_SECTIONS.has(section)) {
      pendingReturn = section; showLogin(); return;
    }
    showLanding();
    if (PUBLIC_SECTIONS.has(section)) scrollToPublicSection(section);
    return;
  }
  // Con sesión, la portada lleva directo al panel.
  if (section === 'landing' || section === 'entrar') { location.hash = '#/panel'; return; }
  showApp();
  highlightNav(section);
  viewTeardown();
  viewTeardown = () => {};
  viewRoot.innerHTML = '<p class="empty">Cargando…</p>';
  try {
    let cleanup;
    // Cada sección se descarga al abrirla (import dinámico): la portada pública
    // no carga panel, estaciones, avisos, admin ni cuenta.
    if (section === 'estaciones' && id) cleanup = await import('./js/stations.js').then((m) => m.renderStationDetail(viewRoot, id, tab));
    else if (section === 'estaciones') cleanup = await import('./js/stations.js').then((m) => m.renderStations(viewRoot));
    else if (section === 'avisos') cleanup = await import('./js/alerts.js').then((m) => m.renderAlertsCenter(viewRoot));
    else if (section === 'admin') cleanup = await import('./js/admin.js').then((m) => m.renderAdmin(viewRoot));
    else if (section === 'cuenta') cleanup = await import('./js/account.js').then((m) => m.renderAccount(viewRoot));
    else cleanup = await import('./js/panel.js').then((m) => m.renderPanel(viewRoot));
    if (typeof cleanup === 'function') viewTeardown = cleanup;
    if (session.me?.role === 'viewer' && ['panel', 'estaciones', 'avisos'].includes(section)) {
      api('/api/v1/metrics/activation', { method: 'POST', referrerPolicy: 'no-referrer', body: JSON.stringify({ tool: section }) }).catch(() => console.warn('No se pudo registrar la activación agregada.'));
    }
  } catch (error) {
    if (error.message === 'authentication_required' || error.message === 'session_expired') { showLogin(); return; }
    viewRoot.innerHTML = '<section class="panel"><p class="error" data-route-error></p></section>';
    $('[data-route-error]', viewRoot).textContent = `No se pudo cargar la vista: ${error.message}`;
  }
  if (section !== 'panel') window.scrollTo({ top: 0 });
  showConnection();
}

setUnauthorizedHandler(() => showLogin());

// Captación: se toma una vez de la URL de llegada y se envía tal cual; el
// servidor la sanea a un conjunto pequeño de parámetros conocidos.
const acquisition = (() => {
  const params = new URLSearchParams(location.search);
  const out = {};
  for (const key of ['source', 'medium', 'campaign', 'content', 'term', 'ref']) {
    const value = params.get(key) ?? params.get(`utm_${key}`);
    if (value) out[key] = value;
  }
  return out;
})();

// Solicitud de enlace de acceso. La respuesta es genérica por diseño. La casilla
// de novedades es opcional y no condiciona el acceso.
$('#magic-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const button = event.currentTarget.querySelector('button[type="submit"], button');
  if (button.disabled) return;
  button.disabled = true;
  const statusEl = $('#magic-status');
  const errorEl = $('#magic-error');
  errorEl.textContent = '';
  statusEl.textContent = 'Enviando…';
  try {
    await api('/api/auth/magic/request', {
      method: 'POST',
      body: JSON.stringify({
        email: data.get('email'),
        next: pendingReturn,
        commercial_consent: data.get('marketing') === 'on',
        acquisition,
      }),
    });
    statusEl.textContent = 'Si la dirección puede recibir acceso, te hemos enviado un enlace. Revisa tu correo y la carpeta de spam.';
  } catch {
    statusEl.textContent = '';
    errorEl.textContent = 'No se pudo solicitar el acceso. Inténtalo de nuevo en unos minutos.';
  } finally {
    button.disabled = false;
  }
});

$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button[type="submit"], button');
  if (button.disabled) return;
  button.disabled = true;
  const form = new FormData(event.currentTarget);
  $('#login-error').textContent = '';
  try {
    await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: form.get('email'), password: form.get('password') }) });
    await loadMe();
    if (!location.hash || location.hash === '#' || location.hash === '#/entrar') location.hash = '#/panel';
    else await route();
  } catch {
    $('#login-error').textContent = 'No se pudo iniciar sesión. Revisa tus credenciales.';
  } finally {
    button.disabled = false;
  }
});

logoutButton.addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
  if (location.hash && location.hash !== '#/') location.hash = '#/';
  else showLanding();
});

window.addEventListener('hashchange', () => route());

// Rutas "bonitas" (sin hash) que sirve el mismo index.html: se traducen a la
// ruta hash equivalente para que /panel, /zonas, etc. abran la sección correcta.
const PATH_ROUTES = {
  '/panel': '#/panel', '/estaciones': '#/estaciones', '/avisos': '#/avisos', '/cuenta': '#/cuenta',
  '/como-funciona': '#/como-funciona', '/zonas': '#/zonas', '/alertas': '#/alertas',
  '/tiempo-local': '#/tiempo-local', '/comparacion-aemet': '#/comparacion-aemet', '/evolucion': '#/evolucion',
  '/fincas': '#/fincas', '/herramientas': '#/herramientas', '/preguntas': '#/preguntas',
  '/demo-agricola': '#/demo-agricola', '/demo': '#/demo-agricola', '/demostracion': '#/demo-agricola',
  '/acceso-gratuito': '#/solicitar-piloto', '/solicitar-piloto': '#/solicitar-piloto', '/entrar': '#/entrar',
};
const pathRoute = PATH_ROUTES[location.pathname.replace(/\/+$/, '') || '/'];
if (pathRoute && !location.hash) history.replaceState(null, '', `/${pathRoute}`);

// Verifica un enlace de acceso si llega en la URL. El token se quita de la barra
// de direcciones antes de enviarlo y nunca se guarda en el cliente.
async function handleMagicReturn() {
  const params = new URLSearchParams(location.search);
  const token = params.get('token');
  if (!token) return false;
  history.replaceState(null, '', '/entrar');
  try {
    const result = await api('/api/auth/magic/verify', { method: 'POST', body: JSON.stringify({ token }) });
    await loadMe();
    const destination = typeof result?.next === 'string' && result.next.startsWith('#/') ? result.next : '#/panel';
    location.hash = destination;
    return true;
  } catch (error) {
    showLogin();
    const el = $('#magic-error');
    if (el) {
      el.textContent = error.message === 'link_invalid_or_expired'
        ? 'El enlace no es válido, ya se usó o ha caducado. Pide uno nuevo.'
        : error.message === 'password_login_required'
          ? 'Esta cuenta se gestiona con contraseña. Entra con ella.'
          : 'No se pudo completar el acceso con el enlace.';
    }
    return false;
  }
}

// El soporte público no depende de la sesión: vuela en paralelo con el resto
// del arranque en lugar de bloquearlo con un await en serie.
api('/api/v1/public-config')
  .then((support) => { session.support = support; })
  .catch(() => { session.support = null; })
  .finally(() => renderSupport());
initLanding();
try { await loadMe(); } catch { session.me = null; }
await handleMagicReturn();
await route();
await initAnalyticsChoice();
