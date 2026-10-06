import { $, api, session, setUnauthorizedHandler, roleLabel } from './js/ui.js';
import { renderPanel } from './js/panel.js';
import { renderStations, renderStationDetail } from './js/stations.js';
import { renderAlertsCenter } from './js/alerts.js';
import { renderAdmin } from './js/admin.js';
import { renderAccount } from './js/account.js';

const loginView = $('#login-view');
const viewRoot = $('#view-root');
const logoutButton = $('#logout');
const mainNav = $('#main-nav');
const mobileNav = $('#mobile-nav');
const sessionChip = $('#session-chip');

function showLogin() {
  session.me = null;
  loginView.classList.remove('hidden');
  viewRoot.classList.add('hidden');
  mainNav.classList.add('hidden');
  mobileNav.classList.add('hidden');
  logoutButton.classList.add('hidden');
  sessionChip.classList.add('hidden');
}

function showApp() {
  loginView.classList.add('hidden');
  viewRoot.classList.remove('hidden');
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
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  return { section: parts[0] || 'panel', id: parts[1] ? decodeURIComponent(parts[1]) : null, tab: parts[2] || null };
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
  if (!session.me) { showLogin(); return; }
  showApp();
  const { section, id, tab } = currentRoute();
  highlightNav(section);
  viewRoot.innerHTML = '<p class="empty">Cargando…</p>';
  try {
    if (section === 'estaciones' && id) await renderStationDetail(viewRoot, id, tab);
    else if (section === 'estaciones') await renderStations(viewRoot);
    else if (section === 'avisos') await renderAlertsCenter(viewRoot);
    else if (section === 'admin') await renderAdmin(viewRoot);
    else if (section === 'cuenta') await renderAccount(viewRoot);
    else await renderPanel(viewRoot);
  } catch (error) {
    if (error.message === 'authentication_required' || error.message === 'session_expired') { showLogin(); return; }
    viewRoot.innerHTML = '<section class="panel"><p class="error" data-route-error></p></section>';
    $('[data-route-error]', viewRoot).textContent = `No se pudo cargar la vista: ${error.message}`;
  }
  window.scrollTo({ top: 0 });
}

setUnauthorizedHandler(() => showLogin());

$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  $('#login-error').textContent = '';
  try {
    await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: form.get('email'), password: form.get('password') }) });
    await loadMe();
    if (!location.hash || location.hash === '#') location.hash = '#/panel';
    else await route();
  } catch {
    $('#login-error').textContent = 'No se pudo iniciar sesión. Revisa tus credenciales.';
  }
});

logoutButton.addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
  showLogin();
});

window.addEventListener('hashchange', () => { if (session.me) route(); });

try {
  await loadMe();
  if (!location.hash || location.hash === '#') location.hash = '#/panel';
  else await route();
} catch {
  showLogin();
}
