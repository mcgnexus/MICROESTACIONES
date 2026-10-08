// Texto comprensible para las alertas: qué pasa, dónde, cuándo, de dónde sale,
// cómo de grave está y en qué estado está. Nada de "warning" o "extreme".
//
// Cada tarjeta declara los cinco datos de la taxonomía (categoría, fuente, fecha,
// estado y vigencia) y, sobre todo, de qué clase de afirmación se trata: real,
// previsto, calculado o simulado. La explicación cita siempre el dato observado
// o la previsión que origina el aviso; nunca promete "detectamos que viene…".
import { escapeText, dateText, numberText } from './ui.js';
import {
  classifyNotice, coverageCaveat, validityText, NOTICE_CATEGORIES,
} from './notice-taxonomy.js';

export { coverageCaveat };

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

// Explicación: cita el dato observado o la previsión que origina el aviso y,
// solo después, qué puede hacer el usuario. Nunca una promesa general.
export function alertExplanation(alert) {
  const category = alertCategory(alert);
  const value = alertValue(alert);
  const origin = classifyNotice(alert).origin;
  switch (category) {
    case 'frost':
      return value == null
        ? `${origin} Aviso preventivo sin valor numérico: revisa las medidas de protección de tu cultivo.`
        : `${origin} Aviso preventivo: revisa las medidas de protección de tu cultivo.`;
    case 'heat':
      return `${origin} Temperatura y humedad elevadas durante varias horas. Revisa sombra, agua y ventilación del ganado.`;
    case 'storm':
      return `${origin} La tormenta se muestra como aviso oficial o riesgo estimado, no como detección local.`;
    case 'wind':
      return `${origin} Revisa invernaderos, cubiertas y el ganado expuesto.`;
    case 'humidity':
      return `${origin} Revisa la ventilación y el riesgo de hongos.`;
    default:
      return `${origin}${alert.message ? ` ${alert.message}.` : ''}`.trim();
  }
}

// Los cinco datos de la taxonomía, en una sola línea legible.
export function alertMeta(alert, { zone = null, engineVerified = true } = {}) {
  const meta = classifyNotice({ ...alert, engineVerified });
  return [
    `Estación: ${alert.deviceName || alert.deviceId || '—'}`,
    zone ? `Zona: ${zone}` : null,
    `Categoría: ${meta.categoryLabel}`,
    `Hora: ${dateText(alert.observedAt)}${alertSince(alert) ? ` (${alertSince(alert)})` : ''}`,
    `Fuente: ${meta.sourceLabel}`,
    meta.official ? 'Aviso oficial' : null,
    `Tipo: ${meta.natureLabel} — ${meta.natureHint}`,
    `Estado: ${meta.stateLabel}`,
    `Vigencia: ${validityText(meta.category, alert.closedAt)}`,
    `Nivel: ${alertLevel(alert)}`,
  ].filter(Boolean);
}

// Insignia con la naturaleza: real, previsto, calculado o simulado.
function natureBadge(meta) {
  const tone = meta.nature === 'real' ? 'valid'
    : meta.nature === 'previsto' ? 'warn'
      : meta.nature === 'simulado' ? 'muted' : 'muted';
  return `<span class="badge badge-${tone}" title="${escapeText(meta.natureHint)}">${escapeText(meta.natureLabel)}</span>`;
}

// Una tarjeta comprensible por alerta.
export function renderAlertCard(alert, { zone = null, technical = false, engineVerified = true } = {}) {
  const status = alertStatus(alert);
  const meta = classifyNotice({ ...alert, engineVerified });
  const tone = status.key !== 'active' ? 'muted' : (Number(alert.level) === 1 ? 'alert' : 'warn');
  // El detalle técnico (regla, destinatario, canal) solo para administración.
  const technicalBlock = technical && alert.ruleSnapshot
    ? `<details class="alert-card-tech"><summary>Detalle técnico</summary><pre>${escapeText(JSON.stringify(alert.ruleSnapshot, null, 2))}</pre></details>`
    : '';
  const engineBlock = meta.requiresEngine && !engineVerified
    ? '<p class="hint">Aviso de umbral local oculto: el motor de avisos no está comprobado en esta instalación.</p>'
    : '';
  return `<article class="alert-card tone-${tone}">
    <div class="alert-card-head">
      <h3>${escapeText(alertTitle(alert, zone))}</h3>
      <span class="overview-tag tone-${tone}">${escapeText(status.label)}</span>
      ${natureBadge(meta)}
    </div>
    <p class="alert-card-explain">${escapeText(alertExplanation(alert))}</p>
    <ul class="alert-card-meta">${alertMeta(alert, { zone, engineVerified }).map((line) => `<li>${escapeText(line)}</li>`).join('')}</ul>
    ${engineBlock}
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

// Advertencia que acompaña a un listado vacío: un listado sin avisos no es un
// listado sin riesgo cuando faltan datos o la previsión está caída.
export function caveatBlock(caveat) {
  if (!caveat) return '';
  return `<p class="${caveat.tone === 'warn' ? 'warn-box' : 'empty'}">Sin avisos que mostrar, pero <strong>esto no significa que no haya riesgo</strong>: ${escapeText(caveat.text)}</p>`;
}

// Listado de tarjetas. `caveat` (de coverageCaveat) y `engineVerified` llegan
// del panel; sin ellos no se afirma nada sobre la ausencia de riesgo.
export function renderAlertsList(alerts, farms = [], {
  technical = false, caveat = null, engineVerified = true,
} = {}) {
  const zones = zoneByDevice(farms);
  // Con el motor sin comprobado, un aviso de umbral local no se presenta como tal.
  const visible = engineVerified
    ? alerts
    : alerts.filter((alert) => classifyNotice({ ...alert, engineVerified }).category !== 'threshold');
  const hidden = alerts.length - visible.length;
  if (!visible.length) {
    const engineNote = hidden > 0
      ? `<p class="hint">${hidden} aviso(s) de umbral local ocultos: el motor de avisos no está comprobado en esta instalación.</p>`
      : '';
    return `<p class="empty">No hay avisos para estos filtros.</p>${caveatBlock(caveat)}${engineNote}`;
  }
  const extra = hidden > 0
    ? `<p class="hint">${hidden} aviso(s) de umbral local ocultos: el motor de avisos no está comprobado en esta instalación.</p>`
    : '';
  return `${extra}<div class="alert-cards">${visible.map((alert) =>
    renderAlertCard(alert, { zone: zones.get(alert.deviceId) || null, technical, engineVerified })).join('')}</div>`;
}

export const categorySummary = (category) => {
  const entry = NOTICE_CATEGORIES[category];
  if (!entry) return null;
  return { category, label: entry.label, description: entry.description, nature: entry.nature };
};
