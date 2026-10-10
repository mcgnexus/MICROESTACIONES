import {
  $, api, escapeText, dateText, dayText, numberText, pressureMbar, pressureText, chartTrend,
  chartSection, connectivityBadge, openDialog, makeChart, trendWindows, trendPeriodLabel, session, renderSupport,
  isAdmin, canEdit, freshness, roleLabel, locationLabel,
} from './ui.js';
import { mountMeasurements } from './measurements.js';
import { summarizeFarms, renderFarmOverview } from './farm-overview.js';
import { renderStateCards, nextRisk, renderNextRisk, renderZoneComparison, resourceNote } from './farm-cards.js';
import { coverageCaveat, caveatBlock } from './alert-copy.js';
import { originBadge, originLegend } from './origin-labels.js';
import { icon } from './icons.js';
import { classifyNotice } from './notice-taxonomy.js';
import {
  notificationPermission, requestNotificationPermission, showBrowserNotification, newAlertIds,
} from './notifications.js';

const REFRESH_MS = 15 * 60 * 1000;

// Emergentes: la primera carga fija la línea base (no notifica lo ya abierto);
// después, cada aviso abierto nuevo dispara una notificación del navegador.
const seenOpenAlerts = new Set();
let alertsBaselineDone = false;

// Cabecera del panel: nombre y tipo de cada estación más el rol efectivo. El
// detalle técnico queda en las tarjetas; aquí solo se sitúa quién eres y qué
// estaciones ves, que es lo primero que pide la organización de lectura.
function setPanelContext(root, devices = []) {
  const target = $('[data-panel-context]', root);
  if (!target) return;
  const stations = devices.map((item) => {
    const type = item?.device?.locationType ? ` · ${locationLabel(item.device.locationType)}` : '';
    return `${item?.device?.name || '—'}${type}`;
  });
  const role = session.me?.role ? roleLabel(session.me.role) : null;
  const access = canEdit() ? 'Acceso de edición' : 'Solo lectura';
  target.textContent = [role, ...stations, access].filter(Boolean).join(' · ');
}

function surfaceNewAlerts(openAlerts) {
  if (!alertsBaselineDone) {
    for (const alert of openAlerts) seenOpenAlerts.add(String(alert.id));
    alertsBaselineDone = true;
    return;
  }
  for (const alert of newAlertIds(seenOpenAlerts, openAlerts)) {
    const priority = Number(alert.level) === 1 ? 'Alerta prioritaria' : 'Alerta';
    showBrowserNotification(`${priority} · ${alert.deviceName || 'estación'}`, alert.message || '');
    seenOpenAlerts.add(String(alert.id));
  }
  for (const closed of [...seenOpenAlerts]) {
    if (!openAlerts.some((alert) => String(alert.id) === closed)) seenOpenAlerts.delete(closed);
  }
}

// Botón discreto para conceder el permiso de notificación: los navegadores
// exigen un gesto del usuario para pedirla.
function wireNotificationButton(root) {
  const button = $('[data-notify-enable]', root);
  if (!button) return;
  const permission = notificationPermission();
  button.classList.toggle('hidden', permission !== 'default');
  button.addEventListener('click', async () => {
    const granted = (await requestNotificationPermission()) === 'granted';
    button.classList.toggle('hidden', notificationPermission() !== 'default');
    if (granted) showBrowserNotification('Avisos activados', 'Te avisaremos aquí cuando se abra una alerta en tu finca.');
  });
}

const weatherText = (code) => ({
  0: 'Despejado', 1: 'Mayormente despejado', 2: 'Parcialmente nuboso', 3: 'Nublado',
  45: 'Niebla', 48: 'Niebla con escarcha', 51: 'Llovizna débil', 53: 'Llovizna', 55: 'Llovizna intensa',
  61: 'Lluvia débil', 63: 'Lluvia', 65: 'Lluvia intensa', 71: 'Nieve débil', 73: 'Nieve', 75: 'Nieve intensa',
  80: 'Chubascos débiles', 81: 'Chubascos', 82: 'Chubascos intensos', 95: 'Tormenta', 96: 'Tormenta con granizo', 99: 'Tormenta intensa con granizo',
}[Number(code)] || 'Estado variable');

const median = (values) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

function valueTone(kind, value, reference = null) {
  if (value == null || !Number.isFinite(Number(value))) return 'tone-muted';
  const number = Number(value);
  if (kind === 'temperature') return number < 0 ? 'tone-cold' : number < 10 ? 'tone-cool' : number <= 25 ? 'tone-normal' : number <= 35 ? 'tone-warm' : 'tone-hot';
  if (kind === 'humidity') return number < 30 ? 'tone-dry' : number <= 70 ? 'tone-normal' : number <= 85 ? 'tone-humid' : 'tone-hot';
  if (kind === 'pressure' && reference != null) {
    const difference = Math.abs(number - reference);
    return difference <= 3 ? 'tone-normal' : difference <= 8 ? 'tone-warm' : 'tone-hot';
  }
  if (kind === 'rain') return number < 1 ? 'tone-normal' : number < 10 ? 'tone-warm' : 'tone-hot';
  if (kind === 'wind') return number < 30 ? 'tone-normal' : number < 50 ? 'tone-warm' : 'tone-hot';
  return 'tone-neutral';
}

// ---- Registro de detalles para ampliar tarjetas y gráficos -----------------
const stationDetails = new Map();
let detailSeq = 0;

function registerDetail(item) {
  const key = `station-${++detailSeq}`;
  stationDetails.set(key, item);
  return key;
}

export function resetStationDetails() {
  stationDetails.clear();
}

const METRIC_META = {
  temperatureC: { label: 'Temperatura', unit: '°C', digits: 1, color: '#c97742', icon: 'temperature', aemet: 'temperatureC' },
  humidityPct: { label: 'Humedad', unit: '%', digits: 1, color: '#168b80', icon: 'humidity', aemet: 'humidityPct' },
  pressureMbar: { label: 'Presión', unit: 'mbar', digits: 1, color: '#079ab1', icon: 'pressure', aemet: 'pressureHpa' },
  batteryMv: { label: 'Batería', unit: 'mV', digits: 0, color: '#217a4b', icon: 'battery', aemet: null },
  lux: { label: 'Iluminancia', unit: 'lux', digits: 0, color: '#d99a1f', icon: 'lux', aemet: null },
};

const AEMET_META = {
  temperatureC: { label: 'Temperatura', unit: '°C', digits: 1, icon: 'temperature', kind: 'temperature', local: 'temperatureC' },
  humidityPct: { label: 'Humedad', unit: '%', digits: 1, icon: 'humidity', kind: 'humidity', local: 'humidityPct' },
  pressureHpa: { label: 'Presión', unit: 'mbar', digits: 1, icon: 'pressure', kind: 'pressure', local: 'pressureMbar' },
  precipitationMm: { label: 'Precipitación', unit: 'mm', digits: 1, icon: 'rain', kind: 'rain', local: null },
  windKmh: { label: 'Viento', unit: 'km/h', digits: 1, icon: 'wind', kind: 'wind', local: null },
  windGustKmh: { label: 'Racha', unit: 'km/h', digits: 1, icon: 'wind', kind: 'wind', local: null },
};

const rawValue = (row, key) => (key === 'pressureMbar' ? pressureMbar(row?.pressurePa) : row?.[key]);
const chartRowsFor = (item, key) => (key === 'pressureMbar'
  ? (item.history || []).map((row) => ({ ...row, pressureMbar: pressureMbar(row.pressurePa) }))
  : (item.history || []));

// Formato compacto de hora para las tarjetas de detalle.
const stampText = (value) => (value
  ? new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
  : '—');

const TONE_KIND = { temperatureC: 'temperature', humidityPct: 'humidity', pressureMbar: 'pressure', batteryMv: 'battery', lux: 'neutral' };

function metricTone(key, value, reference = null) {
  const kind = TONE_KIND[key];
  if (!kind) return 'tone-neutral';
  if (kind === 'battery') {
    if (value == null) return 'tone-muted';
    return value < 3300 ? 'tone-battery-critical' : value < 3600 ? 'tone-battery-low' : 'tone-battery-ok';
  }
  return valueTone(kind, value, reference);
}

function valueCard({ key, value, meta, label = null, reference = null }) {
  return readingCard({ label: label || meta.label, icon: meta.icon, value: numberText(value, meta.digits), unit: meta.unit, tone: metricTone(key, value, reference) });
}

function lastReadingsBlock(rows, key, meta, reference = null, limit = 5) {
  const points = rows.filter((row) => row[key] != null && row.observedAt).slice(-limit).reverse();
  if (!points.length) return '<div class="detail-block"><h4>Últimas mediciones</h4><p class="empty">Sin mediciones registradas.</p></div>';
  return `<div class="detail-block"><h4>Últimas ${points.length} mediciones</h4><div class="detail-readings">${points
    .map((row) => valueCard({ key, value: row[key], meta, label: stampText(row.observedAt), reference })).join('')}</div></div>`;
}

function forecastBlock(item, key) {
  const weather = item.weather || {};
  const days = weather.aemet?.forecast?.days || [];
  const hours = (weather.openMeteo?.hourly || []).slice(0, 12);
  let title = '';
  let rows = [];
  if (key === 'temperatureC') {
    title = 'Temperatura';
    rows = days.length
      ? days.map((day) => ({ when: dayText(`${String(day.date).slice(0, 10)}T12:00:00`), text: `${icon('temperature', { size: 14 })} ${numberText(day.temperatureMinC)}° / ${numberText(day.temperatureMaxC)}°` }))
      : hours.map((hour) => ({ when: stampText(hour.forecastFor), text: `${icon('temperature', { size: 14 })} ${numberText(hour.temperatureC)} °C` }));
  } else if (key === 'humidityPct') {
    title = 'Humedad';
    rows = hours.map((hour) => ({ when: stampText(hour.forecastFor), text: `${icon('humidity', { size: 14 })} ${numberText(hour.humidityPct)} %` }));
  } else if (key === 'precipitationMm') {
    title = 'Precipitación';
    rows = days.length
      ? days.map((day) => ({ when: dayText(`${String(day.date).slice(0, 10)}T12:00:00`), text: `${icon('rain', { size: 14 })} Prob. ${numberText(day.precipitationProbabilityPct, 0)} %` }))
      : hours.map((hour) => ({ when: stampText(hour.forecastFor), text: `${icon('rain', { size: 14 })} ${numberText(hour.precipitationMm)} mm · ${numberText(hour.precipitationProbabilityPct, 0)} %` }));
  } else if (key === 'windKmh' || key === 'windGustKmh') {
    title = key === 'windGustKmh' ? 'Rachas' : 'Viento';
    rows = days.length
      ? days.map((day) => ({ when: dayText(`${String(day.date).slice(0, 10)}T12:00:00`), text: `${icon('wind', { size: 14 })} ${numberText(day.windKmh)} km/h ${escapeText(day.windDirection || '')}` }))
      : hours.map((hour) => ({ when: stampText(hour.forecastFor), text: `${icon('wind', { size: 14 })} ${numberText(key === 'windGustKmh' ? hour.windGustKmh : hour.windKmh)} km/h` }));
  }
  rows = rows.filter((row) => row.text && !/—/.test(row.text));
  if (!rows.length) return '';
  const provider = days.length ? 'AEMET' : 'Open-Meteo';
  return `<div class="detail-block"><h4>Previsión de ${title.toLowerCase()} · ${provider}</h4><div class="weather-days">${rows
    .map((row) => `<div class="weather-day"><strong>${escapeText(row.when)}</strong><span>${escapeText(row.text)}</span></div>`).join('')}</div></div>`;
}

