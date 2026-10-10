import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PUBLIC_PAGES } from './seo.js';

const html = await readFile(new URL('../views/index.html', import.meta.url), 'utf8');
const landing = await readFile(new URL('../public/js/landing.js', import.meta.url), 'utf8');
const leads = await readFile(new URL('../public/js/leads.js', import.meta.url), 'utf8');
const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
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

test('el CTA del tiempo local no vuelve a la sección donde ya está el visitante', () => {
  const local = section('tiempo-local');
  // La sección se llama «tiempo-local»: un enlace a ella no lleva a ninguna parte.
  assert.doesNotMatch(local, /href="#\/tiempo-local"/,
    'el CTA principal apunta a la sección en la que ya se está');
  // Lo que ofrece son las dos salidas reales desde la portada.
  assert.match(local, /href="#\/vias"/);
  assert.match(local, /href="#\/herramientas"/);
});

test('las tres vías se separan y cada una declara su resultado antes del enlace', () => {
  const vias = section('vias');
  const cards = vias.split('<article class="via-card">').slice(1);
  assert.equal(cards.length, 3, 'se esperaban tres caminos distintos');
  const expected = [
    ['Ver la simulación', '#/demo-agricola', /sin cre(ar|é) cuenta|no creas cuenta|ningún dato sale/i],
    ['Entrar con tu correo', '#/entrar', /acceso inmediato/i],
    ['Consultar una instalación', '#/solicitar-piloto', /hasta que te escribamos no hay acceso concedido/i],
  ];
  expected.forEach(([title, href, outcome], index) => {
    const card = cards[index];
    assert.ok(card.includes(title), `falta la vía «${title}»`);
    assert.ok(card.includes(`href="${href}"`), `«${title}» no lleva a ${href}`);
    assert.match(card, outcome, `«${title}» no declara su resultado`);
  });
});

test('cada vía dice qué NO hace, para que no se confundan entre sí', () => {
  const vias = section('vias');
  // La demostración no registra; entrar no espera al equipo; el formulario no
  // da acceso por sí solo. Son las tres confusiones que la FAQ resolvía tarde.
  const demo = vias.split('<article class="via-card">')[1];
  assert.match(demo, /simulad/i);
  assert.match(vias, /no es autom[aá]tico/i);
  assert.match(vias, /no programa una instalaci[oó]n/i);
});

test('el menú no promete un acceso gratuito que solo se concede por revisión', () => {
  // «Acceso gratuito» rótulo del formulario, que es revisado por el equipo:
  // se leía igual que «Entrar», que da acceso inmediato.
  const nav = html.slice(html.indexOf('id="public-nav"'), html.indexOf('</nav>', html.indexOf('id="public-nav"')));
  assert.match(nav, /href="#\/solicitar-piloto">Consultar instalación</);
  assert.doesNotMatch(nav, />Acceso gratuito</, 'el menú vuelve a mezclar las dos vías');
  assert.match(nav, /href="#\/entrar">Entrar</);
});

test('el formulario de instalación descarta las dos otras vías', () => {
  // Se rellena en tiempo de ejecución: el texto vive en leads.js.
  assert.match(leads, /no es la v[ií]a de acceso inmediato/i);
  assert.match(leads, /href="#\/entrar"/);
  assert.match(leads, /href="#\/demo-agricola"/);
  const request = section('solicitar-piloto');
  assert.match(request, /data-lead-title="Consultar una instalaci[oó]n"/);
  assert.doesNotMatch(request, /Solicita acceso gratuito/);
});

test('cada vía tiene ruta propia y aparece en el sitemap', () => {
  assert.match(app, /'\/vias': '#\/vias'/, 'no hay ruta directa a las vías');
  assert.match(app, /'\/como-empezar': '#\/vias'/);
  assert.match(landing, /'vias'/);
  assert.ok(PUBLIC_PAGES['/vias'], 'la sección de vías no tiene título propio');
  // El título del sitemap de installation no promete ya el acceso que se revisa.
  assert.match(PUBLIC_PAGES['/solicitar-piloto'][0], /Consultar una instalaci[oó]n/);
  assert.doesNotMatch(PUBLIC_PAGES['/solicitar-piloto'][0], /Solicita acceso gratuito/);
});

test('la explicación de las vías aparece antes que la FAQ y la FAQ la confirma', () => {
  assert.ok(html.indexOf('id="vias"') < html.indexOf('id="preguntas"'),
    'las vías se explican después de la FAQ');
  // La FAQ ya no es el único sitio donde se distinction: remite a las tres.
  const faq = section('preguntas');
  assert.match(faq, /diferencia entre las tres formas de empezar/i);
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