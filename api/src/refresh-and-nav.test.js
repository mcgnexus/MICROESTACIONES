import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const app = read('../public/app.js');
const panel = read('../public/js/panel.js');

const slice = (source, from, to) => {
  const start = source.indexOf(from);
  assert.ok(start > -1, `no se encontró ${from}`);
  const end = source.indexOf(to, start + from.length);
  assert.ok(end > start, `no se encontró ${to} después de ${from}`);
  return source.slice(start, end);
};

// F25 · P2: el panel se refresca cada 15 minutos, pero ese intervalo solo
// existía en código. Ahora se ve: botón «Actualizar», marca de última consulta
// (distinta de la última medición) y carga anunciada mientras llega la
// respuesta, sin borrar lo que ya se muestra.

test('los tres paneles ofrecen «Actualizar» y una marca de última consulta', () => {
  // El botón y la marca viven en una sola plantilla compartida por los tres
  // paneles: así ningún panel puede quedarse sin la marca de consulta.
  const controls = slice(panel, 'function refreshControls', 'function createRefreshState');
  assert.match(controls, /data-refresh>/);
  assert.match(controls, /data-refresh-status/);
  assert.match(controls, /Actualizar<\/button>/);
  assert.match(controls, /Última consulta/);
  assert.equal((panel.match(/\$\{refreshControls\(\)\}/g) || []).length, 3,
    'los tres paneles deben incluir los controles de refresco');
  const listeners = (panel.match(/\$\('\[data-refresh\]', root\)\.addEventListener/g) || []);
  assert.equal(listeners.length, 3, 'cada panel debe enganchar su botón');
  assert.equal((panel.match(/= createRefreshState\(root\)/g) || []).length, 3);
});

test('la última consulta no se confunde con la última medición', () => {
  const helper = slice(panel, '// ---- Refresco visible del panel', 'function createRefreshState');
  assert.match(helper, /Última consulta/);
  assert.doesNotMatch(helper, /última medición:|Última medición:/,
    'la marca de refresco no debe nombrarse como la medición');
  // El estado distingue los tres momentos: pendiente, consultando y consultado.
  const state = slice(panel, 'function createRefreshState', '// Panel sencillo para el agricultor');
  assert.match(state, /Última consulta: pendiente/);
  assert.match(state, /Consultando/);
  assert.match(state, /Última consulta: \$\{dateText\(lastQueryAt\)\}/);
  assert.match(state, /lastQueryAt = new Date\(\)\.toISOString\(\)/);
});

test('mientras llega la respuesta se conservan los datos anteriores', () => {
  // Ninguna carga borra el DOM antes de recibir la respuesta: se mide sobre la
  // función de carga de cada panel, de su `begin` a su enganche.
  const loaders = [
    ['agricultor', 'async function renderSimplePanel', 'const loadDashboard = async',
      "mountMeasurements($('#simple-measurements'"],
    ['consulta', 'async function renderDemoPanel', 'const load = async () => {',
      "$('#period', root).addEventListener('change', load);"],
    ['administración', 'export async function renderPanel', 'const loadDashboard = async',
      "mountMeasurements($('#panel-measurements'"],
  ];
  for (const [name, fn, from, to] of loaders) {
    const fnStart = panel.indexOf(fn);
    assert.ok(fnStart > -1, `no se encuentra ${fn}`);
    const start = panel.indexOf(from, fnStart);
    assert.ok(start > -1, `no se encuentra la carga de ${name}`);
    const body = panel.slice(start, panel.indexOf(to, start));
    const begin = body.indexOf('refresh.begin()');
    const request = body.indexOf('await api(');
    const done = body.indexOf('refresh.done()');
    assert.ok(begin > -1 && request > -1 && done > -1, `faltan marcas de refresco en ${name}`);
    assert.ok(begin < request, `en ${name} el aviso de carga va después de la petición`);
    assert.ok(done > request, `en ${name} la consulta se marca antes de recibir datos`);
    assert.match(body, /refresh\.fail\(\);/, `en ${name} el error no devuelve el estado a reposo`);
  }
  const state = slice(panel, 'function createRefreshState', '// Panel sencillo para el agricultor');
  assert.match(state, /se conservan los datos anteriores/);
  // La carga se anuncia sobre el bloque que la cabecera encabeza.
  assert.match(state, /setAttribute\('aria-busy', 'true'\)/);
  assert.match(state, /removeAttribute\('aria-busy'\)/);
});

