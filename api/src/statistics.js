// Informes estadísticos sobre datos ya validados.
// Nada de inferirVariables que los sensores no miden (lluvia, viento,
// enfermedades): aquí solo hay cálculo sobre temperatura, humedad, presión,
// batería e illuminancia, con el periodo y la estación siempre citados.

import { sql } from './db.js';
import { NON_COMMUNICATION_ALERT } from './alert-visibility.js';
import { aemetPairWindowMs } from './weather.js';
import { AUTOMATIC_VALIDATION_LIMITS } from './validation.js';

// La clave es la columna en la base de datos; `column` es como la devuelve el
// cliente (camelCase) y `key` es como se expone en el informe.
export const STAT_METRICS = [
  { key: 'temperature_c', column: 'temperatureC', label: 'Temperatura', unit: '°C', digits: 1 },
  { key: 'humidity_pct', column: 'humidityPct', label: 'Humedad', unit: '%', digits: 1 },
  { key: 'pressure_pa', column: 'pressurePa', label: 'Presión', unit: 'Pa', digits: 0 },
  { key: 'battery_mv', column: 'batteryMv', label: 'Batería', unit: 'mV', digits: 0 },
  { key: 'lux', column: 'lux', label: 'Iluminancia', unit: 'lux', digits: 0 },
];

const DIXON_Q_95 = {
  3: 0.970, 4: 0.829, 5: 0.710, 6: 0.625, 7: 0.568, 8: 0.526, 9: 0.493, 10: 0.466,
  11: 0.444, 12: 0.426, 13: 0.410, 14: 0.396, 15: 0.384, 16: 0.374, 17: 0.365,
  18: 0.356, 19: 0.349, 20: 0.342, 21: 0.337, 22: 0.331, 23: 0.326, 24: 0.321,
  25: 0.317, 26: 0.312, 27: 0.308, 28: 0.305, 29: 0.301, 30: 0.299,
};

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
    .filter((point) => point.value != null && point.value !== '')
    .map((point) => ({ t: new Date(point.at).getTime(), v: Number(point.value) }))
    .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.v))
    .sort((a, b) => a.t - b.t);
  if (!usable.length) {
    return { count: 0, min: null, max: null, avg: null, stddev: null, p10: null, p50: null, p90: null, minAt: null, maxAt: null, trend: null };
  }
  const values = usable.map((point) => point.v);
  const sum = values.reduce((total, value) => total + value, 0);
  const avg = sum / values.length;
  const variance = values.reduce((total, value) => total + (value - avg) ** 2, 0) / values.length;
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted.at(-1);
  // Hora de la mínima y la máxima: "cuándo", no solo "cuánto".
  let minPoint = usable[0];
  let maxPoint = usable[0];
  for (const point of usable) {
    if (point.v < minPoint.v) minPoint = point;
    if (point.v > maxPoint.v) maxPoint = point;
  }

  return {
    count: values.length,
    min: round(min, digits),
    max: round(max, digits),
    avg: round(avg, digits),
    stddev: round(Math.sqrt(variance), digits),
    p10: round(quantile(sorted, 0.1), digits),
    p50: round(quantile(sorted, 0.5), digits),
    p90: round(quantile(sorted, 0.9), digits),
    minAt: new Date(minPoint.t).toISOString(),
    maxAt: new Date(maxPoint.t).toISOString(),
    trend: trendOf(points, { digits }),
  };
}

// ---- Punto de rocío (indicador CALCULADO) ----------------------------------
// No hay sensor de punto de rocío: se estima con la fórmula de Magnus a partir
// de temperatura y humedad relativa del mismo registro. Se etiqueta como
// calculado y se declaran sus límites para no confundirlo con una medida.
export const DEW_POINT_METHOD = 'Fórmula de Magnus (a = 17,62; b = 243,12 °C) sobre temperatura y humedad relativa medidas en el mismo instante.';
export const DEW_POINT_LIMITATIONS = [
  'Es un valor calculado, no una lectura directa de ningún sensor.',
  'Necesita temperatura y humedad del mismo registro; si falta una, no se calcula.',
  'Pierde precisión en humedades muy altas (cerca de saturación) y en cambios bruscos.',
];

