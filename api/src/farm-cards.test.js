import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessFrost, assessHeat, assessStorm, assessConnectivity, assessStation,
  renderStateCards, nextRisk, zoneComparison, renderZoneComparison, sinceText, resourceNote,
} from '../public/js/farm-cards.js';

const item = (over = {}) => ({
  device: { id: 'a', name: 'Huéscar' },
  latest: { temperatureC: 18, humidityPct: 55, observedAt: '2026-01-01T10:00:00Z' },
  status: { connectivity: 'online', batteryLevel: 'ok', dataFreshness: 'fresh', lastContact: '2026-01-01T10:00:00Z' },
  weather: { advisories: [], aemet: { warnings: [] } },
  ...over,
});

test('frost risk escalates from normal to hard frost and forecast', () => {
  assert.equal(assessFrost(item()).tone, 'ok');
  assert.equal(assessFrost(item({ latest: { temperatureC: 1.5, observedAt: 'x' } })).tone, 'warn');
  assert.equal(assessFrost(item({ latest: { temperatureC: -3, observedAt: 'x' } })).tone, 'alert');
  const forecast = item({ latest: { temperatureC: 8, observedAt: 'x' },
    weather: { advisories: [], aemet: { warnings: [], forecast: { days: [{ temperatureMinC: -1 }] } } } });
  assert.equal(assessFrost(forecast).tone, 'warn');
});

test('heat risk escalates with temperature and forecast', () => {
  assert.equal(assessHeat(item()).tone, 'ok');
  assert.equal(assessHeat(item({ latest: { temperatureC: 36, observedAt: 'x' } })).tone, 'warn');
  assert.equal(assessHeat(item({ latest: { temperatureC: 40, observedAt: 'x' } })).tone, 'alert');
});

test('storm risk reports official warnings and estimated risk, never local detection', () => {
  assert.equal(assessStorm(item()).tone, 'muted');
  const warning = item({ weather: { advisories: [], aemet: { warnings: [{ event: 'Aviso por tormentas', severity: 'naranja', headline: 'Tormentas fuertes' }] } } });
  assert.equal(assessStorm(warning).tone, 'alert');
  const estimate = item({ weather: { advisories: [{ kind: 'lluvia', text: 'Posible lluvia intensa', date: '2026-01-02' }], aemet: { warnings: [] } } });
  assert.equal(assessStorm(estimate).tone, 'warn');
});

test('a forecast failure does not claim the official warnings are unavailable too', () => {
  // El caso reportado: un 429 al pedir la previsión municipal mientras los
  // avisos oficiales sí se consultaron. Antes la tarjeta decía que «la previsión
  // externa y los avisos oficiales no se pueden consultar», contradiciendo el
  // «Sin avisos vigentes» con fecha que se mostraba debajo.
  const forecast429 = item({
    weather: {
      advisories: [],
      errors: ['AEMET previsión municipal: 429'],
      aemet: {
        warnings: [],
        warningsStatus: 'current',
        warningsFetchedAt: '2026-01-01T22:29:00Z',
        forecastStatus: 'unavailable',
      },
    },
  });
  const storm = assessStorm(forecast429);
  assert.notEqual(storm.meaning, 'sin avisos');
  // La previsión es lo que falla, y eso es lo único que se afirma.
  assert.match(storm.meaning, /previsión/i);
  // No se arrastra al otro recurso.
  assert.doesNotMatch(storm.meaning, /los avisos oficiales no se pueden consultar/);
  // Y se dice que los avisos sí se consultaron: eso ya es un dato.
  assert.match(storm.meaning, /Los avisos oficiales sí se consultaron/);
  assert.match(storm.meaning, /no consta ninguno vigente/);
});

test('a warnings failure is reported as such, without blaming the forecast', () => {
  const warningsDown = item({
    weather: {
      advisories: [],
      aemet: { warnings: [], warningsStatus: 'unavailable', forecastStatus: 'current' },
    },
  });
  const storm = assessStorm(warningsDown);
  assert.match(storm.meaning, /avisos oficiales/);
  assert.match(storm.meaning, /La previsión sí se consultó/);
});

test('stored data is shown as such instead of a bare unavailability', () => {
  // Mensaje pedido en F06: distinguir «no se pudo actualizar» de «no hay nada».
  const stale = item({
    weather: {
      advisories: [],
      aemet: {
        warnings: [],
        warningsStatus: 'current',
        forecastStatus: 'stale',
        forecastFetchedAt: '2026-01-01T22:29:00Z',
      },
    },
  });
  const storm = assessStorm(stale);
  assert.match(storm.meaning, /No se pudo actualizar la previsión/);
  assert.match(storm.meaning, /Mostramos la última consulta/);
  // Conserva la hora de la última consulta utilizable.
  assert.match(storm.meaning, /\d{1,2}:\d{2}/);
  assert.equal(storm.value, 'consulta parcial');
});