function buildLocalMetricDetail(item, metricKey) {
  const key = metricKey === 'pressurePa' ? 'pressureMbar' : metricKey;
  const meta = METRIC_META[key];
  if (!meta) return null;
  const rows = chartRowsFor(item, key);
  const recentRows = item.trendHistory?.length ? chartRowsFor({ ...item, history: item.trendHistory }, key) : rows;
  const reference = key === 'pressureMbar' ? median(rows.map((row) => row[key])) : null;
  const chart = rows.some((row) => row[key] != null) ? makeChart(meta.label, rows, key, meta.color, meta.unit, meta.digits) : '';
  const observation = item.weather?.aemet?.observation;
  const comparison = key === 'temperatureC' ? temperatureComparisonBlock(item.weather?.comparison)
    : observation && meta.aemet ? `<div class="detail-block"><h4>Referencias independientes</h4><div class="reading-grid">${valueCard({ key, value: rawValue(item.latest, key), meta, label: `${meta.label} · microestación` })}${valueCard({ key, value: observation[meta.aemet], meta, label: `${meta.label} · AEMET` })}</div><p class="hint">No se calcula diferencia para estas lecturas. Microestación: ${dateText(item.latest?.observedAt)} · AEMET ${escapeText(observation.stationId || '')}: ${dateText(observation.observedAt)}.</p></div>` : '';
  return {
    title: `${meta.label} · ${item.device?.name || 'Microestación'}`,
    body: `${chart}${lastReadingsBlock(recentRows, key, meta, reference)}${forecastBlock(item, key)}${comparison}`,
  };
}

function buildAemetMetricDetail(item, metricKey) {
  const meta = AEMET_META[metricKey];
  if (!meta) return null;
  const observation = item.weather?.aemet?.observation;
  const value = observation?.[metricKey];
  const aemetCard = readingCard({ label: `${meta.label} · AEMET`, icon: meta.icon, value: numberText(value, meta.digits), unit: meta.unit, tone: valueTone(meta.kind, value) });
  const header = `<div class="detail-block"><h4>Observación AEMET · ${escapeText(observation?.stationId || '—')}</h4><div class="reading-grid">${readingCard({ label: 'Estación observadora', icon: 'station', value: escapeText(observation?.stationId || '—'), unit: '', tone: 'tone-neutral' })}${aemetCard}<div class="reading-card tone-muted"><span class="reading-label"><span class="reading-icon">${icon('station', { size: 17 })}</span>Medida</span><div class="reading-value"><strong>${escapeText(stampText(observation?.observedAt))}</strong></div></div></div></div>`;
  const blocks = [header];
  if (meta.local) {
    const localMeta = METRIC_META[meta.local];
    const rows = item.trendHistory?.length ? chartRowsFor({ ...item, history: item.trendHistory }, meta.local) : chartRowsFor(item, meta.local);
    const reference = meta.local === 'pressureMbar' ? median(rows.map((row) => row[meta.local])) : null;
    if (meta.local === 'temperatureC') {
      blocks.push(temperatureComparisonBlock(item.weather?.comparison));
    } else {
      blocks.push(`<div class="detail-block"><h4>Referencias independientes · sin diferencia calculada</h4><div class="reading-grid">${valueCard({ key: meta.local, value: rawValue(item.latest, meta.local), meta: localMeta, label: `${localMeta.label} · microestación` })}${aemetCard}</div><p class="hint">Microestación: ${dateText(item.latest?.observedAt)} · AEMET ${escapeText(observation?.stationId || '')}: ${dateText(observation?.observedAt)}.</p></div>`);
    }
    blocks.push(lastReadingsBlock(rows, meta.local, localMeta, reference));
  }
  blocks.push(forecastBlock(item, metricKey === 'pressureHpa' ? 'pressureMbar' : metricKey));
  return { title: `${meta.label} · AEMET`, body: blocks.join('') };
}

function buildSummaryDetail(item) {
  const { device, latest, status, sensors } = item;
  const cards = [
    latest?.temperatureC != null ? valueCard({ key: 'temperatureC', value: latest.temperatureC, meta: METRIC_META.temperatureC }) : '',
    latest?.humidityPct != null ? valueCard({ key: 'humidityPct', value: latest.humidityPct, meta: METRIC_META.humidityPct }) : '',
    latest?.pressurePa != null ? valueCard({ key: 'pressureMbar', value: rawValue(latest, 'pressureMbar'), meta: METRIC_META.pressureMbar }) : '',
    sensors?.battery === false ? '' : valueCard({ key: 'batteryMv', value: latest?.batteryMv, meta: METRIC_META.batteryMv }),
  ].filter(Boolean).join('');
  const facts = [
    ['Estación', device?.name],
    ['Última lectura', dateText(latest?.observedAt)],
    ['Actualidad de datos', status?.dataFreshness === 'stale' ? 'Datos antiguos' : status?.dataFreshness === 'fresh' ? 'Reciente' : 'Sin datos válidos'],
    ['Conectividad', status?.connectivity],
  ].filter(([, value]) => value != null);
  return {
    title: device?.name || 'Microestación',
    body: `<div class="detail-block"><h4>Resumen</h4><div class="reading-grid">${cards}</div></div><div class="detail-block"><h4>Ficha</h4><dl class="detail-grid">${facts.map(([label, value]) => `<dt>${escapeText(label)}</dt><dd>${escapeText(value)}</dd>`).join('')}</dl></div>`,
  };
}

function buildDayDetail(item, isoDate) {
  const weather = item.weather || {};
  const aemetDay = (weather.aemet?.forecast?.days || []).find((day) => String(day.date).slice(0, 10) === isoDate);
  const openDay = (weather.openMeteo?.daily || []).find((day) => String(day.date).slice(0, 10) === isoDate);
  const day = aemetDay || openDay;
  if (!day) return null;
  const hours = (weather.openMeteo?.hourly || []).filter((hour) => String(hour.forecastFor).slice(0, 10) === isoDate);
  const sky = aemetDay?.sky || (openDay ? weatherText(openDay.weatherCode) : 'Sin descripción');
  const cards = [
    readingCard({ label: 'Cielo', icon: 'cloud', value: escapeText(sky), unit: '', tone: 'tone-neutral' }),
    readingCard({ label: 'Temperatura', icon: 'temperature', value: `${numberText(day.temperatureMinC)}° / ${numberText(day.temperatureMaxC)}°`, unit: '', tone: 'tone-normal' }),
    readingCard({ label: 'Precipitación', icon: 'rain', value: numberText(day.precipitationMm), unit: 'mm', tone: 'tone-cool' }),
    readingCard({ label: 'Viento', icon: 'wind', value: numberText(day.windKmh), unit: 'km/h', tone: 'tone-neutral' }),
  ].join('');
  const hourly = hours.length
    ? `<div class="detail-block"><h4>Detalle por horas</h4><div class="weather-hours">${hours
      .map((hour) => `<div><strong>${escapeText(stampText(hour.forecastFor))}</strong><span>${icon('temperature', { size: 15 })} ${numberText(hour.temperatureC)} °C · ${icon('humidity', { size: 15 })} ${numberText(hour.humidityPct)} %</span><span>${icon('rain', { size: 15 })} ${numberText(hour.precipitationMm)} mm · ${icon('wind', { size: 15 })} ${numberText(hour.windKmh)} km/h</span></div>`).join('')}</div></div>`
    : '';
  return {
    title: `Previsión · ${dayText(`${isoDate}T12:00:00`)}`,
    body: `<div class="detail-block"><h4>${aemetDay ? 'AEMET' : 'Open-Meteo'}</h4><div class="reading-grid">${cards}</div></div>${hourly}`,
  };
}

function openMetricModal(key, metric, source, day = null) {
  const item = stationDetails.get(key);
  if (!item) return;
  let built = null;
  if (day) built = buildDayDetail(item, day);
  else if (source === 'aemet') built = buildAemetMetricDetail(item, metric);
  else if (metric === '__summary') built = buildSummaryDetail(item);
  else built = buildLocalMetricDetail(item, metric);
  if (built) openDialog(built.title, built.body);
}

if (typeof document !== 'undefined') {
  document.addEventListener('click', (event) => {
    const target = event.target.closest?.('[data-detail-key]');
    if (!target || event.target.closest('a,button')) return;
    openMetricModal(target.dataset.detailKey, target.dataset.detailMetric, target.dataset.detailSource || 'local', target.dataset.detailDay || null);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const target = event.target.closest?.('[data-detail-key]');
    if (!target) return;
    event.preventDefault();
    openMetricModal(target.dataset.detailKey, target.dataset.detailMetric, target.dataset.detailSource || 'local', target.dataset.detailDay || null);
  });
}

// La flecha acompaña al valor actual, así que describe la hora reciente y no el
// resumen del día; la etiqueta cambia si la ventana reciente se ha degradado.
function trendArrow(history, key) {
  const { recent } = trendWindows(history);
  const direction = chartTrend(recent?.rows || [], key).direction;
  const icon = direction === 'sube' ? '↑' : direction === 'baja' ? '↓' : direction === 'estable' ? '→' : '·';
  const scope = trendPeriodLabel(recent).toLowerCase();
  const description = { sube: `Ascendente · ${scope}`, baja: `Descendente · ${scope}`, estable: `Estable · ${scope}`, insuficiente: `Sin suficientes lecturas en ${scope}` }[direction];
  return `<span class="reading-trend trend-${direction}" role="img" aria-label="${escapeText(description)}" title="${escapeText(description)}">${icon}</span>`;
}

function detailAttrs(key, metric, source = 'local') {
  return ` data-detail-key="${escapeText(key)}" data-detail-metric="${escapeText(metric)}" data-detail-source="${escapeText(source)}" role="button" tabindex="0"`;
}

function readingCard({ label, icon: iconName, value, unit, tone, trend = '', detail = '' }) {
  return `<div class="reading-card ${tone}"${detail}><span class="reading-label"><span class="reading-icon">${icon(iconName, { size: 17 })}</span>${label}</span><div class="reading-value"><strong>${value == null ? '—' : value}</strong><small>${unit || ''}</small>${trend}</div></div>`;
}

