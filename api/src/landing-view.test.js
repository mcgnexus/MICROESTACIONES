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
  // solo «entrar» redirige al panel; «landing» invoca showLandingView().
  const route = sliceBetween('if (!session.me) {', 'showApp();');
  assert.match(route, /showLandingView\(\)/);
  // La redirección a panel queda confinada al caso entrar: todo location.hash a
  // #/panel está dentro de un `if (section === 'entrar')`.
  const panelRedirects = (route.match(/location\.hash = '#\/panel'/g) || []);
  assert.ok(panelRedirects.length >= 1, 'entrar sigue redirigiendo al panel');
  const guard = route.indexOf("section === 'entrar'");
  const firstRedirect = route.indexOf("location.hash = '#/panel'");
  assert.ok(guard > -1 && firstRedirect > guard,
    'la redirección al panel debe estar tras comprobar section === entrar');
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
