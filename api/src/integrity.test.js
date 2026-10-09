import test from 'node:test';
import assert from 'node:assert/strict';
import {
  expectedSamples, expectedFromSegments, expectedBetween, intervalSegments,
  sequenceIntegrity, coverageReport,
} from './statistics.js';

const DAY_FROM = '2026-01-01T00:00:00Z';
const DAY_TO = '2026-01-02T00:00:00Z';

test('a recent commissioning shrinks the denominator to the service window', () => {
  const full = coverageReport({ received: 0, valid: 0, invalid: 0, intervalSeconds: 360, from: DAY_FROM, to: DAY_TO });
  assert.equal(full.expected, 240);
  const recent = coverageReport({
    received: 0, valid: 0, invalid: 0, intervalSeconds: 360,
    from: DAY_FROM, to: DAY_TO, serviceFrom: '2026-01-01T12:00:00Z',
  });
  assert.equal(recent.expected, 120, 'solo cuenta desde la puesta en servicio');
});

test('an interruption is expressed as time missing, not as sequence gaps', () => {
  const report = coverageReport({ received: 90, valid: 85, invalid: 5, intervalSeconds: 360, from: DAY_FROM, to: DAY_TO });
  assert.equal(report.expected, 240);
  assert.equal(report.timeMissing, 150);
  assert.equal(report.validMissing, 155);
  assert.equal(report.receivedPct, 37.5);
  assert.equal(report.validPct, 35.4);
});

test('a cadence change splits the denominator into effective intervals', () => {
  const segments = intervalSegments({
    versions: [
      { at: DAY_FROM, intervalSeconds: 360 },
      { at: '2026-01-01T12:00:00Z', intervalSeconds: 600 },
    ],
    currentIntervalSeconds: 600,
    from: DAY_FROM, to: DAY_TO, defaultIntervalSeconds: 360,
  });
  assert.equal(segments.length, 2);
  assert.equal(segments[0].intervalSeconds, 360);
  assert.equal(segments[1].intervalSeconds, 600);
  // 12 h a 360 s + 12 h a 600 s = 120 + 72
  assert.equal(expectedFromSegments(segments), 192);
  const report = coverageReport({ received: 192, valid: 192, invalid: 0, from: DAY_FROM, to: DAY_TO, segments, intervalSeconds: 600 });
  assert.equal(report.expected, 192);
  assert.equal(report.receivedPct, 100);
});

test('expectedBetween clips the segments that cross a sub-range', () => {
  const segments = intervalSegments({
    versions: [
      { at: DAY_FROM, intervalSeconds: 360 },
      { at: '2026-01-01T12:00:00Z', intervalSeconds: 600 },
    ],
    currentIntervalSeconds: 600, from: DAY_FROM, to: DAY_TO, defaultIntervalSeconds: 360,
  });
  // Las 6 h finales van a 600 s.
  assert.equal(expectedBetween(segments, '2026-01-01T18:00:00Z', DAY_TO), 36);
});

test('a sequence reset is not counted as missing samples', () => {
  const withReset = sequenceIntegrity([
    { at: '2026-01-01T00:00:00Z', sequence: 1 },
    { at: '2026-01-01T00:05:00Z', sequence: 2 },
    { at: '2026-01-01T00:10:00Z', sequence: 3 },
    { at: '2026-01-01T00:15:00Z', sequence: 1 },
    { at: '2026-01-01T00:20:00Z', sequence: 2 },
  ]);
  assert.equal(withReset.total, 0);
  assert.equal(withReset.gaps.length, 0);
  assert.equal(withReset.resets.length, 1);
});

test('a real jump in the sequence is reported as a gap', () => {
  const withGap = sequenceIntegrity([
    { at: '2026-01-01T00:00:00Z', sequence: 10 },
    { at: '2026-01-01T00:05:00Z', sequence: 11 },
    { at: '2026-01-01T00:10:00Z', sequence: 14 },
  ]);
  assert.equal(withGap.total, 2);
  assert.deepEqual(withGap.gaps, [{ from: 12, to: 13, missing: 2 }]);
  assert.equal(withGap.resets.length, 0);
});

test('expectedSamples needs an interval and never divides by zero', () => {
  assert.equal(expectedSamples({ from: DAY_FROM, to: DAY_TO, intervalSeconds: 0 }), null);
  assert.equal(expectedSamples({ from: DAY_FROM, to: DAY_TO, intervalSeconds: 360 }), 240);
});
