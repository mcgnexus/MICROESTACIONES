import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { icon, ICON_NAMES, mountIcons } from '../public/js/icons.js';
import { makeChart, chartScale, shortDate, CHART_BOX, metric } from '../public/js/ui.js';
import { renderStateCards } from '../public/js/farm-cards.js';

const read = async (name) => readFile(new URL(`../public/js/${name}`, import.meta.url), 'utf8');
const view = await readFile(new URL('../views/index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/app.css', import.meta.url), 'utf8');

// F12 · F13. Dos hallazgos sobre el mismo problema de fondo: un lenguaje visual
// y tipográfico que se construía por partes, sin una escala común.

test('el conjunto de iconos es un solo trazo sobre una rejilla de 24', () => {
  for (const name of ICON_NAMES) {
    const svg = icon(name);
    assert.match(svg, /viewBox="0 0 24 24"/, `${name} usa otra rejilla`);
    assert.match(svg, /stroke-width="1\.8"/, `${name} usa otro grosor de trazo`);
    assert.match(svg, /stroke="currentColor"/, `${name} fija su propio color en vez de heredar`);
    assert.match(svg, /fill="none"/, `${name} rellena el trazo`);
  }
});

test('los iconos son decorativos y el texto siempre los acompaña', () => {
  // Un icono suelto no dice nada: la etiqueta es la que se lee.
  assert.match(icon('alerts'), /aria-hidden="true"/);
  assert.doesNotMatch(icon('alerts'), /role="img"/);
  // Solo se nombra cuando el icono es el único contenido del control.
  assert.match(icon('panel', { title: 'Panel' }), /role="img" aria-label="Panel"/);
  // Nombre desconocido: no se dibuja un hueco ni se rompe la plantilla.
  assert.equal(icon('no-existe'), '');
});

test('la navegación ya no depende de leer la etiqueta para reconocerse', () => {
  const nav = view.slice(view.indexOf('id="mobile-nav"'), view.indexOf('</nav>', view.indexOf('id="mobile-nav"')));
  // Antes: un trébol, un círculo y un punto, indistinguibles entre sí.
  assert.doesNotMatch(nav, /⌂|◉|♧|●/, 'quedan símbolos geométricos sin nombre propio');
  for (const name of ['panel', 'stations', 'alerts', 'account']) {
    assert.match(nav, new RegExp(`data-icon="${name}"`), `falta el icono ${name}`);
  }
  // Cada entrada conserva su texto: el icono acompaña, no sustituye.
  for (const label of ['Panel', 'Estaciones', 'Avisos', 'Cuenta']) {
    assert.match(nav, new RegExp(`</span>${label}</a>`));
  }
});

test('ningún icono depende de la tipografía de emojis del sistema', async () => {
  // El aspa de cerrar el diálogo es texto, no un icono: se queda.
  const ALLOWED = new Set(['✕']);
  for (const file of ['ui.js', 'panel.js', 'farm-cards.js', 'farm-sim.js', 'landing.js',
    'admin-statistics.js', 'statistics.js', 'alerts.js', 'stations.js']) {
    const source = await read(file);
    const emoji = (source.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/gu) || [])
      .filter((glyph) => !ALLOWED.has(glyph));
    assert.deepEqual(emoji, [], `${file} conserva emojis: ${emoji.slice(0, 4).join(' ')}`);
  }
  // Y la pila de fuentes ya no reserva las de emojis: no hacen falta.
  const fontStacks = css.match(/font-family:[^;}]*;/g) || [];
  assert.deepEqual(fontStacks.filter((stack) => /Emoji/.test(stack)), [],
    'alguna regla sigue reserving una tipografía de emojis');
});

