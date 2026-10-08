import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyMeasurementTime, measurementIdentity } from './measurement-policy.js';

const now = new Date('2026-10-07T12:00:00Z');
const at = (minutes) => new Date(now.getTime() + minutes * 60_000);

test('retries preserve the existing device/sequence/timestamp identity', () => {
  const sample = { sequence: 9, ts: 1791374400 };
  assert.equal(measurementIdentity('station-a', sample), measurementIdentity('station-a', { ...sample }));
  assert.notEqual(measurementIdentity('station-a', sample), measurementIdentity('station-a', { ...sample, ts: sample.ts + 1 }));
});

test('untrusted, future, late and out-of-order samples do not count as current', () => {
  assert.equal(classifyMeasurementTime({ observedAt: at(-1), now, timeValid: false }), 'untrusted_time');
  assert.equal(classifyMeasurementTime({ observedAt: at(6), now }), 'future');
  assert.equal(classifyMeasurementTime({ observedAt: at(-21), now, measurementIntervalSeconds: 300 }), 'historical');
  assert.equal(classifyMeasurementTime({ observedAt: at(-1), now, newestObservedAt: at(0) }), 'out_of_order');
  assert.equal(classifyMeasurementTime({ observedAt: at(-1), now }), 'current');
});

test('a delayed historical batch is stored as history, not as current weather', () => {
  const delayedSamples = [at(-60), at(-55), at(-51)];
  assert.deepEqual(delayedSamples.map((observedAt) => classifyMeasurementTime({
    observedAt, now, measurementIntervalSeconds: 300,
  })), ['historical', 'historical', 'historical']);
});
