export const CONNECTIVITY_GRACE_SECONDS = 300;

// Suelo de frescura: los lotes llegan cada ~15 min, así que un dato de menos
// de 20 minutos es cadencia normal aunque la configuración declare un
// intervalo menor. Nunca se etiqueta como antiguo antes de los 20 minutos.
export const MIN_FRESH_WINDOW_SECONDS = 20 * 60;

export function connectivityFor(lastContact, intervalSeconds, now = new Date()) {
  if (!lastContact) return 'unknown';
  const ageMs = Math.max(0, now.getTime() - new Date(lastContact).getTime());
  const interval = Math.max(60, Number(intervalSeconds) || 1800) * 1000;
  const grace = CONNECTIVITY_GRACE_SECONDS * 1000;
  if (ageMs <= 1.5 * interval + grace) return 'online';
  if (ageMs <= 3 * interval + grace) return 'degraded';
  return 'offline';
}

export function dataFreshnessFor(lastValidData, intervalSeconds, now = new Date()) {
  if (!lastValidData) return 'unknown';
  const ageMs = Math.max(0, now.getTime() - new Date(lastValidData).getTime());
  const interval = Math.max(60, Number(intervalSeconds) || 360) * 1000;
  const freshWindowMs = Math.max(3 * interval + CONNECTIVITY_GRACE_SECONDS * 1000, MIN_FRESH_WINDOW_SECONDS * 1000);
  return ageMs <= freshWindowMs ? 'fresh' : 'stale';
}

export function offlineThresholdSeconds(syncIntervalSeconds) {
  return 3 * Math.max(60, Number(syncIntervalSeconds) || 1800) + CONNECTIVITY_GRACE_SECONDS;
}
