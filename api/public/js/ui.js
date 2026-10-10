// Utilidades compartidas del panel: API, formato, insignias y gráficas.
import { icon } from './icons.js';
export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export const escapeText = (value) => String(value ?? '—').replace(/[&<>"']/g, (char) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
// Fecha exacta para el detalle. Sin segundos: el dato llega en lotes y el
// segundo no añade información, pero repetido en cada tarjeta compite con la
// lectura. La frescura («hace 5 min») se muestra con freshText.
//
// Se compone a mano y con ceros, igual que shortDate y stampText: los tres
// formatos de fecha del producto son este (detalle), el corto (ejes y tarjetas
// compactas) y dayText (solo día). «9 oct», «9/10/2026, 22:00:05» y «2026-10-09»
// dejaron de convivir en pantalla.
const two = (n) => String(n).padStart(2, '0');
export const dateText = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return `${two(date.getDate())}/${two(date.getMonth() + 1)}/${date.getFullYear()} ${two(date.getHours())}:${two(date.getMinutes())}`;
};
export const dayText = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return `${two(date.getDate())}/${two(date.getMonth() + 1)}/${date.getFullYear()}`;
};

/**
 * Frescura en palabras para los resúmenes: «hace 5 min».
 *
 * La fecha exacta no desaparece: queda en el atributo title del elemento que
 * llame a esto, y en el detalle ampliable. Pasadas 24 h la antigüedad deja de
 * ser el dato útil y se muestra la fecha corta.
 */
export function freshText(value, now = new Date()) {
  if (!value) return '—';
  const then = new Date(value);
  if (Number.isNaN(then.getTime())) return '—';
  const minutes = Math.round((now.getTime() - then.getTime()) / 60000);
  if (minutes < 2) return 'hace un momento';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return shortDate(value);
}

// Marca de tiempo con frescura y fecha exacta en el title: la resumen se lee
// rápido, la precisa sigue a un hover de distancia.
export function freshness(value, now = new Date()) {
  const exact = dateText(value);
  return `<span title="Actualizado ${escapeText(exact)}">${escapeText(freshText(value, now))}</span>`;
}
export const numberText = (value, digits = 1) =>
  value == null ? '—' : Number(value).toLocaleString('es-ES', { maximumFractionDigits: digits });
export const pressureMbar = (value) => (value == null ? null : Number(value) / 100);
export const pressureText = (value, digits = 1) => numberText(pressureMbar(value), digits);

export const session = { me: null };
let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) { onUnauthorized = fn; }

export async function api(path, options = {}) {
  // `skipUnauthorized`: la comprobación inicial de sesión no debe disparar el
  // manejador global, o un visitante anónimo vería un parpadeo del formulario
  // de acceso antes de que se resuelva la portada pública.
  const { skipUnauthorized, ...fetchOptions } = options;
  const response = await fetch(path, {
    cache: 'no-store',
    credentials: 'same-origin',
    ...fetchOptions,
    headers: {
      'X-Requested-With': 'fetch',
      ...(fetchOptions.body ? { 'Content-Type': 'application/json' } : {}),
      ...fetchOptions.headers,
    },
  }).catch(() => {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('api-unavailable'));
    throw new Error('Sin conexión con el servidor. Inténtalo cuando recuperes la conexión.');
  });
  if (response.status === 401 && !skipUnauthorized) onUnauthorized();
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

// Iconos por métrica, del conjunto común. Sustituyen a los emojis, que cada
// sistema operativo dibujaba con su propio tamaño, color y estilo de trazo.
export const METRIC_ICONS = { Temperatura: 'temperature', Humedad: 'humidity', Presión: 'pressure', Batería: 'battery', Lux: 'lux', Iluminancia: 'lux' };

