import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { originBadge, originLegend, ORIGIN_LABELS } from '../public/js/origin-labels.js';
import { renderSimulationShell, renderSimulationResult, scenarioById } from '../public/js/farm-sim.js';

const read = (name) => readFile(new URL(`../public/js/${name}`, import.meta.url), 'utf8');
const view = await readFile(new URL('../views/index.html', import.meta.url), 'utf8');
const panel = await read('panel.js');

// F11 · P2: la precisión sobre punto urbano, finca, fuentes, simulación y
// validación es necesaria, pero reaparecía en introducciones, tarjetas,
// metodología y pie. Estas pruebas fijan que la declaración se hace con
// etiquetas persistentes y que el origen y la antigüedad nunca se pierden.

test('las etiquetas nombran la procedencia sin tener que desplegar nada', () => {
  assert.match(originBadge('medido'), />Medido</);
  assert.match(originBadge('forecast', { provider: 'aemet' }), />Previsión AEMET</);
  assert.match(originBadge('forecast', { provider: 'openmeteo' }), />Previsión Open-Meteo</);
  assert.match(originBadge('simulated'), />Simulación</);
  assert.match(originBadge('calculated'), />Calculado</);
});

test('la etiqueta conserva el origen y la antigüedad del dato', () => {
  // Quitar la explicación repetida no puede significar quitar el origen: la
  // fecha de la medida sigue en la propia etiqueta.
  const badge = originBadge('medido', { observedAt: '2026-01-01T12:00:00Z', extra: 'No demuestra calibración.' });
  assert.match(badge, /2026/, 'la etiqueta pierde la hora de la lectura');
  assert.match(badge, /No demuestra calibración/);
  // La explicación completa queda disponible, no eliminada.
  assert.match(badge, /controles autom/);
  assert.match(badge, /title=/);
});

test('la leyenda explica las etiquetas una vez por contexto, y solo si hay varias', () => {
  const many = originLegend([
    { kind: 'medido' }, { kind: 'forecast', provider: 'aemet' }, { kind: 'calculated' },
  ]);
  assert.match(many, /<details class="origin-legend">/);
  assert.match(many, />Medido</);
  assert.match(many, />Previsión AEMET</);
  assert.match(many, />Calculado</);
  // Con una sola etiqueta la explicación se estorba más de lo que ayuda.
  assert.equal(originLegend([{ kind: 'medido' }]), '');
  assert.equal(originLegend([]), '');
});

test('la demostración se declara con la etiqueta, no repitiéndolo en cada párrafo', () => {
  const shell = renderSimulationShell();
  assert.match(shell, /data-origin="simulated"/);
  assert.match(shell, />Simulación</);
  // Las series ya no arrastran el «(simulado)» ni el «(ilustrativa)» en su nombre:
  // la etiqueta del contexto lo dice por todas.
  assert.doesNotMatch(shell, /\(simulad/);
  assert.doesNotMatch(shell, /Descenso observado \(/);
  assert.doesNotMatch(shell, /Máximo simulado/);
  // Y el aviso de que no hay avisos reales sobrevive, plegado.
  assert.match(shell, /no crean avisos reales, no envían mensajes/);
  assert.match(shell, /<details class="sim-safety">/);
});

test('el origen y los límites siguen visibles donde el dato se usa', () => {
  // La advertencia veterinaria pertenece al resumen del escenario cálido, que es
  // donde se hace una afirmación sobre el ganado: no se puede dejar solo en el
  // desplegable general.
  const result = renderSimulationResult(scenarioById('jornada-calurosa'), 30);
  assert.match(result, /no es un diagnóstico veterinario/);
  // Y la serie de previsión sigue nombrándose como tal en la leyenda, para que
  // la discontinuidad no se lea como un dato medido.
  const shell = renderSimulationShell();
  assert.match(shell, /lo que un proveedor externo habría previsto/i);
  assert.match(shell, /A[uú]n no ha ocurrido/);
});

test('las explicaciones largas se concentran en un bloque por panel', () => {
  // «Las alertas son orientativas, no avisos oficiales» aparecía dos veces, una
  // por panel, además de la nota global: ahora es una vez, en la documentación.
  assert.equal((panel.match(/Las alertas son orientativas, no avisos oficiales/g) || []).length, 0);
  assert.match(panel, /Los avisos propios son orientativos y no son avisos oficiales/);
  // Y las fuentes siguen nombradas donde se muestran.
  assert.match(panel, /Fuentes: <a href="https:\/\/open-meteo\.com\/"/);
});

test('las fuentes externas se distinguen por etiqueta, no por un badge genérico', () => {
  assert.match(panel, /originBadge\('forecast', \{ provider: aemetHasForecast \? 'aemet' : 'openmeteo'/);
  // El rótulo anterior («Fuentes externas, separadas de las mediciones») solo
  // decía que eran externas, no cuáles.
  assert.doesNotMatch(panel, /Fuentes externas, separadas de las mediciones/);
});

test('la nota global del pie no repite lo que ya declara cada pantalla', () => {
  const footnote = view.match(/<p class="footnote">([\s\S]*?)<\/p>/)[1];
  // La advertencia de fuentes y de validación ya vive en la documentación y en
  // las etiquetas; el pie conserva solo lo que no se ve en ninguna otra parte.
  assert.doesNotMatch(footnote, /se identifican por su proveedor/, 'el pie repite lo que ya dice la etiqueta');
  assert.match(footnote, /Las gráficas muestran solo mediciones validadas/);
  assert.match(footnote, /etiqueta de procedencia/);
});