function heroBlock({ latest, history, weather, status, detailKey }) {
  const aemetDay = weather?.aemet?.forecast?.days?.[0];
  const openDay = weather?.openMeteo?.daily?.[0];
  const forecast = aemetDay || openDay;
  const currentLocal = status?.dataFreshness !== 'stale';
  // La última medición se mantiene en la tarjeta aunque los datos estén
  // anticuados: el aviso de frescura (etiqueta y badge) evita que se lea como
  // tiempo actual, pero una medida vieja sigue siendo mejor que un guion.
  const temperature = latest?.temperatureC ?? null;
  const temperatureSource = !currentLocal ? 'MICROESTACIÓN · ÚLTIMO DATO ANTIGUO'
    : latest?.temperatureC != null ? 'MICROESTACIÓN · MEDICIÓN DIRECTA' : 'MICROESTACIÓN · SIN MEDICIÓN';
  const forecastProvider = aemetDay ? 'AEMET' : openDay ? 'Open-Meteo' : null;
  const forecastSky = aemetDay?.sky
    ? aemetDay.sky.split(',')[0].trim()
    : (openDay ? weatherText(openDay.weatherCode) : 'Sin previsión disponible');
  const minimum = aemetDay?.temperatureMinC ?? openDay?.temperatureMinC;
  const maximum = aemetDay?.temperatureMaxC ?? openDay?.temperatureMaxC;
  return `<section class="station-hero" data-observed-at="${escapeText(latest?.observedAt || '')}"${detailAttrs(detailKey, '__summary')}>
    <div class="hero-ambient" aria-hidden="true"></div>
    <div class="hero-content">
      <div class="hero-source-row"><span class="hero-local-badge"><span class="source-dot" aria-hidden="true"></span>${temperatureSource}</span>${latest?.temperatureC != null ? trendArrow(history, 'temperatureC') : ''}</div>
      <div class="hero-main">
        <div class="hero-temperature"><strong>${numberText(temperature)}</strong><span>°C</span></div>
        <div class="hero-forecast"><span class="hero-weather-icon">${icon(forecast ? (aemetDay ? 'cloud' : 'cloud') : 'station', { size: 22 })}</span><strong>${escapeText(forecastSky)}</strong><small>${forecastProvider ? `Previsión · ${forecastProvider}` : 'Previsión no disponible'}</small>${minimum != null || maximum != null ? `<small>${numberText(minimum)}° / ${numberText(maximum)}°</small>` : ''}</div>
      </div>
      <div class="hero-readout-footer"><span>Medición local · ${freshness(latest?.observedAt)}</span>${!currentLocal ? '<span class="badge badge-warn">No representa el tiempo actual</span>' : ''}<span class="hero-separator">·</span><span>Humedad ${numberText(latest?.humidityPct)}%</span><span class="hero-separator">·</span><span>Presión ${pressureText(latest?.pressurePa)} mbar</span></div>
    </div>
  </section>`;
}

// La última temperatura registrada: la estación con lectura fresca más
// reciente manda; sin lecturas válidas, la primera de la lista.
export function primaryReading(devices) {
  const candidates = (devices || []).filter((item) =>
    item.status?.dataFreshness === 'fresh' && item.latest?.temperatureC != null)
    .sort((a, b) => new Date(b.latest.observedAt || 0) - new Date(a.latest.observedAt || 0));
  return candidates[0] || devices?.[0] || null;
}

// Tarjeta grande de temperatura como primer bloque visible del panel.
function heroFirstSection(item) {
  if (!item) return '';
  const history = item.history || [];
  const trendHistory = item.trendHistory?.length ? item.trendHistory : history;
  const displayLatest = item.latest?.isValidated ? item.latest : history.at(-1) || null;
  return `<section class="hero-first">
    <p class="eyebrow">ÚLTIMA TEMPERATURA REGISTRADA</p>
    ${heroBlock({ latest: displayLatest, history: trendHistory, weather: item.weather, status: item.status, detailKey: registerDetail(item) })}
  </section>`;
}

// Al abrir el panel, la tarjeta grande recibe el foco, pero el scroll no se
// va con ella: la vista se queda en la cabecera para que el título y el
// selector de periodo sigan visibles (en móvil, centrar la tarjeta los dejaba
// fuera de pantalla). Solo en la primera carga: los refrescos silenciosos no
// mueven el scroll.
function focusHeroSlot(slot) {
  const hero = slot?.querySelector('.station-hero');
  if (!hero || typeof hero.scrollIntoView !== 'function') return;
  hero.focus({ preventScroll: true });
  const heading = slot?.parentElement?.querySelector('.page-heading');
  if (!heading || typeof heading.scrollIntoView !== 'function') return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  heading.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}

function comparisonBlock({ latest, history, trendHistory, weather, sensors, status, detailKey }) {
  const observation = weather?.aemet?.observation;
  const trends = trendHistory?.length ? trendHistory : history;
  const localPressure = pressureMbar(latest?.pressurePa);
  const historyPressure = median(history.map((row) => pressureMbar(row.pressurePa)));
  // Un sensor desactivado no ocupa una tarjeta con un guion: quien lo ha
  // apagado ya lo sabe, y su estado se declara en la ficha del equipo. Aquí solo
  // va lo que la estación está midiendo ahora.
  const local = [
    readingCard({ label: 'Temperatura', icon: 'temperature', value: numberText(latest?.temperatureC), unit: '°C', tone: valueTone('temperature', latest?.temperatureC), trend: trendArrow(trends, 'temperatureC'), detail: detailAttrs(detailKey, 'temperatureC') }),
    readingCard({ label: 'Humedad', icon: 'humidity', value: numberText(latest?.humidityPct), unit: '%', tone: valueTone('humidity', latest?.humidityPct), trend: trendArrow(trends, 'humidityPct'), detail: detailAttrs(detailKey, 'humidityPct') }),
    readingCard({ label: 'Presión', icon: 'pressure', value: pressureText(latest?.pressurePa), unit: 'mbar', tone: valueTone('pressure', localPressure, historyPressure), trend: trendArrow(trends, 'pressurePa'), detail: detailAttrs(detailKey, 'pressurePa') }),
    sensors.battery === false ? '' : readingCard({ label: 'Batería', icon: 'battery', value: numberText(latest?.batteryMv, 0), unit: 'mV', tone: `tone-battery-${status.batteryLevel || 'unknown'}`, trend: trendArrow(trends, 'batteryMv'), detail: detailAttrs(detailKey, 'batteryMv') }),
    ...(sensors.lux === true && latest?.lux != null
      ? [readingCard({ label: 'Iluminancia', icon: 'lux', value: numberText(latest.lux, 0), unit: 'lux', tone: 'tone-normal', trend: trendArrow(trends, 'lux'), detail: detailAttrs(detailKey, 'lux') })]
      : []),
  ].join('');
  const aemetCards = [
    readingCard({ label: 'Temperatura', icon: 'temperature', value: numberText(observation?.temperatureC), unit: '°C', tone: valueTone('temperature', observation?.temperatureC), detail: detailAttrs(detailKey, 'temperatureC', 'aemet') }),
    readingCard({ label: 'Humedad', icon: 'humidity', value: numberText(observation?.humidityPct), unit: '%', tone: valueTone('humidity', observation?.humidityPct), detail: detailAttrs(detailKey, 'humidityPct', 'aemet') }),
    readingCard({ label: 'Presión', icon: 'pressure', value: numberText(observation?.pressureHpa), unit: 'mbar', tone: valueTone('pressure', observation?.pressureHpa, historyPressure), detail: detailAttrs(detailKey, 'pressureHpa', 'aemet') }),
    readingCard({ label: 'Precipitación', icon: 'rain', value: numberText(observation?.precipitationMm), unit: 'mm', tone: valueTone('rain', observation?.precipitationMm), detail: detailAttrs(detailKey, 'precipitationMm', 'aemet') }),
    readingCard({ label: 'Viento', icon: 'wind', value: numberText(observation?.windKmh), unit: 'km/h', tone: valueTone('wind', observation?.windKmh), detail: detailAttrs(detailKey, 'windKmh', 'aemet') }),
    readingCard({ label: 'Racha', icon: 'pressure', value: numberText(observation?.windGustKmh), unit: 'km/h', tone: valueTone('wind', observation?.windGustKmh), detail: detailAttrs(detailKey, 'windGustKmh', 'aemet') }),
  ].join('');
  const observationStatus = weather.aemet?.observationStatus || 'unavailable';
  const observationCacheAge = weather.aemet?.observationAgeSeconds == null ? ''
    : ` · respuesta utilizable hace ${Math.round(weather.aemet.observationAgeSeconds / 60)} min`;
  const aemetStatus = observation
    ? `Estación ${escapeText(observation.stationId)} · medida ${freshness(observation.observedAt)}${observationStatus === 'stale' ? ` · caché antigua${observationCacheAge}` : ''}`
    : observationStatus === 'unconfigured' ? 'Consulta AEMET no configurada'
      : observationStatus === 'empty' ? 'Sin observación en la respuesta AEMET'
        : 'Observación AEMET no disponible';
  const proximity = observation?.proximity;
  const proximityNote = !observation ? ''
    : proximity
      ? `<p class="aemet-proximity">Distancia ${numberText(proximity.distanceKm, 1)} km · altitud AEMET ${proximity.aemetAltitudeM == null ? '—' : `${numberText(proximity.aemetAltitudeM, 0)} m`} · microestación ${proximity.microAltitudeM == null ? '—' : `${numberText(proximity.microAltitudeM, 0)} m`} · AEMET − microestación ${proximity.altitudeDifferenceM == null ? '—' : `${proximity.altitudeDifferenceM > 0 ? '+' : ''}${numberText(proximity.altitudeDifferenceM, 0)} m`}<br><small>Fuentes: ${escapeText(proximity.aemetAltitudeSource || proximity.aemetLocationSource || 'sin metadato AEMET')} · ${escapeText(proximity.microAltitudeSource || proximity.microLocationSource || 'sin metadato local')}. Altitud y distancia describen los emplazamientos; no explican por sí solas la diferencia térmica.</small></p>`
      : '<p class="aemet-proximity">Faltan coordenadas para calcular la distancia y la diferencia de altitud con la microestación.</p>';
  // Viento, precipitación, lux y radiación UV son hoy datos de AEMET o de
  // producto: su lugar es la ficha del equipo y la portada, no la rejilla de
  // lecturas, donde ocupaban cuatro huecos «Próximamente».
  return `<div class="reading-comparison">
    <section class="reading-source local-readings"><div class="reading-source-head"><h3>Microestación</h3><small>Actualizado ${freshness(latest?.observedAt)}</small></div><div class="reading-grid">${local}</div></section>
    <section class="reading-source aemet-readings"><div class="reading-source-head"><h3>AEMET</h3><small>${aemetStatus}</small></div><div class="reading-grid">${aemetCards}</div>${proximityNote}</section>
    ${temperatureComparisonBlock(weather?.comparison)}
    <p class="reading-legend"><span class="legend-swatch legend-green"></span> rango habitual <span class="legend-swatch legend-blue"></span> frío/fresco <span class="legend-swatch legend-amber"></span> precaución <span class="legend-swatch legend-red"></span> extremo. La presión se colorea respecto a la mediana del periodo. Viento y precipitación los aporta AEMET, no esta estación.</p>
  </div>`;
}