export function dewPointCelsius(temperatureC, humidityPct) {
  if (temperatureC == null || temperatureC === '' || humidityPct == null || humidityPct === '') return null;
  const temperature = Number(temperatureC);
  const humidity = Number(humidityPct);
  if (!Number.isFinite(temperature) || !Number.isFinite(humidity) || humidity <= 0 || humidity > 100) return null;
  const a = 17.62;
  const b = 243.12;
  const gamma = (a * temperature) / (b + temperature) + Math.log(humidity / 100);
  const dew = (b * gamma) / (a - gamma);
  return Number.isFinite(dew) ? round(dew, 1) : null;
}

// ---- Resúmenes diarios -----------------------------------------------------
const MADRID_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
});
export const madridDate = (value) => (value ? MADRID_DATE.format(new Date(value)) : null);

// Agrupa una serie por día natural de Madrid y resume cada día. Sin datos de un
// día, ese día no aparece: la ausencia es un hueco, no un valor.
export function dailySummaries(points, { digits = 1 } = {}) {
  const days = new Map();
  for (const point of points || []) {
    if (point.value == null || point.value === '') continue;
    const time = new Date(point.at).getTime();
    const value = Number(point.value);
    if (!Number.isFinite(time) || !Number.isFinite(value)) continue;
    const key = madridDate(point.at);
    const day = days.get(key) ?? { date: key, values: [], minAt: null, maxAt: null, min: null, max: null };
    day.values.push(value);
    if (day.min == null || value < day.min) { day.min = value; day.minAt = new Date(time).toISOString(); }
    if (day.max == null || value > day.max) { day.max = value; day.maxAt = new Date(time).toISOString(); }
    days.set(key, day);
  }
  return [...days.values()].map((day) => ({
    date: day.date,
    count: day.values.length,
    min: round(day.min, digits),
    max: round(day.max, digits),
    avg: round(day.values.reduce((total, value) => total + value, 0) / day.values.length, digits),
    minAt: day.minAt,
    maxAt: day.maxAt,
  })).sort((a, b) => a.date.localeCompare(b.date));
}