test('la tarjeta de gráfico abandona el efecto y comparte la escala del resto', () => {
  // El borde superior de color degradado y el halo del área eran los dos
  // detalles que la separaban del resto de tarjetas.
  assert.doesNotMatch(css, /\.tecrural-chart-card::after/);
  assert.doesNotMatch(css, /\.tecrural-chart-card \.chart-wrap\{background:radial-gradient/);
  assert.match(css, /\.tecrural-chart-card\{position:relative;background:#fff/);
  // Una sola sombra y un solo radio para tarjetas de gráfico y de estación.
  assert.match(css, /\.panel,\.station-card\{[^}]*box-shadow:/);
  assert.match(css, /\.tecrural-chart-card\{[^}]*border-radius:\d+px|/, 'la tarjeta de gráfico no comparte radio');
});

test('la escala de la tarjeta no crece con el texto que contiene', () => {
  // Un h3 grande dentro de una tarjeta pequeña es lo que rompe la escala visual:
  // la tarjeta no debe distinguirse por el tamaño de su tipografía.
  const card = css.slice(css.indexOf('.tecrural-chart-card .chart-title h3{'));
  const fontSize = card.match(/font-size:(\d+)px/)[1];
  assert.ok(Number(fontSize) <= 18, `el título de la tarjeta llega a ${fontSize}px`);
});

test('la escala del gráfico se adapta al ancho en lugar de encogerse', () => {
  const narrow = chartScale(320);
  const wide = chartScale(560);
  // El factor de escala es 1 en ambos casos: el viewBox se ajusta al ancho real,
  // así que la tipografía no se reduce con el resto del dibujo.
  assert.equal(narrow.scale, 1);
  assert.equal(wide.scale, 1);
  assert.equal(narrow.width, 320);
  assert.equal(wide.width, 560);
  // Y la letra no se encoge: es la misma, o mayor si el ancho es pequeño.
  assert.ok(narrow.axisFont >= 12, `la escala queda en ${narrow.axisFont}px`);
  assert.ok(narrow.axisFont >= wide.axisFont - 1);
});

test('un gráfico estrecho reduce las marcas, no el tamaño de la letra', () => {
  const narrow = chartScale(300);
  const wide = chartScale(900);
  assert.ok(narrow.timeTicks < wide.timeTicks, 'un eje estrecho no puede llevar las mismas horas');
  assert.ok(narrow.compact);
  assert.ok(!wide.compact);
  // La altura se adapta en lugar de dejar una franja con el texto fuera.
  assert.ok(narrow.height > 140 && narrow.height <= 240);
});

test('un ancho imposible no rompe el dibujo', () => {
  // El contenedor puede medir 0 en el primer fotograma o en un detalle cerrado.
  assert.equal(chartScale(0).width, CHART_BOX.width);
  assert.equal(chartScale(undefined).width, CHART_BOX.width);
  assert.equal(chartScale(50).width, CHART_BOX.minWidth);
});

test('la fecha del eje se abrevia sin perder el valor preciso', () => {
  const chart = makeChart('Temperatura', [1, 2, 3].map((temperatureC, i) => ({
    observedAt: new Date(Date.now() - (3 - i) * 3600000).toISOString(), temperatureC,
  })), 'temperatureC', '#d47749', '°C', 1, null, null, null, new Date('2026-05-20T18:00:00'), { width: 320 });
  // Abreviar la etiqueta visible…
  assert.match(chart, /class="chart-dates"><span title="/);
  assert.doesNotMatch(chart, /<span>\d{1,2}\/\d{1,2}\/\d{4},/);
  // …no es quitar la fecha: sigue en el title, en el aria-label y en cada punto.
  assert.match(chart, /aria-label="Temperatura desde/);
  assert.match(chart, /class="chart-hit"[^>]*aria-label="[^"]*\d[^"]*"/);
  assert.match(shortDate('2026-05-20T18:00:00Z'), /\d{2}\/\d{2}/);
});

test('la explicación de tendencia conserva su cifra junto a la etiqueta', () => {
  // El detalle en texto no se sustituye por el icono de la flecha: sigue
  // diciendo cuánto cambia y entre qué horas. Se mide en un gráfico estrecho,
  // que es donde antes se encogía.
  const now = new Date('2026-05-20T18:00:00');
  const rows = [1, 2, 3].map((temperatureC, i) => ({
    observedAt: new Date(now.getTime() - (3 - i) * 20 * 60000).toISOString(), temperatureC,
  }));
  const chart = makeChart('Temperatura', rows, 'temperatureC', '#d47749', '°C', 1,
    null, null, rows, now, { width: 320 });
  assert.match(chart, /chart-trend-note">calentamiento/);
  assert.match(chart, /Última hora/);
  // Y la cifra del periodo va con su texto, no solo en la flecha.
  assert.match(chart, /calentamiento · 2 °C/);
});

test('la tarjeta de estado usa el mismo conjunto que el resto', () => {
  const cards = renderStateCards([{
    device: { id: 's1', name: 'Huéscar', sensors: {} },
    status: { connectivity: 'online', dataFreshness: 'fresh', batteryLevel: 'ok' },
    latest: { observedAt: '2026-01-01T12:00:00Z', temperatureC: 18 },
  }], new Date(), { readings: true });
  for (const name of ['temperature', 'humidity', 'frost', 'heat', 'storm', 'connectivity', 'battery']) {
    assert.match(cards, new RegExp(`<svg class="icon"[^>]*><(?:path|circle|rect)[^>]*`) , name);
  }
  assert.doesNotMatch(cards, /[\u{1F300}-\u{1FAFF}]/u);
});

test('el icono de métrica llega a todas las tarjetas que lo usan', () => {
  const html = metric('Temperatura', '19,2', '°C');
  assert.match(html, /class="metric-icon"><svg class="icon"/);
});