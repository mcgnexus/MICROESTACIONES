// Texto comprensible para las alertas: qué pasa, dónde, cuándo, de dónde sale,
// cómo de grave está y en qué estado está. Nada de "warning" o "extreme".
import { escapeText, dateText, numberText } from './ui.js';

export const CATEGORY_LABELS = {
  frost: 'Riesgo de helada', heat: 'Riesgo de calor', storm: 'Riesgo de tormenta',
  wind: 'Riesgo de viento', humidity: 'Humedad', general: 'Aviso',
};

const ORIGIN_LABELS = {
  station_measurement: 'Medición de tu estación',
  external_forecast: 'Previsión externa',
  estimate: 'Estimación',
};

export const alertCategory = (alert) => alert.category || alert.ruleSnapshot?.category || 'general';
export const alertLevel = (alert) => (Number(alert.level) === 1 ? 'Prioritario' : 'Aviso');

export function alertStatus(alert) {
  if (!alert.closedAt) return { key: 'active', label: 'Activa' };
  if (alert.autoResolved) return { key: 'resolved', label: 'Resuelta' };
  return { key: 'dismissed', label: 'Descartada' };
}

export function alertOrigin(alert) {
  return ORIGIN_LABELS[alert.source] || 'Regla configurada';
}

// Edad de la medida en palabras, a partir de alert.ageSeconds.
export function alertSince(alert) {
  const seconds = alert.ageSeconds;
  if (seconds == null) return null;
  if (seconds < 90) return 'hace unos segundos';
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `hace ${hours} h` : `hace ${Math.round(hours / 24)} días`;
}

// Valor numérico medido, venga como número o dentro del objeto value.
export function alertValue(alert) {
  if (typeof alert.value === 'number') return alert.value;
  const raw = alert.value?.value;
  return typeof raw === 'number' ? raw : null;
}

export function alertTitle(alert, zone = null) {
  const category = alertCategory(alert);
  const base = category === 'general' ? (alert.message || 'Aviso') : CATEGORY_LABELS[category];
  return zone ? `${base} — ${zone}` : base;
}

export function alertExplanation(alert) {
  const category = alertCategory(alert);
  const value = alertValue(alert);
  switch (category) {
    case 'frost':
      return value == null
        ? 'Posible helada. Aviso preventivo: revisa las medidas de protección de tu cultivo.'
        : `Temperatura prevista o medida de ${numberText(value)} °C. Aviso preventivo: revisa las medidas de protección de tu cultivo.`;
    case 'heat':
      return 'Temperatura y humedad elevadas durante varias horas. Revisa sombra, agua y ventilación del ganado.';
    case 'storm':
      return `${alert.message}. La tormenta se muestra como aviso oficial o riesgo estimado, no como detección local.`;
    case 'wind':
      return `${alert.message}. Revisa invernaderos, cubiertas y el ganado expuesto.`;
    case 'humidity':
      return `${alert.message}. Revisa la ventilación y el riesgo de hongos.`;
    default:
      return alert.message || 'Aviso de tu estación.';
  }
}

export function alertMeta(alert, { zone = null } = {}) {
  return [
    `Estación: ${alert.deviceName || alert.deviceId || '—'}`,
    zone ? `Zona: ${zone}` : null,
    `Hora: ${dateText(alert.observedAt)}${alertSince(alert) ? ` (${alertSince(alert)})` : ''}`,
    `Origen: ${alertOrigin(alert)}`,
    `Nivel: ${alertLevel(alert)}`,
  ].filter(Boolean);
}

// Una tarjeta comprensible por alerta.
export function renderAlertCard(alert, { zone = null, technical = false } = {}) {
  const status = alertStatus(alert);
  const tone = status.key !== 'active' ? 'muted' : (Number(alert.level) === 1 ? 'alert' : 'warn');
  const technicalBlock = technical && alert.ruleSnapshot
    ? `<details class="alert-card-tech"><summary>Detalle técnico</summary><pre>${escapeText(JSON.stringify(alert.ruleSnapshot, null, 2))}</pre></details>`
    : '';
  return `<article class="alert-card tone-${tone}">
    <div class="alert-card-head">
      <h3>${escapeText(alertTitle(alert, zone))}</h3>
      <span class="overview-tag tone-${tone}">${escapeText(status.label)}</span>
    </div>
    <p class="alert-card-explain">${escapeText(alertExplanation(alert))}</p>
    <ul class="alert-card-meta">${alertMeta(alert, { zone }).map((line) => `<li>${escapeText(line)}</li>`).join('')}</ul>
    ${technicalBlock}
  </article>`;
}

// Mapa device_id → nombre de finca (zona) a partir de las fincas del suscriptor.
export function zoneByDevice(farms = []) {
  const map = new Map();
  for (const farm of farms) {
    for (const deviceId of farm.devices || []) map.set(deviceId, farm.name);
  }
  return map;
}

export function renderAlertsList(alerts, farms = [], { technical = false } = {}) {
  const zones = zoneByDevice(farms);
  if (!alerts.length) return '<p class="empty">No hay alertas para estos filtros.</p>';
  return `<div class="alert-cards">${alerts.map((alert) =>
    renderAlertCard(alert, { zone: zones.get(alert.deviceId) || null, technical })).join('')}</div>`;
}
