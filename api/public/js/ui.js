// Utilidades compartidas del panel: API, formato, insignias y gráficas.
export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export const escapeText = (value) => String(value ?? '—').replace(/[&<>"']/g, (char) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export const dateText = (value) => (value ? new Date(value).toLocaleString('es-ES') : '—');
export const dayText = (value) => (value ? new Date(value).toLocaleDateString('es-ES') : '—');
export const numberText = (value, digits = 1) =>
  value == null ? '—' : Number(value).toLocaleString('es-ES', { maximumFractionDigits: digits });
export const pressureMbar = (value) => (value == null ? null : Number(value) / 100);
export const pressureText = (value, digits = 1) => numberText(pressureMbar(value), digits);

export const session = { me: null };
let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) { onUnauthorized = fn; }

export async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: {
      'X-Requested-With': 'fetch',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  if (response.status === 401) onUnauthorized();
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const detail = Array.isArray(body.details) && body.details.length
      ? `: ${body.details.map((issue) => issue.message).join(', ')}`
      : '';
    throw new Error((body.error || `HTTP ${response.status}`) + detail);
  }
  return response.status === 204 ? null : response.json();
}

// Permisos de interfaz según el rol de la sesión.
export const canEdit = () => ['admin', 'operator'].includes(session.me?.role);
export const isAdmin = () => session.me?.role === 'admin';

export const METRIC_ICONS = { Temperatura: '🌡️', Humedad: '💧', Presión: '🌬️', Batería: '🔋', Lux: '☀️', Iluminancia: '☀️' };

export function metric(label, value, unit = '') {
  const icon = METRIC_ICONS[label] || '';
  return `<div class="metric"><span>${icon ? `<span class="metric-icon" aria-hidden="true">${icon}</span> ` : ''}${label}</span><strong>${value}</strong> <small>${unit}</small></div>`;
}

export function fieldError(root, message) {
  const target = $('[data-error]', root) || document.body;
  target.textContent = message || '';
}

// ---- Insignias -------------------------------------------------------------
const VFLAG_LABELS = [
  [1, 'temperatura fuera de rango'],
  [2, 'humedad fuera de rango'],
  [4, 'presión fuera de rango'],
  [8, 'batería fuera de rango'],
  [16, 'lux fuera de rango'],
  [32, 'revisión manual'],
  [64, 'hora sin referencia'],
  [128, 'equipo marcó el dato como no válido'],
];

export function flagText(row) {
  const labels = VFLAG_LABELS.filter(([bit]) => (row.validationFlags ?? 0) & bit).map(([, label]) => label);
  if (row.invalidatedReason) labels.push(row.invalidatedReason);
  return labels.join(' · ') || 'dato sin validar';
}

export function validationBadge(row) {
  if (row.deletedAt) return `<span class="badge badge-deleted" title="${escapeText(row.invalidatedReason || 'borrada manualmente')}">Borrada</span>`;
  if (row.isValidated) return `<span class="badge badge-valid">Validada</span>`;
  return `<span class="badge badge-invalid" title="${escapeText(flagText(row))}">Inválida</span>`;
}

const CONNECTIVITY = {
  online: ['Conectada', 'badge-valid'],
  degraded: ['Intermitente', 'badge-warn'],
  offline: ['Sin conexión', 'badge-invalid'],
  unknown: ['Sin datos', 'badge-muted'],
};

export function connectivityBadge(connectivity) {
  const [label, css] = CONNECTIVITY[connectivity] || CONNECTIVITY.unknown;
  return `<span class="badge ${css}">${label}</span>`;
}

const BATTERY = { ok: 'Correcta', low: 'Baja', critical: 'Crítica', unknown: 'Sin dato' };
export const batteryLabel = (level) => BATTERY[level] || 'Sin dato';

export const roleLabel = (role) => ({ admin: 'Administrador', operator: 'Operador', viewer: 'Observador' }[role] || role);
export const planLabel = (plan) => ({ free: 'Gratis', pro: 'Pro', enterprise: 'Empresa' }[plan] || plan);
export const locationLabel = (type) => ({ urbano: 'Urbano', finca: 'Finca', otro: 'Otro' }[type] || type || '—');

export const METRIC_LABELS = { temperature: 'Temperatura', humidity: 'Humedad', pressure: 'Presión', battery: 'Batería', lux: 'Lux' };
export const COMPARATOR_LABELS = { gt: '>', gte: '≥', lt: '<', lte: '≤' };
export const CHANNEL_LABELS = { email: 'Correo', sms: 'SMS', webhook: 'Webhook', push: 'Push', in_app: 'En pantalla' };
export const ALERT_LEVELS = { 1: 'Prioritario', 2: 'Aviso' };

