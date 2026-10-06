import { $, api, session, setUnauthorizedHandler, roleLabel, renderSupport } from './js/ui.js';
import { renderPanel } from './js/panel.js';
import { renderStations, renderStationDetail } from './js/stations.js';
import { renderAlertsCenter } from './js/alerts.js';
import { renderAdmin } from './js/admin.js';
import { renderAccount } from './js/account.js';
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

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js').catch(() => {});
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

async function route() {
  const { section, id, tab } = currentRoute();
  if (!session.me) {
    // La portada y las páginas públicas no piden sesión. Solo el panel y el
    // resto de secciones privadas muestran el login.
    if (section === 'entrar' || PRIVATE_SECTIONS.has(section)) { showLogin(); return; }
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
    if (section === 'estaciones' && id) cleanup = await renderStationDetail(viewRoot, id, tab);
    else if (section === 'estaciones') cleanup = await renderStations(viewRoot);
    else if (section === 'avisos') cleanup = await renderAlertsCenter(viewRoot);
    else if (section === 'admin') cleanup = await renderAdmin(viewRoot);
    else if (section === 'cuenta') cleanup = await renderAccount(viewRoot);
    else cleanup = await renderPanel(viewRoot);
    if (typeof cleanup === 'function') viewTeardown = cleanup;
  } catch (error) {
    if (error.message === 'authentication_required' || error.message === 'session_expired') { showLogin(); return; }
    viewRoot.innerHTML = '<section class="panel"><p class="error" data-route-error></p></section>';
    $('[data-route-error]', viewRoot).textContent = `No se pudo cargar la vista: ${error.message}`;
  }
  if (section !== 'panel') window.scrollTo({ top: 0 });
}

setUnauthorizedHandler(() => showLogin());

$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  $('#login-error').textContent = '';
  try {
    await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: form.get('email'), password: form.get('password') }) });
    await loadMe();
    if (!location.hash || location.hash === '#' || location.hash === '#/entrar') location.hash = '#/panel';
    else await route();
  } catch {
    $('#login-error').textContent = 'No se pudo iniciar sesión. Revisa tus credenciales.';
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
  '/solicitar-piloto': '#/solicitar-piloto', '/entrar': '#/entrar',
};
const pathRoute = PATH_ROUTES[location.pathname.replace(/\/+$/, '') || '/'];
if (pathRoute && !location.hash) history.replaceState(null, '', `/${pathRoute}`);

try { session.support = await api('/api/v1/public-config'); } catch { session.support = null; }
renderSupport();
initLanding();
try { await loadMe(); } catch { session.me = null; }
await route();
