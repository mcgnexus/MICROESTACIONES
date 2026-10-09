import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeOpenMeteo, forecastAdvisories, normalizeAemetObservation, parseAemetWarnings,
  aemetConfigForDevice, describeAemetError, mergeWeatherErrors, aemetProximityForDevice, aemetSky,
  compareTemperatures, mergeAemetSnapshot, resolveAemetWarnings, resolveAemetWarningsDetailed,
  isAemetCapPayload, aemetPairWindowMs, downloadAreaForZone,
} from './weather.js';

test('AEMET sky returns a single representative description', () => {
  // Prefiere el periodo que cubre el mediodía.
  assert.equal(
    aemetSky([
      { periodo: '00-12', descripcion: 'Muy nuboso' },
      { periodo: '12-24', descripcion: 'Cubierto con lluvia' },
    ]),
    'Cubierto con lluvia',
  );
  // Sin periodos, escoge la descripción más repetida.
  assert.equal(
    aemetSky([
      { descripcion: 'Cubierto con lluvia' }, { descripcion: 'Cubierto con lluvia' },
      { descripcion: 'Muy nuboso' }, { descripcion: '' }, null,
    ]),
    'Cubierto con lluvia',
  );
  assert.equal(aemetSky([]), null);
  assert.equal(aemetSky(undefined), null);
});

test('AEMET proximity reports distance and altitude difference against the microstation', () => {
  const proximity = aemetProximityForDevice(
    { latitude: 37.8614, longitude: -2.6, altitude: 953 },
    { stationId: '5051X' },
  );
  assert.ok(proximity.distanceKm > 0 && proximity.distanceKm < 6);
  assert.equal(proximity.aemetAltitudeM, 1101);
  assert.equal(proximity.aemetAltitudeSource, 'ficha de estación AEMET 5051X');
  assert.equal(proximity.microAltitudeM, 953);
  assert.equal(proximity.microAltitudeSource, 'altitud configurada en la ficha de estación');
  assert.equal(proximity.altitudeDifferenceM, 148);
  assert.equal(aemetProximityForDevice({ latitude: null, longitude: null }, { stationId: '5051X' }), null);
});

test('AEMET errors show safe endpoint diagnostics and repeated messages are deduplicated', () => {
  assert.match(describeAemetError('previsión municipal', new Error('aemet_status_401')), /API key o permisos rechazados \(HTTP 401\)/);
  assert.match(describeAemetError('avisos oficiales', new Error('provider_http_503')), /servicio AEMET con error HTTP 503/);
  assert.deepEqual(mergeWeatherErrors(['fallo AEMET', 'fallo Open-Meteo'], ['fallo AEMET']), [
    'fallo AEMET', 'fallo Open-Meteo',
  ]);
});

test('Huéscar devices receive AEMET municipality, observation, and warning-zone defaults', () => {
  assert.deepEqual(aemetConfigForDevice({ name: 'Microestación', publicZone: 'Huéscar, Granada' }), {
    municipalityCode: '18098', stationId: '5051X', warningZone: '611803', downloadArea: '61',
  });
  assert.deepEqual(aemetConfigForDevice({ name: 'Huéscar Norte', publicZone: null, aemetStationId: 'CUSTOM' }), {
    municipalityCode: '18098', stationId: 'CUSTOM', warningZone: '611803', downloadArea: '61',
  });
  assert.deepEqual(aemetConfigForDevice({ name: 'Otra estación', publicZone: 'Baza' }), {
    municipalityCode: null, stationId: null, warningZone: null, downloadArea: null,
  });
});

