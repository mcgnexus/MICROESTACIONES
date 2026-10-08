import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPublicZones, selectUrbanStation, renderLocalWeatherCard, renderThreeHourHistory } from '../public/js/landing.js';
import { readFile } from 'node:fs/promises';

const station = (overrides = {}) => ({
  name: 'Casco urbano', zone: 'Huéscar', temperatureC: 10.2, observedAt: '2026-10-07T12:05:00Z',
  dataFreshness: 'fresh', connectivity: 'online',
  comparison: {
    state: 'matched', windowMinutes: 10,
    local: { temperatureC: 10.2, observedAt: '2026-10-07T12:05:00Z', location: 'Huéscar' },
    aemet: { stationId: '5051X', temperatureC: 9.1, observedAt: '2026-10-07T12:00:00Z' },
    differenceC: 1.1, timeOffsetSeconds: 300,
    proximity: {
      distanceKm: 4.2, aemetAltitudeM: 1101, microAltitudeM: 953,
      aemetAltitudeSource: 'ficha AEMET 5051X', microAltitudeSource: 'ficha estación',
      aemetLocationSource: 'coordenadas AEMET', microLocationSource: 'coordenadas configuradas',
    },
  },
  aemet: {
    observation: { stationId: '5051X', temperatureC: 9.1, observedAt: '2026-10-07T12:00:00Z' },
    forecast: { municipality: 'Huéscar', days: [{ date: '2026-10-08', sky: 'Despejado', temperatureMinC: 2, temperatureMaxC: 14 }] },
    warnings: [], warningStatus: 'current', warningsFetchedAt: '2026-10-07T12:06:00Z', warningsAreaCode: '611803',
  },
  ...overrides,
});

test('public temperature comparison shows sources, exact hours, sign, metadata and separate forecast', () => {
  const html = renderPublicZones([
    station(),
    station({ name: 'Vega', zone: 'Vega', temperatureC: 8.1, comparison: {
      ...station().comparison, local: { ...station().comparison.local, temperatureC: 8.1 },
      differenceC: -1.0,
    } }),
  ]);
  assert.match(html, /Casco urbano/);
  assert.match(html, /5051X/);
  assert.match(html, /\+1,1 °C/);
  assert.match(html, /-1 °C/);
  assert.match(html, /±10 minutos/);
  assert.match(html, /coordenadas AEMET/);
  assert.match(html, /Previsión · independiente de las observaciones/);
});

test('public no-pair and CAP states do not imply a measured difference or no alerts on failure', () => {
  const html = renderPublicZones([station({
    comparison: { ...station().comparison, state: 'no_pair', differenceC: null, timeOffsetSeconds: 1800 },
    aemet: { ...station().aemet, warnings: [], warningStatus: 'stale', warningsAgeSeconds: 3600 },
  })]);
  assert.match(html, /No calculada/);
  assert.match(html, /Sin pareja dentro de ±10 min/);
  assert.match(html, /Consulta no disponible/);
  assert.match(html, /sin avisos vigentes en esa respuesta/);
  assert.doesNotMatch(html, /AEMET − AEMET/);
});

test('an empty successful CAP response is explicitly distinct from a failed request', () => {
  const current = renderPublicZones([station()]);
  const unavailable = renderPublicZones([station({ aemet: {
    ...station().aemet, warningStatus: 'unavailable', warningsFetchedAt: null,
  } })]);
  assert.match(current, /Sin avisos vigentes/);
  assert.match(unavailable, /No se ha podido consultar avisos AEMET/);
});

test('the public current card keeps the last reading even when stale, clearly labelled', () => {
  const finca = { name: 'Finca Vega', locationType: 'finca', temperatureFreshness: 'fresh', temperatureObservedAt: '2026-10-07T12:00:00Z' };
  const staleUrban = { name: 'Casco antiguo', locationType: 'urbano', temperatureFreshness: 'stale', temperatureC: 4, temperatureObservedAt: '2026-10-07T08:00:00Z' };
  const currentUrban = { name: 'Casco', locationType: 'urbano', temperatureFreshness: 'fresh', temperatureC: 12.3, temperatureObservedAt: '2026-10-07T12:00:00Z' };
  assert.equal(selectUrbanStation([finca, staleUrban, currentUrban]), currentUrban);
  assert.equal(selectUrbanStation([finca]), null);
  const staleHtml = renderLocalWeatherCard(staleUrban);
  // La última medición permanece visible, pero marcada como no reciente.
  assert.match(staleHtml, />4 °C</);
  assert.match(staleHtml, /Última medición/);
  assert.match(staleHtml, /Lectura no reciente/);
  const staleWithoutValue = renderLocalWeatherCard({ ...staleUrban, temperatureC: null, humidityPct: null });
  assert.match(staleWithoutValue, /Sin lectura registrada/);
  const currentHtml = renderLocalWeatherCard(currentUrban);
  assert.match(currentHtml, /12,3 °C/);
  assert.match(currentHtml, /no toda la ciudad/i);
});

test('the three-hour graph only draws supplied real points and has an explicit empty state', () => {
  const now = Date.now();
  const station = { history: [
    { observedAt: new Date(now - 60 * 60_000).toISOString(), temperatureC: 8, humidityPct: 66 },
    { observedAt: new Date(now - 30 * 60_000).toISOString(), temperatureC: 9, humidityPct: 62 },
  ] };
  const html = renderThreeHourHistory(station, now);
  assert.match(html, /Temperatura · últimas 3 horas/);
  assert.match(html, /Humedad · últimas 3 horas/);
  assert.match(html, /8/);
  assert.match(html, /62/);
  assert.match(renderThreeHourHistory({ history: [] }, now), /No hay suficientes mediciones reales/);
  assert.doesNotMatch(renderThreeHourHistory({ history: [] }, now), /chart-box/);
});

test('public landing has loading containers and a single access request form, without sample readings', async () => {
  const html = await readFile(new URL('../views/index.html', import.meta.url), 'utf8');
  assert.match(html, /id="local-weather-state"/);
  assert.match(html, /id="public-comparison"/);
  assert.match(html, /id="public-evolution"/);
  assert.equal((html.match(/data-lead-embed/g) || []).length, 1);
  assert.doesNotMatch(html, /3,1 °C|82 %|hace 12 min|Solicitar piloto/);
  assert.match(html, /Consultar el tiempo local/);
  assert.match(html, /Explorar todas las herramientas/);
});

test('the big weather card is the first element of the public landing section', async () => {
  const html = await readFile(new URL('../views/index.html', import.meta.url), 'utf8');
  const section = html.slice(html.indexOf('id="tiempo-local"'), html.indexOf('id="comparacion-aemet"'));
  const card = section.indexOf('id="local-weather-card"');
  const loading = section.indexOf('id="local-weather-state"');
  const heading = section.indexOf('<h1>');
  assert.ok(loading >= 0 && card >= 0 && heading >= 0);
  assert.ok(loading < heading, 'el indicador de carga va antes del título');
  assert.ok(card < heading, 'la tarjeta grande va antes del título');
});
