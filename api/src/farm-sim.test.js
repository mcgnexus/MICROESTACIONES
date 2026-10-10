import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SIM_SCENARIOS, scenarioById, buildScenario, coldestGap, clockLabel, formatDuration,
  firstCrossing, heatStressNote, interpolate, initialSimulationState, renderSimulationResult,
  sampleSeries, thresholdIntervals, totalMinutes, renderSimulationShell,
} from '../public/js/farm-sim.js';

const cold = scenarioById('noche-fria');
const heat = scenarioById('jornada-calurosa');
const zones = scenarioById('zonas-finca');

test('the three scenarios are simulated and clearly labelled as such', () => {
  assert.deepEqual(SIM_SCENARIOS.map((scenario) => scenario.id),
    ['noche-fria', 'jornada-calurosa', 'zonas-finca']);
  // Ningún escenario depende de datos reales: todo sale de puntos de control fijos.
  for (const scenario of SIM_SCENARIOS) {
    assert.ok(scenario.series.length >= 1);
    assert.ok(scenario.series.every((definition) => definition.control.length >= 2));
  }
  // La simulación se declara una vez, con etiqueta persistente, y no en cada
  // párrafo: el origen sigue siendo visible sin depender de leer el detalle.
  const shell = renderSimulationShell();
  assert.match(shell, /data-origin="simulated"/);
  assert.match(shell, />Simulación</);
  // Y la etiqueta va antes que la explicación: se ve sin desplegar nada.
  assert.ok(shell.indexOf('data-origin="simulated"') < shell.indexOf('Qué es exactamente esta demostración'));
  // El detalle plegado sigue declarando que no hay avisos reales ni envíos.
  assert.match(shell, /no crean avisos reales, no envían mensajes/);
});

test('interpolating control points stays inside the declared range', () => {
  const control = [[0, 10], [60, 4]];
  assert.equal(interpolate(control, 0), 10);
  assert.equal(interpolate(control, 60), 4);
  assert.equal(interpolate(control, 30), 7);
  assert.equal(interpolate(control, -30), 10, 'fuera del rango usa el extremo');
  assert.equal(interpolate(control, 999), 4);
});

test('raising the threshold makes the cold crossing happen earlier', () => {
  const points = sampleSeries(cold, cold.series[1]);
  const low = firstCrossing(points, -1, 'below');
  const middle = firstCrossing(points, 2, 'below');
  const high = firstCrossing(points, 6, 'below');
  assert.ok(low && middle && high, 'los tres umbrales se cruzan en esta noche simulada');
  assert.ok(low.t > middle.t && middle.t > high.t,
    'umbral más bajo = cruce más tarde: -1 °C a las ' + clockLabel(cold.start, low.t)
    + ', 2 °C a las ' + clockLabel(cold.start, middle.t)
    + ', 6 °C a las ' + clockLabel(cold.start, high.t));
});

test('a threshold that the series never reaches produces no crossing', () => {
  const points = sampleSeries(cold, cold.series[1]);
  assert.equal(firstCrossing(points, -50, 'below'), null);
  const heatPoints = sampleSeries(heat, heat.series[0]);
  assert.equal(firstCrossing(heatPoints, 60, 'above'), null, 'la jornada simulada no llega a 60 °C');
  const html = renderSimulationResult(cold, -50);
  assert.match(html, /No se cruzaría con este umbral/);
});

test('the cold scenario distinguishes forecast, observed descent and local threshold', () => {
  const built = buildScenario(cold, 2);
  const labels = built.series.map((item) => item.label);
  assert.equal(labels.length, 2);
  assert.match(labels[0], /Previsión externa/);
  assert.match(labels[1], /Descenso observado/);
  // Las etiquetas ya no arrastran el qualified «(simulado)»: lo declara una vez
  // la insignia del escenario, no cada fila del resultado.
  const html = renderSimulationResult(cold, 2);
  assert.match(html, /Previsión externa/);
  assert.match(html, /Descenso observado/);
  assert.match(html, /Umbral local/);
  assert.match(html, /2,0 °C/);
  // Las dos curvas son distintas: la previsión ilustrativa no replica lo medido.
  assert.notDeepEqual(built.series[0].points.map((point) => point.temperatureC),
    built.series[1].points.map((point) => point.temperatureC));
});

test('sustained heat is measured as duration, not as a diagnosis', () => {
  const built = buildScenario(heat, 30);
  const item = built.series[0];
  assert.ok(item.sustained > 240, `horas por encima del umbral: ${item.sustained}`);
  const html = renderSimulationResult(heat, 30);
  assert.match(html, /por encima del umbral/i);
  assert.match(html, /orientativo/);
  assert.match(html, /no es un diagnóstico veterinario ni una recomendación válida/);
  assert.doesNotMatch(html, /golpe de calor/);
  // Subir el umbral por encima del máximo simulado elimina el tramo sostenido.
  const veryHigh = buildScenario(heat, 40);
  assert.equal(veryHigh.series[0].sustained, 0);
  assert.ok(veryHigh.series[0].sustained < item.sustained, 'umbral más alto = menos tiempo');
});

test('heat notes describe ambient conditions with escalating caution', () => {
  const none = heatStressNote(0);
  assert.equal(none.tone, 'muted');
  const short = heatStressNote(90);
  assert.equal(short.tone, 'warn');
  assert.match(short.text, /Condiciones cálidas/);
  const long = heatStressNote(300);
  assert.equal(long.tone, 'alert');
  assert.match(long.text, /Riesgo orientativo de estrés térmico/);
  for (const note of [none, short, long]) {
    assert.doesNotMatch(note.text, /golpe de calor|diagnóstico de/);
  }
});