export function metric(label, value, unit = '') {
  const name = METRIC_ICONS[label] || '';
  return `<div class="metric"><span>${name ? `<span class="metric-icon">${icon(name, { size: 18 })}</span>` : ''}${label}</span><strong>${value}</strong> <small>${unit}</small></div>`;
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
  if (row.isValidated) return `<span class="badge badge-valid" title="Aceptada por los controles automáticos (rango, marcas del equipo y hora). No demuestra calibración, exactitud ni ausencia de influencia del emplazamiento.">Aceptada</span>`;
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

// Estado de verificación física: separa «aceptada por controles automáticos» de
// «verificada frente a una referencia». Sin registro, no se afirma verificación.
const VERIFICATION = {
  verified: ['Verificada frente a referencia', 'badge-valid'],
  pending: ['Verificación pendiente', 'badge-warn'],
  unverified: ['Sin verificar', 'badge-muted'],
};

export function verificationBadge(verification = {}) {
  const key = ['verified', 'pending'].includes(verification?.status) ? verification.status : 'unverified';
  const [label, css] = VERIFICATION[key];
  const title = key === 'unverified'
    ? 'Los controles automáticos aceptan el dato por rango, marcas y hora; eso no demuestra calibración ni exactitud.'
    : verification?.reference ? `Referencia: ${verification.reference}` : '';
  return `<span class="badge ${css}" title="${escapeText(title)}">${label}</span>`;
}

// En una cabecera de badges, «Sin dato» no dice de qué dato se trata: se lee
// como si faltara algo que no se nombra. Cada estado nombra su magnitud.
const BATTERY = { ok: 'Batería correcta', low: 'Batería baja', critical: 'Batería crítica', unknown: 'Batería no medida' };
export const batteryLabel = (level) => BATTERY[level] || 'Batería no medida';

// Soporte telefónico público (llega en /api/v1/public-config al arrancar).
export function supportText() {
  const phone = session.support?.supportPhone;
  if (!phone) return '';
  const tel = String(phone).replace(/[^\d+]/g, '');
  return `¿Prefieres hablar? Llámanos al <a href="tel:${escapeText(tel)}">${escapeText(phone)}</a>.`;
}

export function renderSupport(root = document) {
  const html = supportText();
  root.querySelectorAll?.('[data-support]').forEach((element) => {
    element.innerHTML = html;
    element.classList.toggle('hidden', !html);
  });
}

export const roleLabel = (role) => ({ admin: 'Administrador', operator: 'Operador', viewer: 'Observador' }[role] || role);
export const planLabel = (plan) => ({ free: 'Gratis', pro: 'Pro', enterprise: 'Empresa' }[plan] || plan);
export const locationLabel = (type) => ({ urbano: 'Urbano', finca: 'Finca', otro: 'Otro' }[type] || type || '—');

export const METRIC_LABELS = { temperature: 'Temperatura', humidity: 'Humedad', pressure: 'Presión', battery: 'Batería', lux: 'Lux' };
export const COMPARATOR_LABELS = { gt: '>', gte: '≥', lt: '<', lte: '≤' };
export const CHANNEL_LABELS = { email: 'Correo', sms: 'SMS', webhook: 'Webhook', push: 'Push', in_app: 'En pantalla', whatsapp: 'WhatsApp' };
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
  temperatureC: { icon: 'temperature', up: 'calentamiento', down: 'enfriamiento', unit: '°C' },
  humidityPct: { icon: 'humidity', up: 'aumenta la humedad relativa', down: 'disminuye la humedad relativa', unit: '%' },
  pressurePa: { icon: 'pressure', up: 'presión atmosférica al alza', down: 'presión atmosférica a la baja', unit: 'mbar' },
  pressureMbar: { icon: 'pressure', up: 'presión atmosférica al alza', down: 'presión atmosférica a la baja', unit: 'mbar' },
  batteryMv: { icon: 'battery', up: 'subida de tensión', down: 'descenso de tensión', unit: 'mV' },
};

// La magnitud es el cambio observado entre la primera y la última lectura de la
// serie, no el recorrido de una recta ajustada: el usuario compara los mismos
// valores que ve en la gráfica. La regresión lineal se eliminó por completo.
export function chartTrend(rows, key) {
  const points = (rows || []).map((row) => ({
    time: new Date(row.observedAt).getTime(), value: Number(row[key]),
  })).filter((point) => Number.isFinite(point.time) && Number.isFinite(point.value))
    .sort((a, b) => a.time - b.time);
  if (points.length < 3) return { direction: 'insuficiente', change: null, samples: points.length };
  const first = points[0];
  const last = points.at(-1);
  const change = last.value - first.value;
  const values = points.map((point) => point.value);
  const range = Math.max(...values) - Math.min(...values);
  const direction = range === 0 || Math.abs(change) <= range * 0.1
    ? 'estable' : change > 0 ? 'sube' : 'baja';
  return {
    direction,
    change,
    from: first.value,
    to: last.value,
    startAt: new Date(first.time).toISOString(),
    endAt: new Date(last.time).toISOString(),
    spanMs: last.time - first.time,
    samples: points.length,
  };
}