test('when no source is consultable the card says so and does not claim all-clear', () => {
  const nothing = item({
    weather: {
      advisories: [],
      aemet: { warnings: [], warningsStatus: 'unavailable', forecastStatus: 'unavailable' },
    },
  });
  const storm = assessStorm(nothing);
  assert.equal(storm.value, 'fuente no disponible');
  assert.match(storm.meaning, /no se afirma que no haya tormenta/i);
});

test('an empty but current warnings response is a result, not a failure', () => {
  // Sin errores y con la consulta al día: AEMET respondió que no hay avisos.
  const current = item({
    weather: {
      advisories: [],
      aemet: { warnings: [], warningsStatus: 'current', forecastStatus: 'current' },
    },
  });
  const storm = assessStorm(current);
  assert.equal(storm.value, 'sin avisos');
  assert.match(storm.meaning, /Sin avisos oficiales/);
});

test('resource notes name the resource and keep the hour of the stored query', () => {
  // Es lo que consume el bloque de contexto del panel en lugar del error crudo.
  const staleForecast = item({
    weather: {
      advisories: [],
      aemet: {
        warnings: [],
        warningsStatus: 'current',
        forecastStatus: 'stale',
        forecastFetchedAt: '2026-01-01T22:29:00Z',
      },
    },
  });
  const note = resourceNote(staleForecast, 'forecast', 'la previsión');
  assert.match(note, /No se pudo actualizar la previsión/);
  assert.match(note, /Mostramos la última consulta/);
  assert.match(note, /\d{1,2}:\d{2}/);

  // Sin previsión ni estado, el recurso no está: eso sí se dice, con nombre.
  assert.equal(resourceNote(item(), 'forecast', 'la previsión'), 'No se pudo consultar la previsión.');
  // Consultados y vacíos no generan nota: no hay nada que avisar.
  const currentEmpty = item({ weather: { advisories: [], aemet: { warnings: [], warningsStatus: 'current' } } });
  assert.equal(resourceNote(currentEmpty, 'warnings', 'los avisos oficiales'), '');
  // Vacíos pero SIN estado sí es «no consultado»: no se presume que estén vacíos.
  assert.equal(resourceNote(item(), 'warnings', 'los avisos oficiales'), 'No se pudo consultar los avisos oficiales.');

  // Acepta el bloque weather suelto (como lo pasa el detalle del panel).
  const loose = resourceNote(staleForecast.weather, 'forecast', 'la previsión');
  assert.equal(loose, note);
});

test('connectivity and station state map to advice', () => {
  assert.equal(assessConnectivity(item({ status: { connectivity: 'offline' } })).tone, 'alert');
  assert.equal(assessConnectivity(item()).tone, 'ok');
  assert.equal(assessStation(item({ status: { batteryLevel: 'critical', dataFreshness: 'fresh' } })).tone, 'alert');
  assert.equal(assessStation(item({ status: { batteryLevel: 'low', dataFreshness: 'fresh' } })).tone, 'warn');
  assert.equal(assessStation(item()).tone, 'ok');
});

test('no measurements or no sensor never shows a reassuring state', () => {
  const noData = item({ status: { connectivity: 'unknown', dataFreshness: 'unknown', lastContact: null } });
  assert.equal(assessStation(noData).tone, 'muted');
  assert.equal(assessStation(noData).value, 'sin datos');
  assert.equal(assessFrost(noData).tone, 'muted');
  assert.equal(assessHeat(noData).tone, 'muted');

  const noTemp = item({ device: { id: 'a', name: 'Huéscar', sensors: { temperature: false } } });
  assert.equal(assessFrost(noTemp).tone, 'muted');
  assert.equal(assessFrost(noTemp).value, 'sin sensor');
  const html = renderStateCards([noTemp]);
  assert.match(html, /sin sensor/i);
  assert.doesNotMatch(html, /Sin riesgo de helada/);
});

test('stale local temperature is never described as a current risk or an all-clear', () => {
  const stale = item({
    latest: { temperatureC: -5, observedAt: '2026-01-01T08:00:00Z' },
    status: { connectivity: 'online', dataFreshness: 'stale', lastValidData: '2026-01-01T08:00:00Z' },
  });
  assert.equal(assessFrost(stale).tone, 'muted');
  assert.match(assessFrost(stale).value, /sin lectura actual/);
  assert.equal(assessHeat(stale).tone, 'muted');
  assert.equal(assessConnectivity(stale).tone, 'warn');
  assert.equal(assessStation(stale).value, 'datos antiguos');
});