// ---- Gráficas (solo mediciones validadas: el filtro lo hace el servidor) ---
export function sampleChartRows(rows, key, limit = 300) {
  const points = rows.filter((row) => row[key] != null);
  if (points.length <= limit) return points;

  const bucketCount = Math.max(1, Math.floor((limit - 2) / 2));
  const interiorCount = points.length - 2;
  const sampled = [points[0]];
  for (let bucket = 0; bucket < bucketCount; bucket++) {
    const start = 1 + Math.floor((bucket * interiorCount) / bucketCount);
    const end = 1 + Math.floor(((bucket + 1) * interiorCount) / bucketCount);
    let minIndex = start;
    let maxIndex = start;
    for (let index = start + 1; index < end; index++) {
      if (Number(points[index][key]) < Number(points[minIndex][key])) minIndex = index;
      if (Number(points[index][key]) > Number(points[maxIndex][key])) maxIndex = index;
    }
    for (const index of [...new Set([minIndex, maxIndex])].sort((a, b) => a - b)) {
      sampled.push(points[index]);
    }
  }
  sampled.push(points.at(-1));
  return sampled;
}

const TREND_METRICS = {
  temperatureC: { icon: '🌡️', up: 'calentamiento', down: 'enfriamiento', unit: '°C' },
  humidityPct: { icon: '💧', up: 'aumenta la humedad relativa', down: 'disminuye la humedad relativa', unit: '%' },
  pressurePa: { icon: '🌬️', up: 'presión atmosférica al alza', down: 'presión atmosférica a la baja', unit: 'mbar' },
  pressureMbar: { icon: '🌬️', up: 'presión atmosférica al alza', down: 'presión atmosférica a la baja', unit: 'mbar' },
};

export function chartTrend(rows, key) {
  const points = (rows || []).map((row) => ({
    time: new Date(row.observedAt).getTime(), value: Number(row[key]),
  })).filter((point) => Number.isFinite(point.time) && Number.isFinite(point.value))
    .sort((a, b) => a.time - b.time);
  if (points.length < 3) return { direction: 'insuficiente', change: null };
  const origin = points[0].time;
  const xs = points.map((point) => (point.time - origin) / 3600000);
  const ys = points.map((point) => point.value);
  const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / ys.length;
  let numerator = 0, denominator = 0;
  for (let i = 0; i < points.length; i++) {
    numerator += (xs[i] - meanX) * (ys[i] - meanY);
    denominator += (xs[i] - meanX) ** 2;
  }
  if (!denominator) return { direction: 'insuficiente', change: null };
  const change = (numerator / denominator) * (xs.at(-1) - xs[0]);
  const range = Math.max(...ys) - Math.min(...ys);
  const direction = range === 0 || Math.abs(change) <= range * 0.1
    ? 'estable' : change > 0 ? 'sube' : 'baja';
  return { direction, change };
}

// Serie corta para las tendencias: el día local en curso; si aún no hay muestras
// suficientes, cae a las últimas 3 horas y, en último caso, a las últimas 5 lecturas.
export function trendWindowRows(rows, now = new Date()) {
  const points = (rows || []).filter((row) => row && row.observedAt);
  if (points.length < 3) return points;
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const dayStart = startOfDay.getTime();
  const today = points.filter((row) => new Date(row.observedAt).getTime() >= dayStart);
  if (today.length >= 3) return today;
  const recentStart = now.getTime() - 3 * 3600000;
  const recent = points.filter((row) => new Date(row.observedAt).getTime() >= recentStart);
  return recent.length >= 3 ? recent : points.slice(-5);
}

// Ventana corta del día local, normalizada a la hora de `now` (para gráficos).
export const TREND_WINDOW_LABEL = 'tendencia del día en curso';

const CHART_SCALE = {
  temperatureC: { minimumSpan: 10, step: 5 },
  humidityPct: { minimumSpan: 20, step: 10 },
  pressurePa: { minimumSpan: 5000, step: 1000 },
  pressureMbar: { minimumSpan: 50, step: 10 },
  batteryMv: { minimumSpan: 500, step: 250 },
};

let chartInstance = 0;

export function chartYDomain(key, min, max) {
  const scale = CHART_SCALE[key] || { minimumSpan: 0, step: 1 };
  const center = (min + max) / 2;
  const span = Math.max(max - min, scale.minimumSpan);
  const step = scale.step;
  return {
    low: Math.floor((center - span / 2) / step) * step,
    high: Math.ceil((center + span / 2) / step) * step,
  };
}

