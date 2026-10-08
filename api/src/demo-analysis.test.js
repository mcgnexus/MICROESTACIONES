import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEW_POINT_LIMITATIONS, DEW_POINT_METHOD, dailySummaries, describeSeries, dewPointCelsius,
  pairTemperatureSeries,
} from './statistics.js';

test('dew point is calculated with Magnus and refuses impossible inputs', () => {
  assert.equal(dewPointCelsius(20, 50), 9.3);
  assert.equal(dewPointCelsius(10, 100), 10);
  assert.equal(dewPointCelsius(null, 50), null);
  assert.equal(dewPointCelsius(20, null), null);
  assert.equal(dewPointCelsius(20, 0), null);
  assert.equal(dewPointCelsius(20, 120), null);
  // Metadato honesto: es un cálculo, no una medida.
  assert.match(DEW_POINT_METHOD, /Magnus/);
  assert.ok(DEW_POINT_LIMITATIONS.length >= 2);
});

test('describeSeries reports when the minimum and maximum happened', () => {
  const series = describeSeries([
    { at: '2026-01-01T10:00:00Z', value: 12 },
    { at: '2026-01-01T14:00:00Z', value: 25 },
    { at: '2026-01-01T22:00:00Z', value: 4 },
  ]);
  assert.equal(series.min, 4);
  assert.equal(series.max, 25);
  assert.equal(series.minAt, '2026-01-01T22:00:00.000Z');
  assert.equal(series.maxAt, '2026-01-01T14:00:00.000Z');
});

test('daily summaries group by Madrid day and expose each day extremes', () => {
  const days = dailySummaries([
    { at: '2026-01-01T08:00:00Z', value: 5 },
    { at: '2026-01-01T14:00:00Z', value: 15 },
    { at: '2026-01-01T23:30:00Z', value: 9 }, // 00:30 del 2 de enero en Madrid
  ]);
  assert.equal(days.length, 2);
  assert.equal(days[0].date, '2026-01-01');
  assert.equal(days[0].max, 15);
  assert.equal(days[1].date, '2026-01-02');
  assert.equal(days[1].count, 1);
  assert.ok(days[0].minAt && days[0].maxAt);
});

test('AEMET comparison pairs only observations inside the window', () => {
  const local = [
    { at: '2026-01-01T12:00:00Z', value: 10 },
    { at: '2026-01-01T13:00:00Z', value: 12 },
  ];
  const external = [
    { observedAt: '2026-01-01T12:05:00Z', temperatureC: 9 },
    { observedAt: '2026-01-01T13:30:00Z', temperatureC: 20 }, // fuera de ±10 min
  ];
  const result = pairTemperatureSeries(local, external, 10 * 60 * 1000);
  assert.equal(result.matched, 1);
  assert.equal(result.pairs[0].differenceC, 1);
  assert.equal(result.differenceDefinition, 'temperatura_microestacion_menos_AEMET');
  assert.equal(result.differences.avg, 1);
});