test('el intervalo de refresco sigue declarado y el botón lo dispara a demanda', () => {
  assert.match(panel, /const REFRESH_MS = 15 \* 60 \* 1000;/);
  // El refresco silencioso existe, pero ya no es la única vía.
  assert.match(panel, /silentRefresh, REFRESH_MS/);
  assert.match(panel, /\$\('\[data-refresh\]', root\)\.addEventListener\('click'/);
});

// F26 · P2: política uniforme de navegación y foco. La navegación superior no
// marcaba la sección activa, el título del documento no cambiaba en las
// pantallas privadas y el foco en la tarjeta grande dejaba el título y el
// selector de periodo fuera de pantalla en móvil.

test('la navegación superior e inferior marcan la sección activa igual', () => {
  const nav = slice(app, 'function highlightNav', 'const PAGE_TITLES');
  // Un solo bucle recorre las dos navegaciones: lo que hace arriba lo hace
  // abajo, con el mismo significado para quien navega con lector de pantalla.
  assert.match(nav, /for \(const \[nav, attribute\] of \[\[mainNav, 'data-nav'\], \[mobileNav, 'data-mobile-nav'\]\]\)/);
  assert.equal((nav.match(/link\.setAttribute\('aria-current', 'page'\)/g) || []).length, 1,
    'el mismo código marca aria-current en ambas navegaciones');
  assert.match(nav, /link\.removeAttribute\('aria-current'\)/);
  assert.match(nav, /classList\.toggle\('active', active\)/);
});

test('el título del documento sigue a la sección abierta', () => {
  assert.match(app, /const PAGE_TITLES = \{/);
  for (const [key, label] of [['panel', 'Panel'], ['estaciones', 'Estaciones'],
    ['avisos', 'Avisos'], ['cuenta', 'Cuenta'], ['admin', 'Administración']]) {
    assert.match(app, new RegExp(`${key}: '${label}'`), `falta el título de ${key}`);
  }
  assert.match(app, /const PUBLIC_PAGE_TITLE = 'Tiempo local medido en Huéscar \| TecRural'/);
  // route() lo aplica en cualquier entrada, y la pantalla de acceso nombra lo
  // que se ve: el formulario, no la sección pedida sin sesión.
  const route = slice(app, 'async function route()', 'setUnauthorizedHandler');
  assert.match(route, /setPageTitle\(section\)/);
  assert.match(route, /setPageTitle\('entrar'\)/);
  assert.match(app, /function setPageTitle\(section\) \{[\s\S]*?document\.title =/);
  // Cerrar sesión o caer la sesión no deja el título de una pantalla privada.
  const showLanding = slice(app, 'function showLanding()', 'function showLandingView');
  assert.match(showLanding, /setPageTitle\('landing'\)/);
  const showLogin = slice(app, 'function showLogin()', 'function showApp');
  assert.match(showLogin, /setPageTitle\('entrar'\)/);
});

test('al entrar en el panel el título y el selector de periodo siguen visibles', () => {
  const focus = slice(panel, 'function focusHeroSlot', 'function comparisonBlock');
  assert.match(focus, /hero\.focus\(\{ preventScroll: true \}\)/, 'el foco debe ir a la tarjeta');
  assert.match(focus, /querySelector\('\.page-heading'\)/, 'la vista se ancla a la cabecera');
  assert.match(focus, /block: 'start'/, 'la cabecera debe quedar arriba');
  assert.doesNotMatch(focus, /block: 'center'/,
    'centrar la tarjeta dejaba título y periodo fuera de pantalla en móvil');
  // Solo la primera carga mueve el scroll: el guardia heroFocused sigue ahí.
  assert.equal((panel.match(/heroFocused = true; focusHeroSlot/g) || []).length, 2);
  assert.match(panel, /if \(!heroFocused && data\.devices\.length\)/);
  // Y la ruta arranca cada sección en su cabecera, también el panel: antes
  // conservaba el scroll de la pantalla anterior.
  const route = slice(app, 'async function route()', 'setUnauthorizedHandler');
  assert.match(route, /window\.scrollTo\(\{ top: 0 \}\)/);
  assert.doesNotMatch(route, /section !== 'panel'/);
});
