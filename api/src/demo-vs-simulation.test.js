import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderDemoDetails } from '../public/js/panel.js';

const read = async (name) => readFile(new URL(name, import.meta.url), 'utf8');
const view = await readFile(new URL('../views/index.html', import.meta.url), 'utf8');
const panel = await read('../public/js/panel.js');
const sim = await read('../public/js/farm-sim.js');
const taxonomy = await read('../public/js/notice-taxonomy.js');
const alerts = await read('../public/js/alerts.js');
const seo = await read('./seo.js');

// F15 · P2: «Demostración» nombraba a la vez el panel con estaciones reales y la
// demostración con datos inventados de la portada. El usuario tenía que
// reconstruir la diferencia leyendo. Tres palabras, tres significados:
//   real      → el dato viene de una estación de verdad
//   consulta  → el alcance del acceso (qué puedes ver)
//   simulación→ el dato está inventado

test('el panel de consulta declara que sus datos son reales', () => {
  assert.match(panel, /ESTACIÓN URBANA REAL · ACCESO DE CONSULTA/);
  assert.match(panel, /Datos reales medidos por la estación/);
  // Y ya no se presenta como «demostración»: esa palabra describía también al
  // simulador, que es otra cosa.
  const heading = panel.slice(panel.indexOf('renderDemoPanel(root)'));
  assert.doesNotMatch(heading, /DEMOSTRACIÓN · SOLO LECTURA/,
    'el panel vuelve a llamarse demostración');
});

test('«solo lectura» describe el permiso, no el dato', () => {
  const heading = panel.slice(panel.indexOf('renderDemoPanel(root)'));
  // El permiso se declara como tal, junto a qué no se puede hacer.
  assert.match(heading, /Solo lectura: este acceso no permite editar, borrar ni configurar nada/);
});

test('la palabra «simulación» queda reservada a los datos inventados', () => {
  // El panel remite a la simulación como otra cosa, nunca como lo que él muestra.
  assert.match(panel, /La simulación con datos inventados está en la portada y nunca aparece en este panel/);
  // Y la taxonomía no usa «demostración» para describir la naturaleza de un dato.
  assert.doesNotMatch(taxonomy, /de la demostración/);
  assert.match(taxonomy, /Valor inventado de la simulación/);
  assert.match(taxonomy, /simulation: \{ label: 'Simulación', nature: 'simulado' \}/);
});

test('el simulador público se llama simulación en toda la portada', () => {
  const vias = view.slice(view.indexOf('id="vias"'), view.indexOf('id="comparacion-aemet"'));
  assert.match(vias, /<h3>Ver la simulación<\/h3>/);
  assert.doesNotMatch(vias, /Ver la demostración/);
  // Cada vía declara de qué clase es su dato: inventados o reales.
  assert.match(vias, /SIN REGISTRARTE · DATOS INVENTADOS/);
  assert.match(vias, /ACCESO INMEDIATO · DATOS REALES/);
  assert.match(vias, /La estación urbana real está arriba, sin registro/);
  // El propio bloque del simulador, no solo la tarjeta que lleva a él.
  assert.match(view, /SIMULACIÓN INTERACTIVA · DATOS INVENTADOS/);
  assert.doesNotMatch(view, /DEMOSTRACIÓN INTERACTIVA/);
});

test('el acceso de consulta se nombra igual en todos los sitios', () => {
  // El centro de avisos decía «por la demostración»: era el mismo acceso con
  // otro nombre.
  assert.match(alerts, /acceso de consulta, pero no estás suscrito a sus avisos/);
  assert.doesNotMatch(alerts, /por la demostración/);
  assert.match(panel, /estaciones reales autorizadas para consulta/);
  assert.doesNotMatch(panel, /autorizadas para la demostración/);
  // Y la vía de entrada promete lo mismo que luego dice el panel.
  assert.match(view, /acceso de consulta a las mediciones reales/);
  assert.match(view, /acceso de consulta, solo lectura, a las mediciones reales/);
});

test('el detalle del periodo no mezcla los vocabularios', () => {
  const details = renderDemoDetails({
    coverage: {}, dewPoint: {}, aemet: { comparison: {} }, weekly: {}, limits: [],
  });
  assert.doesNotMatch(details, /demostración/i);
});

test('el buscador ya no recibe «demostración» como título de datos', () => {
  // El título del simulador nombra la simulación y su naturaleza.
  assert.match(seo, /'Simulación agrícola con datos inventados \| TecRural'/);
  assert.match(seo, /las mediciones reales están en la portada/);
  // La ruta interna no cambia: es un identificador de código, no un rótulo.
  assert.match(seo, /'\/demo-agricola'/);
});