export function chartGapThreshold(rows) {
  const times = (rows || []).map((row) => new Date(row.observedAt).getTime())
    .filter(Number.isFinite).sort((a, b) => a - b);
  const intervals = times.slice(1).map((time, index) => time - times[index]).filter((gap) => gap > 0).sort((a, b) => a - b);
  if (!intervals.length) return Infinity;
  // Lower quartile resists a majority of missed readings inflating the normal cadence.
  const typicalInterval = intervals[Math.floor((intervals.length - 1) * 0.25)];
  return typicalInterval * 2.5;
}

function chartTrendBadge(rows, key, digits) {
  const metric = TREND_METRICS[key];
  if (!metric) return '';
  const { direction, change } = chartTrend(trendWindowRows(rows), key);
  const icon = direction === 'sube' ? '↑' : direction === 'baja' ? '↓' : direction === 'estable' ? '→' : '·';
  const explanation = direction === 'sube' ? metric.up
    : direction === 'baja' ? metric.down
      : direction === 'estable' ? 'variación pequeña durante el día'
        : 'se necesitan al menos 3 muestras del día en curso';
  const amount = change == null ? '' : ` · ${numberText(Math.abs(change), digits)} ${metric.unit} en el día`;
  const accessible = `${direction}: ${explanation}${amount}`;
  return `<div class="chart-trend-wrap"><span class="chart-trend trend-${direction}" title="${escapeText(accessible)}" aria-label="Tendencia ${escapeText(accessible)}"><strong aria-hidden="true">${icon}</strong> ${escapeText(direction === 'insuficiente' ? 'Sin tendencia' : direction)}</span><small class="chart-trend-note">${escapeText(explanation)}${amount ? escapeText(amount) : ''}</small></div>`;
}

