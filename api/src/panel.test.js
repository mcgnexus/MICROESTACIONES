import test from 'node:test';
import assert from 'node:assert/strict';
import { primaryReading } from '../public/js/panel.js';

const device = (over = {}) => ({
  device: { id: 'a', name: 'Estación A' },
  status: { dataFreshness: 'fresh' },
  latest: { temperatureC: 12, observedAt: '2026-01-05T06:00:00Z', isValidated: true },
  ...over,
});

test('primaryReading picks the freshest valid temperature', () => {
  const older = device({ device: { id: 'a', name: 'A' }, latest: { temperatureC: 10, observedAt: '2026-01-05T05:00:00Z', isValidated: true } });
  const newer = device({ device: { id: 'b', name: 'B' }, latest: { temperatureC: 12, observedAt: '2026-01-05T06:30:00Z', isValidated: true } });
  assert.equal(primaryReading([older, newer]).device.id, 'b');
});

test('primaryReading ignores stale or temperature-less stations', () => {
  const stale = device({ status: { dataFreshness: 'stale' }, latest: { temperatureC: 9, observedAt: '2026-01-05T07:00:00Z', isValidated: true } });
  const noTemp = device({ device: { id: 'c', name: 'C' }, latest: { humidityPct: 50, observedAt: '2026-01-05T07:30:00Z', isValidated: true } });
  const fresh = device({ device: { id: 'd', name: 'D' }, latest: { temperatureC: 8, observedAt: '2026-01-05T06:00:00Z', isValidated: true } });
  assert.equal(primaryReading([stale, noTemp, fresh]).device.id, 'd');
});

test('primaryReading falls back to the first device without valid readings', () => {
  const stale = device({ status: { dataFreshness: 'stale' } });
  assert.equal(primaryReading([stale]).device.id, 'a');
  assert.equal(primaryReading([]), null);
  assert.equal(primaryReading(undefined), null);
});
