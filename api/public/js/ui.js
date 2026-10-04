// Utilidades compartidas del panel: API, formato, insignias y gráficas.
export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export const escapeText = (value) => String(value ?? '—').replace(/[&<>"']/g, (char) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export const dateText = (value) => (value ? new Date(value).toLocaleString('es-ES') : '—');
export const dayText = (value) => (value ? new Date(value).toLocaleDateString('es-ES') : '—');
export const numberText = (value, digits = 1) =>
  value == null ? '—' : Number(value).toLocaleString('es-ES', { maximumFractionDigits: digits });

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

export function metric(label, value, unit = '') {
  return `<div class="metric"><span>${label}</span><strong>${value}</strong> <small>${unit}</small></div>`;
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
export function makeChart(title, rows, key, color, unit, digits = 1) {
  const points = rows.filter((row) => row[key] != null);
  if (!points.length) return `<div class="chart-box"><h3>${title}</h3><p class="empty">No hay mediciones validadas en este periodo.</p></div>`;
  const width = 500, height = 135, pad = 18;
  const values = points.map((row) => Number(row[key]));
  let low = Math.min(...values), high = Math.max(...values);
  if (high === low) { high += 1; low -= 1; }
  const coords = points.map((row, index) => {
    const x = pad + (points.length === 1 ? 0.5 : index / (points.length - 1)) * (width - pad * 2);
    const y = height - pad - ((Number(row[key]) - low) / (high - low)) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const first = dateText(points[0].observedAt);
  const last = dateText(points.at(-1).observedAt);
  return `<div class="chart-box"><h3>${title} · ${unit}</h3><svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeText(title)} desde ${first} hasta ${last}"><line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="#dfe7df"/><polyline fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${coords}"/>${points.map((row, i) => { const p = coords.split(' ')[i].split(','); return `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="${color}"/>`; }).join('')}</svg><div class="summary"><span>Mín. ${numberText(Math.min(...values), digits)} ${unit}</span><span>Máx. ${numberText(Math.max(...values), digits)} ${unit}</span><span>Prom. ${numberText(values.reduce((a, b) => a + b, 0) / values.length, digits)} ${unit}</span></div></div>`;
}

export const chartSection = (history) => `<div class="chart-grid">${makeChart('Temperatura', history, 'temperatureC', '#d47749', '°C')}${makeChart('Humedad', history, 'humidityPct', '#4286a8', '%')}${makeChart('Presión', history, 'pressurePa', '#735bb0', 'Pa', 0)}${makeChart('Batería', history, 'batteryMv', '#528452', 'mV', 0)}</div>`;

// ---- Diálogo de detalle ----------------------------------------------------
export function openDialog(title, bodyHtml, actionsHtml = '') {
  const dialog = $('#detail-dialog');
  dialog.innerHTML = `<div class="dialog-head"><h3>${escapeText(title)}</h3><button type="button" class="quiet" data-dialog-close>Cerrar</button></div>
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