const ADVISORY_PATTERNS = {
  helada: /helada|nieve|temperatura/i,
  calor: /calor|temperatura|máxima/i,
  lluvia: /lluvia|precipit|tormenta|chubasco/i,
  viento: /viento|racha/i,
};

function temperatureComparisonBlock(comparison) {
  if (!comparison) return '';
  const local = comparison.local;
  const aemet = comparison.aemet;
  // El titular dice qué se está comparando: la última pareja dentro de la
  // ventana, que no tiene por qué ser la lectura de ahora. Sin ese matiz, dos
  // horas distintas en la misma tarjeta se leen como un error.
  const pairTitle = local?.observedAt && aemet?.observedAt
    ? `Última pareja comparable · ${clockLabel(local.observedAt)}–${clockLabel(aemet.observedAt)}`
    : 'Última pareja comparable';
  if (!local || !aemet) return `<section class="detail-block temperature-comparison"><h4>${pairTitle}</h4><p class="hint">No hay mediciones emparejables. Las observaciones local y AEMET se mantienen independientes.</p></section>`;
  const difference = comparison.state === 'matched' && comparison.differenceC != null
    ? `${comparison.differenceC > 0 ? '+' : ''}${numberText(comparison.differenceC, 1)} °C`
    : 'Sin diferencia directa';
  const offset = comparison.timeOffsetSeconds == null ? ''
    : ` · separación ${Math.abs(comparison.timeOffsetSeconds)} s (microestación ${comparison.timeOffsetSeconds >= 0 ? 'posterior' : 'anterior'})`;
  const reason = comparison.state === 'matched'
    ? `Emparejadas dentro de ±${comparison.windowMinutes} min. Diferencia = microestación − AEMET${offset}.`
    : `No hay pareja dentro de ±${comparison.windowMinutes} min; se muestran ambas horas y no se calcula diferencia${offset}.`;
  const proximity = comparison.proximity;
  const metadata = proximity ? `<p class="aemet-proximity">${numberText(proximity.distanceKm, 1)} km · altitud AEMET ${proximity.aemetAltitudeM == null ? '—' : `${numberText(proximity.aemetAltitudeM, 0)} m`} (${escapeText(proximity.aemetAltitudeSource || 'fuente no disponible')}) · microestación ${proximity.microAltitudeM == null ? '—' : `${numberText(proximity.microAltitudeM, 0)} m`} (${escapeText(proximity.microAltitudeSource || 'fuente no disponible')}).</p>` : '';
  return `<section class="detail-block temperature-comparison"><h4>${pairTitle}</h4><div class="reading-grid">
    ${readingCard({ label: `Microestación · ${escapeText(local.location || 'zona configurada')}`, icon: 'temperature', value: numberText(local.temperatureC), unit: `°C · ${dateText(local.observedAt)}`, tone: 'tone-neutral' })}
    ${readingCard({ label: `AEMET · ${escapeText(aemet.stationId || 'estación')}`, icon: 'station', value: numberText(aemet.temperatureC), unit: `°C · ${dateText(aemet.observedAt)}`, tone: 'tone-neutral' })}
    ${readingCard({ label: 'Microestación − AEMET', icon: 'difference', value: difference, unit: '', tone: comparison.state === 'matched' ? 'tone-neutral' : 'tone-muted' })}
  </div><p class="hint">${escapeText(reason)} Esta comparación no describe el instante presente: usa la pareja más reciente dentro de la ventana, y la lectura de ahora puede ser más nueva. Diferencia positiva: microestación más cálida; negativa: más fría.</p>${metadata}<p class="hint">La diferencia puede relacionarse con distancia, altitud, exposición y entorno. No se atribuye a un único factor.</p></section>`;
}

// Hora corta para titulares de comparación: 22:00, sin fecha ni segundos.
const clockLabel = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
};

function weatherBlock(weather, detailKey) {
  if (!weather?.configured) return '';
  const open = weather.openMeteo;
  const current = open?.current;
  const currentBlock = current && !weather.aemet?.observation ? `<div class="weather-current">
    <div class="weather-current-title"><div><span class="source-tag">Open-Meteo · condición actual estimada</span><h4>${weatherText(current.weatherCode)}</h4></div><small>Actualizado ${freshness(open.fetchedAt)}</small></div>
    <div class="weather-metrics">
      <div><span><span class="weather-icon">${icon('temperature', { size: 15 })}</span> Temperatura</span><strong>${numberText(current.temperatureC)} °C</strong></div>
      <div><span><span class="weather-icon">${icon('humidity', { size: 15 })}</span> Humedad</span><strong>${numberText(current.humidityPct)} %</strong></div>
      <div><span><span class="weather-icon">${icon('rain', { size: 15 })}</span> Lluvia</span><strong>${numberText(current.rainMm ?? current.precipitationMm)} mm</strong></div>
      <div><span><span class="weather-icon">${icon('wind', { size: 15 })}</span> Viento</span><strong>${numberText(current.windKmh)} km/h</strong></div>
      <div><span><span class="weather-icon">${icon('pressure', { size: 15 })}</span> Racha</span><strong>${numberText(current.windGustKmh)} km/h</strong></div>
      <div><span><span class="weather-icon">${icon('compass', { size: 15 })}</span> Presión</span><strong>${numberText(current.pressureHpa, 1)} mbar</strong></div>
    </div>
    <p class="hint">Estimación de modelo para ${escapeText(weather.location)}; no es una observación de la microestación ni de un pluviómetro local.</p>
  </div>` : '';
  const aemetHasForecast = Boolean(weather.aemet?.forecast?.days?.length);
  const openDays = open?.daily || [];
  const hours = aemetHasForecast ? [] : (open?.hourly || []).slice(0, 24).filter((_, index) => index % 3 === 0);
  const hourlyForecast = hours.length ? `<details class="weather-hourly"><summary>Previsión por horas · próximas 24 h</summary><div class="weather-hours">${hours.map((hour) => `<div><strong>${dateText(hour.forecastFor)}</strong><span><span class="weather-icon">${icon('temperature', { size: 15 })}</span> ${numberText(hour.temperatureC)} °C · <span class="weather-icon">${icon('humidity', { size: 15 })}</span> ${numberText(hour.humidityPct)} %</span><span><span class="weather-icon">${icon('rain', { size: 15 })}</span> ${numberText(hour.precipitationMm)} mm${hour.precipitationProbabilityPct != null ? ` · ${numberText(hour.precipitationProbabilityPct, 0)} %` : ''}</span><span><span class="weather-icon">${icon('wind', { size: 15 })}</span> ${numberText(hour.windKmh)} km/h · rachas ${numberText(hour.windGustKmh)} km/h</span></div>`).join('')}</div></details>` : '';
  const openForecast = !aemetHasForecast && openDays.length ? `<div class="weather-provider"><h4>Previsión Open-Meteo · 5 días · actualizado ${freshness(open.fetchedAt)}</h4><div class="weather-days">${openDays.map((day) => `<div class="weather-day"${detailAttrs(detailKey, 'forecast', 'local')} data-detail-day="${escapeText(String(day.date).slice(0, 10))}">
    <strong>${dayText(`${day.date}T12:00:00`)}</strong><span>${weatherText(day.weatherCode)}</span>
    <span><span class="weather-icon">${icon('temperature', { size: 15 })}</span> ${numberText(day.temperatureMinC)}–${numberText(day.temperatureMaxC)} °C</span>
    <span><span class="weather-icon">${icon('rain', { size: 15 })}</span> ${numberText(day.precipitationMm)} mm${day.precipitationProbabilityPct != null ? ` · ${numberText(day.precipitationProbabilityPct, 0)} %` : ''}</span>
    <span><span class="weather-icon">${icon('wind', { size: 15 })}</span> ${numberText(day.windKmh)} km/h · rachas ${numberText(day.windGustKmh)} km/h</span>
  </div>`).join('')}</div>${hourlyForecast}</div>` : hourlyForecast;
  const aemetDays = weather.aemet?.forecast?.days || [];
  const aemetForecastAge = weather.aemet?.forecastStatus === 'stale' && weather.aemet?.forecastAgeSeconds != null
    ? ` · respuesta antigua (${Math.round(weather.aemet.forecastAgeSeconds / 60)} min)` : '';
  const aemetForecast = aemetDays.length ? `<div class="weather-provider"><h4>Previsión municipal AEMET · ${escapeText(weather.aemet.forecast.municipality || weather.location)} · actualizado ${freshness(weather.aemet.forecastFetchedAt)}${aemetForecastAge}</h4><div class="weather-days">${aemetDays.map((day) => `<div class="weather-day"${detailAttrs(detailKey, 'forecast', 'local')} data-detail-day="${escapeText(String(day.date).slice(0, 10))}">
    <strong>${dayText(`${String(day.date).slice(0, 10)}T12:00:00`)}</strong><span>${escapeText(day.sky || 'Sin descripción')}</span>
    <span><span class="weather-icon">${icon('temperature', { size: 15 })}</span> ${numberText(day.temperatureMinC)}–${numberText(day.temperatureMaxC)} °C</span>
    <span><span class="weather-icon">${icon('rain', { size: 15 })}</span> Probabilidad máx. ${numberText(day.precipitationProbabilityPct, 0)} %</span>
    <span><span class="weather-icon">${icon('wind', { size: 15 })}</span> ${numberText(day.windKmh)} km/h ${escapeText(day.windDirection || '')}</span>
  </div>`).join('')}</div></div>` : '';
  const warningStatus = weather.aemet?.warningsStatus || 'unavailable';
  const warningAge = weather.aemet?.warningsAgeSeconds == null ? '' : ` · última consulta hace ${Math.round(weather.aemet.warningsAgeSeconds / 60)} min`;
  const warningStatusText = warningStatus === 'current' ? `Consulta completada ${dateText(weather.aemet?.warningsFetchedAt)}`
    : warningStatus === 'empty' ? `AEMET no devolvió datos (${dateText(weather.aemet?.warningsCheckedAt)}): no se interpreta como ausencia de avisos`
      : warningStatus === 'stale' ? `No se pudo actualizar; se conserva la última respuesta utilizable${warningAge}${weather.aemet?.warnings?.length ? '' : ', que no contiene avisos vigentes'}`
        : warningStatus === 'unconfigured' ? 'Consulta AEMET no configurada para esta zona'
          : 'No se ha podido consultar AEMET';
  const officialAlerts = weather.aemet?.warnings?.length ? `<div class="weather-alert-group"><h4>Avisos oficiales AEMET</h4><p class="hint">${escapeText(warningStatusText)} · área ${escapeText(weather.aemet.warningsAreaCode || 'no indicada')}</p>${weather.aemet.warnings.map((alert) => `<article class="weather-alert official">
    <strong>${escapeText(alert.event || alert.headline || 'Aviso meteorológico')} · ${escapeText(alert.severity || 'Sin nivel')}</strong>
    ${alert.area ? `<span>${escapeText(alert.area)}</span>` : ''}
    ${alert.description ? `<p>${escapeText(alert.description)}</p>` : ''}
    <small>${alert.onset ? `Desde ${dateText(alert.onset)}` : ''}${alert.expires ? ` · hasta ${dateText(alert.expires)}` : ''}</small>
  </article>`).join('')}</div>` : warningStatus === 'current'
    ? `<div class="weather-alert-group"><h4>Avisos oficiales AEMET</h4><p class="hint">Sin avisos vigentes en el área ${escapeText(weather.aemet?.warningsAreaCode || 'configurada')} · consultado ${dateText(weather.aemet?.warningsFetchedAt)}.</p></div>`
      : `<div class="weather-alert-group"><h4>Avisos oficiales AEMET</h4><p class="hint">${escapeText(warningStatusText)}. No se interpreta un fallo de consulta como ausencia de avisos.</p></div>`;
  // Los riesgos orientativos no repiten un fenómeno ya cubierto por un aviso oficial.
  const warningsText = (weather.aemet?.warnings || [])
    .map((alert) => `${alert.event || ''} ${alert.headline || ''} ${alert.description || ''}`).join(' ');
  const advisories = (weather.advisories || []).filter((notice) => {
    const pattern = ADVISORY_PATTERNS[notice.kind];
    return !(pattern && pattern.test(warningsText));
  });
  // El rótulo ya dice «Riesgos orientativos» y nombra al proveedor: la nota solo
// añade el límite que la etiqueta no puede expresar.
const advisoriesBlock = advisories.length ? `<div class="weather-alert-group"><h4>Riesgos orientativos · ${aemetHasForecast ? 'AEMET' : 'Open-Meteo'}</h4>${advisories.map((notice) => `<article class="weather-alert advisory"><strong>${escapeText(notice.text)}</strong><span>${dayText(`${notice.date}T12:00:00`)}</span></article>`).join('')}<p class="hint">Indicadores con umbrales generales, no umbrales específicos del cultivo o ganado.</p></div>` : '';
  const missing = weather.aemetMissing || [];
  // El error crudo («AEMET previsión municipal: 429») no dice qué se conserva ni
  // qué recurso sigue válido: se traduce al estado de cada recurso, separando
  // «no se pudo actualizar» de «no hay nada» (F06).
  const sourceNotes = [
    resourceNote(weather, 'forecast', 'la previsión'),
    resourceNote(weather, 'warnings', 'los avisos oficiales'),
    resourceNote(weather, 'observation', 'la observación de la estación'),
  ].filter(Boolean);
  const notices = [
    missing.length ? `AEMET incompleto: falta ${missing.map(escapeText).join(', ')}. Completa esos datos en la ficha de estación; la API key se configura de forma privada en el servidor.` : null,
    ...sourceNotes,
  ].filter(Boolean);
  const noticeBlock = notices.length ? `<p class="hint">${notices.map(escapeText).join(' ')}</p>` : '';
  if (!currentBlock && !openForecast && !aemetForecast && !officialAlerts && !advisoriesBlock && !noticeBlock) return '';
  return `<section class="weather-panel"><div class="weather-heading"><div><p class="eyebrow">CONTEXTO EXTERNO · ${escapeText(weather.location)}</p><h3>Tiempo en la localidad</h3></div>${originBadge('forecast', { provider: aemetHasForecast ? 'aemet' : 'openmeteo', extra: 'No procede de esta estación.' })}</div>
    ${currentBlock}${aemetHasForecast ? aemetForecast : openForecast}${officialAlerts}${advisoriesBlock}${noticeBlock}
    <p class="weather-attribution">Fuentes: <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a> · <a href="https://www.aemet.es/" target="_blank" rel="noopener noreferrer">AEMET</a></p></section>`;
}

