import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessFrost, assessHeat, assessStorm, assessConnectivity, assessStation,
  renderStateCards, nextRisk, zoneComparison, renderZoneComparison, sinceText,
} from '../public/js/farm-cards.js';

const item = (over = {}) => ({
  device: { id: 'a', name: 'Huéscar' },
  latest: { temperatureC: 18, humidityPct: 55, observedAt: '2026-01-01T10:00:00Z' },
  status: { connectivity: 'online', batteryLevel: 'ok', lastContact: '2026-01-01T10:00:00Z' },
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

test('connectivity and station state map to advice', () => {
  assert.equal(assessConnectivity(item({ status: { connectivity: 'offline' } })).tone, 'alert');
  assert.equal(assessConnectivity(item()).tone, 'ok');
  assert.equal(assessStation(item({ status: { batteryLevel: 'critical' } })).tone, 'alert');
  assert.equal(assessStation(item({ status: { batteryLevel: 'low' } })).tone, 'warn');
  assert.equal(assessStation(item()).tone, 'ok');
});

test('state cards render the seven main cards with advice', () => {
  const html = renderStateCards([item()]);
  for (const title of ['Temperatura actual', 'Humedad actual', 'Riesgo de helada', 'Riesgo de calor', 'Riesgo de tormenta', 'Última comunicación', 'Estado de la estación']) {
    assert.match(html, new RegExp(title));
  }
  assert.match(html, /state-action/);
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
