import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPublicZones } from '../public/js/landing.js';

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

// F22 · P2: la comparación pública de seis columnas obligaba a desplazamiento
// horizontal. Ahora se muestra cada pareja como una tarjeta con los dos valores
// enfrentados, su hora propia, la diferencia debajo y los metadatos desplegables.

test('la comparación pública usa tarjetas, no una tabla de seis columnas', () => {
  const html = renderPublicZones([station()]);
  assert.match(html, /comparison-card/);
  assert.match(html, /comparison-readings/);
  assert.match(html, /reading-local/);
  assert.match(html, /reading-aemet/);
  assert.match(html, /comparison-diff/);
  assert.doesNotMatch(html, /<table class="comparison-table"/);
  assert.doesNotMatch(html, /<th>Ubicación urbana<\/th>/);
});

test('cada lectura mantiene su ubicación y su hora por separado', () => {
  const html = renderPublicZones([station()]);
  // La medición local y la AEMET conservan sus valores y horas distintas.
  assert.match(html, /Medición local/);
  assert.match(html, /Observación AEMET · 5051X/);
  assert.match(html, /10,2 °C/);
  assert.match(html, /9,1 °C/);
  // Dos tiempos distintos (lectura local y AEMET) conviven en la tarjeta.
  const readingTimes = html.match(/class="reading-time">/g) || [];
  assert.equal(readingTimes.length, 2, 'debe haber dos horas, una por lectura');
});

test('la diferencia aparece debajo, con el signo y la lectura de calor o frío', () => {
  const html = renderPublicZones([station()]);
  const diffBlock = html.slice(html.indexOf('comparison-diff'));
  assert.match(diffBlock, /\+1,1 °C/);
  assert.match(diffBlock, /En este punto hace más calor/);
  assert.match(diffBlock, /las dos lecturas se separan menos de 10 minutos/);
});

test('la diferencia negativa declara "hace más frío" y mantiene las dos horas', () => {
  const html = renderPublicZones([station({ comparison: {
    ...station().comparison, local: { ...station().comparison.local, temperatureC: 8.1 }, differenceC: -1.0,
  } })]);
  assert.match(html, /-1 °C/);
  assert.match(html, /En este punto hace más frío/);
  const readingTimes = html.match(/class="reading-time">/g) || [];
  assert.equal(readingTimes.length, 2, 'las dos horas se mantienen');
});

test('sin lecturas comparables no se calcula diferencia y el estado lo deja claro', () => {
  const html = renderPublicZones([station({ comparison: {
    ...station().comparison, state: 'no_pair', differenceC: null, timeOffsetSeconds: 1800,
  } })]);
  assert.match(html, /No calculada/);
  assert.match(html, /Sin datos comparables: las dos lecturas se separan más de 10 minutos/);
  assert.doesNotMatch(html, /En este punto hace más calor|En este punto hace más frío/);
});

test('la distancia y la altitud se ofrecen en un desplegable', () => {
  const html = renderPublicZones([station()]);
  assert.match(html, /comparison-metadata/);
  assert.match(html, /<summary>Distancia y altitud<\/summary>/);
  assert.match(html, /4,2 km entre emplazamientos/);
  assert.match(html, /coordenadas AEMET/);
});

// F5 · P2: cuando la lectura comparada con AEMET es anterior a la última, la
// comparación se fecha (no describe el «ahora») y se dice que la última lectura
// aún no se ha comparado. Así solo hay un valor «actual»: el de la tarjeta hero.
test('una lectura anterior a la última se presenta como histórica', () => {
  const html = renderPublicZones([station({
    temperatureC: 16.3, temperatureObservedAt: '2026-10-07T21:47:00Z',
    comparison: {
      ...station().comparison,
      isLatestLocal: false,
      local: { temperatureC: 18.2, observedAt: '2026-10-07T20:07:00Z', location: 'Huéscar' },
      differenceC: 0.5,
    },
  })]);
  // La diferencia va fechada y la lectura local se marca como anterior, no actual.
  assert.match(html, /a las \d{2}:\d{2} · \+0,5 °C/);
  assert.match(html, /Comparación con la estación oficial de una lectura anterior/);
  // Y se declara que la última lectura (16,3 °C a las 21:47) no se ha comparado.
  assert.match(html, /La última lectura \(16,3 °C a las \d{2}:\d{2}\) todavía no se ha podido comparar con la estación oficial/);
});

test('cuando la lectura comparada es la última no se marca como histórica', () => {
  const html = renderPublicZones([station({
    temperatureObservedAt: '2026-10-07T12:05:00Z',
    comparison: { ...station().comparison, isLatestLocal: true },
  })]);
  assert.match(html, /\+1,1 °C/);
  assert.doesNotMatch(html, /a las \d{2}:\d{2} · \+1,1 °C/);
  assert.doesNotMatch(html, /todavía no se ha podido comparar/);
  assert.doesNotMatch(html, /de una lectura anterior/);
});