// Tarjeta de estación del panel: estado operativo, cobertura y gráficas
// (el servidor ya excluye lo no validado y lo borrado del histórico).
export function renderStationCard(item, { chartsOnly = false } = {}) {
  const { device, status, latest, history, nearby, summary, weather } = item;
  const detailKey = registerDetail(item);
  const trendHistory = item.trendHistory?.length ? item.trendHistory : history;
  const displayLatest = latest?.isValidated ? latest : history.at(-1) || null;
  const sensors = device.sensors || {};
  // Aquí se declara qué está apagado, que es el sitio donde tiene sentido: en el
// resumen operativo una métrica desactivada ya no aparece.
const sensorState = Object.entries({ Temperatura: sensors.temperature, Humedad: sensors.humidity, Presión: sensors.pressure, Batería: sensors.battery, Lux: sensors.lux })
    .filter(([, ok]) => ok !== undefined)
    .map(([label, ok]) => `${label} ${ok ? 'OK' : 'desactivado, no se mide'}`).join(' · ') || 'Sin sensores configurados';
  const updated = latest?.observedAt || status.lastContact;
  const latestNote = latest
    ? (latest.isValidated
      ? '<span class="badge badge-valid" title="Aceptada por los controles automáticos (rango, marcas del equipo y hora). No demuestra calibración ni exactitud del sensor.">Última lectura aceptada</span>'
      : `<span class="badge badge-invalid" title="${escapeText(latest.invalidatedReason || '')}">Última lectura inválida</span>`)
    : '<span class="badge badge-muted">Sin lecturas</span>';
  const coverage = summary.expected
    ? `Cobertura ${numberText(summary.coverage_pct)} % · ${summary.valid_count} aceptadas por controles · ${summary.invalid_count} inválidas de ${summary.expected} esperadas`
    : 'Sin intervalo configurado para la cobertura';
  const coverageClass = summary.expected && summary.coverage_pct < 90 ? 'warn-box reliability-summary' : 'coverage reliability-summary';
  const nearbyRows = nearby.stations.length
    ? nearby.stations.map((station) => `<div class="nearby-row"><span>${escapeText(station.name)} · última conexión ${dateText(station.lastSeenAt)}</span><strong>${numberText(station.distanceKm, 1)} km</strong></div>`).join('')
    : '';
  const nearbyBlock = nearby.stations.length || !/ubicación.*no configurada/i.test(nearby.message)
    ? `<div class="subsection"><h3>Estaciones cercanas</h3><p class="coverage">${escapeText(nearby.message)} ${nearby.representative ? 'Cobertura representativa disponible.' : 'La cobertura puede ser insuficiente.'}</p>${nearbyRows}</div>`
    : '';

  // En la sección de evolución el valor actual ya está en la cabecera: la
  // tarjeta se reduce a sus gráficas para no repetirlo estación por estación.
  if (chartsOnly) {
    return `<article class="station-card dashboard-station-card">
      <div class="station-head">
        <div>
          <p class="eyebrow">ESTACIÓN · ${escapeText(device.id)}</p>
          <h2><a href="#/estaciones/${encodeURIComponent(device.id)}">${escapeText(device.name)}</a></h2>
          <p class="updated">Actualizado ${freshness(updated)} ${latestNote}</p>
        </div>
        <div class="station-tags">${connectivityBadge(status.connectivity)}${status.dataFreshness === 'stale' ? '<span class="badge badge-warn">Datos antiguos</span>' : status.dataFreshness === 'unknown' ? '<span class="badge badge-muted">Sin datos válidos</span>' : ''}</div>
      </div>
      ${chartSection(history, summary, { detailKey, sensors, trendHistory })}
    </article>`;
  }

  return `<article class="station-card dashboard-station-card">
    <div class="station-head">
      <div>
        <p class="eyebrow">ESTACIÓN · ${escapeText(device.id)}</p>
        <h2><a href="#/estaciones/${encodeURIComponent(device.id)}">${escapeText(device.name)}</a></h2>
        <p class="updated">Actualizado ${freshness(updated)} ${latestNote}</p>
      </div>
      <div class="station-tags">${connectivityBadge(status.connectivity)}${status.dataFreshness === 'stale' ? '<span class="badge badge-warn">Datos antiguos</span>' : status.dataFreshness === 'unknown' ? '<span class="badge badge-muted">Sin datos válidos</span>' : ''}${canEdit() ? `<span class="badge badge-muted">Config v${status.configVersion}</span>` : ''}</div>
    </div>
    ${heroBlock({ latest: displayLatest, history: trendHistory, weather, status, detailKey })}
    ${comparisonBlock({ latest: displayLatest, history, trendHistory, weather, sensors, status, detailKey })}
    ${weatherBlock(weather, detailKey)}
    <div class="${coverageClass}"><strong>Fiabilidad de lecturas</strong><p>${escapeText(coverage)}</p>${summary.expected && summary.coverage_pct < 90 ? '<p>La estación está perdiendo lecturas y requiere revisión de conectividad.</p>' : ''}</div>
    <p class="coverage">Sensores: ${sensorState}</p>
    ${chartSection(history, summary, { detailKey, sensors, trendHistory })}
    ${nearbyBlock}
  </article>`;
}

function renderAlertRow(alert, { technical = false } = {}) {
  const meta = classifyNotice(alert);
  // El valor crudo y la regla son información técnica: solo para administración.
  const raw = technical
    ? ` · dato: ${escapeText(JSON.stringify(alert.value))}`
    : '';
  return `<div class="alert-row">
    <div><strong>${escapeText(alert.deviceName)} · ${escapeText(alert.message)}</strong>
      <div class="alert-detail">${escapeText(meta.origin)}</div>
      <div class="alert-detail">${dateText(alert.observedAt)} · ${escapeText(meta.sourceLabel)} · ${escapeText(meta.natureLabel)}${raw}</div></div>
    <span class="alert-level ${alert.level === 2 ? 'warning' : ''}">${alert.level === 1 ? 'Prioritario' : 'Aviso'}</span>
  </div>`;
}

function renderOpenAlert(alert) {
  const meta = classifyNotice(alert);
  const tone = alert.level === 1 ? 'alert' : 'warn';
  return `<article class="plain-alert tone-${tone}">
    <div class="plain-alert-head"><strong>${escapeText(alert.message)}</strong>
      <span class="overview-tag tone-${tone}">${alert.level === 1 ? 'Prioritario' : 'Aviso'}</span>
      <span class="badge badge-muted">${escapeText(meta.natureLabel)}</span></div>
    <p class="plain-alert-meta">${escapeText(alert.deviceName)} · ${dateText(alert.observedAt)} · ${escapeText(meta.sourceLabel)}</p>
    <p class="plain-alert-meta">${escapeText(meta.origin)}</p>
  </article>`;
}

