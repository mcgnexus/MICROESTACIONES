import test from 'node:test';
import assert from 'node:assert/strict';
import { measurementSchema } from './contracts.js';

const base = {
  device_id: 'esp32c3-01', sequence: 1, ts: 1760000000, quality: 2,
  temp_c: 20.5, hum_pct: 55, press_pa: 100800, batt_mv: 3800, flags: 31, alert: 0,
};

test('measurement contract accepts the firmware uint32 sequence range', () => {
  assert.equal(measurementSchema.safeParse({ ...base, sequence: 4294967295 }).success, true);
  assert.equal(measurementSchema.safeParse({ ...base, sequence: 4294967296 }).success, false);
});

test('measurement contract rejects unsafe ranges and unexpected fields', () => {
  assert.equal(measurementSchema.safeParse({ ...base, temp_c: 101 }).success, false);
  assert.equal(measurementSchema.safeParse({ ...base, api_key: 'not-allowed' }).success, false);
});