test('the CAP download area derives from the zone prefix and falls back to spain', () => {
  // La zona CAP (611802) sirve para filtrar; el área de descarga es la CCAA (61).
  assert.equal(downloadAreaForZone('611802'), '61');
  assert.equal(downloadAreaForZone('611803'), '61');
  assert.equal(downloadAreaForZone('610404'), '61');
  // Códigos fuera del rango de CCAA admitido o sin zona: España entera.
  assert.equal(downloadAreaForZone('999999'), 'esp');
  assert.equal(downloadAreaForZone('abc'), 'esp');
  assert.equal(downloadAreaForZone(null), 'esp');
  assert.equal(downloadAreaForZone(''), 'esp');
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

test('Minor or green CAP messages are no-warning and never count as active risk', () => {
  const now = new Date('2026-10-08T12:00:00Z');
  const build = (severity, event, onset = '2026-10-08T10:00:00Z', expires = '2026-10-09T10:00:00Z') =>
    `<alert><identifier>x-1</identifier><status>Actual</status><msgType>Alert</msgType><info><language>es-ES</language><event>${event}</event><severity>${severity}</severity><onset>${onset}</onset><expires>${expires}</expires><area><areaDesc>Huéscar</areaDesc><geocode><value>611802</value></geocode></area></info></alert>`;
  for (const [severity, event] of [
    ['Minor', 'Aviso de tormentas de nivel verde'],
    ['Minor', 'Minor thunderstorm warning'],
    ['Moderate', 'Aviso de tormentas de nivel verde (sin severidad clara)'],
    ['Unknown', 'Sin aviso'],
  ]) {
    assert.equal(resolveAemetWarnings([build(severity, event)], { now, areaCode: '611802' }).length, 0,
      `${severity} / ${event}`);
  }
  // Amarillo/naranja/rojo (Moderate/Severe/Extreme) se conservan.
  assert.equal(resolveAemetWarnings([build('Moderate', 'Aviso de tormentas de nivel amarillo')], { now, areaCode: '611802' }).length, 1);
  assert.equal(resolveAemetWarnings([build('Severe', 'Naranja')], { now, areaCode: '611802' }).length, 1);
  assert.equal(resolveAemetWarnings([build('Extreme', 'Rojo')], { now, areaCode: '611802' }).length, 1);
});

test('CAP messages prefer Spanish info over other languages', () => {
  const now = new Date('2026-10-08T12:00:00Z');
  const bilingual = '<alert><identifier>bi-1</identifier><status>Actual</status><msgType>Alert</msgType>'
    + '<info><language>en-GB</language><event>Moderate rain warning</event><severity>Moderate</severity><onset>2026-10-08T10:00:00Z</onset><expires>2026-10-09T10:00:00Z</expires><area><areaDesc>Levante almeriense</areaDesc><geocode><value>610404</value></geocode></area></info>'
    + '<info><language>es-ES</language><event>Aviso de lluvias de nivel amarillo</event><severity>Moderate</severity><onset>2026-10-08T10:00:00Z</onset><expires>2026-10-09T10:00:00Z</expires><area><areaDesc>Levante almeriense</areaDesc><geocode><value>610404</value></geocode></area></info>'
    + '</alert>';
  const warnings = resolveAemetWarnings([bilingual], { now, areaCode: '610404' });
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].event, 'Aviso de lluvias de nivel amarillo');
});

test('upcoming warnings (future onset) are separated from active ones', () => {
  const now = new Date('2026-10-08T12:00:00Z');
  const future = '<alert><identifier>f-1</identifier><status>Actual</status><msgType>Alert</msgType><info><language>es-ES</language><event>Heladas de nivel amarillo</event><severity>Moderate</severity><onset>2026-10-09T22:00:00Z</onset><expires>2026-10-10T10:00:00Z</expires><area><areaDesc>Huéscar</areaDesc><geocode><value>611802</value></geocode></area></info></alert>';
  const active = resolveAemetWarnings([future], { now, areaCode: '611802' });
  assert.equal(active.length, 0, 'onset futuro no es vigente');
  const detailed = resolveAemetWarningsDetailed([future], { now, areaCode: '611802' });
  assert.equal(detailed.active.length, 0);
  assert.equal(detailed.upcoming.length, 1);
  assert.match(detailed.upcoming[0].event, /Heladas/);
  // Sin coordenadas el geocódigo de zona decide; con zona ajena, fuera.
  assert.equal(resolveAemetWarningsDetailed([future], { now, areaCode: '610404' }).upcoming.length, 0);
});