// Un listado vacío nunca se lee como "no hay riesgo": si faltan datos o la
// previsión está caída, se dice. Si todo está completo, se puede afirmar.
function emptyAlertsHtml(caveat) {
  return caveat
    ? `<p class="warn-box"><strong>Sin avisos abiertos, pero esto no significa que no haya riesgo.</strong> ${escapeText(caveat.text)}</p>`
    : '<p class="ok">No hay alertas abiertas. Estaciones con lecturas actuales y previsión disponible.</p>';
}

// Bloques de documentación comunes a los tres paneles. Se leen cuando se
// necesitan, pero no se atraviesan para consultar el valor de ahora: son
// metodología, calidad de datos y procedencia de las fuentes.
function panelDocumentation() {
  return `
    <details class="technical-details">
      <summary>Qué significa cada etiqueta</summary>
      ${originLegend([
        { kind: 'medido', text: 'Medición directa de la microestación, con su hora. Aceptada por los controles automáticos de rango, marcas del equipo y hora: eso no demuestra calibración ni exactitud.' },
        { kind: 'forecast', provider: 'aemet', text: 'Previsión municipal u observación oficial de AEMET. Si AEMET no está disponible, se usa Open-Meteo y se nombra. Aún no ha ocurrido.' },
        { kind: 'calculated', text: 'Punto de rocío y diferencia con AEMET: valores derivados por fórmula, no observaciones. La diferencia puede relacionarse con distancia, altitud, exposición y entorno, y no se atribuye a un único factor.' },
        { kind: 'status', text: 'Estado observado del equipo o del canal. No es una previsión.' },
      ])}
    </details>
    <details class="technical-details">
      <summary>Metodología y calidad de datos</summary>
      <p class="hint">Las tendencias de cada gráfico son diferencias observadas entre la primera y la última lectura del periodo, no pendientes ajustadas ni pendientes pendientes de corregir.</p>
      <p class="hint">La cobertura son las lecturas recibidas frente a las esperadas según el intervalo configurado, y no una medida del rendimiento del sensor. Las lecturas extrañas no se borran: se marcan como inválidas y siguen visibles, para que el histórico no pueda ocultar un problema de conectividad.</p>
      <p class="hint">Un vacío de avisos nunca significa «no hay riesgo»: si faltan datos o la previsión está caída, el panel lo dice en lugar de tranquilizar.</p>
      <p class="hint">Los avisos propios son orientativos y no son avisos oficiales.</p>
    </details>`;
}

// ---- Refresco visible del panel -------------------------------------------
// El panel se vuelve a consultar cada 15 minutos (REFRESH_MS), pero ese
// intervalo es código, no algo que se vea. El botón «Actualizar» deja pedirlo
// a mano y la marca de «última consulta» dice cuándo se pidió por última vez.
// La consulta es al servidor; la medición es el dato que se muestra en las
// tarjetas. Son cosas distintas y aquí no se nombran igual.
function refreshControls() {
  return `<button type="button" class="quiet" data-refresh>${icon('refresh', { size: 15 })} Actualizar</button>
      <p class="hint refresh-meta" data-refresh-status role="status" aria-live="polite">Última consulta: pendiente.</p>`;
}

// Mientras llega la respuesta no se borra nada: los datos anteriores siguen
// en pantalla y la carga se anuncia en la cabecera, que encabeza todos los
// bloques que la consulta va a tocar.
function createRefreshState(root) {
  const status = $('[data-refresh-status]', root);
  const button = $('[data-refresh]', root);
  let lastQueryAt = null;
  let busy = false;
  const paint = () => {
    if (!status) return;
    if (busy) status.textContent = 'Consultando… se conservan los datos anteriores.';
    else if (lastQueryAt) status.textContent = `Última consulta: ${dateText(lastQueryAt)}`;
    else status.textContent = 'Última consulta: pendiente.';
  };
  const setBusy = (value) => {
    busy = value;
    if (value) root.setAttribute('aria-busy', 'true');
    else root.removeAttribute('aria-busy');
    if (button) button.disabled = value;
    paint();
  };
  paint();
  return {
    begin: () => setBusy(true),
    done: () => { lastQueryAt = new Date().toISOString(); setBusy(false); },
    fail: () => setBusy(false),
  };
}

// Panel sencillo para el agricultor: estado, alertas, próximo riesgo, evolución
// y, al final, el detalle técnico. El administrador usa el completo.
async function renderSimplePanel(root) {
  root.innerHTML = `
    <div class="page-heading">
      <div><p class="eyebrow">TU FINCA</p><h1>Resumen de un vistazo</h1><p class="hint panel-context" data-panel-context></p></div>
      <div class="row-actions">
        <button type="button" class="quiet hidden" data-notify-enable title="Recibir alertas emergentes del navegador">${icon('alerts', { size: 15 })} Alertas emergentes</button>
        <label class="period-label">Periodo del histórico
          <select id="period"><option value="24h">24 horas</option><option value="7d">7 días</option><option value="30d">30 días</option></select>
        </label>
        ${refreshControls()}
      </div>
    </div>
    <p class="error" data-error role="alert"></p>
    <div id="simple-hero" class="hero-first-slot"></div>
    <section class="panel" data-panel-section="estado">
      <div class="section-heading"><div><p class="eyebrow">ESTADO ACTUAL</p><h2>Ahora mismo</h2></div></div>
      <div id="simple-state"></div>
    </section>
    <section class="panel" data-panel-section="avisos">
      <div class="section-heading"><div><p class="eyebrow">ALERTAS ACTIVAS</p><h2>Lo que requiere tu atención</h2></div>
        <a class="link" href="#/avisos">Centro de avisos</a></div>
      <div id="simple-alerts" class="plain-alerts"></div>
      ${originLegend([
        { kind: 'medido', text: 'La regla se cruzó sobre una medida real de tu estación.' },
        { kind: 'forecast', provider: 'aemet', text: 'Riesgo o aviso oficial externo. Aún no ha ocurrido.' },
        { kind: 'status', text: 'Estado del equipo o del canal, observado. No es previsión.' },
      ])}
      <div id="simple-next"></div>
    </section>
    <section class="panel" data-panel-section="evolucion">
      <div class="section-heading"><div><p class="eyebrow">EVOLUCIÓN</p><h2>Gráficos del periodo</h2></div></div>
      <p class="hint">Evolución de mediciones aceptadas por los controles automáticos. El detalle de cada estación está en «Ver detalles técnicos».</p>
      <div id="simple-charts" class="station-list"></div>
      <div class="section-heading"><div><p class="eyebrow">HISTÓRICO</p><h2>Últimos avisos</h2></div>
        <a class="link" href="#/avisos">Ver todos</a></div>
      <div id="simple-history" class="alerts"></div>
    </section>
    <p class="support-line hidden" data-support></p>
    <details class="technical-details" data-panel-section="detalles">
      <summary>Ver detalles técnicos de las estaciones</summary>
      <div id="simple-stations" class="station-list"></div>
      <section class="panel" id="simple-measurements"></section>
      <section class="panel">
        <div class="section-heading"><div><p class="eyebrow">ZONAS</p><h2>Comparación entre zonas</h2></div></div>
        <div id="simple-zones"></div>
        <p class="hint">Sin coordenadas exactas: solo lecturas y diferencias entre tus puntos de medición.</p>
      </section>
      ${panelDocumentation()}
    </details>`;

  resetStationDetails();
  renderSupport(root);
  let heroFocused = false;
  const refresh = createRefreshState(root);
  const loadDashboard = async ({ silent = false } = {}) => {
    if (!silent) $('[data-error]', root).textContent = '';
    refresh.begin();
    try {
      const data = await api(`/api/v1/dashboard?period=${encodeURIComponent($('#period', root).value)}`);
      resetStationDetails();
      setPanelContext(root, data.devices);
      $('#simple-hero', root).innerHTML = heroFirstSection(primaryReading(data.devices));
      $('#simple-state', root).innerHTML = renderStateCards(data.devices);
      const caveat = coverageCaveat(data.devices);
      const engineOk = data.engine_verified !== false;
      const visible = (list) => (engineOk ? list
        : list.filter((alert) => classifyNotice({ ...alert, engineVerified: engineOk }).category !== 'threshold'));
      const open = visible(data.alerts).filter((alert) => !alert.closedAt);
      $('#simple-alerts', root).innerHTML = open.length
        ? open.map(renderOpenAlert).join('')
        : emptyAlertsHtml(caveat);
      $('#simple-next', root).innerHTML = renderNextRisk(nextRisk(data.devices, visible(data.alerts)));
      $('#simple-zones', root).innerHTML = renderZoneComparison(data.devices);
      $('#simple-history', root).innerHTML = visible(data.alerts).length
        ? visible(data.alerts).map((alert) => renderAlertRow(alert, { technical: canEdit() })).join('')
        : `<p class="empty">No hay avisos recientes.</p>${caveatBlock(caveat)}`;
      $('#simple-stations', root).innerHTML = data.devices.length
        ? data.devices.map(renderStationCard).join('')
        : '<section class="panel"><p class="empty">Tu suscripción aún no tiene estaciones vinculadas.</p></section>';
      $('#simple-charts', root).innerHTML = data.devices.length
        ? data.devices.map((item) => renderStationCard(item, { chartsOnly: true })).join('')
        : '<p class="empty">Todavía no hay estaciones que mostrar.</p>';
      surfaceNewAlerts(open);
      refresh.done();
      return data.devices.map((item) => ({ id: item.device.id, name: item.device.name }));
    } catch (error) {
      refresh.fail();
      if (error.message === 'authentication_required' || error.message === 'session_expired') return [];
      $('[data-error]', root).textContent = `No se pudo cargar el panel: ${error.message}`;
      return [];
    }
  };

  const stations = await loadDashboard();
  mountMeasurements($('#simple-measurements', root), { stations });
  $('#period', root).addEventListener('change', loadDashboard);
  $('[data-refresh]', root).addEventListener('click', () => loadDashboard());
  wireNotificationButton(root);

  let refreshTimer = null;
  let inFlight = false;
  const silentRefresh = async () => {
    if (inFlight || document.hidden) return;
    inFlight = true;
    try { await loadDashboard({ silent: true }); } finally { inFlight = false; }
  };
  const startTimer = () => { stopTimer(); refreshTimer = setInterval(silentRefresh, REFRESH_MS); };
  const stopTimer = () => { if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; } };
  const onVisibility = () => { if (document.hidden) stopTimer(); else { silentRefresh(); startTimer(); } };
  document.addEventListener('visibilitychange', onVisibility);
  startTimer();
  return () => { stopTimer(); document.removeEventListener('visibilitychange', onVisibility); };
}