const RECENT_WINDOW_MS = 60 * 60 * 1000;
const MIN_TREND_SAMPLES = 3;

function trendTimes(rows) {
  return (rows || []).map((row) => new Date(row?.observedAt).getTime())
    .filter(Number.isFinite).sort((a, b) => a - b);
}

function trendPeriod(rows, label, fallback) {
  const times = trendTimes(rows);
  return {
    rows,
    label,
    fallback,
    startAt: times.length ? new Date(times[0]).toISOString() : null,
    endAt: times.length ? new Date(times.at(-1)).toISOString() : null,
    spanMs: times.length > 1 ? times.at(-1) - times[0] : 0,
  };
}

// Dos periodos con método y etiqueta explícitos, para que ninguna cifra se
// presente como si describiera otro intervalo:
//   recent — hora reciente, anclada en la última lectura observada (no en el
//            reloj, que dejaría el bloque vacío si el equipo va retrasado).
//   daily  — resumen del día local; si faltan muestras degrada a 3 h y luego a
//            las 5 últimas lecturas, cambiando de etiqueta en cada salto.
export function trendWindows(rows, now = new Date()) {
  const points = (rows || []).filter((row) => row && row.observedAt);
  if (!points.length) return { recent: null, daily: null };

  const times = trendTimes(points);
  const lastTime = times.at(-1);

  let recentPoints = points.filter((row) => new Date(row.observedAt).getTime() >= lastTime - RECENT_WINDOW_MS);
  const recentLabel = recentPoints.length >= MIN_TREND_SAMPLES ? 'Última hora' : 'Últimas 3 lecturas';
  if (recentPoints.length < MIN_TREND_SAMPLES) recentPoints = points.slice(-MIN_TREND_SAMPLES);
  const recent = trendPeriod(recentPoints, recentLabel, recentLabel !== 'Última hora');

  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const dayStart = startOfDay.getTime();
  const today = points.filter((row) => new Date(row.observedAt).getTime() >= dayStart);
  let dailyPoints = today;
  let dailyLabel = 'Hoy';
  let dailyFallback = false;
  if (today.length < MIN_TREND_SAMPLES) {
    const last3h = points.filter((row) => new Date(row.observedAt).getTime() >= lastTime - 3 * RECENT_WINDOW_MS);
    if (last3h.length >= MIN_TREND_SAMPLES) {
      dailyPoints = last3h;
      dailyLabel = 'Últimas 3 h';
    } else {
      dailyPoints = points.slice(-5);
      dailyLabel = 'Últimas 5 lecturas';
    }
    dailyFallback = true;
  }
  return { recent, daily: trendPeriod(dailyPoints, dailyLabel, dailyFallback) };
}

// Envoltorio conservado para los llamadores que solo necesitan el resumen diario.
// Para texto o etiquetas usar `trendWindows`, que distingue día, 3 h y 5 lecturas.
export function trendWindowRows(rows, now = new Date()) {
  return trendWindows(rows, now).daily?.rows || [];
}

export const trendPeriodLabel = (period) => period?.label || 'sin periodo';

const CHART_SCALE = {
  temperatureC: { minimumSpan: 10, step: 5 },
  humidityPct: { minimumSpan: 20, step: 10 },
  pressurePa: { minimumSpan: 5000, step: 1000 },
  pressureMbar: { minimumSpan: 50, step: 10 },
  batteryMv: { minimumSpan: 500, step: 250 },
};

