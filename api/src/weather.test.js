import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeOpenMeteo, forecastAdvisories, normalizeAemetObservation, parseAemetWarnings,
  aemetConfigForDevice,
} from './weather.js';

test('Huéscar devices receive AEMET municipality, observation, and warning-area defaults', () => {
  assert.deepEqual(aemetConfigForDevice({ name: 'Microestación', publicZone: 'Huéscar, Granada' }), {
    municipalityCode: '18098', stationId: '5051X', warningArea: '611803',
  });
  assert.deepEqual(aemetConfigForDevice({ name: 'Huéscar Norte', publicZone: null, aemetStationId: 'CUSTOM' }), {
    municipalityCode: '18098', stationId: 'CUSTOM', warningArea: '611803',
  });
  assert.deepEqual(aemetConfigForDevice({ name: 'Otra estación', publicZone: 'Baza' }), {
    municipalityCode: null, stationId: null, warningArea: null,
  });
});

test('Open-Meteo normalization includes current weather, hourly rain and wind, and daily outlook', () => {
  const result = normalizeOpenMeteo({
    timezone: 'Europe/Madrid',
    current: {
      time: '2026-01-01T10:00', temperature_2m: 12, relative_humidity_2m: 74,
      pressure_msl: 1012, precipitation: 0, rain: 0, wind_speed_10m: 8,
      wind_direction_10m: 270, wind_gusts_10m: 14, weather_code: 2,
    },
    hourly: {
      time: ['2026-01-01T10:00', '2026-01-01T11:00'], temperature_2m: [12, 13],
      relative_humidity_2m: [74, 70], precipitation_probability: [5, 20],
      precipitation: [0, 1.2], rain: [0, 1.2], weather_code: [2, 61],
      wind_speed_10m: [8, 10], wind_direction_10m: [270, 280], wind_gusts_10m: [14, 18],
    },
    daily: {
      time: ['2026-01-01'], temperature_2m_max: [13], temperature_2m_min: [4],
      precipitation_sum: [3], precipitation_probability_max: [50], wind_speed_10m_max: [20],
      wind_gusts_10m_max: [32], weather_code: [61],
    },
  });
  assert.equal(result.current.precipitationMm, 0);
  assert.equal(result.current.windGustKmh, 14);
  assert.equal(result.hourly[0].precipitationMm, 0);
  assert.equal(result.daily[0].precipitationMm, 3);
});

test('forecast advisories identify frost, heat, heavy rain, and strong gusts as non-official risks', () => {
  const notices = forecastAdvisories([{
    date: '2026-01-01', temperatureMinC: -1, temperatureMaxC: 36,
    precipitationMm: 24, windGustKmh: 55,
  }]);
  assert.deepEqual(notices.map((notice) => notice.kind), ['helada', 'calor', 'lluvia', 'viento']);
  assert.ok(notices.every((notice) => notice.level === 'preventive'));
});

test('AEMET station observations convert wind from m/s and CAP warnings retain official fields', () => {
  const observation = normalizeAemetObservation([{ idema: '1234A', fint: '2026-01-01T10:00:00', ta: '12', hr: '70', pres: '1008', prec: '0', vv: '5', vmax: '12', dv: 'NW' }], '1234A');
  assert.equal(observation.windKmh, 18);
  assert.equal(observation.windGustKmh, 43.2);
  const warnings = parseAemetWarnings('<alert><info><event>Viento</event><headline>Rachas fuertes</headline><severity>Moderate</severity><area><areaDesc>Zona norte</areaDesc></area></info></alert>');
  assert.equal(warnings[0].event, 'Viento');
  assert.equal(warnings[0].area, 'Zona norte');
});
