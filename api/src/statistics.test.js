import test from 'node:test';
import assert from 'node:assert/strict';
import { dixonQTest } from './statistics.js';

const points = (values) => values.map((value, index) => ({
  at: new Date(index * 60_000).toISOString(), value,
}));

test('Dixon Q identifies a single extreme high value and keeps it for review', () => {
  const result = dixonQTest(points([10, 11, 12, 13, 14, 15, 16, 17, 18, 40]));
  assert.equal(result.status, 'possible_outlier');
  assert.equal(result.side, 'maximum');
  assert.equal(result.suspectedValue, 40);
  assert.equal(result.n, 10);
  assert.equal(result.criticalQ, 0.466);
  assert.ok(result.q > result.criticalQ);
});

test('Dixon Q reports insufficient data, constant series, and limits the window to 30', () => {
  assert.equal(dixonQTest(points([1, 2])).status, 'insufficient_data');
  assert.equal(dixonQTest(points([5, 5, 5, 5])).status, 'no_variation');
  const result = dixonQTest(points(Array.from({ length: 35 }, (_, index) => index)));
  assert.equal(result.n, 30);
  assert.equal(result.sampleLimit, 30);
  assert.equal(result.status, 'no_outlier');
});