// El gráfico se dibuja en un viewBox fijo y luego se escala al ancho del
// contenedor. Al escalarlo también se reduce el texto interno, que es lo que lo
// hacía ilegible en móvil: la escala no se puede corregir solo con CSS porque el
// tamaño final depende del ancho real, que el SVG no conoce al dibujarse.
//
// La solución es fijar la altura en píxeles y ajustar la escala de forma que el
// viewBox se parezca al ancho mostrado: así 1 unidad del viewBox ≈ 1 píxel, y la
// tipografía del eje conserva su tamaño en pantalla. `chartGeometry` devuelve
// además los valores medidos para poder probarlos sin navegador.
export const CHART_BOX = { width: 560, height: 200, minWidth: 260 };

/**
 * Escala de un gráfico al ancho que realmente ocupa.
 *
 * Devuelve el alto en píxeles, el factor de escala y el ancho efectivo del
 * viewBox. Con un contenedor estrecho se reduce el número de marcas del eje y
 * se acorta la fecha, nunca el tamaño de la letra.
 */
export function chartScale(measuredWidth = CHART_BOX.width) {
  const width = Math.max(CHART_BOX.minWidth, Math.round(measuredWidth) || CHART_BOX.width);
  const compact = width < 380;
  // Alto proporcional al ancho, acotado: en un móvil la gráfica no puede
  // quedarse en una franja de 135 px con la mitad del texto fuera.
  const height = Math.round(Math.max(150, Math.min(230, width * 0.5)));
  // Se estira el viewBox para que coincida con el ancho mostrado: el factor de
  // escala real pasa a ser 1 y la tipografía se ve al tamaño declarado.
  return {
    width,
    height,
    scale: 1,
    compact,
    // Un eje con cuatro horas no cabe en 260 px: se muestran menos marcas, no
    // letras más pequeñas.
    timeTicks: compact ? 3 : 4,
    valueTicks: compact ? 3 : 3,
    axisFont: compact ? 12 : 13,
  };
}

let chartInstance = 0;

// Gráficos ya dibujados, para poder redibujarlos cuando cambia el ancho. El
// SVG se genera antes de estar en el documento y, por tanto, antes de saber
// cuánto mide su contenedor: sin esto, el viewBox fijo haría que en un móvil
// todo el texto interno se escalase a menos de la mitad.
const chartSpecs = new Map();

const CHART_REDRAW_TOLERANCE = 24;

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

const clockText = (value) => (value
  ? new Date(value).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  : '—');

const trendIcon = (direction) => (direction === 'sube' ? '↑' : direction === 'baja' ? '↓' : direction === 'estable' ? '→' : '·');

// Los extremos del eje se muestran abreviados —día, mes y hora— porque en
// pantalla ancha la fecha larga no cabe y empujaba el resto. La fecha completa
// sigue en el title de cada etiqueta, en el aria-label del SVG y en el detalle
// ampliable: acortar no es quitar.
export function shortDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const two = (n) => String(n).padStart(2, '0');
  // Se compone a mano porque el formato largo de es-ES no rellena con cero el
  // día ni la hora, y un eje con «5/6» junto a «20/6» se lee como dos formatos.
  return `${two(date.getDate())}/${two(date.getMonth() + 1)} ${two(date.getHours())}:${two(date.getMinutes())}`;
}

function trendExplanation(direction, metric, period) {
  const scope = period.label.toLowerCase();
  if (direction === 'sube') return metric.up;
  if (direction === 'baja') return metric.down;
  if (direction === 'estable') return `variación pequeña · ${scope}`;
  return `se necesitan 3 lecturas en ${scope}`;
}