test('rendered state cards distinguish last contact from stale measurements', () => {
  const html = renderStateCards([item({ status: {
    connectivity: 'online', dataFreshness: 'stale', lastValidData: '2026-01-01T08:00:00Z',
    lastContact: '2026-01-01T10:00:00Z', batteryLevel: 'ok',
  } })]);
  assert.match(html, /datos antiguos/i);
  // Las lecturas antiguas permanecen visibles, con tono de aviso y su título
  // cambiado; los riesgos, en cambio, no se estiman con datos viejos.
  assert.match(html, /Última temperatura/);
  assert.match(html, /Última humedad/);
  assert.match(html, /datos están anticuados/);
  assert.match(html, /18 °C/);
  assert.match(html, /sin lectura actual/i);
});

test('state cards render the seven main cards with advice', () => {
  const html = renderStateCards([item()]);
  for (const title of ['Temperatura actual', 'Humedad actual', 'Riesgo de helada', 'Riesgo de calor', 'Riesgo de tormenta', 'Última comunicación', 'Estado de la estación']) {
    assert.match(html, new RegExp(title));
  }
  assert.match(html, /state-action/);
});

test('risk cards say whether the claim is real, forecast or calculated', () => {
  // Medida local → real.
  assert.equal(assessFrost(item({ latest: { temperatureC: -3, observedAt: 'x' } })).nature, 'real');
  assert.equal(assessHeat(item({ latest: { temperatureC: 40, observedAt: 'x' } })).nature, 'real');
  // Previsión externa → previsto, con el proveedor nombrado.
  const forecastItem = item({
    latest: { temperatureC: 8, observedAt: 'x' },
    weather: { advisories: [], aemet: { warnings: [], forecast: { days: [{ temperatureMinC: -1 }] } } },
  });
  const forecast = assessFrost(forecastItem);
  assert.equal(forecast.nature, 'previsto');
  assert.match(forecast.meaning, /AEMET prevé/);
  // Estimación propia sobre la previsión → calculado.
  const estimated = item({
    weather: { advisories: [{ kind: 'helada', text: 'Riesgo orientativo', date: '2026-01-02' }], aemet: { warnings: [] } },
  });
  assert.equal(assessFrost(estimated).nature, 'calculado');
  // Sin medición no se afirma nada: no aparece ninguna naturaleza.
  const stale = assessFrost(item({
    status: { connectivity: 'online', dataFreshness: 'stale', lastValidData: '2026-01-01T08:00:00Z' },
  }));
  assert.equal(stale.nature, undefined);
  // Y la tarjeta renderizada muestra la insignia con la pista.
  const html = renderStateCards([forecastItem]);
  assert.match(html, /Previsión externa o aviso oficial[^"]*">Previsto</);
  assert.match(html, /Dato observado o medido[^"]*">Real</);
});

test('next risk prefers an open alert, then the nearest advisory', () => {
  const withAlert = nextRisk([item()], [{ level: 1, message: 'Helada', deviceName: 'Huéscar', observedAt: '2026-01-01T05:00:00Z' }]);
  assert.equal(withAlert.tone, 'alert');
  assert.match(withAlert.title, /Helada/);

  const withAdvisory = nextRisk([item({ weather: { advisories: [{ kind: 'viento', text: 'Rachas fuertes', date: '2026-01-03' }], aemet: { warnings: [] } } })], []);
  assert.equal(withAdvisory.tone, 'warn');

  const none = nextRisk([item()], []);
  assert.equal(none.tone, 'ok');
});

test('zone comparison needs two stations and reports the difference', () => {
  assert.equal(zoneComparison([item()]), null);
  const rows = zoneComparison([
    item({ device: { id: 'a', name: 'Casco' }, latest: { temperatureC: 3, humidityPct: 80, observedAt: 'x' } }),
    item({ device: { id: 'b', name: 'Vega' }, latest: { temperatureC: -1, humidityPct: 90, observedAt: 'y' } }),
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[1].difference, -4);
  const html = renderZoneComparison([
    item({ device: { id: 'a', name: 'Casco' }, latest: { temperatureC: 3, humidityPct: 80, observedAt: 'x' } }),
    item({ device: { id: 'b', name: 'Vega' }, latest: { temperatureC: -1, humidityPct: 90, observedAt: 'y' } }),
  ]);
  assert.match(html, /Vega/);
  assert.match(html, /-4,0 °C|-4 °C/);
});

test('since text is human and bounded', () => {
  const now = new Date('2026-01-01T10:00:00Z');
  assert.equal(sinceText('2026-01-01T09:50:00Z', now), 'hace 10 min');
  assert.equal(sinceText('2026-01-01T07:00:00Z', now), 'hace 3 h');
  assert.equal(sinceText(null, now), null);
});
