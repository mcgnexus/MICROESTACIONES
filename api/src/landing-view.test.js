import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appSource = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');

// F20 · P2: «Ir a la página pública» (href="#/") abría Panel porque app.js
// redirigía la portada con sesión a #/panel. Ahora la portada se permite con
// sesión: el usuario consulta la información del producto sin cerrar sesión.

test('app.js exporta una vista de portada que no cierra la sesión', () => {
  assert.match(appSource, /function showLandingView\(\)/);
  // El cuerpo de showLandingView (hasta el cierre de la función) no debe limpiar la sesión.
  const start = appSource.indexOf('function showLandingView()');
  const end = appSource.indexOf('function showLogin()', start);
  const body = appSource.slice(start, end);
  assert.doesNotMatch(body, /session\.me = null/, 'showLandingView no debe limpiar la sesión');
});

function sliceBetween(startMarker, endMarker) {
  const start = appSource.indexOf(startMarker);
  const end = appSource.indexOf(endMarker, start);
  return appSource.slice(start, end);
}

test('la ruta de portada con sesión muestra la portada en lugar de redirigir al panel', () => {
  // El bloque de sesión (después de `if (!session.me)`): para landing/entrar,
  // «landing» invoca showLandingView() y «entrar» respeta el destino pedido
  // (histórico, panel…) en lugar de imponer siempre el panel.
  const route = sliceBetween('if (!session.me) {', 'showApp();');
  assert.match(route, /showLandingView\(\)/);
  // La redirección por «entrar» queda confinada al caso `section === 'entrar'`.
  const guard = route.indexOf("section === 'entrar'");
  assert.ok(guard > -1, 'falta el caso section === entrar');
  const enterBlock = route.slice(guard, route.indexOf('showLandingView()', guard));
  assert.match(enterBlock, /RETURN_DESTINATIONS\.has\(pendingReturn\)/);
  assert.match(enterBlock, /'#\/panel'/);
  // Y el caso landing, explícitamente, invoca la vista de portada.
  assert.match(route, /section === 'landing' \|\| section === 'entrar'[\s\S]*?showLandingView\(\)/);
});

test('las secciones públicas con sesión también abren la portada, no el panel', () => {
  assert.match(appSource, /PUBLIC_SECTIONS\.has\(section\)\)\s*\{\s*showLandingView\(\)/);
  assert.match(appSource, /scrollToPublicSection\(section\)/);
});

test('showLandingView conserva la chip y el botón de cierre de sesión', () => {
  const fn = appSource.slice(appSource.indexOf('function showLandingView'), appSource.indexOf('function highlightNav'));
  assert.match(fn, /sessionChip\.classList\.remove\('hidden'\)/);
  assert.match(fn, /logoutButton\.classList\.remove\('hidden'\)/);
  assert.match(fn, /landingView\.classList\.remove\('hidden'\)/);
  assert.match(fn, /viewRoot\.classList\.add\('hidden'\)/);
});

test('al abrir sin ruta la portada vuelve al principio y la tarjeta recibe el foco tras cargar', async () => {
  // Entrar en la portada (por ruta vacía o desde el pie) siempre empieza arriba.
  const route = sliceBetween('if (!session.me) {', 'showApp();');
  assert.match(route, /if \(section === 'landing'\) \{ window\.scrollTo\(\{ top: 0 \}\); return; \}/);
  assert.match(appSource, /showPublicSections\('landing'\);\s*window\.scrollTo\(\{ top: 0 \}\)/);
  // El enfoque de la tarjeta lo dirige loadPublicWeather solo en la ruta de
  // apertura; los refrescos (focus: false) no roban el foco.
  const landing = await readFile(new URL('../public/js/landing.js', import.meta.url), 'utf8');
  assert.match(landing, /if \(focus && isOpenRoute\(\)\) \{\s*focusWeatherCard\(root\.querySelector\('#local-weather-card'\)\)/);
  // Si la carga falla sin tarjeta SSR, el foco va al estado de aviso.
  assert.match(landing, /if \(focus && isOpenRoute\(\)\) focusWeatherFallback\(root\)/);
});
