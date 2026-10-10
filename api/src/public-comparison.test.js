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

test('la diferencia aparece debajo, con el signo y el matiz de pareja', () => {
  const html = renderPublicZones([station()]);
  const diffBlock = html.slice(html.indexOf('comparison-diff'));
  assert.match(diffBlock, /\+1,1 °C/);
  assert.match(diffBlock, /microestación más cálida/);
  assert.match(diffBlock, /pareja dentro de ±10 min/);
});

test('la diferencia negativa declara "más fría" y mantiene las dos horas', () => {
  const html = renderPublicZones([station({ comparison: {
    ...station().comparison, local: { ...station().comparison.local, temperatureC: 8.1 }, differenceC: -1.0,
  } })]);
  assert.match(html, /-1 °C/);
  assert.match(html, /microestación más fría/);
  const readingTimes = html.match(/class="reading-time">/g) || [];
  assert.equal(readingTimes.length, 2, 'las dos horas se mantienen');
});

test('sin pareja no se calcula diferencia y el estado lo deja claro', () => {
  const html = renderPublicZones([station({ comparison: {
    ...station().comparison, state: 'no_pair', differenceC: null, timeOffsetSeconds: 1800,
  } })]);
  assert.match(html, /No calculada/);
  assert.match(html, /Sin pareja dentro de ±10 min/);
  assert.doesNotMatch(html, /más cálida|más fría/);
});

test('la distancia y la altitud se ofrecen en un desplegable', () => {
  const html = renderPublicZones([station()]);
  assert.match(html, /comparison-metadata/);
  assert.match(html, /<summary>Distancia y altitud<\/summary>/);
  assert.match(html, /4,2 km entre emplazamientos/);
  assert.match(html, /coordenadas AEMET/);
});
