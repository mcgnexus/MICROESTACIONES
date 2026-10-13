import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PUBLIC_PAGES } from './seo.js';

const html = await readFile(new URL('../views/index.html', import.meta.url), 'utf8');
const landing = await readFile(new URL('../public/js/landing.js', import.meta.url), 'utf8');
const leads = await readFile(new URL('../public/js/leads.js', import.meta.url), 'utf8');
const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const magic = await readFile(new URL('./magic-link.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/app.css', import.meta.url), 'utf8');

const section = (id) => {
  const start = html.indexOf(`id="${id}"`);
  assert.ok(start > -1, `no existe la sección ${id}`);
  const next = html.indexOf('<section', start + 10);
  return html.slice(start, next > -1 ? next : html.length);
};

// F10 · P2: la portada intentaba cubrir a la vez el tiempo público, la
// explicación del producto y la captación. Estas pruebas fijan que las tres
// cosas se offering como caminos separados y con resultados declarados.

test('el CTA del tiempo local ofrece acciones con resultado bajo la tarjeta', () => {
  const local = section('tiempo-local');
  // La sección se llama «tiempo-local»: un enlace a ella no lleva a ninguna parte.
  assert.doesNotMatch(local, /href="#\/tiempo-local"/,
    'el CTA principal apunta a la sección en la que ya está el visitante');
  // Bajo la tarjeta de medición van dos acciones con beneficio: histórico y finca.
  assert.match(local, /href="#\/entrar" data-return="evolucion">Consultar histórico/);
  assert.match(local, /href="#\/solicitar-piloto">Pedir información para instalar una estación/);
});

test('el acceso al histórico conserva el destino tras verificar el correo', () => {
  // La acción declara la herramienta de vuelta con `data-return`; el enrutador
  // de «entrar» la respeta en vez de imponer el panel por defecto, y el enlace
  // solicitado viaja como `next` (validado en el servidor).
  assert.match(html, /href="#\/entrar" data-return="evolucion"/);
  assert.match(app, /closest\?\.\('\[data-return\]'\)/);
  assert.match(app, /if \(section !== 'entrar'\) pendingReturn = section/);
  assert.match(app, /next: pendingReturn/);
  // El destino declarado es un fragmento interno conocido por el servidor.
  assert.match(magic, /\['evolucion', '#\/evolucion'\]/);
});

test('la acción de finca se repite tras explicar las diferencias de microclima', () => {
  const fincas = section('fincas');
  assert.match(fincas, /href="#\/solicitar-piloto">Pedir información para instalar una estación/,
    'falta la acción de finca después de la sección de microclima');
});

test('las dos acciones se separan y cada una declara su resultado antes del enlace', () => {
  const vias = section('vias');
  const cards = vias.split('<article class="via-card">').slice(1);
  assert.equal(cards.length, 2, 'se esperaban dos acciones, no tres tarjetas');
  const expected = [
    ['Consultar histórico', '#/entrar', /acceso de consulta a las mediciones reales/],
    ['Pedir información para instalar una estación', '#/solicitar-piloto', /revisamos tu solicitud y te contactamos/i],
  ];
  expected.forEach(([title, href, outcome], index) => {
    const card = cards[index];
    assert.ok(card.includes(title), `falta la vía «${title}»`);
    assert.ok(card.includes(`href="${href}"`), `«${title}» no lleva a ${href}`);
    assert.match(card, outcome, `«${title}» no declara su resultado`);
  });
  // El histórico usa el mismo destino declarado que el CTA del hero: tras
  // confirmar el enlace del correo se vuelve a la herramienta pedida.
  assert.match(cards[0], /href="#\/entrar" data-return="evolucion"/);
  // La simulación deja de ser tarjeta: queda como enlace secundario discreto.
  assert.match(vias, /href="#\/demo-agricola">simulación con datos inventados/);
});

test('las condiciones detalladas ya no se repiten en la portada: viven en la FAQ', () => {
  const vias = section('vias');
  const faq = section('preguntas');
  // El formulario tiene su propio aviso, cubierto por lead-form.test.js.
  assert.doesNotMatch(vias, /no es autom[aá]tico/i);
  assert.doesNotMatch(vias, /no programa una instalaci[oó]n/i);
  assert.match(faq, /no es autom[aá]tic[oa]/i);
  assert.match(faq, /no programa una instalaci[oó]n/i);
});

