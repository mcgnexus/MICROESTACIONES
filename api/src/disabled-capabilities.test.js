import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderStationCard } from '../public/js/panel.js';
import { chartSection, batteryLabel } from '../public/js/ui.js';

const read = async (name) => readFile(new URL(`../public/js/${name}`, import.meta.url), 'utf8');
const stationsSource = await read('stations.js');
const view = await readFile(new URL('../views/index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/app.css', import.meta.url), 'utf8');

// 14 · P2: lo que la estación no mide ocupaba el mismo espacio que lo que mide.
// El hueco no es información: es ruido que empuja hacia abajo el dato real.

const station = (sensors = { battery: true }) => ({
  device: { id: 'station-1', name: 'Huéscar', sensors },
  status: { connectivity: 'online', configVersion: 1, batteryLevel: 'ok', dataFreshness: 'fresh' },
  latest: { observedAt: '2026-01-01T12:00:00Z', temperatureC: 18, humidityPct: 55, pressurePa: 90000, batteryMv: 3900, isValidated: true },
  history: [], summary: { expected: 0, valid_count: 1, invalid_count: 0, coverage_pct: 100 },
  nearby: { stations: [], message: 'Ubicación de estación no configurada.' },
  weather: { configured: false, advisories: [], aemetMissing: [], errors: [], openMeteo: {}, aemet: {} },
});

test('un sensor desactivado no ocupa tarjeta en el resumen', () => {
  const on = renderStationCard(station());
  const off = renderStationCard(station({ battery: false }));
  const count = (html, label) => (html.match(new RegExp(`<span class="reading-label">[^]*?${label}</span>`, 'g')) || []).length;
  assert.ok(count(on, 'Batería') > 0, 'con el sensor activo la batería debe verse');
  assert.equal(count(off, 'Batería'), 0, 'con el sensor apagado la batería no debe ocupar tarjeta');
  // Y no se degrada en un guion suelto ni en una etiqueta de «desactivada».
  assert.doesNotMatch(off, /Desactivada/);
  // Pero el estado sigue declarado, en la línea de sensores de la tarjeta.
  assert.match(off, /Batería desactivado, no se mide/);
});

test('una métrica desactivada no deja un gráfico vacío', () => {
  const history = [{ observedAt: '2026-01-01T12:00:00Z', temperatureC: 18, batteryMv: 3900 }];
  const on = chartSection(history, {}, { sensors: { battery: true } });
  const off = chartSection(history, {}, { sensors: { battery: false } });
  assert.match(on, /<h3>Batería<\/h3>/);
  assert.doesNotMatch(off, /<h3>Batería<\/h3>/);
  // Lo que no se mide se nombra, para que el conjunto no parezca incompleto sin
  // explicación.
  assert.match(off, /Sin medir: batería/);
  assert.match(off, /no tienen gráfica/);
  // Y si no queda ninguna, se dice por qué está vacío.
  const none = chartSection(history, {}, { sensors: { battery: false, temperature: false, humidity: false, pressure: false } });
  assert.match(none, /todos los sensores de esta estación están desactivados/i);
});

test('las capacidades futuras salen del panel operativo', () => {
  const html = renderStationCard(station());
  // Cuatro huecos «Próximamente» ocupaban la rejilla de lecturas.
  assert.doesNotMatch(html, /Próximamente/);
  assert.doesNotMatch(html, /upcoming-sensors-panel|upcoming-grid/);
  assert.doesNotMatch(html, /Radiación UV/);
  // Lo que sí es dato hoy se declara con su origen.
  assert.match(html, /Viento y precipitación los aporta AEMET, no esta estación/);
  // Y el CSS de ese bloque desaparece con él.
  assert.doesNotMatch(css, /upcoming-/, 'quedan estilos de un bloque que ya no existe');
});

test('el estado del equipo es donde se declara lo que no se mide', () => {
  const stations = stationsSource;
  assert.match(stations, /desactivado, no se mide/);
  assert.match(stations, /sensor desactivado/);
  // Y explica por qué no hay gráfica, en el sitio donde se configura el equipo.
  assert.match(stations, /no aparecen en el resumen ni tienen gráfica/);
  assert.match(stations, /la radiación UV no se mide hoy/);
});

test('«Sin dato» nombra su magnitud en la cabecera de detalle', () => {
  // El genérico se leía como si faltara algo que no se nombraba.
  assert.equal(batteryLabel('unknown'), 'Batería no medida');
  assert.equal(batteryLabel(undefined), 'Batería no medida');
  assert.equal(batteryLabel('ok'), 'Batería correcta');
  assert.equal(batteryLabel('critical'), 'Batería crítica');
  for (const level of ['ok', 'low', 'critical', 'unknown']) {
    assert.match(batteryLabel(level), /^Batería /, `«${batteryLabel(level)}» no nombra la magnitud`);
  }
});

test('la ficha de estación distingue sensor apagado de batería sin medir', () => {
  const stations = stationsSource;
  // Son dos situaciones distintas: una es una decisión de configuración y la otra
  // es una lectura que no ha llegado.
  assert.match(stations, /station\.sensors\?\.battery === false \? 'sensor desactivado'/);
  assert.match(stations, /status\.batteryMv == null \? 'no medida'/);
});

test('la información de producto se lleva a la portada, no al panel', () => {
  const tools = view.slice(view.indexOf('id="herramientas"'), view.indexOf('id="solicitar-piloto"'));
  // Lo que la estación todavía no mide, explained donde se consulta qué ofrece
  // el producto y no donde alguien espera una lectura.
  assert.match(tools, /se declara en su ficha de equipo/);
  assert.match(tools, /iluminación y radiación UV/);
});