// ---- Panel de demostración para usuarios registrados ----------------------
// Solo lectura y solo sobre estaciones autorizadas para consulta. No
// incluye edición, borrado, reglas, configuración ni administración.
const DEMO_PERIOD_HOURS = { '24h': 24, '7d': 168, '30d': 720 };

const DEMO_EXPLANATIONS = [
  ['Temperatura', 'Es la medida directa del aire. La mínima suele darse de madrugada y la máxima a primera hora de la tarde; por eso se indica la hora de cada extremo.', '°C'],
  ['Humedad', 'Es la humedad relativa: cuánto vapor de agua contiene el aire respecto al máximo que admitiría a esa temperatura. Sube al enfriarse por la noche.', '%'],
  ['Presión', 'Es la presión atmosférica. Se muestra en milibares (1 mbar = 100 Pa). Bajadas rápidas suelen acompañar a cambios de tiempo.', 'mbar'],
];

function demoMetricCard(metric, unit, digits) {
  if (!metric || !metric.count) {
    return `<div class="stat-card"><p class="eyebrow">${escapeText(metric?.label || '')} <small>${escapeText(unit)}</small></p><p class="empty">Sin datos en el periodo.</p></div>`;
  }
  const trend = metric.trend?.direction || 'insuficiente';
  const slope = metric.trend?.slopePerHour != null ? ` · ${numberText(metric.trend.slopePerHour, 3)} ${unit}/h` : '';
  return `<div class="stat-card">
    <p class="eyebrow">${escapeText(metric.label)} <small>${escapeText(unit)}</small></p>
    <div class="stat-row"><span>Mín</span><strong>${numberText(metric.min, digits)}</strong><span>${escapeText(stampText(metric.minAt))}</span></div>
    <div class="stat-row"><span>Máx</span><strong>${numberText(metric.max, digits)}</strong><span>${escapeText(stampText(metric.maxAt))}</span></div>
    <div class="stat-row"><span>Media</span><strong>${numberText(metric.avg, digits)}</strong><span>${metric.count} muestras</span></div>
    <p class="${trend === 'insuficiente' ? 'hint' : 'coverage'}">Tendencia ${escapeText(trend)}${slope}</p>
  </div>`;
}

function demoDailyTable(daily, unit, digits) {
  if (!daily?.length) return '<p class="empty">Sin días completos en el periodo seleccionado.</p>';
  return `<div class="table-wrap"><table>
    <thead><tr><th>Día</th><th>Muestras</th><th>Mín</th><th>Hora mín.</th><th>Máx</th><th>Hora máx.</th><th>Media</th></tr></thead>
    <tbody>${daily.map((day) => `<tr>
      <td>${escapeText(day.date)}</td><td>${day.count}</td>
      <td>${numberText(day.min, digits)} ${escapeText(unit)}</td><td>${escapeText(stampText(day.minAt))}</td>
      <td>${numberText(day.max, digits)} ${escapeText(unit)}</td><td>${escapeText(stampText(day.maxAt))}</td>
      <td>${numberText(day.avg, digits)} ${escapeText(unit)}</td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

// El análisis del periodo se parte en dos salidas porque ocupan lugares
// distintos en la pantalla: el resumen del periodo acompaña a la evolución, y
// todo lo que documenta cómo se ha calculado se pliega en Detalles.
export function renderDemoOverview(data) {
  return `
    <div class="stat-grid">
      ${demoMetricCard(data.metrics.temperature_c, '°C', 1)}
      ${demoMetricCard(data.metrics.humidity_pct, '%', 1)}
      ${demoMetricCard({ ...data.metrics.pressure_pa, min: pressureMbar(data.metrics.pressure_pa.min), max: pressureMbar(data.metrics.pressure_pa.max), avg: pressureMbar(data.metrics.pressure_pa.avg), trend: data.metrics.pressure_pa.trend ? { ...data.metrics.pressure_pa.trend, slopePerHour: pressureMbar(data.metrics.pressure_pa.trend.slopePerHour) } : null }, 'mbar', 1)}
    </div>
    <p class="${data.period.complete ? 'hint' : 'warn-box'}">${escapeText(data.period.note)}</p>`;
}

export function renderDemoDetails(data) {
  const coverage = data.coverage;
  const coverageBlock = `<div class="fact-grid">
    <div><span>Recibidos</span><strong>${coverage.received}</strong></div>
    <div><span>Esperados</span><strong>${coverage.expected ?? '—'}</strong></div>
    <div><span>Cobertura de recibidas</span><strong>${coverage.receivedPct != null ? `${numberText(coverage.receivedPct, 1)} %` : '—'}</strong></div>
    <div><span>Cobertura de aceptadas</span><strong>${coverage.validPct != null ? `${numberText(coverage.validPct, 1)} %` : '—'}</strong></div>
    <div><span>Aceptadas</span><strong>${coverage.valid} (${coverage.invalid} inválidas)</strong></div>
    <div><span>Faltantes por tiempo</span><strong>${coverage.timeMissing ?? '—'}</strong></div>
  </div>`;
  const dew = data.dewPoint;
  const dewBlock = `<p class="coverage">Punto de rocío: <strong>${numberText(dew.value, 1)} °C</strong> <span class="badge badge-muted">Calculado</span>${dew.count ? ` · mín ${numberText(dew.min, 1)} / máx ${numberText(dew.max, 1)} °C en el periodo` : ''}</p>
    <p class="hint">${escapeText(dew.method)} ${(dew.limitations || []).map(escapeText).join(' ')}</p>`;
  const comparison = data.aemet.comparison;
  const aemetBlock = comparison.matched
    ? `<div class="fact-grid">
        <div><span>Parejas (±${comparison.windowMinutes} min)</span><strong>${comparison.matched}</strong></div>
        <div><span>Diferencia media</span><strong>${numberText(comparison.differences.avg, 2)} °C</strong></div>
        <div><span>Rango de diferencia</span><strong>${numberText(comparison.differences.min, 1)} … ${numberText(comparison.differences.max, 1)} °C</strong></div>
      </div><p class="hint">Diferencia = microestación − AEMET. Proveedor AEMET · estación ${escapeText(data.aemet.stationId || '—')} · última observación ${escapeText(stampText(data.aemet.lastObservedAt))}.</p>`
    : `<p class="empty">Sin observaciones AEMET emparejables en el periodo (${data.aemet.observations} observaciones disponibles).</p>`;
  return `
    ${coverageBlock}
    <h3>Resúmenes diarios · temperatura</h3>
    ${demoDailyTable(data.weekly.dailyTemperature, '°C', 1)}
    <h3>Punto de rocío <span class="badge badge-muted">Calculado</span></h3>
    ${dewBlock}
    <h3>Comparación histórica con AEMET <span class="badge badge-muted">Fuente externa</span></h3>
    ${aemetBlock}
    <p class="hint">${(data.limits || []).map(escapeText).join(' ')}</p>
    ${panelDocumentation()}`;
}

// Orden de lectura del panel: resumen actual → avisos relevantes → evolución
// → detalles. Lo que explica, documenta o calcula se pliega en «Detalles» para
// que quien solo viene a consultar el valor de ahora no lo atraviese.
async function renderDemoPanel(root) {
  // Tres palabras con significados que no deben mezclarse: los datos de este
  // panel son REALES (vienen de la estación urbana), el acceso es de CONSULTA y
  // el permiso es de SOLO LECTURA. «Simulación» queda reservado para la
  // demostración con datos inventados de la portada, que nunca entra aquí.
  root.innerHTML = `
    <div class="page-heading">
      <div><p class="eyebrow">ESTACIÓN URBANA REAL · ACCESO DE CONSULTA</p><h1>Panel ampliado</h1>
        <p class="hint">Datos reales medidos por la estación. Solo lectura: este acceso no permite editar, borrar ni configurar nada.</p>
        <p class="hint panel-context" data-panel-context></p></div>
      <div class="row-actions">
        <label class="period-label">Periodo
          <select id="period"><option value="24h">24 horas</option><option value="7d">7 días</option><option value="30d">30 días</option></select>
        </label>
        ${refreshControls()}
      </div>
    </div>
    <p class="error" data-error role="alert"></p>
    <div id="demo-hero" class="hero-first-slot"></div>
    <section class="panel" data-panel-section="estado">
      <div class="section-heading"><div><p class="eyebrow">ESTADO ACTUAL</p><h2>Últimas mediciones</h2></div></div>
      <div id="demo-state"></div>
    </section>
    <section class="panel" data-panel-section="avisos">
      <div class="section-heading"><div><p class="eyebrow">AVISOS</p><h2>Lo que requiere tu atención</h2></div>
        <a class="link" href="#/avisos">Centro de avisos</a></div>
      <div id="demo-alerts" class="plain-alerts"></div>
    </section>
    <section class="panel" data-panel-section="evolucion">
      <div class="section-heading"><div><p class="eyebrow">EVOLUCIÓN</p><h2>Gráficos del periodo</h2></div>
        <label class="period-label">Estación <select id="demo-device"></select></label></div>
      <div id="demo-overview"></div>
      <div id="demo-stations" class="station-list"></div>
    </section>
    <details class="technical-details" data-panel-section="detalles">
      <summary>Ver detalles del periodo y cómo se han calculado</summary>
      <section class="panel">
        <div class="section-heading"><div><p class="eyebrow">DETALLES DEL PERIODO</p><h2>Resúmenes diarios, punto de rocío y comparación con AEMET</h2></div></div>
        <div id="demo-analysis"></div>
      </section>
      <section class="panel">
        <div class="section-heading"><div><p class="eyebrow">CÓMO LEERLO</p><h2>Temperatura, humedad y presión</h2></div></div>
        <div class="fact-grid">${DEMO_EXPLANATIONS.map(([title, text]) => `<div><span>${escapeText(title)}</span><p class="hint">${escapeText(text)}</p></div>`).join('')}</div>
      </section>
      <section class="panel">
        <div class="section-heading"><div><p class="eyebrow">ALCANCE</p><h2>Herramientas ampliadas del registro</h2></div></div>
        <p class="hint">Este panel muestra <strong>estaciones reales autorizadas para consulta</strong> y no permite editar, borrar ni configurar nada. Las estaciones privadas de terceros no son accesibles desde aquí. La simulación con datos inventados está en la portada y nunca aparece en este panel.</p>
      </section>
      <section class="panel">
        <div class="section-heading"><div><p class="eyebrow">CÓMO FUNCIONAN LOS AVISOS</p><h2>Qué llega aquí y por qué</h2></div></div>
        <p class="hint">Registrarte <strong>no te suscribe a los avisos de la estación urbana</strong>: solo verás los avisos de las estaciones que se te concedan expresamente.
          Cada aviso indica su categoría, su fuente, su fecha, su estado y su vigencia, y si es un dato <strong>real</strong>, una <strong>previsión</strong>,
          un <strong>cálculo</strong> o una <strong>simulación</strong>. Los avisos de umbral local solo aparecen cuando el motor de avisos está comprobado,
          y los simulados de la portada nunca se cuelan aquí.</p>
      </section>
    </details>
    <p class="support-line hidden" data-support></p>`;

  resetStationDetails();
  renderSupport(root);
  let lastDevices = [];
  let heroFocused = false;
  const refresh = createRefreshState(root);

  const loadAnalysis = async () => {
    const deviceId = $('#demo-device', root)?.value;
    if (!deviceId) {
      $('#demo-overview', root).innerHTML = '<p class="empty">No hay estaciones autorizadas para consulta.</p>';
      $('#demo-analysis', root).innerHTML = '';
      return;
    }
    const hours = DEMO_PERIOD_HOURS[$('#period', root).value] || 24;
    const to = new Date();
    const from = new Date(to.getTime() - hours * 3600 * 1000);
    try {
      const analysis = await api(`/api/v1/stations/${encodeURIComponent(deviceId)}/demo-analysis?from=${from.toISOString()}&to=${to.toISOString()}`);
      $('#demo-overview', root).innerHTML = renderDemoOverview(analysis);
      $('#demo-analysis', root).innerHTML = renderDemoDetails(analysis);
    } catch (error) {
      $('#demo-overview', root).innerHTML = `<p class="error">No se pudo cargar el análisis: ${escapeText(error.message)}</p>`;
    }
  };

  const load = async () => {
    $('[data-error]', root).textContent = '';
    refresh.begin();
    try {
      const data = await api(`/api/v1/dashboard?period=${encodeURIComponent($('#period', root).value)}`);
      resetStationDetails();
      lastDevices = data.devices || [];
      setPanelContext(root, lastDevices);
      $('#demo-hero', root).innerHTML = heroFirstSection(primaryReading(lastDevices));
      $('#demo-state', root).innerHTML = renderStateCards(lastDevices);
      // Los avisos llegan del mismo /dashboard, ya acotados por el servidor a las
      // estaciones concedidas: aquí no se decide a quién pertenece un aviso.
      const engineOk = data.engine_verified !== false;
      const visible = (list) => (engineOk ? list
        : list.filter((alert) => classifyNotice({ ...alert, engineVerified: engineOk }).category !== 'threshold'));
      const open = visible(data.alerts).filter((alert) => !alert.closedAt);
      const caveat = coverageCaveat(lastDevices);
      $('#demo-alerts', root).innerHTML = open.length
        ? open.map(renderOpenAlert).join('')
        : emptyAlertsHtml(caveat);
      $('#demo-stations', root).innerHTML = lastDevices.length
        ? lastDevices.map((item) => renderStationCard(item, { chartsOnly: true })).join('')
        : '<section class="panel"><p class="empty">Todavía no hay estaciones autorizadas para consulta.</p></section>';
      const select = $('#demo-device', root);
      const previous = select.value;
      select.innerHTML = lastDevices.map((item) => `<option value="${escapeText(item.device.id)}">${escapeText(item.device.name)}</option>`).join('');
      if (lastDevices.some((item) => item.device.id === previous)) select.value = previous;
      if (!heroFocused && lastDevices.length) { heroFocused = true; focusHeroSlot($('#demo-hero', root)); }
      refresh.done();
      await loadAnalysis();
    } catch (error) {
      refresh.fail();
      $('[data-error]', root).textContent = `No se pudo cargar el panel: ${error.message}`;
    }
  };

  $('#period', root).addEventListener('change', load);
  $('#demo-device', root).addEventListener('change', loadAnalysis);
  $('[data-refresh]', root).addEventListener('click', () => load());
  await load();

  let refreshTimer = null;
  const startTimer = () => { stopTimer(); refreshTimer = setInterval(() => { if (!document.hidden) load(); }, REFRESH_MS); };
  const stopTimer = () => { if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; } };
  const onVisibility = () => { if (document.hidden) stopTimer(); else { load(); startTimer(); } };
  document.addEventListener('visibilitychange', onVisibility);
  startTimer();
  return () => { stopTimer(); document.removeEventListener('visibilitychange', onVisibility); };
}