test('el menú no promete un acceso gratuito que solo se concede por revisión', () => {
  // «Acceso gratuito» rótulo del formulario, que es revisado por el equipo:
  // se leía igual que «Entrar», que da acceso inmediato.
  const nav = html.slice(html.indexOf('id="public-nav"'), html.indexOf('</nav>', html.indexOf('id="public-nav"')));
  assert.match(nav, /href="#\/solicitar-piloto">Pedir información para instalar una estación</);
  assert.doesNotMatch(nav, />Acceso gratuito</, 'el menú vuelve a mezclar las dos vías');
  assert.match(nav, /href="#\/entrar">Consultar histórico</);
  assert.match(nav, /href="#\/fincas">Fincas</);
});

test('la etiqueta principal de instalación se mantiene en todas las llamadas públicas', () => {
  const primary = 'Pedir información para instalar una estación';
  for (const surface of [html, leads]) assert.ok(surface.includes(primary), `falta la etiqueta «${primary}»`);
  for (const oldLabel of ['Quiero información para mi finca', 'Consultar una instalación', 'Medir en finca']) {
    assert.ok(!html.includes(oldLabel), `queda una etiqueta pública alternativa: «${oldLabel}»`);
  }
  assert.match(leads, /value="installation_info"> Pedir información para instalar una estación/);
  assert.match(leads, /value="pilot"> Solicitar una prueba del servicio en mi finca/);
});

test('el formulario de instalación descarta las dos otras vías', () => {
  // Se rellena en tiempo de ejecución: el texto vive en leads.js.
  assert.match(leads, /no es la v[ií]a de acceso inmediato/i);
  assert.match(leads, /href="#\/entrar"/);
  assert.match(leads, /href="#\/demo-agricola"/);
  const request = section('solicitar-piloto');
  assert.match(request, /data-lead-title="Pedir información para instalar una estación"/);
  assert.doesNotMatch(request, /Solicita acceso gratuito/);
});

test('cada vía tiene ruta propia y aparece en el sitemap', () => {
  assert.match(app, /'\/vias': '#\/vias'/, 'no hay ruta directa a las vías');
  assert.match(app, /'\/como-empezar': '#\/vias'/);
  assert.match(landing, /'vias'/);
  assert.ok(PUBLIC_PAGES['/vias'], 'la sección de vías no tiene título propio');
  // El título del sitemap de installation no promete ya el acceso que se revisa.
  assert.match(PUBLIC_PAGES['/solicitar-piloto'][0], /Pedir información para instalar una estación/);
  assert.doesNotMatch(PUBLIC_PAGES['/solicitar-piloto'][0], /Solicita acceso gratuito/);
});

test('la explicación de las vías aparece antes que la FAQ y la FAQ la confirma', () => {
  assert.ok(html.indexOf('id="vias"') < html.indexOf('id="preguntas"'),
    'las vías se explican después de la FAQ');
  // La FAQ explica la diferencia entre las dos acciones y remite a las tres
  // rutas: entrar, solicitar y la simulación como enlace secundario.
  const faq = section('preguntas');
  assert.match(faq, /diferencia hay entre consultar el histórico y pedir información para instalar una estación/i);
  for (const href of ['#/demo-agricola', '#/entrar', '#/solicitar-piloto']) {
    assert.ok(faq.includes(`href="${href}"`), `la FAQ no menciona ${href}`);
  }
});

test('«cómo empezar» es una sección pública con ruta propia', () => {
  assert.match(landing, /'vias'/);
  assert.match(landing, /empezar: 'vias'/);
  assert.match(html, /href="#\/vias"/);
});

test('las vías se apilan en una columna en móvil', () => {
  // La regla de escritorio aparece antes del bloque móvil: se busca el bloque
  // concreto, no la primera mención del selector.
  const mobile = css.split('@media(max-width:760px){').find((part) => part.includes('.vias-grid{grid-template-columns:1fr}'));
  assert.ok(mobile, 'no se encuentra el bloque móvil de las vías');
  assert.match(mobile, /\.vias-grid\{grid-template-columns:1fr\}/);
});