// ---- Comparación temporal con AEMET ---------------------------------------
// Empareja cada punto local con la observación AEMET más cercana dentro de la
// ventana. Diferencia = microestación − AEMET. No empareja si excede la ventana.
export function pairTemperatureSeries(localPoints, externalPoints, windowMs) {
  const external = (externalPoints || [])
    .filter((point) => point.temperatureC != null && point.temperatureC !== '' && point.observedAt
      && Number.isFinite(Number(point.temperatureC)))
    .map((point) => ({ t: new Date(point.observedAt).getTime(), value: Number(point.temperatureC) }))
    .filter((point) => Number.isFinite(point.t));
  const window = Number(windowMs) || 0;
  const pairs = [];
  for (const local of localPoints || []) {
    if (local.value == null || local.value === '') continue;
    const time = new Date(local.at).getTime();
    const value = Number(local.value);
    if (!Number.isFinite(time) || !Number.isFinite(value)) continue;
    let best = null;
    let bestGap = Infinity;
    for (const candidate of external) {
      const gap = Math.abs(candidate.t - time);
      if (gap < bestGap) { bestGap = gap; best = candidate; }
    }
    if (!best || bestGap > window) continue;
    pairs.push({
      at: local.at,
      local: round(value, 1),
      aemet: round(best.value, 1),
      differenceC: round(value - best.value, 1),
      offsetSeconds: Math.round((time - best.t) / 1000),
    });
  }
  const differences = pairs.map((pair) => pair.differenceC);
  return {
    matched: pairs.length,
    windowMinutes: Math.max(1, Math.round(window / 60000)),
    differenceDefinition: 'temperatura_microestacion_menos_AEMET',
    differences: differences.length ? {
      min: Math.min(...differences),
      max: Math.max(...differences),
      avg: round(differences.reduce((total, value) => total + value, 0) / differences.length, 2),
    } : null,
    pairs: pairs.slice(-200),
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

// Muestras esperadas en un tramo según un intervalo fijo. Null si no hay intervalo.
export function expectedSamples({ from, to, intervalSeconds }) {
  const interval = Number(intervalSeconds) || 0;
  if (!interval) return null;
  const spanSeconds = Math.max(0, (new Date(to).getTime() - new Date(from).getTime()) / 1000);
  return Math.max(1, Math.floor(spanSeconds / interval));
}

// Esperadas sumando tramos de intervalo efectivo (la cadencia puede cambiar en
// el tiempo: un cambio de configuración no debe distorsionar el denominador).
export function expectedFromSegments(segments = []) {
  if (!segments.length) return null;
  let total = 0;
  let usable = false;
  for (const segment of segments) {
    const expected = expectedSamples(segment);
    if (expected == null) continue;
    usable = true;
    total += expected;
  }
  return usable ? total : null;
}

// Esperadas dentro de un sub-rango, recortando los tramos que lo cruzan.
export function expectedBetween(segments = [], fromIso, toIso) {
  const lo = new Date(fromIso).getTime();
  const hi = new Date(toIso).getTime();
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return 0;
  let total = 0;
  for (const segment of segments) {
    const interval = Number(segment.intervalSeconds) || 0;
    if (!interval) continue;
    const start = Math.max(lo, new Date(segment.from).getTime());
    const end = Math.min(hi, new Date(segment.to).getTime());
    if (end <= start) continue;
    total += Math.max(0, Math.floor((end - start) / 1000 / interval));
  }
  return total;
}

// Construye tramos de intervalo efectivo desde el historial de configuraciones.
// `versions`: [{ at, intervalSeconds }]. El último tramo abierto usa la
// configuración vigente o el intervalo por defecto.
export function intervalSegments({
  versions = [], currentIntervalSeconds = null, from, to, defaultIntervalSeconds = 360,
} = {}) {
  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) return [];
  const fallback = Number(currentIntervalSeconds) || Number(defaultIntervalSeconds) || 360;
  const points = versions
    .map((version) => ({ at: new Date(version.at).getTime(), interval: Number(version.intervalSeconds) || null }))
    .filter((point) => Number.isFinite(point.at))
    .sort((a, b) => a.at - b.at);
  const intervalAt = (time) => {
    let interval = fallback;
    for (const point of points) {
      if (point.at <= time && point.interval) interval = point.interval;
    }
    return interval;
  };
  const boundaries = [...new Set(points.map((point) => point.at).filter((time) => time > fromMs && time < toMs))];
  const segments = [];
  let cursor = fromMs;
  for (const boundary of boundaries) {
    segments.push({
      from: new Date(cursor).toISOString(), to: new Date(boundary).toISOString(), intervalSeconds: intervalAt(cursor),
    });
    cursor = boundary;
  }
  segments.push({
    from: new Date(cursor).toISOString(), to: new Date(toMs).toISOString(), intervalSeconds: intervalAt(cursor),
  });
  return segments;
}

// Integridad de la secuencia del equipo: separa huecos (el contador salta hacia
// adelante) de reinicios (retrocede), que no son muestras perdidas.
export function sequenceIntegrity(points = []) {
  const ordered = points
    .map((point) => ({ at: point.at, sequence: Number(point.sequence) }))
    .filter((point) => Number.isFinite(point.sequence) && point.at != null)
    .sort((a, b) => new Date(a.at) - new Date(b.at));
  const gaps = [];
  const resets = [];
  for (let i = 1; i < ordered.length; i += 1) {
    const prev = ordered[i - 1].sequence;
    const current = ordered[i].sequence;
    if (current === prev + 1) continue;
    if (current > prev + 1) gaps.push({ from: prev + 1, to: current - 1, missing: current - prev - 1 });
    else resets.push({ at: ordered[i].at, from: prev, to: current });
  }
  return { total: gaps.reduce((sum, gap) => sum + gap.missing, 0), gaps, resets };
}

// Cobertura: datos recibidos frente a los esperados. `serviceFrom` acota el
// denominador a la vida útil de la estación; `segments` usa las cadencias
// efectivas. `missing` se mantiene como alias de `timeMissing` por compatibilidad.
export function coverageReport({ received, valid, invalid, intervalSeconds, from, to, serviceFrom = from, segments = null }) {
  const expected = segments && segments.length
    ? expectedFromSegments(segments)
    : expectedSamples({ from: serviceFrom, to, intervalSeconds });
  const receivedCount = Number(received) || 0;
  const validCount = Number(valid) || 0;
  const timeMissing = expected == null ? null : Math.max(0, expected - receivedCount);
  const validMissing = expected == null ? null : Math.max(0, expected - validCount);
  return {
    received: receivedCount,
    valid: validCount,
    invalid: Number(invalid) || 0,
    intervalSeconds: Number(intervalSeconds) || null,
    expected,
    missing: timeMissing,
    timeMissing,
    validMissing,
    receivedPct: expected ? round(Math.min(100, (receivedCount / expected) * 100), 1) : null,
    validPct: expected ? round(Math.min(100, (validCount / expected) * 100), 1) : null,
  };
}

// Prueba Q de Dixon bilateral al 95 %, limitada a las 30 medidas más recientes.
// Señala como máximo un extremo (mínimo o máximo); nunca elimina observaciones.
export function dixonQTest(points, { maxSamples = 30 } = {}) {
  const values = (points || []).map((point) => ({
    at: point.at,
    value: Number(point.value),
    time: new Date(point.at).getTime(),
  })).filter((point) => Number.isFinite(point.value) && Number.isFinite(point.time))
    .sort((a, b) => a.time - b.time).slice(-maxSamples)
    .sort((a, b) => a.value - b.value);
  const n = values.length;
  const base = { method: 'Dixon Q', alpha: 0.05, sampleLimit: maxSamples, n, status: 'insufficient_data', q: null, criticalQ: null, suspectedValue: null, suspectedAt: null, side: null };
  if (n < 3 || n > 30) return base;
  const range = values.at(-1).value - values[0].value;
  if (range === 0) return { ...base, status: 'no_variation', criticalQ: DIXON_Q_95[n] };

  const lowQ = (values[1].value - values[0].value) / range;
  const highQ = (values.at(-1).value - values.at(-2).value) / range;
  const side = highQ > lowQ ? 'maximum' : 'minimum';
  const candidate = side === 'maximum' ? values.at(-1) : values[0];
  const q = Math.max(lowQ, highQ);
  const criticalQ = DIXON_Q_95[n];
  const isOutlier = q > criticalQ;
  return {
    ...base,
    status: isOutlier ? 'possible_outlier' : 'no_outlier',
    q: round(q, 3),
    criticalQ,
    side,
    suspectedValue: isOutlier ? candidate.value : null,
    suspectedAt: isOutlier ? new Date(candidate.at).toISOString() : null,
  };
}

// ---- Consulta completa -----------------------------------------------------
// from/to son ISO. Solo datos validados y no borrados.
export async function statisticsFor(deviceId, { from, to, includeCommunicationAlerts = true, includeDixonQ = false }) {
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
    FROM alerts a WHERE device_id = ${deviceId} AND created_at >= ${from} AND created_at < ${to}
      ${includeCommunicationAlerts ? sql`` : sql`AND ${NON_COMMUNICATION_ALERT}`}`;

  const metrics = {};
  for (const metric of STAT_METRICS) {
    const points = rows
      .filter((row) => row[metric.column] != null)
      .map((row) => ({ at: row.observedAt, value: row[metric.column] }));
    const described = describeSeries(points, { digits: metric.digits });
    metrics[metric.key] = {
      ...described,
      ...(includeDixonQ ? { dixonQ: dixonQTest(points) } : {}),
      unit: metric.unit,
      label: metric.label,
    };
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
      'Solo se usan mediciones aceptadas por los controles automáticos y no borradas.',
      'La tendencia es una pendiente por hora; no implica causalidad.',
      'Estos sensores no miden lluvia, viento ni estado del cultivo: no se deducen de ellos.',
      ...AUTOMATIC_VALIDATION_LIMITS,
    ],
  };
}

// ---- Análisis para el panel de demostración --------------------------------
// Reúne, con los datos validados del periodo, todo lo que el panel gratuito
// ampliado necesita: mín/máx/medias con su hora, resúmenes diarios, punto de
// rocío calculado y comparación histórica con AEMET. Solo lectura.
export async function demoAnalysisFor(deviceId, { from, to }) {
  const [configRow] = await sql`SELECT config FROM device_configs WHERE device_id = ${deviceId}`;
  const config = configRow?.config ?? {};
  const rows = await sql`SELECT observed_at, temperature_c, humidity_pct, pressure_pa
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
  const [availability] = await sql`SELECT min(observed_at) AS first, max(observed_at) AS last
    FROM measurements WHERE device_id = ${deviceId} AND is_validated AND deleted_at IS NULL`;
  const aemetRows = await sql`SELECT observed_at, temperature_c, station_id
    FROM aemet_observations
    WHERE device_id = ${deviceId} AND observed_at >= ${from} AND observed_at < ${to}
    ORDER BY observed_at ASC`;

  const pointSeries = (column) => rows
    .filter((row) => row[column] != null)
    .map((row) => ({ at: row.observedAt, value: row[column] }));

  const temperaturePoints = pointSeries('temperatureC');
  const humidityPoints = pointSeries('humidityPct');
  const pressurePoints = pointSeries('pressurePa');
  const metrics = {
    temperature_c: { ...describeSeries(temperaturePoints, { digits: 1 }), label: 'Temperatura', unit: '°C' },
    humidity_pct: { ...describeSeries(humidityPoints, { digits: 1 }), label: 'Humedad', unit: '%' },
    pressure_pa: { ...describeSeries(pressurePoints, { digits: 0 }), label: 'Presión', unit: 'Pa' },
  };

  const dewPoints = rows
    .filter((row) => row.temperatureC != null && row.humidityPct != null)
    .map((row) => ({ at: row.observedAt, value: dewPointCelsius(row.temperatureC, row.humidityPct) }))
    .filter((point) => point.value != null);

  const now = to;
  const hours = Math.max(1, Math.round((new Date(to) - new Date(from)) / 3600000));
  const firstAvailable = availability?.first ? new Date(availability.first) : null;
  const complete = Boolean(firstAvailable && firstAvailable <= new Date(from));
  const availableHours = firstAvailable
    ? Math.max(1, Math.round((now - firstAvailable) / 3600000))
    : 0;

  return {
    deviceId,
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    hours,
    samples: rows.length,
    period: {
      requestedHours: hours,
      availableFrom: firstAvailable?.toISOString() ?? null,
      availableHours,
      complete,
      note: complete
        ? 'El periodo solicitado está cubierto por datos de la estación.'
        : firstAvailable
          ? `Solo hay datos desde ${firstAvailable.toISOString()}; se muestra el periodo disponible (${availableHours} h).`
          : 'No hay mediciones válidas para esta estación en el periodo solicitado.',
    },
    coverage: coverageReport({
      received: counts.received, valid: counts.valid, invalid: counts.invalid,
      intervalSeconds: config.interval_normal_s, from, to,
    }),
    metrics,
    weekly: {
      dailyTemperature: dailySummaries(temperaturePoints),
      dailyHumidity: dailySummaries(humidityPoints),
    },
    dewPoint: {
      calculated: true,
      value: dewPoints.length ? dewPoints.at(-1).value : null,
      min: dewPoints.length ? Math.min(...dewPoints.map((point) => point.value)) : null,
      max: dewPoints.length ? Math.max(...dewPoints.map((point) => point.value)) : null,
      count: dewPoints.length,
      method: DEW_POINT_METHOD,
      limitations: DEW_POINT_LIMITATIONS,
    },
    aemet: {
      provider: 'AEMET',
      stationId: aemetRows.at(-1)?.stationId ?? null,
      observations: aemetRows.length,
      lastObservedAt: aemetRows.at(-1)?.observedAt ?? null,
      comparison: pairTemperatureSeries(temperaturePoints, aemetRows, aemetPairWindowMs()),
    },
    limits: [
      'Solo se usan mediciones aceptadas por los controles automáticos y no borradas.',
      'El punto de rocío y las diferencias con AEMET son cálculos, no medidas directas.',
      'AEMET es una referencia externa; no se mezcla con las series de la microestación.',
      ...AUTOMATIC_VALIDATION_LIMITS,
    ],
  };
}
