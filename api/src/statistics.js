// Informes estadísticos sobre datos ya validados.
// Nada de inferirVariables que los sensores no miden (lluvia, viento,
// enfermedades): aquí solo hay cálculo sobre temperatura, humedad, presión,
// batería e illuminancia, con el periodo y la estación siempre citados.

import { sql } from './db.js';

// La clave es la columna en la base de datos; `column` es como la devuelve el
// cliente (camelCase) y `key` es como se expone en el informe.
export const STAT_METRICS = [
  { key: 'temperature_c', column: 'temperatureC', label: 'Temperatura', unit: '°C', digits: 1 },
  { key: 'humidity_pct', column: 'humidityPct', label: 'Humedad', unit: '%', digits: 1 },
  { key: 'pressure_pa', column: 'pressurePa', label: 'Presión', unit: 'Pa', digits: 0 },
  { key: 'battery_mv', column: 'batteryMv', label: 'Batería', unit: 'mV', digits: 0 },
  { key: 'lux', column: 'lux', label: 'Iluminancia', unit: 'lux', digits: 0 },
];

const quantile = (sorted, q) => {
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * q;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  if (low === high) return sorted[low];
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
};

const round = (value, digits) => (value == null ? null : Number(Number(value).toFixed(digits)));

// Descripción de una serie temporal validada.
export function describeSeries(points, { digits = 2 } = {}) {
  const usable = (points || [])
    .map((point) => ({ t: new Date(point.at).getTime(), v: Number(point.value) }))
    .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.v))
    .sort((a, b) => a.t - b.t);
  if (!usable.length) {
    return { count: 0, min: null, max: null, avg: null, stddev: null, p10: null, p50: null, p90: null, trend: null };
  }
  const values = usable.map((point) => point.v);
  const sum = values.reduce((total, value) => total + value, 0);
  const avg = sum / values.length;
  const variance = values.reduce((total, value) => total + (value - avg) ** 2, 0) / values.length;
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted.at(-1);

  return {
    count: values.length,
    min: round(min, digits),
    max: round(max, digits),
    avg: round(avg, digits),
    stddev: round(Math.sqrt(variance), digits),
    p10: round(quantile(sorted, 0.1), digits),
    p50: round(quantile(sorted, 0.5), digits),
    p90: round(quantile(sorted, 0.9), digits),
    trend: trendOf(points, { digits }),
  };
}

// Tendencia por mínimos cuadrados sobre el tiempo, en unidades por hora.
// Se declara "estable" cuando el cambio total es menor que el 10 % del rango.
export function trendOf(points, { digits = 3 } = {}) {
  const usable = (points || [])
    .map((point) => ({ t: new Date(point.at).getTime(), v: Number(point.value) }))
    .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.v))
    .sort((a, b) => a.t - b.t);
  if (usable.length < 3) {
    return { direction: 'insuficiente', slopePerHour: null, totalChange: null, points: usable.length };
  }
  const origin = usable[0].t;
  const xs = usable.map((point) => (point.t - origin) / 3600000);
  const ys = usable.map((point) => point.v);
  const meanX = xs.reduce((total, value) => total + value, 0) / xs.length;
  const meanY = ys.reduce((total, value) => total + value, 0) / ys.length;
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < xs.length; i++) {
    numerator += (xs[i] - meanX) * (ys[i] - meanY);
    denominator += (xs[i] - meanX) ** 2;
  }
  if (denominator === 0) return { direction: 'insuficiente', slopePerHour: null, totalChange: null, points: usable.length };
  const slopePerHour = numerator / denominator;
  const totalChange = slopePerHour * xs.at(-1);
  const span = Math.max(...ys) - Math.min(...ys);
  // Serie plana (sin rango) o cambio total menor que el 10 % del rango: estable.
  const direction = span === 0 || Math.abs(totalChange) <= span * 0.1
    ? 'estable' : totalChange > 0 ? 'sube' : 'baja';
  return { direction, slopePerHour: round(slopePerHour, digits), totalChange: round(totalChange, digits), points: usable.length };
}