export async function renderPanel(root) {
  if (session.me?.role === 'viewer') return renderDemoPanel(root);
  if (!isAdmin()) return renderSimplePanel(root);
  root.innerHTML = `
    <div class="page-heading">
      <div><p class="eyebrow">ADMINISTRACIÓN · TU FINCA</p><h1>Estado y alertas</h1><p class="hint panel-context" data-panel-context></p></div>
      <div class="row-actions">
        <button type="button" class="quiet hidden" data-notify-enable title="Recibir alertas emergentes del navegador">${icon('alerts', { size: 15 })} Alertas emergentes</button>
        <label class="period-label">Periodo del detalle técnico
          <select id="period"><option value="24h">24 horas</option><option value="7d">7 días</option><option value="30d">30 días</option></select>
        </label>
        ${refreshControls()}
      </div>
    </div>
    <p class="error" data-error role="alert"></p>
    <div id="panel-hero" class="hero-first-slot"></div>
    <section class="panel" data-panel-section="estado">
      <div class="section-heading"><div><p class="eyebrow">ESTADO DE LA FINCA</p><h2>Resumen de un vistazo</h2></div>
        <a class="link" href="#/cuenta">Mis fincas</a></div>
      <div id="panel-overview" class="farm-overview"></div>
    </section>
    <section class="panel" data-panel-section="avisos">
      <div class="section-heading"><div><p class="eyebrow">MIS ALERTAS</p><h2>Alertas abiertas</h2></div>
        <a class="link" href="#/avisos">Centro de avisos</a></div>
      <div id="panel-alerts" class="plain-alerts"></div>
      ${originLegend([
        { kind: 'medido', text: 'La regla se cruzó sobre una medida real de la estación.' },
        { kind: 'forecast', provider: 'aemet', text: 'Riesgo o aviso oficial externo. Aún no ha ocurrido.' },
        { kind: 'status', text: 'Estado del equipo o del canal, observado. No es previsión.' },
      ])}
    </section>
    <section class="panel" data-panel-section="evolucion">
      <div class="section-heading"><div><p class="eyebrow">EVOLUCIÓN</p><h2>Gráficos del periodo</h2></div></div>
      <p class="hint">Evolución de mediciones aceptadas por los controles automáticos. El detalle de cada estación está en «Ver detalle técnico».</p>
      <div id="panel-charts" class="station-list"></div>
      <div class="section-heading"><div><p class="eyebrow">AVISOS</p><h2>Historial reciente</h2></div>
        <a class="link" href="#/avisos">Centro de avisos</a></div>
      <div id="panel-history" class="alerts"></div>
    </section>
    <p class="support-line hidden" data-support></p>
    <details class="technical-details" data-panel-section="detalles">
      <summary>Ver detalle técnico de las estaciones</summary>
      <div id="panel-stations" class="station-list"></div>
      <section class="panel" id="panel-measurements"></section>
      ${panelDocumentation()}
    </details>`;

  resetStationDetails();
  renderSupport(root);
  let heroFocused = false;
  const refresh = createRefreshState(root);
  const loadDashboard = async ({ silent = false } = {}) => {
    if (!silent) $('[data-error]', root).textContent = '';
    refresh.begin();
    try {
      const data = await api(`/api/v1/dashboard?period=${encodeURIComponent($('#period', root).value)}`);
      resetStationDetails();
      setPanelContext(root, data.devices);
      $('#panel-hero', root).innerHTML = heroFirstSection(primaryReading(data.devices));
      const caveat = coverageCaveat(data.devices);
      const engineOk = data.engine_verified !== false;
      const visible = (list) => (engineOk ? list
        : list.filter((alert) => classifyNotice({ ...alert, engineVerified: engineOk }).category !== 'threshold'));
      const open = visible(data.alerts).filter((alert) => !alert.closedAt);
      // El resumen de la finca recibe los mismos avisos abiertos que la sección
      // «Alertas abiertas»: así nunca dice «Todo en orden» con avisos pendientes.
      const overview = summarizeFarms(session.me?.farms || [], data.devices, { alerts: open });
      $('#panel-overview', root).innerHTML = renderFarmOverview(overview, {
        updatedAt: new Date().toISOString(), caveat,
      });
      $('#panel-alerts', root).innerHTML = open.length
        ? open.map(renderOpenAlert).join('')
        : emptyAlertsHtml(caveat);
      $('#panel-stations', root).innerHTML = data.devices.length
        ? data.devices.map(renderStationCard).join('')
        : '<section class="panel"><p class="empty">Tu suscripción aún no tiene estaciones vinculadas.</p></section>';
      // La evolución se ve sin desplegar nada; el detalle de estación queda abajo.
      $('#panel-charts', root).innerHTML = data.devices.length
        ? data.devices.map((item) => renderStationCard(item, { chartsOnly: true })).join('')
        : '<p class="empty">Todavía no hay estaciones que mostrar.</p>';
      $('#panel-history', root).innerHTML = visible(data.alerts).length
        ? visible(data.alerts).map((alert) => renderAlertRow(alert, { technical: canEdit() })).join('')
        : `<p class="empty">No hay avisos recientes.</p>${caveatBlock(caveat)}`;
      surfaceNewAlerts(open);
      if (!heroFocused && data.devices.length) { heroFocused = true; focusHeroSlot($('#panel-hero', root)); }
      refresh.done();
      return data.devices.map((item) => ({ id: item.device.id, name: item.device.name }));
    } catch (error) {
      refresh.fail();
      if (error.message === 'authentication_required' || error.message === 'session_expired') return [];
      $('[data-error]', root).textContent = `No se pudo cargar el panel: ${error.message}`;
      return [];
    }
  };

  const stations = await loadDashboard();
  mountMeasurements($('#panel-measurements', root), { stations });
  $('#period', root).addEventListener('change', loadDashboard);
  $('[data-refresh]', root).addEventListener('click', () => loadDashboard());
  wireNotificationButton(root);

  // Refresco silencioso cada 15 minutos; se pausa mientras la pestaña está oculta.
  let refreshTimer = null;
  let inFlight = false;
  const silentRefresh = async () => {
    if (inFlight || document.hidden) return;
    inFlight = true;
    try { await loadDashboard({ silent: true }); } finally { inFlight = false; }
  };
  const startTimer = () => { stopTimer(); refreshTimer = setInterval(silentRefresh, REFRESH_MS); };
  const stopTimer = () => { if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; } };
  const onVisibility = () => {
    if (document.hidden) stopTimer();
    else { silentRefresh(); startTimer(); }
  };
  document.addEventListener('visibilitychange', onVisibility);
  startTimer();

  return () => {
    stopTimer();
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