export function makeChart(title, rows, key, color, unit, digits = 1, exactStats = null, detail = null, trendRows = null) {
  const allPoints = rows.filter((row) => row[key] != null);
  const points = sampleChartRows(rows, key);
  const icon = TREND_METRICS[key]?.icon || '📈';
  const detailAttrs = detail
    ? ` data-detail-key="${escapeText(detail.key)}" data-detail-metric="${escapeText(detail.metric || key)}" data-detail-source="${escapeText(detail.source || 'local')}" role="button" tabindex="0" aria-label="Ampliar ${escapeText(title)}"`
    : '';
  if (!allPoints.length) return `<div class="chart-box tecrural-chart-card chart-empty"${detailAttrs}><div class="chart-title"><span class="chart-icon" aria-hidden="true">${icon}</span><div><h3>${escapeText(title)}</h3><small>MICROESTACIÓN</small></div></div><p class="empty">No hay mediciones validadas en este periodo.</p></div>`;
  const width = 560, height = 200, left = 58, right = 14, top = 16, bottom = 34;
  const values = allPoints.map((row) => Number(row[key]));
  const min = exactStats?.min ?? Math.min(...values);
  const max = exactStats?.max ?? Math.max(...values);
  const average = exactStats?.avg ?? values.reduce((a, b) => a + b, 0) / values.length;
  const { low, high } = chartYDomain(key, min, max);
  const timestamps = allPoints.map((row) => new Date(row.observedAt).getTime()).filter(Number.isFinite).sort((a, b) => a - b);
  const firstTime = timestamps[0] ?? 0, lastTime = timestamps.at(-1) ?? firstTime;
  const gapThreshold = chartGapThreshold(allPoints);
  const xAt = (row) => left + ((lastTime === firstTime ? 0.5 : (new Date(row.observedAt).getTime() - firstTime) / (lastTime - firstTime))) * (width - left - right);
  const yAt = (row) => height - bottom - ((Number(row[key]) - low) / (high - low)) * (height - top - bottom);
  const coords = points.map((row) => ({ x: xAt(row), y: yAt(row), row }));
  const orderedPoints = [...allPoints].sort((a, b) => new Date(a.observedAt) - new Date(b.observedAt));
  const first = dateText(orderedPoints[0].observedAt);
  const last = dateText(orderedPoints.at(-1).observedAt);
  const ticks = [0, 1, 2].map((i) => {
    const fraction = i / 2;
    const y = top + fraction * (height - top - bottom);
    const value = high - fraction * (high - low);
    return `<line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" class="chart-gridline"/><text x="${left - 8}" y="${y + 4}" class="chart-axis-label" text-anchor="end">${numberText(value, digits)}</text>`;
  }).join('');
  const dateSpan = lastTime - firstTime;
  const timeLabels = [0, 1, 2, 3].map((i) => {
    const time = firstTime + dateSpan * i / 3;
    const date = new Date(time);
    const text = dateSpan > 36 * 60 * 60 * 1000
      ? new Intl.DateTimeFormat('es', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date)
      : new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' }).format(date);
    return `<text x="${left + (width - left - right) * i / 3}" y="${height - 7}" class="chart-axis-label" text-anchor="${i === 0 ? 'start' : i === 3 ? 'end' : 'middle'}">${escapeText(text)}</text>`;
  }).join('');
  const segments = [];
  let segment = [];
  coords.forEach((point, index) => {
    if (index && new Date(point.row.observedAt) - new Date(points[index - 1].observedAt) > gapThreshold) {
      if (segment.length) segments.push(segment);
      segment = [];
    }
    segment.push(point);
  });
  if (segment.length) segments.push(segment);
  chartInstance += 1;
  const gradientId = `chart-gradient-${chartInstance}`;
  const glowId = `chart-glow-${chartInstance}`;
  const areaPaths = segments.filter((part) => part.length > 1).map((part) => {
    const firstPoint = part[0];
    const lastPoint = part.at(-1);
    const area = `M${firstPoint.x.toFixed(1)},${height - bottom} L${part.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L')} L${lastPoint.x.toFixed(1)},${height - bottom} Z`;
    return `<path class="chart-area" d="${area}" fill="url(#${gradientId})"/>`;
  }).join('');
  const paths = segments.map((part) => `<polyline class="chart-line" fill="none" stroke="${color}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" pathLength="1" filter="url(#${glowId})" points="${part.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}"/>`).join('');
  const lastCoord = coords.at(-1);
  const pulse = lastCoord
    ? `<circle class="chart-pulse" cx="${lastCoord.x.toFixed(1)}" cy="${lastCoord.y.toFixed(1)}" r="5" fill="${color}" pointer-events="none"/>`
    : '';
  const pointTargets = coords.map(({ x, y, row }, pointIndex) => {
    const label = `${dateText(row.observedAt)}: ${numberText(row[key], digits)} ${unit}`;
    const tabIndex = coords.length <= 40 || pointIndex === 0 || pointIndex === coords.length - 1 ? 0 : -1;
    return `<circle cx="${x}" cy="${y}" r="9" fill="transparent" class="chart-hit" tabindex="${tabIndex}" role="img" aria-label="${escapeText(label)}" data-chart-tip="${escapeText(label)}" data-chart-x="${x}" data-chart-y="${y}"/><circle cx="${x}" cy="${y}" r="2.4" fill="${color}" pointer-events="none"/>`;
  }).join('');
  const latestValue = numberText(orderedPoints.at(-1)[key], digits);
  return `<div class="chart-box tecrural-chart-card"${detailAttrs}><div class="chart-heading"><div class="chart-title"><span class="chart-icon" aria-hidden="true">${icon}</span><div><h3>${escapeText(title)}</h3><small>MICROESTACIÓN · MEDICIONES VALIDADAS</small></div></div><div class="chart-current"><strong>${latestValue}</strong><small>${escapeText(unit)}</small></div></div><div class="chart-trend-strip">${chartTrendBadge(trendRows && trendRows.length ? trendRows : allPoints, key, digits)}</div><div class="chart-wrap"><svg class="chart" viewBox="0 0 ${width} ${height}" role="group" aria-label="${escapeText(title)} desde ${escapeText(first)} hasta ${escapeText(last)}"><defs><linearGradient id="${gradientId}" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="${color}" stop-opacity=".42"/><stop offset="100%" stop-color="${color}" stop-opacity=".02"/></linearGradient><filter id="${glowId}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.6" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>${ticks}${areaPaths}${paths}${pulse}${timeLabels}${pointTargets}</svg><div class="chart-tooltip" role="status" aria-live="polite" hidden></div></div><div class="chart-dates"><span>${escapeText(first)}</span><span>${escapeText(last)}</span></div><div class="summary"><span>Mín. ${numberText(min, digits)} ${escapeText(unit)}</span><span>Máx. ${numberText(max, digits)} ${escapeText(unit)}</span><span>Prom. ${numberText(average, digits)} ${escapeText(unit)}</span></div></div>`;
}