function trendBadgeBlock(period, key, digits, variant) {
  const metric = TREND_METRICS[key];
  const trend = chartTrend(period.rows, key);
  const { direction, change } = trend;
  const explanation = trendExplanation(direction, metric, period);
  const amount = change == null ? '' : ` · ${numberText(Math.abs(change), digits)} ${metric.unit}`;
  // El bloque diario añade los extremos del día: junto a la tendencia reciente,
  // es lo que responde a «¿qué mínimo y qué máximo ha habido hoy?».
  const dayValues = variant === 'daily'
    ? period.rows.map((row) => Number(row[key])).filter(Number.isFinite)
    : [];
  const dayRange = dayValues.length
    ? ` · mín ${numberText(Math.min(...dayValues), digits)} / máx ${numberText(Math.max(...dayValues), digits)} ${metric.unit}`
    : '';
  const window = `${clockText(period.startAt)}–${clockText(period.endAt)}`;
  const method = 'Diferencia entre la primera y la última lectura del periodo';
  const accessible = trend.samples < 3
    ? `${period.label}: ${explanation}${dayRange}`
    : `${period.label}: ${explanation}${amount}${dayRange}. De ${window}, ${trend.samples} lecturas. `
      + `${numberText(trend.from, digits)} → ${numberText(trend.to, digits)} ${metric.unit}. ${method}.`;
  return `<div class="chart-trend-item chart-trend-${variant}"><span class="chart-trend-label">${escapeText(period.label)}</span><span class="chart-trend trend-${direction}" title="${escapeText(accessible)}" aria-label="${escapeText(accessible)}"><strong aria-hidden="true">${trendIcon(direction)}</strong> ${escapeText(direction === 'insuficiente' ? 'Sin tendencia' : direction)}</span><small class="chart-trend-note">${escapeText(explanation)}${escapeText(amount)}${escapeText(dayRange)}</small></div>`;
}

// Un bloque por periodo, con su etiqueta y su cifra. Si el resumen diario y la
// hora reciente coinciden en lecturas se muestra uno solo, para no repetir dos
// veces la misma afirmación.
function chartTrendBadge(rows, key, digits, now) {
  const metric = TREND_METRICS[key];
  if (!metric) return '';
  const { recent, daily } = trendWindows(rows, now);
  if (!recent) return '';
  const sameSeries = daily && daily.rows.length === recent.rows.length
    && daily.startAt === recent.startAt && daily.endAt === recent.endAt;
  const blocks = [trendBadgeBlock(recent, key, digits, 'recent')];
  if (daily && !sameSeries) blocks.push(trendBadgeBlock(daily, key, digits, 'daily'));
  return `<div class="chart-trend-wrap">${blocks.join('')}</div>`;
}

