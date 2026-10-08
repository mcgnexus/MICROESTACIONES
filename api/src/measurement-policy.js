import { FUTURE_CLOCK_TOLERANCE_MS } from './validation.js';

// Existing wire identity remains (device_id, uint32 sequence, ts). A retry must
// reproduce all three; reboot/sequence reset remains distinguishable by ts.
export function measurementIdentity(deviceId, record) {
  return `${deviceId}:${record.sequence}:${record.ts}`;
}

export function classifyMeasurementTime({ observedAt, now = new Date(), newestObservedAt = null,
  measurementIntervalSeconds = 360, timeValid = true }) {
  const observedMs = new Date(observedAt).getTime();
  const nowMs = now.getTime();
  if (!timeValid || !Number.isFinite(observedMs)) return 'untrusted_time';
  if (observedMs > nowMs + FUTURE_CLOCK_TOLERANCE_MS) return 'future';
  if (newestObservedAt && observedMs <= new Date(newestObservedAt).getTime()) return 'out_of_order';
  const maxCurrentAgeMs = (3 * Math.max(60, Number(measurementIntervalSeconds) || 360) + 300) * 1000;
  if (nowMs - observedMs > maxCurrentAgeMs) return 'historical';
  return 'current';
}