test('AEMET observation timestamps use Madrid time when the provider omits an offset', () => {
  const winter = normalizeAemetObservation([{ idema: '5051X', fint: '2026-01-15T10:00:00', ta: '4' }], '5051X');
  const summer = normalizeAemetObservation([{ idema: '5051X', fint: '2026-07-15T10:00:00', ta: '24' }], '5051X');
  assert.equal(winter.observedAt, '2026-01-15T09:00:00.000Z');
  assert.equal(summer.observedAt, '2026-07-15T08:00:00.000Z');
  assert.equal(normalizeAemetObservation([], '5051X'), null);
  const now = new Date('2026-10-07T12:00:00Z');
  assert.equal(normalizeAemetObservation([
    { idema: '5051X', fint: '2026-10-07T12:06:00Z', ta: '30' },
  ], '5051X', { now }), null);
});

test('temperature comparison pairs nearest timestamps only inside the ten-minute window and keeps signed results', () => {
  assert.equal(aemetPairWindowMs('5'), 5 * 60 * 1000);
  assert.equal(aemetPairWindowMs('0'), 10 * 60 * 1000);
  assert.equal(aemetPairWindowMs('90'), 60 * 60 * 1000);
  const local = { temperatureC: 14.2, observedAt: '2026-10-07T12:05:00Z', location: 'Vega de Huéscar' };
  const observations = {
    observations: [
      { stationId: '5051X', temperatureC: 13.7, observedAt: '2026-10-07T12:00:00Z' },
      { stationId: '5051X', temperatureC: 12.0, observedAt: '2026-10-07T11:40:00Z' },
    ],
  };
  const warmer = compareTemperatures(local, observations);
  assert.equal(warmer.state, 'matched');
  assert.equal(warmer.aemet.temperatureC, 13.7);
  assert.equal(warmer.differenceC, 0.5);
  assert.equal(warmer.timeOffsetSeconds, 300);
  assert.equal(compareTemperatures({ ...local, temperatureC: 12 }, observations).differenceC, -1.7);
  const old = compareTemperatures(local, { observations: [
    { stationId: '5051X', temperatureC: 13.7, observedAt: '2026-10-07T11:54:00Z' },
  ] });
  assert.equal(old.state, 'no_pair');
  assert.equal(old.differenceC, null);
  assert.equal(old.local.observedAt, local.observedAt);
  assert.equal(old.aemet.observedAt, '2026-10-07T11:54:00Z');
  assert.equal(compareTemperatures(local, null).state, 'missing');
});

test('provider failure retains last usable AEMET values and marks each component stale', () => {
  const previous = {
    observation: { stationId: '5051X', temperatureC: 8 }, observationFetchedAt: '2026-10-07T10:00:00Z',
    forecast: { days: [{ date: '2026-10-08' }] }, forecastFetchedAt: '2026-10-07T10:00:00Z',
    warnings: [{ identifier: 'alert-1', event: 'Viento', expires: '2026-10-07T13:00:00Z' }],
    warningsFetchedAt: '2026-10-07T10:00:00Z',
  };
  const merged = mergeAemetSnapshot(previous, {
    fetchedAt: '2026-10-07T12:00:00Z', errors: ['fallo AEMET'],
    observationAvailable: false, forecastAvailable: false, warningsAvailable: false,
  });
  assert.equal(merged.observation.temperatureC, 8);
  assert.equal(merged.forecast.days.length, 1);
  assert.equal(merged.warnings[0].identifier, 'alert-1');
  assert.equal(merged.observationStatus, 'stale');
  assert.equal(merged.warningsStatus, 'stale');
});