export function makeChart(title, rows, key, color, unit, digits = 1, exactStats = null, detail = null, trendRows = null, now = new Date(), options = {}) {
  const allPoints = rows.filter((row) => row[key] != null);
  const points = sampleChartRows(rows, key);
  const metricIcon = TREND_METRICS[key]?.icon || 'chart';
  const iconHtml = icon(metricIcon, { size: 19 });
  const detailAttrs = detail
    ? ` data-detail-key="${escapeText(detail.key)}" data-detail-metric="${escapeText(detail.metric || key)}" data-detail-source="${escapeText(detail.source || 'local')}" role="button" tabindex="0" aria-label="Ampliar ${escapeText(title)}"`
    : '';
  if (!allPoints.length) return `<div class="chart-box tecrural-chart-card chart-empty"${detailAttrs}><div class="chart-title"><span class="chart-icon">${iconHtml}</span><div><h3>${escapeText(title)}</h3><small>MICROESTACIÓN</small></div></div><p class="empty">No hay mediciones aceptadas por los controles automáticos en este periodo.</p></div>`;
  const scale = chartScale(options.width ?? CHART_BOX.width);
  const { width, height } = scale;
  const left = scale.compact ? 40 : 58, right = 14, top = 16, bottom = scale.compact ? 30 : 34;
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
  const valueSteps = scale.valueTicks - 1;
  const ticks = Array.from({ length: scale.valueTicks }, (_, i) => {
    const fraction = valueSteps ? i / valueSteps : 0;
    const y = top + fraction * (height - top - bottom);
    const value = high - fraction * (high - low);
    return `<line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" class="chart-gridline"/><text x="${left - 8}" y="${y + 4}" class="chart-axis-label" style="font-size:${scale.axisFont}px" text-anchor="end">${numberText(value, digits)}</text>`;
  }).join('');
  const dateSpan = lastTime - firstTime;
  const tickCount = scale.timeTicks;
    const lastTick = tickCount - 1;
    const timeLabels = Array.from({ length: tickCount }, (_, i) => {
      const time = firstTime + dateSpan * i / lastTick;
      const date = new Date(time);
      // En un eje estrecho la fecha se abrevia; el valor preciso sigue en el
      // punto ampliable y en las etiquetas de datos de la tabla.
      const text = dateSpan > 36 * 60 * 60 * 1000
        ? new Intl.DateTimeFormat('es', scale.compact
          ? { day: '2-digit', month: '2-digit' } : { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date)
        : new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' }).format(date);
      const anchor = i === 0 ? 'start' : i === lastTick ? 'end' : 'middle';
      return `<text x="${left + (width - left - right) * i / lastTick}" y="${height - 7}" class="chart-axis-label" style="font-size:${scale.axisFont}px" text-anchor="${anchor}">${escapeText(text)}</text>`;
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
  // Se guarda lo necesario para volver a dibujar el mismo gráfico a otro ancho.
  const chartId = `c${chartInstance}`;
  chartSpecs.set(chartId, { title, rows, key, color, unit, digits, exactStats, detail, trendRows, now, height });
  return `<div class="chart-box tecrural-chart-card"${detailAttrs} data-chart-id="${chartId}" data-chart-width="${width}" data-chart-height="${height}"><div class="chart-heading"><div class="chart-title"><span class="chart-icon">${iconHtml}</span><div><h3>${escapeText(title)}</h3><small>MICROESTACIÓN · MEDICIONES VALIDADAS</small></div></div><div class="chart-current"><strong>${latestValue}</strong><small>${escapeText(unit)}</small></div></div><div class="chart-trend-strip">${chartTrendBadge(trendRows && trendRows.length ? trendRows : allPoints, key, digits, now)}</div><div class="chart-wrap"><svg class="chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" style="--chart-h:${height}px" role="group" aria-label="${escapeText(title)} desde ${escapeText(first)} hasta ${escapeText(last)}"><defs><linearGradient id="${gradientId}" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="${color}" stop-opacity=".42"/><stop offset="100%" stop-color="${color}" stop-opacity=".02"/></linearGradient><filter id="${glowId}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.6" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>${ticks}${areaPaths}${paths}${pulse}${timeLabels}${pointTargets}</svg><div class="chart-tooltip" role="status" aria-live="polite" hidden></div></div><div class="chart-dates"><span title="${escapeText(first)}">${escapeText(shortDate(orderedPoints[0].observedAt))}</span><span title="${escapeText(last)}">${escapeText(shortDate(orderedPoints.at(-1).observedAt))}</span></div><div class="summary"><span>Mín. ${numberText(min, digits)} ${escapeText(unit)}</span><span>Máx. ${numberText(max, digits)} ${escapeText(unit)}</span><span>Prom. ${numberText(average, digits)} ${escapeText(unit)}</span></div></div>`;
}

if (typeof document !== 'undefined') {
  const showChartTip = (target) => {
    const wrap = target.closest('.chart-wrap');
    if (!wrap) return;
    const tip = wrap.querySelector('.chart-tooltip');
    tip.textContent = target.dataset.chartTip;
    tip.hidden = false;
    // El SVG ya se dibuja 1:1 con el ancho mostrado, así que las coordenadas del
    // viewBox coinciden con las de la caja y no hace falta escalar a mano.
    const wrapWidth = wrap.getBoundingClientRect().width || CHART_BOX.width;
    tip.style.left = `${Math.max(0, Math.min(88, Number(target.dataset.chartX) / wrapWidth * 100))}%`;
    const height = wrap.closest('[data-chart-id]')?.dataset.chartHeight
      || wrap.getBoundingClientRect().height || CHART_BOX.height;
    tip.style.top = `${Math.max(0, Math.min(75, Number(target.dataset.chartY) / Number(height) * 100))}%`;
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

/**
 * Redibuja los gráficos cuyo ancho real se ha alejado del que se dibujaron.
 *
 * El SVG se genera como cadena antes de insertarlo, así que su primer viewBox es
 * el de referencia. Al insertarlo se mide el ancho real y, si difiere lo
 * suficiente, se vuelve a generar a esa medida: es lo que evita que la escala, las
 * horas y la explicación de tendencia se encojan con el resto del dibujo.
 */
export function mountCharts(root = document) {
  root.querySelectorAll('[data-chart-id]').forEach((card) => {
    const spec = chartSpecs.get(card.dataset.chartId);
    if (!spec) return;
    const measured = Math.round(card.querySelector('.chart-wrap')?.getBoundingClientRect().width || 0);
    if (!measured) return;
    const drawn = Number(card.dataset.chartWidth) || CHART_BOX.width;
    if (Math.abs(measured - drawn) <= CHART_REDRAW_TOLERANCE) return;
    card.outerHTML = makeChart(spec.title, spec.rows, spec.key, spec.color, spec.unit, spec.digits,
      spec.exactStats, spec.detail, spec.trendRows, spec.now, { width: measured });
  });
}

if (typeof ResizeObserver !== 'undefined' && typeof document !== 'undefined') {
  let pending = null;
  const redrawSoon = () => {
    if (pending) return;
    pending = requestAnimationFrame(() => { pending = null; mountCharts(document); });
  };
  new ResizeObserver(redrawSoon).observe(document.documentElement);
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
  // Una métrica desactivada no se dibuja: una gráfica vacía ocupa el hueco de
  // una real y hace que el conjunto parezca menos completo de lo que es. Si el
  // sensor está apagado, su estado está en la ficha del equipo.
  const enabled = (key) => options.sensors?.[key] !== false;
  const lux = options.sensors?.lux === true && history.some((row) => row.lux != null)
    ? card('Iluminancia', history, 'lux', '#d99a1f', 'lux', 0)
    : '';
  const battery = enabled('battery')
    ? card('Batería', history, 'batteryMv', '#217a4b', 'mV', 0, { min: summary.battery_min, max: summary.battery_max, avg: summary.battery_avg })
    : '';
  const disabled = ['temperature', 'humidity', 'pressure', 'battery'].filter((key) => !enabled(key));
  // Si no queda ninguna métrica activa, el conjunto vacío dice por qué.
  const charts = [
    enabled('temperature') ? card('Temperatura', history, 'temperatureC', '#c97742', '°C', 1, { min: summary.temp_min, max: summary.temp_max, avg: summary.temp_avg }) : '',
    enabled('humidity') ? card('Humedad', history, 'humidityPct', '#168b80', '%', 1, { min: summary.humidity_min, max: summary.humidity_max, avg: summary.humidity_avg }) : '',
    enabled('pressure') ? card('Presión', pressureHistory, 'pressureMbar', '#079ab1', 'mbar', 1, pressureSummary) : '',
    battery,
    lux,
  ].join('');
  const body = charts || '<p class="empty">Todos los sensores de esta estación están desactivados. Su configuración está en la ficha del equipo.</p>';
  const note = disabled.length
    ? `<p class="hint">Sin medir: ${disabled.map((key) => ({ temperature: 'temperatura', humidity: 'humedad', pressure: 'presión', battery: 'batería' })[key]).join(', ')}. El equipo no las envía y por eso no tienen gráfica.</p>`
    : '';
  return `<div class="chart-grid">${body}</div>${note}<p class="chart-trend-help">Evolución de mediciones aceptadas por los controles automáticos de la microestación. Cada tarjeta separa la última hora del resumen del día: las cifras son diferencias entre la primera y la última lectura de cada periodo, no pendientes ajustadas. Toca un gráfico o una tarjeta para ampliar.</p>`;
};

// ---- Diálogo de detalle ----------------------------------------------------
// El cierre usa un aspa decorativa (oculta al lector de pantalla, que ya lee
// «Cerrar») y el botón conserva texto visible: el símbolo sola no basta si el
// aspa no se ve o se pierde el contraste. Escape cierra por el comportamiento
// nativo de <dialog>, sin depender de este botón.
export function openDialog(title, bodyHtml, actionsHtml = '') {
  const dialog = $('#detail-dialog');
  dialog.innerHTML = `<div class="dialog-head"><h3 id="detail-dialog-title">${escapeText(title)}</h3><button type="button" class="quiet dialog-close" data-dialog-close><span class="dialog-close-mark" aria-hidden="true">✕</span>Cerrar</button></div>
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
