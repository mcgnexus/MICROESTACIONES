import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { primaryReading, renderStationCard, renderUserSummary } from '../public/js/panel.js';

const source = await readFile(new URL('../public/js/panel.js', import.meta.url), 'utf8');

// El esqueleto de un panel: el HTML estático que escribe su renderizador.
function skeleton(fnName) {
  const start = source.indexOf(`async function ${fnName}`);
  assert.ok(start > -1, `no se encuentra ${fnName}`);
  const end = source.indexOf('`;', source.indexOf('root.innerHTML', start));
  assert.ok(end > start, `${fnName} no tiene plantilla de root.innerHTML`);
  return source.slice(start, end);
}

const order = (html) => [...html.matchAll(/data-panel-section="([^"]+)"/g)].map((match) => match[1]);

test('los paneles de usuario muestran primero el resumen y pliegan los detalles; administración conserva sus secciones', () => {
  for (const [name, fn] of [['panel del agricultor', 'renderSimplePanel'], ['panel de demostración', 'renderDemoPanel']]) {
    assert.deepEqual(order(skeleton(fn)), ['estado', 'detalles'], `el ${name} deja contenido técnico fuera del desplegable`);
    assert.match(skeleton(fn), /<summary>Ver más detalles<\/summary>/);
  }
  assert.deepEqual(order(skeleton('renderPanel')), ['estado', 'avisos', 'evolucion', 'detalles']);
});

test('gráficas y estación detallada solo aparecen dentro de Ver más detalles en paneles de usuario', () => {
  const simple = skeleton('renderSimplePanel');
  const simpleDetails = simple.indexOf('<details class="technical-details"');
  assert.ok(simple.indexOf('id="simple-stations"') > simpleDetails);
  assert.match(source.slice(source.indexOf('function renderSimplePanel')), /data\.devices\.map\(renderStationCard\)/);
  for (const fn of ['renderDemoPanel']) {
    const html = skeleton(fn);
    const details = html.indexOf('<details class="technical-details"');
    assert.ok(details > -1);
    assert.match(html.slice(details), /Gráficos del periodo|Estación <select/);
    assert.match(html.slice(details), /station-list/);
  }
});