test('the zones scenario shows a gap and states that one station is one site', () => {
  const built = buildScenario(zones, 2);
  assert.equal(built.series.length, 2);
  const labels = built.series.map((item) => item.label);
  assert.ok(labels.some((label) => /hondonada/i.test(label)));
  assert.ok(labels.some((label) => /zona alta/i.test(label)));
  const gap = coldestGap(zones, built);
  assert.ok(Math.abs(gap.gap) > 3, `diferencia simulada ${gap.gap} °C`);
  assert.match(gap.label, /^\d{2}:\d{2}$/);
  // Con el umbral por defecto solo la hondonada cruza: mismo umbral, otra historia.
  const hondonada = built.series.find((item) => item.id === 'hondonada');
  const alta = built.series.find((item) => item.id === 'zona-alta');
  assert.ok(hondonada.crossing);
  assert.equal(alta.crossing, null);
  const html = renderSimulationResult(zones, 2);
  assert.match(html, /exige un sensor en cada uno de ellos/);
});

test('clock labels roll over midnight from the scenario start', () => {
  assert.equal(clockLabel({ hour: 18, minute: 0 }, 0), '18:00');
  assert.equal(clockLabel({ hour: 18, minute: 0 }, 60), '19:00');
  assert.equal(clockLabel({ hour: 18, minute: 0 }, 360), '00:00');
  assert.equal(clockLabel({ hour: 18, minute: 0 }, 720), '06:00');
  assert.equal(clockLabel({ hour: 6, minute: 30 }, 90), '08:00');
  assert.equal(clockLabel({ hour: 20, minute: 0 }, 840), '10:00');
});

test('interval maths covers the crossing window and formats durations', () => {
  const points = [{ t: 0, temperatureC: 5 }, { t: 60, temperatureC: 1 }, { t: 120, temperatureC: 3 }];
  const intervals = thresholdIntervals(points, 2, 'below');
  assert.equal(intervals.length, 1);
  // 5 -> 1 cruza 2 a los 45 min; 1 -> 3 sale de 2 a los 90 min.
  assert.equal(Math.round(intervals[0].from), 45);
  assert.equal(Math.round(intervals[0].to), 90);
  assert.equal(totalMinutes(intervals), 45);
  assert.equal(firstCrossing(points, 2, 'below').t, 45);
  // Subir el umbral adelanta el momento del cruce.
  assert.equal(firstCrossing(points, 4, 'below').t, 15);
  assert.ok(thresholdIntervals(points, 4, 'below')[0].from < intervals[0].from);
  assert.equal(formatDuration(60), '1 h');
  assert.equal(formatDuration(90), '1 h 30 min');
  assert.equal(formatDuration(45), '45 min');
  assert.equal(formatDuration(240), '4 h');
});

test('the interaction stays local: no API, no alerts, no messages', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../public/js/farm-sim.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /fetch\s*\(/);
  assert.doesNotMatch(source, /api\s*\(/);
  assert.doesNotMatch(source, /\/api\//);
  assert.doesNotMatch(source, /INSERT INTO|alert_rules|notification_outbox/);
  assert.match(source, /los avisos que ves aquí son simulados/i);
  assert.match(source, /solo existen en esta demostración/);
  // Lo simulado se declara como tal en la taxonomía y no se usa fuera de aquí.
  const { classifyNotice, NOTICE_CATEGORIES } = await import('../public/js/notice-taxonomy.js');
  const meta = classifyNotice({ simulated: true });
  assert.equal(meta.nature, 'simulado');
  assert.equal(meta.categoryLabel, 'Aviso agrícola simulado');
  assert.equal(NOTICE_CATEGORIES.simulated.audience, 'demo');
});

test('initial state starts on the cold night with its default threshold', () => {
  const state = initialSimulationState();
  assert.equal(state.scenarioId, 'noche-fria');
  assert.equal(state.scenarioId, SIM_SCENARIOS[0].id);
  assert.equal(state.thresholds['noche-fria'], 2);
  assert.equal(state.thresholds['jornada-calurosa'], 30);
  assert.equal(state.thresholds['zonas-finca'], 2);
  assert.equal(state.explored, false);
});

test('the landing page exposes the simulation as a public section with its route', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('../views/index.html', import.meta.url), 'utf8');
  assert.match(html, /id="demo-agricola"/);
  assert.match(html, /data-farm-sim/);
  assert.match(html, /SIMULACIÓN/);
  assert.match(html, /no crea avisos reales|no crea avisos/i);

  const landing = await readFile(new URL('../public/js/landing.js', import.meta.url), 'utf8');
  assert.match(landing, /'demo-agricola'/, 'la sección es pública, no pide sesión');
  assert.match(landing, /renderSimulationShell/);
  assert.match(landing, /mountLeadForms\(\)/);

  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /'\/demo-agricola'/, 'existe ruta directa al formulario');
});

test('the post-exploration prompt asks for municipality, crop or livestock and future interest', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../public/js/farm-sim.js', import.meta.url), 'utf8');
  assert.match(source, /municipio, tu cultivo o tu ganado/);
  assert.match(source, /interés en una futura instalación/);
  assert.match(source, /data-lead-embed/, 'reutiliza el formulario público de captación');
  assert.match(source, /futura_instalacion/, 'precarga el interés de futura instalación');
  assert.match(source, /no programa ninguna instalación/);
});