test('a successful empty CAP response means no current warnings; malformed content is not a clear result', () => {
  assert.equal(isAemetCapPayload(''), true);
  assert.equal(isAemetCapPayload([]), true);
  assert.equal(isAemetCapPayload('<alert><status>Actual</status></alert>'), true);
  assert.equal(isAemetCapPayload('gateway temporarily unavailable'), false);
  const empty = mergeAemetSnapshot({ warnings: [{ identifier: 'old' }] }, {
    warnings: [], warningsAvailable: true, warningsFetchedAt: '2026-10-07T12:00:00Z',
    warningsCheckedAt: '2026-10-07T12:00:00Z', fetchedAt: '2026-10-07T12:00:00Z', errors: [],
  });
  assert.deepEqual(empty.warnings, []);
  assert.equal(empty.warningsStatus, 'current');
});

test('a 404 with no CAP data is an empty consultation, never an absence of warnings', () => {
  const noData = mergeAemetSnapshot({ warnings: [{ identifier: 'old' }], warningsFetchedAt: '2026-10-06T12:00:00Z' }, {
    warnings: [], warningsAvailable: true, warningsNoData: true,
    warningsFetchedAt: null, warningsCheckedAt: '2026-10-07T12:00:00Z',
    fetchedAt: '2026-10-07T12:00:00Z', errors: [],
  });
  assert.deepEqual(noData.warnings, []);
  assert.equal(noData.warningsStatus, 'empty');
});

test('CAP parsing filters expired and out-of-area alerts, and applies cancellation references', () => {
  const now = new Date('2026-10-07T12:00:00Z');
  const alert = `<alert><identifier>wind-1</identifier><sender>AEMET</sender><sent>2026-10-07T11:00:00Z</sent><status>Actual</status><msgType>Alert</msgType><info><event>Viento</event><headline>Rachas fuertes</headline><onset>2026-10-07T11:00:00Z</onset><expires>2026-10-07T14:00:00Z</expires><area><areaDesc>Huéscar</areaDesc><polygon>37.7,-2.8 38.0,-2.8 38.0,-2.4 37.7,-2.4 37.7,-2.8</polygon></area></info></alert>`;
  const cancelled = `<alert><identifier>cancel-1</identifier><sender>AEMET</sender><sent>2026-10-07T11:30:00Z</sent><status>Actual</status><msgType>Cancel</msgType><references>AEMET,wind-1,2026-10-07T11:00:00Z</references></alert>`;
  const update = alert.replace('wind-1', 'wind-2').replace('11:00:00Z</sent>', '11:15:00Z</sent>')
    .replace('<msgType>Alert</msgType>', '<msgType>Update</msgType>')
    .replace('<expires>2026-10-07T14:00:00Z</expires>', '<expires>2026-10-07T15:00:00Z</expires>')
    .replace('<references>', '<references>').replace('</msgType>', '</msgType><references>AEMET,wind-1,2026-10-07T11:00:00Z</references>');
  assert.equal(resolveAemetWarnings([alert], { now, areaCode: '611803', latitude: 37.86, longitude: -2.6 }).length, 1);
  assert.equal(resolveAemetWarnings([alert, cancelled], { now, areaCode: '611803', latitude: 37.86, longitude: -2.6 }).length, 0);
  assert.equal(resolveAemetWarnings([update, alert], { now, areaCode: '611803', latitude: 37.86, longitude: -2.6 })[0].identifier, 'wind-2');
  assert.equal(resolveAemetWarnings([alert], { now, areaCode: '611803', latitude: 40, longitude: -3 }).length, 0);
  const expired = alert.replace('2026-10-07T14:00:00Z', '2026-10-07T11:59:00Z');
  assert.equal(resolveAemetWarnings([expired], { now, latitude: 37.86, longitude: -2.6 }).length, 0);
  assert.deepEqual(resolveAemetWarnings([], { now }), []);
});