test('los tres bloques simples preceden a Ver más detalles; administración conserva la cabecera técnica', () => {
  for (const [fn, id] of [['renderSimplePanel', 'simple-summary'], ['renderDemoPanel', 'demo-summary']]) {
    const html = skeleton(fn);
    const summary = html.indexOf(`id="${id}"`);
    const details = html.indexOf('<details class="technical-details"');
    assert.ok(summary > -1 && summary < details);
  }
  assert.match(source, /renderUserSummary\(primaryReading\(data\.devices\)/);
  assert.match(source, /renderUserSummary\(primaryReading\(lastDevices\)/);
  for (const block of ['now', 'trend', 'alerts']) assert.match(renderUserSummary(null), new RegExp(`data-summary-block="${block}"`));
  assert.match(skeleton('renderPanel'), /hero-first-slot/);
  assert.match(skeleton('renderPanel'), /<details class="technical-details" data-panel-section="detalles">/);
});

test('lo que se explica se pliega y no interrumpe el resumen', () => {
  const demo = skeleton('renderDemoPanel');
  // Los dos bloques formativos que bloqueaban la lectura del estado.
  assert.doesNotMatch(demo.slice(0, demo.indexOf('data-panel-section="detalles"')),
    /Herramientas ampliadas del registro/);
  assert.doesNotMatch(demo.slice(0, demo.indexOf('data-panel-section="detalles"')),
    /Cómo se muestran aquí/);
  assert.match(demo, /Herramientas ampliadas del registro/);
  assert.match(demo, /CÓMO FUNCIONAN LOS AVISOS/);
  // Metodología, calidad de datos y fuentes quedan desplegables en los tres.
  for (const fn of ['renderSimplePanel', 'renderPanel', 'renderDemoPanel']) {
    const fnSource = source.slice(source.indexOf(`function ${fn}`) > -1
      ? source.indexOf(`function ${fn}`) : source.indexOf(`async function ${fn}`));
    assert.match(fnSource, /\$\{panelDocumentation\(\)\}/, `${fn} no incluye la documentación plegable`);
  }
});

test('el panel de demostración lista los avisos reales en lugar de solo enlazarlos', () => {
  const demo = skeleton('renderDemoPanel');
  assert.match(demo, /id="demo-alerts"/);
  assert.ok(demo.indexOf('id="demo-alerts"') > demo.indexOf('<details class="technical-details"'));
  const loader = source.slice(source.indexOf('const load = async () =>', source.indexOf('function renderDemoPanel')));
  assert.match(loader, /renderOpenAlert/);
  assert.match(loader, /emptyAlertsHtml/);
  // Un vacío de avisos nunca se lee como «no hay riesgo».
  assert.match(source, /Sin avisos abiertos, pero esto no significa que no haya riesgo/);
});

test('el resumen de usuario muestra la estación escogida, temperatura, humedad y antigüedad', () => {
  const item = {
    device: { id: 'station-1', name: 'Huéscar', sensors: { temperature: true, humidity: true } },
    status: { connectivity: 'online', dataFreshness: 'fresh', batteryLevel: 'ok' },
    latest: { observedAt: '2026-01-01T12:03:00Z', temperatureC: 18, humidityPct: 55, pressurePa: 90000, isValidated: true },
    trendHistory: [
      { observedAt: '2026-01-01T12:00:00Z', temperatureC: 16 },
      { observedAt: '2026-01-01T12:02:00Z', temperatureC: 17 },
      { observedAt: '2026-01-01T12:03:00Z', temperatureC: 18 },
    ],
  };
  const html = renderUserSummary(item, [], null, { now: new Date('2026-01-01T12:05:00Z') });
  assert.match(html, /Huéscar/);
  assert.match(html, /18 °C/);
  assert.match(html, /55 %/);
  assert.match(html, /hace 2 min/);
  assert.match(html, /data-summary-block="now"/);
  assert.match(html, /data-summary-block="trend"/);
  assert.match(html, /<p class="quick-summary-value">Sube<\/p>/);
});

test('el resumen no presenta una lectura antigua como actual ni inventa una tendencia', () => {
  const old = renderUserSummary({
    device: { name: 'Castril', sensors: { humidity: true } },
    status: { dataFreshness: 'stale' },
    latest: { observedAt: '2026-01-01T10:00:00Z', temperatureC: 4, humidityPct: 70 },
    history: [{ observedAt: '2026-01-01T10:00:00Z', temperatureC: 4 }],
  }, [], { text: 'La estación no envía datos recientes.' }, { now: new Date('2026-01-01T12:00:00Z') });
  assert.match(old, /Último dato/);
  assert.match(old, /hace 2 h/);
  assert.match(old, /Sin tendencia todavía/);
  assert.match(old, /No se pudo comprobar/);
  assert.doesNotMatch(old, /data-alert-state="none"/);
});

test('la tendencia indica sube, baja o estable y no presume estabilidad con pocas lecturas', () => {
  const make = (values) => ({
    device: { name: 'Huéscar', sensors: { humidity: true } },
    latest: { observedAt: '2026-01-01T12:10:00Z', temperatureC: values.at(-1), humidityPct: 50 },
    trendHistory: values.map((temperatureC, index) => ({
      observedAt: new Date(Date.parse('2026-01-01T12:00:00Z') + index * 5 * 60_000).toISOString(), temperatureC,
    })),
  });
  const render = (values) => renderUserSummary(make(values), [], null, { now: new Date('2026-01-01T12:10:00Z') });
  assert.match(render([10, 11, 12]), /<p class="quick-summary-value">Sube<\/p>/);
  assert.match(render([12, 11, 10]), /<p class="quick-summary-value">Baja<\/p>/);
  assert.match(render([10, 10, 10]), /<p class="quick-summary-value">Estable<\/p>/);
  assert.match(render([10, 11]), /Sin tendencia todavía/);
});

test('con varias estaciones el resumen identifica la lectura fresca más reciente y no promedia microclimas', () => {
  const devices = [
    { device: { name: 'Huéscar' }, status: { dataFreshness: 'fresh' }, latest: { observedAt: '2026-01-01T12:00:00Z', temperatureC: 5, humidityPct: 60 } },
    { device: { name: 'Castril' }, status: { dataFreshness: 'fresh' }, latest: { observedAt: '2026-01-01T12:04:00Z', temperatureC: 15, humidityPct: 40 } },
  ];
  const summary = renderUserSummary(primaryReading(devices), [
    { id: 1, deviceId: 'huescar', closedAt: null },
    { id: 2, deviceId: 'castril', closedAt: null },
  ]);
  assert.match(summary, /Castril/);
  assert.match(summary, /15 °C/);
  assert.doesNotMatch(summary, /10 °C/);
  assert.match(summary, /2 avisos abiertos/);
});

test('el resumen mantiene activo el riesgo y distingue el envío pendiente', () => {
  const item = { device: { name: 'Huéscar' }, latest: { temperatureC: 18, humidityPct: 55, observedAt: '2026-01-01T12:00:00Z' } };
  const active = renderUserSummary(item, [{ id: 1, closedAt: null, deliveryStatus: 'delivered' }]);
  assert.match(active, /data-alert-state="active"/);
  assert.match(active, />Activo<\/strong>/);
  assert.doesNotMatch(active, /Envío pendiente/);
  const pending = renderUserSummary(item, [{ id: 1, closedAt: null, deliveryStatus: 'pending' }]);
  assert.match(pending, /data-alert-state="active"/);
  assert.match(pending, /data-delivery-pending="true"/);
  assert.match(pending, /Envío pendiente/);
});

test('solo afirma que no hay avisos cuando la consulta está en condiciones de comprobarlos', () => {
  const item = { device: { name: 'Huéscar' }, latest: { temperatureC: 18, humidityPct: 55, observedAt: '2026-01-01T12:00:00Z' } };
  const none = renderUserSummary(item, [], null);
  assert.match(none, /data-alert-state="none"/);
  assert.match(none, />Ninguno<\/strong>/);
  const unavailable = renderUserSummary(item, [], null, { engineOk: false });
  assert.match(unavailable, /data-alert-state="unknown"/);
  assert.match(unavailable, /No se pudo comprobar/);
});

test('la tarjeta de estación se reduce a sus gráficas en la sección de evolución', () => {
  const item = {
    device: { id: 'station-1', name: 'Huéscar', sensors: { battery: true } },
    status: { connectivity: 'online', configVersion: 1, batteryLevel: 'ok', dataFreshness: 'fresh' },
    latest: { observedAt: '2026-01-01T12:00:00Z', temperatureC: 18, humidityPct: 55, pressurePa: 90000, isValidated: true },
    history: [{ observedAt: '2026-01-01T12:00:00Z', temperatureC: 18 }],
    summary: { expected: 1, valid_count: 1, invalid_count: 0, coverage_pct: 100 },
    forecasts: [], nearby: { stations: [], message: 'Ubicación de estación no configurada.' },
    weather: { configured: false, advisories: [], aemetMissing: [], errors: [], openMeteo: {}, aemet: {} },
  };
  const charts = renderStationCard(item, { chartsOnly: true });
  assert.match(charts, /tecrural-chart-card/);
  // La temperatura grande y la previsión ya están arriba: no se repiten aquí.
  assert.doesNotMatch(charts, /hero-temperature/);
  assert.doesNotMatch(charts, /hero-forecast/);
  assert.doesNotMatch(charts, /aemet-readings/);
  assert.doesNotMatch(charts, /weather-panel/);
  assert.doesNotMatch(charts, /nearby-row/);
  // Y la tarjeta completa sigue igual para el detalle técnico y las páginas de estación.
  assert.match(renderStationCard(item), /hero-temperature/);
});

test('la cabecera sitúa la estación, su tipo y el permiso antes del resumen', () => {
  for (const fn of ['renderSimplePanel', 'renderPanel', 'renderDemoPanel']) {
    const html = skeleton(fn);
    assert.match(html, /data-panel-context/, `${fn} no declara el contexto de estación y permiso`);
  }
  // El texto se rellena con el nombre, el tipo de emplazamiento y el rol.
  assert.match(source, /function setPanelContext\(/);
  assert.match(source, /locationLabel\(item\.device\.locationType\)/);
  assert.match(source, /roleLabel\(session\.me\.role\)/);
  assert.match(source, /setPanelContext\(root, data\.devices, \{ includeStations: false \}\)/);
  assert.match(source, /setPanelContext\(root, lastDevices, \{ includeStations: false \}\)/);
  assert.match(source, /setPanelContext\(root, data\.devices\)/, 'administración mantiene el contexto completo');
});

test('el análisis del periodo y sus explicaciones se mantienen dentro del detalle ampliado', async () => {
  // El análisis vive en su propio módulo, cargado bajo demanda (F6).
  const analysis = await readFile(new URL('../public/js/demo-analysis.js', import.meta.url), 'utf8');
  assert.match(analysis, /export function renderDemoOverview\(data\)/);
  assert.match(analysis, /export function renderDemoDetails\(data\)/);
  // El análisis del periodo está disponible dentro de «Ver más detalles».
  const overview = analysis.slice(analysis.indexOf('export function renderDemoOverview'),
    analysis.indexOf('export function renderDemoDetails'));
  assert.match(overview, /demoMetricCard/);
  assert.doesNotMatch(overview, /dailyTemperature/);
  assert.doesNotMatch(overview, /dewPoint/);
  const details = analysis.slice(analysis.indexOf('export function renderDemoDetails'));
  assert.match(details, /dailyTemperature/);
  assert.match(details, /dewPoint/);
  assert.match(details, /panelDocumentation/);
});

test('el análisis del periodo se carga bajo demanda, no en el panel base', () => {
  // El panel no incrusta el análisis: lo importa solo cuando hace falta.
  assert.match(source, /import\('\.\/demo-analysis\.js'\)/);
  assert.doesNotMatch(source, /export function renderDemoOverview/);
  assert.doesNotMatch(source, /export function renderDemoDetails/);
});
