import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderStateCards } from '../public/js/farm-cards.js';
import { renderStationCard } from '../public/js/panel.js';

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

test('los tres paneles se leen en el mismo orden: resumen, avisos, evolución, detalles', () => {
  for (const [name, fn] of [['panel del agricultor', 'renderSimplePanel'],
    ['panel de administración', 'renderPanel'], ['panel de demostración', 'renderDemoPanel']]) {
    const sections = order(skeleton(fn));
    assert.deepEqual(sections, ['estado', 'avisos', 'evolucion', 'detalles'],
      `el ${name} no declara las cuatro secciones en orden`);
  }
});

test('la sección de evolución se ve sin desplegar nada', () => {
  for (const [name, fn] of [['panel del agricultor', 'renderSimplePanel'],
    ['panel de administración', 'renderPanel'], ['panel de demostración', 'renderDemoPanel']]) {
const html = skeleton(fn);
    // Solo el contenido de la sección: su etiqueta de cierre la delimita, para
    // que no cuente el <details> siguiente.
    const start = html.indexOf('data-panel-section="evolucion"');
    const evolution = html.slice(start, html.indexOf('</section>', start));
    assert.doesNotMatch(evolution, /<details/, `en el ${name} la evolución queda dentro del desplegable`);
    assert.match(evolution, /station-list/, `en el ${name} la evolución no tiene gráficas`);
  }
});

test('la cabecera conserva la temperatura como primera lectura y el detalle va plegado', () => {
  for (const [name, fn] of [['panel del agricultor', 'renderSimplePanel'],
    ['panel de administración', 'renderPanel'], ['panel de demostración', 'renderDemoPanel']]) {
    const html = skeleton(fn);
    const hero = html.indexOf('hero-first-slot');
    assert.ok(hero > -1, `el ${name} pierde la tarjeta grande de temperatura`);
    assert.ok(hero < html.indexOf('data-panel-section="estado"'),
      `en el ${name} la cabecera ya no va antes del estado`);
    assert.match(html, /<details class="technical-details" data-panel-section="detalles">/,
      `el ${name} no pliega los detalles`);
  }
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
  // La sección de avisos va antes de la evolución, no después de un bloque largo.
  assert.ok(demo.indexOf('id="demo-alerts"') < demo.indexOf('data-panel-section="evolucion"'));
  const loader = source.slice(source.indexOf('const load = async () =>', source.indexOf('function renderDemoPanel')));
  assert.match(loader, /renderOpenAlert/);
  assert.match(loader, /emptyAlertsHtml/);
  // Un vacío de avisos nunca se lee como «no hay riesgo».
  assert.match(source, /Sin avisos abiertos, pero esto no significa que no haya riesgo/);
});

test('el estado actual no repite la temperatura que ya está en la cabecera', () => {
  const devices = [{
    device: { id: 'station-1', name: 'Huéscar', sensors: { temperature: true, humidity: true } },
    status: { connectivity: 'online', dataFreshness: 'fresh', batteryLevel: 'ok' },
    latest: { observedAt: '2026-01-01T12:00:00Z', temperatureC: 18, humidityPct: 55, pressurePa: 90000 },
  }];
  const cards = renderStateCards(devices);
  assert.doesNotMatch(cards, /Temperatura actual/);
  assert.doesNotMatch(cards, /Humedad actual/);
  // Las decisiones se conservan: son lo que el usuario tiene que decidir.
  for (const label of ['Riesgo de helada', 'Riesgo de calor', 'Riesgo de tormenta',
    'Última comunicación', 'Estado de la estación']) {
    assert.match(cards, new RegExp(label));
  }
  // La lectura cruda sigue disponible para quien la necesite junto a los estados.
  assert.match(renderStateCards(devices, new Date(), { readings: true }), /Temperatura actual/);
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

test('el análisis del periodo se parte entre el resumen y el detalle', () => {
  assert.match(source, /export function renderDemoOverview\(data\)/);
  assert.match(source, /export function renderDemoDetails\(data\)/);
  // El resumen visible lleva las métricas del periodo; lo que documenta el
  // cálculo, las coberturas y la comparación externa, no.
  const overview = source.slice(source.indexOf('export function renderDemoOverview'),
    source.indexOf('export function renderDemoDetails'));
  assert.match(overview, /demoMetricCard/);
  assert.doesNotMatch(overview, /dailyTemperature/);
  assert.doesNotMatch(overview, /dewPoint/);
  const details = source.slice(source.indexOf('export function renderDemoDetails'),
    source.indexOf('// Orden de lectura del panel'));
  assert.match(details, /dailyTemperature/);
  assert.match(details, /dewPoint/);
  assert.match(details, /panelDocumentation/);
});