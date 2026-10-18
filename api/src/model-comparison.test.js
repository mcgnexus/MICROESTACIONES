import test from 'node:test';
import assert from 'node:assert/strict';
import { renderModelComparisonCard } from '../public/js/landing.js';
import {
  parseMadridLocal, modelPairForSample, mostRecentModelComparison,
} from './weather.js';

const model = (overrides = {}) => ({
  fetchedAt: '2026-10-18T03:40:00Z',
  hourly: [
    { forecastFor: '2026-10-18T04:00', temperatureC: 11.8, humidityPct: 72, pressureHpa: null },
    { forecastFor: '2026-10-18T05:00', temperatureC: 12.3, humidityPct: 70, pressureHpa: 912.1 },
    { forecastFor: '2026-10-18T06:00', temperatureC: 13.1, humidityPct: 68, pressureHpa: 912.4 },
  ],
  ...overrides,
});

// Open-Meteo con timezone=auto devuelve horas locales de Madrid sin offset: en
// verano «05:00» son las 03:00 UTC. Parsearlas con Date.parse en un servidor UTC
// desplazaría el emparejamiento dos horas y no habría pareja nunca.
test('las horas locales de Madrid se interpretan en su zona, no en la del servidor', () => {
  assert.equal(parseMadridLocal('2026-10-18T05:00'), Date.parse('2026-10-18T03:00:00Z'));
  assert.equal(parseMadridLocal('2026-01-15T10:00'), Date.parse('2026-01-15T09:00:00Z'));
  // Un valor con offset explícito se respeta tal cual.
  assert.equal(parseMadridLocal('2026-10-18T05:00Z'), Date.parse('2026-10-18T05:00:00Z'));
  assert.ok(Number.isNaN(parseMadridLocal('no-es-fecha')));
});

test('la pareja local-modelo se calcula con la hora que cubre la lectura y diferencia con signo', () => {
  const pair = modelPairForSample(
    { temperatureC: 14.2, observedAt: '2026-10-18T03:15:00Z', pressureHpa: 915.2, location: 'Huéscar' },
    model(),
  );
  assert.equal(pair.state, 'matched');
  assert.equal(pair.model.temperatureC, 12.3);
  assert.equal(pair.differenceC, 1.9);
  assert.equal(pair.differenceDefinition, 'temperatura_microestacion_menos_OpenMeteo');
  assert.equal(pair.timeOffsetMinutes, -15);
  // La presión comparable del modelo es la de superficie, no la del nivel del mar.
  assert.equal(pair.pressureDifferenceHpa, 3.1);
  assert.equal(pair.pressureDifferenceDefinition, 'presion_microestacion_menos_OpenMeteo_superficie');
});

test('sin hora del modelo en ventana no se calcula diferencia', () => {
  const far = modelPairForSample(
    { temperatureC: 14.2, observedAt: '2026-10-18T03:15:00Z' },
    { hourly: [{ forecastFor: '2026-10-18T14:00', temperatureC: 20 }] },
  );
  assert.equal(far.state, 'no_pair');
  assert.equal(far.differenceC, null);
  const none = modelPairForSample({ temperatureC: 14.2, observedAt: '2026-10-18T03:15:00Z' }, { hourly: [] });
  assert.equal(none.state, 'no_model');
});

test('la comparación más reciente recorre la historia y solo la última cuenta como presente', () => {
  const history = [
    { temperatureC: 13.6, observedAt: '2026-10-18T02:20:00Z', pressureHpa: 915.0 },
    { temperatureC: 14.2, observedAt: '2026-10-18T03:15:00Z', pressureHpa: 915.2 },
  ];
  const comparison = mostRecentModelComparison(history, model());
  assert.equal(comparison.state, 'matched');
  assert.equal(comparison.local.temperatureC, 14.2);
  assert.equal(comparison.isLatestLocal, true);
  assert.ok(comparison.recentPairs.length >= 2, 'incluye el histórico de parejas recientes');
  assert.ok(comparison.recentPairs.every((p) => p.differenceC != null));
});

test('si la última lectura no tiene pareja no se inventa con una más antigua', () => {
  const comparison = mostRecentModelComparison(
    [{ temperatureC: 14.2, observedAt: '2026-10-18T03:59:00Z' }],
    // Solo la hora 05:00 de Madrid (03:59Z queda a 59 min): fuera de ventana.
    model({ hourly: [model().hourly[1]] }),
  );
  assert.equal(comparison.state, 'no_pair');
  assert.equal(comparison.differenceC, null);
  assert.equal(comparison.isLatestLocal, false);
});

// La tarjeta sigue el patrón de la comparación con AEMET: dos lecturas con su
// hora, diferencia debajo con signo y la fuente del modelo en un desplegable.
test('la tarjeta sensor vs modelo muestra local, modelo, diferencia y atribución', () => {
  const html = renderModelComparisonCard([{
    name: 'TECRURAL REYES 113', zone: 'Huéscar, Granada', locationType: 'urbano',
    temperatureObservedAt: '2026-10-18T03:15:00Z',
    openMeteo: { fetchedAt: '2026-10-18T03:40:00Z' },
    modelComparison: {
      state: 'matched', windowMinutes: 20,
      local: { temperatureC: 14.2, observedAt: '2026-10-18T03:15:00Z', location: 'Huéscar' },
      model: { temperatureC: 12.3, forecastFor: '2026-10-18T05:00', humidityPct: 70, pressureHpa: 912.1 },
      timeOffsetMinutes: -15, differenceC: 1.9, pressureDifferenceHpa: 3.1,
      differenceDefinition: 'temperatura_microestacion_menos_OpenMeteo',
      recentPairs: [{ observedAt: '2026-10-18T03:15:00Z', differenceC: 1.9 }], isLatestLocal: true,
    },
  }]);
  assert.match(html, /comparison-card/);
  assert.match(html, /Sensor vs modelo/);
  assert.match(html, /Medición local/);
  assert.match(html, /Modelo Open-Meteo/);
  assert.match(html, /14,2 °C/);
  assert.match(html, /12,3 °C/);
  assert.match(html, /\+1,9 °C/);
  assert.match(html, /La estación mide más calor que el modelo/);
  assert.match(html, /Open-Meteo\.com \(licencia CC-BY 4\.0\)/);
  assert.match(html, /celda de ~11 km/);
});

test('sin pareja la tarjeta lo declara y no muestra diferencia', () => {
  const html = renderModelComparisonCard([{
    name: 'TECRURAL REYES 113', zone: 'Huéscar, Granada', locationType: 'urbano',
    temperatureObservedAt: '2026-10-18T03:15:00Z',
    openMeteo: { fetchedAt: '2026-10-18T03:40:00Z' },
    modelComparison: {
      state: 'no_pair', windowMinutes: 20,
      local: { temperatureC: 14.2, observedAt: '2026-10-18T03:59:00Z', location: 'Huéscar' },
      differenceC: null,
    },
  }]);
  assert.match(html, /No calculada/);
  assert.match(html, /Sin pareja/);
  assert.doesNotMatch(html, /hace más calor|hace más frío/);
});

test('sin estación urbana o sin comparación la tarjeta no aparece', () => {
  assert.equal(renderModelComparisonCard([]), '');
  assert.equal(renderModelComparisonCard([{ name: 'x', modelComparison: null }]), '');
});