if (typeof document !== 'undefined') {
  const showChartTip = (target) => {
    const wrap = target.closest('.chart-wrap');
    if (!wrap) return;
    const tip = wrap.querySelector('.chart-tooltip');
    tip.textContent = target.dataset.chartTip;
    tip.hidden = false;
    tip.style.left = `${Math.max(0, Math.min(88, Number(target.dataset.chartX) / 560 * 100))}%`;
    tip.style.top = `${Math.max(0, Math.min(75, Number(target.dataset.chartY) / 200 * 100))}%`;
  };
  document.addEventListener('pointerover', (event) => {
    const target = event.target.closest?.('.chart-hit');
    if (target) showChartTip(target);
  });
  document.addEventListener('focusin', (event) => {
    const target = event.target.closest?.('.chart-hit');
    if (target) showChartTip(target);
  });
  document.addEventListener('pointerdown', (event) => {
    const target = event.target.closest?.('.chart-hit');
    if (target) showChartTip(target);
  });
  document.addEventListener('pointerout', (event) => {
    const target = event.target.closest?.('.chart-hit');
    if (target && event.pointerType !== 'touch' && !target.matches(':focus')) {
      const tip = target.closest('.chart-wrap')?.querySelector('.chart-tooltip');
      if (tip) tip.hidden = true;
    }
  });
}

export const chartSection = (history, summary = {}, options = {}) => {
  const pressureHistory = history.map((row) => ({ ...row, pressureMbar: pressureMbar(row.pressurePa) }));
  const pressureSummary = Object.fromEntries(['min', 'max', 'avg'].map((key) => [key, pressureMbar(summary[`pressure_${key}`])]));
  const detail = options.detailKey ? { key: options.detailKey } : null;
  const trendFor = (key) => (options.trendHistory
    ? options.trendHistory.map((row) => (key === 'pressureMbar' ? { ...row, pressureMbar: pressureMbar(row.pressurePa) } : row))
    : null);
  const card = (title, rows, key, color, unit, digits, stats = null) =>
    makeChart(title, rows, key, color, unit, digits, stats, detail ? { ...detail, metric: key } : null, trendFor(key));
  const lux = options.sensors?.lux === true && history.some((row) => row.lux != null)
    ? card('Iluminancia', history, 'lux', '#d99a1f', 'lux', 0)
    : '';
  return `<div class="chart-grid">${card('Temperatura', history, 'temperatureC', '#c97742', '°C', 1, { min: summary.temp_min, max: summary.temp_max, avg: summary.temp_avg })}${card('Humedad', history, 'humidityPct', '#168b80', '%', 1, { min: summary.humidity_min, max: summary.humidity_max, avg: summary.humidity_avg })}${card('Presión', pressureHistory, 'pressureMbar', '#079ab1', 'mbar', 1, pressureSummary)}${card('Batería', history, 'batteryMv', '#217a4b', 'mV', 0, { min: summary.battery_min, max: summary.battery_max, avg: summary.battery_avg })}${lux}</div><p class="chart-trend-help">Evolución de mediciones validadas de la microestación. Las flechas resumen el día en curso. Toca un gráfico o una tarjeta para ampliar.</p>`;
};

// ---- Diálogo de detalle ----------------------------------------------------
export function openDialog(title, bodyHtml, actionsHtml = '') {
  const dialog = $('#detail-dialog');
  dialog.innerHTML = `<div class="dialog-head"><h3 id="detail-dialog-title">${escapeText(title)}</h3><button type="button" class="quiet" data-dialog-close>Cerrar</button></div>
    <div class="dialog-body">${bodyHtml}</div>${actionsHtml ? `<div class="dialog-actions">${actionsHtml}</div>` : ''}`;
  dialog.querySelector('[data-dialog-close]').addEventListener('click', () => dialog.close());
  dialog.showModal();
}

export function closeDialog() { $('#detail-dialog').close(); }

// Rangos de fechas locales de la tabla.
export const localIsoDate = (value) =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;

export function periodRange(kind, isoDate) {
  const from = isoDate ? new Date(`${isoDate}T00:00:00`) : new Date();
  let to;
  if (kind === 'day') {
    to = new Date(from); to.setDate(to.getDate() + 1);
  } else if (kind === 'week') {
    from.setDate(from.getDate() - ((from.getDay() + 6) % 7));
    to = new Date(from); to.setDate(to.getDate() + 7);
  } else if (kind === 'month') {
    from.setDate(1);
    to = new Date(from); to.setMonth(to.getMonth() + 1);
  } else {
    from.setMonth(0, 1);
    to = new Date(from); to.setFullYear(to.getFullYear() + 1);
  }
  from.setHours(0, 0, 0, 0);
  return { from, to };
}
