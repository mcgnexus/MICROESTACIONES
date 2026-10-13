import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPublicZones, selectUrbanStation, renderLocalWeatherCard, renderDayHistory } from '../public/js/landing.js';
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
  assert.match(html, /menos de 10 minutos/);
  assert.match(html, /coordenadas AEMET/);
  assert.match(html, /Previsión · independiente de las observaciones/);
});

test('public no-pair and CAP states do not imply a measured difference or no alerts on failure', () => {
  const html = renderPublicZones([station({
    comparison: { ...station().comparison, state: 'no_pair', differenceC: null, timeOffsetSeconds: 1800 },
    aemet: { ...station().aemet, warnings: [], warningStatus: 'stale', warningsAgeSeconds: 3600 },
  })]);
  assert.match(html, /No calculada/);
  assert.match(html, /Sin datos comparables: las dos lecturas se separan más de 10 minutos/);
  assert.match(html, /Consulta no disponible/);
  assert.match(html, /sin avisos vigentes en ese dato/);
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
  assert.match(currentHtml, /<p class="public-location">Casco<\/p>/);
  assert.doesNotMatch(currentHtml, /<h3>/, 'la localidad no se inserta como encabezado antes del h1');
  assert.match(currentHtml, /no toda la ciudad/i);
  // La antigüedad se muestra en palabras ("Medido hace…"), no solo con la fecha.
  assert.match(currentHtml, /Medido hace/);
});

test('the day graph only draws supplied real points and has an explicit empty state', () => {
  const now = Date.now();
  const station = { history: [
    { observedAt: new Date(now - 60 * 60_000).toISOString(), temperatureC: 8, humidityPct: 66 },
    { observedAt: new Date(now - 30 * 60_000).toISOString(), temperatureC: 9, humidityPct: 62 },
  ] };
  const html = renderDayHistory(station, now);
  assert.match(html, /Temperatura · últimas 24 horas/);
  assert.match(html, /Humedad · últimas 24 horas/);
  assert.match(html, /8/);
  assert.match(html, /62/);
  // Al pie de la muestra de 24 h va el acceso al histórico: mismo
  // destino declarado que el CTA del hero (vuelve a esta sección tras entrar).
  assert.match(html, /href="#\/entrar" data-return="evolucion">Consultar histórico/);
  // Los periodos del panel se nombran como capacidad, no como datos
  // garantizados: las series cubren desde la puesta en servicio.
  assert.match(html, /7 y 30 d[íi]as/);
  assert.match(html, /puesta en servicio/);
  // Una muestra de hace más de 24 h no entra en la ventana.
  const old = { history: [{ observedAt: new Date(now - 30 * 60 * 60_000).toISOString(), temperatureC: 1 }] };
  assert.match(renderDayHistory(old, now), /No hay datos suficientes/);
  assert.match(renderDayHistory({ history: [] }, now), /No hay datos suficientes/);
  assert.doesNotMatch(renderDayHistory({ history: [] }, now), /chart-box/);
  // Sin gráfica no hay CTA colgando: el estado vacío se queda como estaba.
  assert.doesNotMatch(renderDayHistory({ history: [] }, now), /Consultar histórico/);
});

test('public landing has loading containers and a single access request form, without sample readings', async () => {
  const html = await readFile(new URL('../views/index.html', import.meta.url), 'utf8');
  assert.match(html, /id="local-weather-state"/);
  assert.match(html, /id="public-comparison"/);
  assert.match(html, /id="public-evolution"/);
  assert.equal((html.match(/data-lead-embed/g) || []).length, 1);
  assert.doesNotMatch(html, /3,1 °C|82 %|hace 12 min|Solicitar piloto/);
  assert.match(html, /Consultar histórico/);
  assert.match(html, /Pedir información para instalar una estación/);
});

test('the Tiempo local h1 precedes the load state and dynamically rendered card', async () => {
  const html = await readFile(new URL('../views/index.html', import.meta.url), 'utf8');
  const section = html.slice(html.indexOf('id="tiempo-local"'), html.indexOf('id="comparacion-aemet"'));
  const card = section.indexOf('id="local-weather-card"');
  const loading = section.indexOf('id="local-weather-state"');
  const heading = section.indexOf('<h1>');
  assert.ok(loading >= 0 && card >= 0 && heading >= 0);
  assert.ok(heading < loading, 'el h1 precede al indicador de carga');
  assert.ok(heading < card, 'el h1 precede a la tarjeta que inserta el cliente o SSR');
  assert.ok(loading < card, 'el estado de carga precede al contenedor de la tarjeta');
});
