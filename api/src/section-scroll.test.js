import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const publicDir = new URL('../public/', import.meta.url);
const read = (name) => readFileSync(new URL(name, publicDir), 'utf8');

const app = read('app.js');
const landing = read('js/landing.js');
const css = read('app.css');
const view = readFileSync(new URL('../views/index.html', import.meta.url), 'utf8');

// F05: la cabecera es fija y, al pulsar un enlace de sección, el título quedaba
// debajo. .access-request declaraba 18px, muy por debajo de lo que la cabecera
// ocupa, y el resto de secciones no declaraba nada.

// `export` no es sintaxis válida para vm en este contexto: se retira y la
// función se expone en el ámbito global del contexto.
const landingSource = landing
  .slice(
    landing.indexOf('export function scrollToPublicSection'),
    landing.indexOf('export function selectUrbanStation'),
  )
  .replace('export function', 'function');

function scrollToSection(section, { reducedMotion = false, exists = true } = {}) {
  const focused = [];
  const scrolled = [];
  const makeNode = (tag) => ({
    tag,
    attributes: {},
    hasAttribute(name) { return name in this.attributes; },
    setAttribute(name, value) { this.attributes[name] = value; },
    focus(options) {
      focused.push({ tag, options });
      this.document.activeElement = this;
    },
    scrollIntoView(options) { scrolled.push(options); },
    querySelector() { return null; },
    document: null,
  });
  const target = makeNode('section');
  target.document = { activeElement: null };
  const context = vm.createContext({
    PUBLIC_SECTION_ALIASES: {},
    document: {
      activeElement: null,
      getElementById: (id) => (exists && id === section ? target : null),
    },
    window: { matchMedia: () => ({ matches: reducedMotion }) },
  });
  vm.runInContext(landingSource, context);
  vm.runInContext(`scrollToPublicSection(${JSON.stringify(section)})`, context);
  return { focused, scrolled, target };
}

test('al saltar a una sección el encabezado recibe el foco', () => {
  const { focused, scrolled } = scrollToSection('preguntas');
  assert.equal(focused.length, 1, 'nadie recibió el foco');
  // preventScroll: si el foco desplazara, anularía el scroll suave de después.
  assert.equal(focused[0].options.preventScroll, true);
  assert.equal(scrolled.length, 1, 'no se desplaza la vista a la sección');
  assert.equal(scrolled[0].block, 'start');
  assert.equal(scrolled[0].behavior, 'smooth');
});

test('el salto respeta la preferencia de movimiento reducido', () => {
  const { scrolled } = scrollToSection('preguntas', { reducedMotion: true });
  assert.equal(scrolled[0].behavior, 'auto');
});

test('el salto a una sección inexistente no lanza ni desplaza', () => {
  const { focused, scrolled } = scrollToSection('no-existe', { exists: false });
  assert.equal(scrolled.length, 0);
  assert.equal(focused.length, 0);
});

test('el desplazamiento descuenta la cabecera en todas las secciones, no solo en una', () => {
  // scroll-padding-top en el elemento raíz cubre scrollIntoView y los anclas
  // de todo el documento; una regla por sección se olvidaría en la siguiente.
  assert.match(css, /html\{scroll-padding-top:calc\(var\(--topbar-h\)/);
  // La declaración puntual que daba 18px ya no manda.
  assert.doesNotMatch(css, /\.access-request\{scroll-margin-top:18px\}/);
});

test('la altura de la cabecera se mide, no se supone', () => {
  assert.match(app, /--topbar-h/);
  // Se publica tras medir el alto real, y se vuelve a medir al cambiar.
  assert.match(app, /getBoundingClientRect\(\)\.height/);
  assert.match(app, /setProperty\('--topbar-h'/);
  assert.match(app, /addEventListener\('resize', syncTopbarHeight\)/);
  assert.match(app, /new ResizeObserver\(syncTopbarHeight\)\.observe/);
});

test('el valor por defecto cubre la cabecera antes de medir', () => {
  // Si el script no llega a ejecutarse, el desplazamiento no debe quedar a 0.
  assert.match(css, /--topbar-h:\d+px/);
  assert.ok(!/--topbar-h:\s*0px/.test(css));
});

test('cada sección de la portada tiene un encabezado que puede recibir el foco', () => {
  // El salto enfoca el h1/h2 de la sección. Si alguna se queda sin él, quien
  // navega con lector de pantalla aterriza en un destino sin contexto.
  const ids = [...view.matchAll(/<section id="([a-z-]+)"[^>]*class="landing-section[^"]*"/g)].map((m) => m[1]);
  assert.ok(ids.length >= 8, `solo se han encontrado ${ids.length} secciones`);
  for (const id of ids) {
    // algunas se rellenan en tiempo de ejecución (solicitar-piloto -> leads.js)
    if (id === 'solicitar-piloto') continue;
    const start = view.indexOf(`id="${id}"`);
    const next = view.indexOf('<section', start + 10);
    const chunk = view.slice(start, next > -1 ? next : view.length);
    assert.match(chunk, /<h[12][ >]/, `la sección ${id} no tiene encabezado`);
  }
});

test('el formulario de captación aporta el encabezado que el HTML no trae', () => {
  // solicitar-piloto está vacía en el HTML: su h2 lo inyecta leads.js. Si ese
  // h2 desapareciera, el salto dejaría de anunciar nada en «Acceso gratuito».
  assert.match(landing, /mountLeadForms\(\)/);
  const leads = read('js/leads.js');
  assert.match(leads, /<h2 data-lead-title><\/h2>/);
});