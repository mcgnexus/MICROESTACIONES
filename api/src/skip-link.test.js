import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// F03: el enlace «Saltar al contenido» usa el mismo tipo de fragmento que el
// enrutador (#main-content frente a #/panel). Al activarlo se disparaba
// hashchange -> route() con una sección desconocida, que acababa en el Panel y
// tiraba la pantalla, sus filtros y la sección activa del menú.
//
// Se ejecuta el código real de app.js sobre un DOM mínimo, no una copia: si el
// manejador deja de invocarse, este test falla igual que lo haría el navegador.
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

const sliceBetween = (from, to) => {
  const start = app.indexOf(from);
  assert.ok(start > -1, `no se encontró ${from} en app.js`);
  const end = app.indexOf(to, start);
  assert.ok(end > start, `no se encontró ${to} después de ${from}`);
  return app.slice(start, end);
};

const isRouteFragmentSource = sliceBetween('function isRouteFragment', 'function highlightNav');
const skipLinkSource = sliceBetween('function focusMainContent', "window.addEventListener('hashchange'");

// Reproduce el salto desde una pantalla concreta y devuelve lo que la página
// haría después de activarlo con Enter.
function activateSkipLink({ hash }) {
  const location = { hash };
  const main = {
    focused: false,
    focus(options) {
      if (options && options.preventScroll === undefined) {
        throw new Error('el foco se pide con preventScroll para no depender del navegador');
      }
      this.focused = true;
    },
    scrollIntoView() { this.scrolled = true; },
  };
  let prevented = false;
  let routed = 0;
  const link = {
    className: 'skip-link',
    closest: (selector) => (selector === '.skip-link' ? link : null),
  };
  const context = vm.createContext({
    location,
    $: (selector) => (selector === '#main-content' ? main : null),
    document: {
      addEventListener: (type, handler) => {
        if (type !== 'click') return;
        context.__click = handler;
      },
    },
    route: () => { routed += 1; },
  });
  vm.runInContext(`${isRouteFragmentSource}\n${skipLinkSource}`, context);

  const before = { hash: location.hash };
  // El clic del navegador sobre el enlace: se.preventDefault() debe impedir que
  // el fragmento llegue a la barra de direcciones.
  const event = {
    target: link,
    preventDefault: () => { prevented = true; },
  };
  vm.runInContext('__click', context)(event);
  return { before, after: { hash: location.hash }, prevented, main, routed };
}

for (const [section, hash] of [
  ['Cuenta', '#/cuenta'],
  ['Avisos', '#/avisos'],
  ['Mediciones', '#/estaciones'],
  ['Panel', '#/panel'],
]) {
  test(`el salto al contenido desde ${section} no cambia de pantalla`, () => {
    const result = activateSkipLink({ hash });
    // La URL se conserva: el enlace no debe escribir nada en el fragmento.
    assert.equal(result.after.hash, result.before.hash, `la URL cambió a ${result.after.hash}`);
    assert.equal(result.prevented, true, 'no se canceló la navegación por defecto');
    // El foco y el desplazamiento se hacen explícitamente sobre <main>.
    assert.equal(result.main.focused, true, 'el foco no se movió a main');
    assert.equal(result.main.scrolled, true, 'la vista no se desplazó');
    // Y no se vuelve a enrutar, que es lo que traía el Panel.
    assert.equal(result.routed, 0);
  });
}

test('un fragmento que no es ruta no se enruta, pero una ruta sí', () => {
  const check = (hash) => vm.runInNewContext(`${isRouteFragmentSource}; isRouteFragment(${JSON.stringify(hash)})`);
  // Anclas dentro de la página: no son secciones.
  assert.equal(check('#main-content'), false);
  assert.equal(check('#local-weather-card'), false);
  // Rutas reales y el estado inicial: se enrutan con normalidad.
  assert.equal(check('#/cuenta'), true);
  assert.equal(check('#/estaciones/9'), true);
  assert.equal(check('#/'), true);
  assert.equal(check(''), true);
  assert.equal(check('#'), true);
});

test('route() abandona antes de tocar la vista cuando el fragmento no es ruta', () => {
  // Extracto la guarda y el arranque de route(): si se desmontara la vista,
  // el contador de render se movería y el test lo detectaría.
  const guard = sliceBetween('async function route()', 'homeMetric(!session.me');
  let homeMetricCalls = 0;
  const context = vm.createContext({
    location: { hash: '#main-content' },
    isRouteFragment: () => false,
    homeMetric: () => { homeMetricCalls += 1; },
    lockedMetric: () => {},
    session: { me: null },
  });
  // La guarda es lo que se ejecuta; el resto de la función no llega a correr.
  vm.runInContext(`${isRouteFragmentSource}\n${guard} return; }`, context);
  return vm.runInContext('route()', context).then(() => {
    assert.equal(homeMetricCalls, 0, 'la ruta llegó a trabajar la pantalla pese al ancla');
  });
});

test('el destino del salto es el <main> real, que puede recibir el foco', () => {
  const view = readFileSync(new URL('../views/index.html', import.meta.url), 'utf8');
  assert.match(view, /<a class="skip-link" href="#main-content">/);
  // tabindex="-1" es lo que permite que <main> reciba el foco; sin él, el
  // salto movería el scroll pero dejaría el foco donde estaba.
  assert.match(view, /<main id="main-content" tabindex="-1">/);
});