// Cobertura: datos recibidos frente a los esperados por el intervalo configurado.
export function coverageReport({ received, valid, invalid, intervalSeconds, from, to }) {
  const spanSeconds = Math.max(0, (new Date(to).getTime() - new Date(from).getTime()) / 1000);
  const interval = Number(intervalSeconds) || 0;
  const expected = interval ? Math.max(1, Math.floor(spanSeconds / interval)) : null;
  return {
    received: Number(received) || 0,
    valid: Number(valid) || 0,
    invalid: Number(invalid) || 0,
    intervalSeconds: interval || null,
    expected,
    missing: expected == null ? null : Math.max(0, expected - Number(received || 0)),
    receivedPct: expected ? round(Math.min(100, (Number(received || 0) / expected) * 100), 1) : null,
    validPct: expected ? round(Math.min(100, (Number(valid || 0) / expected) * 100), 1) : null,
  };
}

// ---- Consulta completa -----------------------------------------------------
// from/to son ISO. Solo datos validados y no borrados.
export async function statisticsFor(deviceId, { from, to }) {
  const [configRow] = await sql`SELECT config FROM device_configs WHERE device_id = ${deviceId}`;
  const config = configRow?.config ?? {};

  const rows = await sql`SELECT observed_at, temperature_c, humidity_pct, pressure_pa, battery_mv, lux
    FROM measurements
    WHERE device_id = ${deviceId} AND is_validated AND deleted_at IS NULL
      AND observed_at >= ${from} AND observed_at < ${to}
    ORDER BY observed_at ASC`;

  const [counts] = await sql`SELECT count(*)::integer AS received,
      count(*) FILTER (WHERE is_validated)::integer AS valid,
      count(*) FILTER (WHERE NOT is_validated)::integer AS invalid
    FROM measurements
    WHERE device_id = ${deviceId} AND deleted_at IS NULL
      AND observed_at >= ${from} AND observed_at < ${to}`;

  const [alertCounts] = await sql`SELECT count(*)::integer AS total,
      count(*) FILTER (WHERE closed_at IS NULL)::integer AS open,
      count(*) FILTER (WHERE auto_resolved)::integer AS auto_resolved
    FROM alerts WHERE device_id = ${deviceId} AND created_at >= ${from} AND created_at < ${to}`;

  const metrics = {};
  for (const metric of STAT_METRICS) {
    const points = rows
      .filter((row) => row[metric.column] != null)
      .map((row) => ({ at: row.observedAt, value: row[metric.column] }));
    const described = describeSeries(points, { digits: metric.digits });
    metrics[metric.key] = { ...described, unit: metric.unit, label: metric.label };
  }

  // Serie por horas para la gráfica.
  const bucketHours = Math.max(1, Math.round((new Date(to) - new Date(from)) / 3600000 / 48));
  const buckets = new Map();
  for (const row of rows) {
    const key = new Date(Math.floor(new Date(row.observedAt).getTime() / bucketHours / 3600000) * bucketHours * 3600000);
    const id = key.toISOString();
    const bucket = buckets.get(id) ?? { at: id, count: 0, temperature: [], humidity: [] };
    bucket.count += 1;
    if (row.temperatureC != null) bucket.temperature.push(Number(row.temperatureC));
    if (row.humidityPct != null) bucket.humidity.push(Number(row.humidityPct));
    buckets.set(id, bucket);
  }
  const series = [...buckets.values()].map((bucket) => ({
    at: bucket.at,
    count: bucket.count,
    temperatureAvg: bucket.temperature.length
      ? round(bucket.temperature.reduce((total, value) => total + value, 0) / bucket.temperature.length, 1) : null,
    humidityAvg: bucket.humidity.length
      ? round(bucket.humidity.reduce((total, value) => total + value, 0) / bucket.humidity.length, 1) : null,
  }));

  const hours = Math.max(1, Math.round((new Date(to) - new Date(from)) / 3600000));
  return {
    deviceId,
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    hours,
    bucketHours,
    samples: rows.length,
    coverage: coverageReport({
      received: counts.received, valid: counts.valid, invalid: counts.invalid,
      intervalSeconds: config.interval_normal_s, from, to,
    }),
    metrics,
    series,
    alerts: { total: alertCounts.total, open: alertCounts.open, autoResolved: alertCounts.auto_resolved },
    // Lo que un informe automatico podría afirmar, y lo que no.
    limits: [
      'Solo se usan mediciones validadas y no borradas.',
      'La tendencia es una pendiente por hora; no implica causalidad.',
      'Estos sensores no miden lluvia, viento ni estado del cultivo: no se deducen de ellos.',
    ],
  };
}