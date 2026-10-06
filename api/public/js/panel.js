import {
  $, api, escapeText, dateText, dayText, numberText, pressureMbar, pressureText, chartTrend,
  chartSection, connectivityBadge, openDialog, makeChart, trendWindowRows,
} from './ui.js';
import { mountMeasurements } from './measurements.js';

const REFRESH_MS = 15 * 60 * 1000;

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
  temperatureC: { label: 'Temperatura', unit: '°C', digits: 1, color: '#c97742', icon: '🌡️', aemet: 'temperatureC' },
  humidityPct: { label: 'Humedad', unit: '%', digits: 1, color: '#168b80', icon: '💧', aemet: 'humidityPct' },
  pressureMbar: { label: 'Presión', unit: 'mbar', digits: 1, color: '#079ab1', icon: '🌬️', aemet: 'pressureHpa' },
  batteryMv: { label: 'Batería', unit: 'mV', digits: 0, color: '#217a4b', icon: '🔋', aemet: null },
  lux: { label: 'Iluminancia', unit: 'lux', digits: 0, color: '#d99a1f', icon: '☀️', aemet: null },
};

const AEMET_META = {
  temperatureC: { label: 'Temperatura', unit: '°C', digits: 1, local: 'temperatureC' },
  humidityPct: { label: 'Humedad', unit: '%', digits: 1, local: 'humidityPct' },
  pressureHpa: { label: 'Presión', unit: 'mbar', digits: 1, local: 'pressureMbar' },
  precipitationMm: { label: 'Precipitación', unit: 'mm', digits: 1, local: null },
  windKmh: { label: 'Viento', unit: 'km/h', digits: 1, local: null },
  windGustKmh: { label: 'Racha', unit: 'km/h', digits: 1, local: null },
};

const rawValue = (row, key) => (key === 'pressureMbar' ? pressureMbar(row?.pressurePa) : row?.[key]);
const chartRowsFor = (item, key) => (key === 'pressureMbar'
  ? (item.history || []).map((row) => ({ ...row, pressureMbar: pressureMbar(row.pressurePa) }))
  : (item.history || []));

function lastReadings(rows, key, meta, limit = 5) {
  const points = rows.filter((row) => row[key] != null && row.observedAt);
  if (!points.length) return '<div class="detail-block"><h4>Últimas mediciones</h4><p class="empty">Sin mediciones registradas.</p></div>';
  const last = points.slice(-limit).reverse();
  return `<div class="detail-block"><h4>Últimas ${last.length} mediciones</h4><table class="detail-table"><thead><tr><th>Hora</th><th>Valor</th></tr></thead><tbody>${last
    .map((row) => `<tr><td>${dateText(row.observedAt)}</td><td>${numberText(row[key], meta.digits)} ${escapeText(meta.unit)}</td></tr>`).join('')}</tbody></table></div>`;
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
      ? days.map((day) => ({ when: dayText(`${String(day.date).slice(0, 10)}T12:00:00`), text: `${numberText(day.temperatureMinC)}° / ${numberText(day.temperatureMaxC)}°` }))
      : hours.map((hour) => ({ when: dateText(hour.forecastFor), text: `${numberText(hour.temperatureC)} °C` }));
  } else if (key === 'humidityPct') {
    title = 'Humedad';
    rows = hours.map((hour) => ({ when: dateText(hour.forecastFor), text: `${numberText(hour.humidityPct)} %` }));
  } else if (key === 'precipitationMm') {
    title = 'Precipitación';
    rows = days.length
      ? days.map((day) => ({ when: dayText(`${String(day.date).slice(0, 10)}T12:00:00`), text: `Prob. ${numberText(day.precipitationProbabilityPct, 0)} %` }))
      : hours.map((hour) => ({ when: dateText(hour.forecastFor), text: `${numberText(hour.precipitationMm)} mm · ${numberText(hour.precipitationProbabilityPct, 0)} %` }));
  } else if (key === 'windKmh' || key === 'windGustKmh') {
    title = key === 'windGustKmh' ? 'Rachas' : 'Viento';
    rows = days.length
      ? days.map((day) => ({ when: dayText(`${String(day.date).slice(0, 10)}T12:00:00`), text: `${numberText(day.windKmh)} km/h ${escapeText(day.windDirection || '')}` }))
      : hours.map((hour) => ({ when: dateText(hour.forecastFor), text: `${numberText(key === 'windGustKmh' ? hour.windGustKmh : hour.windKmh)} km/h` }));
  }
  rows = rows.filter((row) => row.text && !/—/.test(row.text));
  if (!rows.length) return '';
  const provider = days.length ? 'AEMET' : 'Open-Meteo';
  return `<div class="detail-block"><h4>Previsión de ${title.toLowerCase()} · ${provider}</h4><table class="detail-table"><thead><tr><th>Cuándo</th><th>Previsión</th></tr></thead><tbody>${rows
    .map((row) => `<tr><td>${escapeText(row.when)}</td><td>${escapeText(row.text)}</td></tr>`).join('')}</tbody></table></div>`;
}

function buildLocalMetricDetail(item, metricKey) {
  const key = metricKey === 'pressurePa' ? 'pressureMbar' : metricKey;
  const meta = METRIC_META[key];
  if (!meta) return null;
  const rows = chartRowsFor(item, key);
  const recentRows = item.trendHistory?.length ? chartRowsFor({ ...item, history: item.trendHistory }, key) : rows;
  const chart = rows.some((row) => row[key] != null) ? makeChart(meta.label, rows, key, meta.color, meta.unit, meta.digits) : '';
  const observation = item.weather?.aemet?.observation;
  const aemetValue = meta.aemet && observation ? observation[meta.aemet] : null;
  const comparison = observation
    ? `<div class="detail-block"><h4>Comparación con AEMET</h4><div class="fact-grid"><div><span>Microestación</span><strong>${numberText(rawValue(item.latest, key), meta.digits)} ${escapeText(meta.unit)}</strong></div><div><span>AEMET</span><strong>${aemetValue == null ? '—' : `${numberText(aemetValue, meta.digits)} ${escapeText(meta.unit)}`}</strong></div></div><p class="hint">AEMET ${escapeText(observation.stationId || '')} · ${dateText(observation.observedAt)}</p></div>`
    : '';
  return {
    title: `${meta.label} · ${item.device?.name || 'Microestación'}`,
    body: `${chart}${lastReadings(recentRows, key, meta)}${forecastBlock(item, key)}${comparison}`,
  };
}

function buildAemetMetricDetail(item, metricKey) {
  const meta = AEMET_META[metricKey];
  if (!meta) return null;
  const observation = item.weather?.aemet?.observation;
  const value = observation?.[metricKey];
  const blocks = [`<div class="detail-block"><h4>Observación AEMET</h4><div class="fact-grid"><div><span>Estación</span><strong>${escapeText(observation?.stationId || '—')}</strong></div><div><span>${escapeText(meta.label)}</span><strong>${numberText(value, meta.digits)} ${escapeText(meta.unit)}</strong></div></div><p class="hint">Medida ${dateText(observation?.observedAt)}</p></div>`];
  if (meta.local) {
    const localMeta = METRIC_META[meta.local];
    const rows = item.trendHistory?.length ? chartRowsFor({ ...item, history: item.trendHistory }, meta.local) : chartRowsFor(item, meta.local);
    blocks.push(`<div class="detail-block"><h4>Comparación con la microestación</h4><div class="fact-grid"><div><span>Microestación</span><strong>${numberText(rawValue(item.latest, meta.local), localMeta.digits)} ${escapeText(localMeta.unit)}</strong></div><div><span>AEMET</span><strong>${numberText(value, meta.digits)} ${escapeText(meta.unit)}</strong></div></div></div>`);
    blocks.push(lastReadings(rows, meta.local, localMeta));
  }
  blocks.push(forecastBlock(item, metricKey === 'pressureHpa' ? 'pressureMbar' : metricKey));
  return { title: `${meta.label} · AEMET`, body: blocks.join('') };
}

function buildSummaryDetail(item) {
  const { device, latest, status, sensors } = item;
  const facts = [
    ['Estación', device?.name],
    ['Última lectura', dateText(latest?.observedAt)],
    ['Temperatura', latest?.temperatureC == null ? null : `${numberText(latest.temperatureC)} °C`],
    ['Humedad', latest?.humidityPct == null ? null : `${numberText(latest.humidityPct)} %`],
    ['Presión', `${pressureText(latest?.pressurePa)} mbar`],
    ['Batería', sensors?.battery === false ? 'Desactivada' : `${numberText(latest?.batteryMv, 0)} mV`],
    ['Conectividad', status?.connectivity],
  ].filter(([, value]) => value != null);
  return {
    title: device?.name || 'Microestación',
    body: `<div class="detail-block"><h4>Resumen</h4><dl class="detail-grid">${facts.map(([label, value]) => `<dt>${escapeText(label)}</dt><dd>${escapeText(value)}</dd>`).join('')}</dl></div>`,
  };
}

function buildDayDetail(item, isoDate) {
  const weather = item.weather || {};
  const aemetDay = (weather.aemet?.forecast?.days || []).find((day) => String(day.date).slice(0, 10) === isoDate);
  const openDay = (weather.openMeteo?.daily || []).find((day) => String(day.date).slice(0, 10) === isoDate);
  const day = aemetDay || openDay;
  if (!day) return null;
  const hours = (weather.openMeteo?.hourly || []).filter((hour) => String(hour.forecastFor).slice(0, 10) === isoDate);
  const facts = [
    ['Cielo', aemetDay?.sky || (openDay ? weatherText(openDay.weatherCode) : null)],
    ['Temperatura', `${numberText(day.temperatureMinC)}° / ${numberText(day.temperatureMaxC)}°`],
    ['Precipitación', aemetDay ? `Prob. ${numberText(aemetDay.precipitationProbabilityPct, 0)} %` : `${numberText(day.precipitationMm)} mm`],
    ['Viento', `${numberText(day.windKmh)} km/h ${escapeText(day.windDirection || '')}`],
  ].filter(([, value]) => value && value !== '—');
  const hourly = hours.length
    ? `<div class="detail-block"><h4>Detalle por horas</h4><table class="detail-table"><thead><tr><th>Hora</th><th>Temp.</th><th>Humedad</th><th>Lluvia</th><th>Viento</th></tr></thead><tbody>${hours
      .map((hour) => `<tr><td>${dateText(hour.forecastFor)}</td><td>${numberText(hour.temperatureC)} °C</td><td>${numberText(hour.humidityPct)} %</td><td>${numberText(hour.precipitationMm)} mm</td><td>${numberText(hour.windKmh)} km/h</td></tr>`).join('')}</tbody></table></div>`
    : '';
  return {
    title: `Previsión · ${dayText(`${isoDate}T12:00:00`)}`,
    body: `<div class="detail-block"><h4>${aemetDay ? 'AEMET' : 'Open-Meteo'}</h4><div class="fact-grid">${facts.map(([label, value]) => `<div><span>${escapeText(label)}</span><strong>${escapeText(value)}</strong></div>`).join('')}</div></div>${hourly}`,
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

function trendArrow(history, key) {
  const direction = chartTrend(trendWindowRows(history), key).direction;
  const icon = direction === 'sube' ? '↑' : direction === 'baja' ? '↓' : direction === 'estable' ? '→' : '·';
  const description = { sube: 'Tendencia ascendente del día', baja: 'Tendencia descendente del día', estable: 'Tendencia estable', insuficiente: 'Tendencia sin suficientes datos' }[direction];
  return `<span class="reading-trend trend-${direction}" role="img" aria-label="${description}" title="${description}">${icon}</span>`;
}

function detailAttrs(key, metric, source = 'local') {
  return ` data-detail-key="${escapeText(key)}" data-detail-metric="${escapeText(metric)}" data-detail-source="${escapeText(source)}" role="button" tabindex="0"`;
}

function readingCard({ label, icon, value, unit, tone, trend = '', detail = '' }) {
  return `<div class="reading-card ${tone}"${detail}><span class="reading-label"><span class="reading-icon" aria-hidden="true">${icon}</span>${label}</span><div class="reading-value"><strong>${value == null ? '—' : value}</strong><small>${unit || ''}</small>${trend}</div></div>`;
}

function heroBlock({ latest, history, weather, detailKey }) {
  const temperature = latest?.temperatureC ?? weather?.aemet?.observation?.temperatureC ?? weather?.openMeteo?.current?.temperatureC;
  const temperatureSource = latest?.temperatureC != null ? 'MICROESTACIÓN · MEDICIÓN DIRECTA'
    : weather?.aemet?.observation?.temperatureC != null ? 'AEMET · OBSERVACIÓN REAL'
      : weather?.openMeteo?.current?.temperatureC != null ? 'OPEN-METEO · ESTIMACIÓN' : 'TEMPERATURA · SIN DATO';
  return `<section class="station-hero"${detailAttrs(detailKey, '__summary')}>
    <div class="hero-ambient" aria-hidden="true"></div>
    <div class="hero-content">
      <div class="hero-source-row"><span class="hero-local-badge"><span aria-hidden="true">●</span> ${temperatureSource}</span>${latest?.temperatureC != null ? trendArrow(history, 'temperatureC') : ''}</div>
      <div class="hero-main">
        <div class="hero-temperature"><strong>${numberText(temperature)}</strong><span>°C</span></div>
      </div>
      <div class="hero-readout-footer"><span>Microestación · ${dateText(latest?.observedAt)}</span><span class="hero-separator">·</span><span>Humedad ${numberText(latest?.humidityPct)}%</span><span class="hero-separator">·</span><span>Presión ${pressureText(latest?.pressurePa)} mbar</span></div>
    </div>
  </section>`;
}

function comparisonBlock({ latest, history, trendHistory, weather, sensors, status, detailKey }) {
  const observation = weather?.aemet?.observation;
  const trends = trendHistory?.length ? trendHistory : history;
  const localPressure = pressureMbar(latest?.pressurePa);
  const historyPressure = median(history.map((row) => pressureMbar(row.pressurePa)));
  const local = [
    readingCard({ label: 'Temperatura', icon: '🌡️', value: numberText(latest?.temperatureC), unit: '°C', tone: valueTone('temperature', latest?.temperatureC), trend: trendArrow(trends, 'temperatureC'), detail: detailAttrs(detailKey, 'temperatureC') }),
    readingCard({ label: 'Humedad', icon: '💧', value: numberText(latest?.humidityPct), unit: '%', tone: valueTone('humidity', latest?.humidityPct), trend: trendArrow(trends, 'humidityPct'), detail: detailAttrs(detailKey, 'humidityPct') }),
    readingCard({ label: 'Presión', icon: '🌬️', value: pressureText(latest?.pressurePa), unit: 'mbar', tone: valueTone('pressure', localPressure, historyPressure), trend: trendArrow(trends, 'pressurePa'), detail: detailAttrs(detailKey, 'pressurePa') }),
    readingCard({ label: 'Batería', icon: '🔋', value: sensors.battery === false ? '—' : numberText(latest?.batteryMv, 0), unit: sensors.battery === false ? 'Desactivada' : 'mV', tone: sensors.battery === false ? 'tone-muted' : `tone-battery-${status.batteryLevel || 'unknown'}`, trend: trendArrow(trends, 'batteryMv'), detail: detailAttrs(detailKey, 'batteryMv') }),
    ...(sensors.lux === true && latest?.lux != null
      ? [readingCard({ label: 'Iluminancia', icon: '☀️', value: numberText(latest.lux, 0), unit: 'lux', tone: 'tone-normal', trend: trendArrow(trends, 'lux'), detail: detailAttrs(detailKey, 'lux') })]
      : []),
  ].join('');
  const aemetCards = [
    readingCard({ label: 'Temperatura', icon: '🌡️', value: numberText(observation?.temperatureC), unit: '°C', tone: valueTone('temperature', observation?.temperatureC), detail: detailAttrs(detailKey, 'temperatureC', 'aemet') }),
    readingCard({ label: 'Humedad', icon: '💧', value: numberText(observation?.humidityPct), unit: '%', tone: valueTone('humidity', observation?.humidityPct), detail: detailAttrs(detailKey, 'humidityPct', 'aemet') }),
    readingCard({ label: 'Presión', icon: '🌬️', value: numberText(observation?.pressureHpa), unit: 'mbar', tone: valueTone('pressure', observation?.pressureHpa, historyPressure), detail: detailAttrs(detailKey, 'pressureHpa', 'aemet') }),
    readingCard({ label: 'Precipitación', icon: '🌧️', value: numberText(observation?.precipitationMm), unit: 'mm', tone: valueTone('rain', observation?.precipitationMm), detail: detailAttrs(detailKey, 'precipitationMm', 'aemet') }),
    readingCard({ label: 'Viento', icon: '💨', value: numberText(observation?.windKmh), unit: 'km/h', tone: valueTone('wind', observation?.windKmh), detail: detailAttrs(detailKey, 'windKmh', 'aemet') }),
    readingCard({ label: 'Racha', icon: '🌬️', value: numberText(observation?.windGustKmh), unit: 'km/h', tone: valueTone('wind', observation?.windGustKmh), detail: detailAttrs(detailKey, 'windGustKmh', 'aemet') }),
  ].join('');
  const aemetStatus = observation
    ? `Estación ${escapeText(observation.stationId)} · medida ${dateText(observation.observedAt)}`
    : 'Observación AEMET no disponible';
  const proximity = observation?.proximity;
  const proximityNote = !observation ? ''
    : proximity
      ? `<p class="aemet-proximity">Distancia ${numberText(proximity.distanceKm, 1)} km · altitud AEMET ${proximity.aemetAltitudeM == null ? '—' : `${numberText(proximity.aemetAltitudeM, 0)} m`} · microestación ${proximity.microAltitudeM == null ? '—' : `${numberText(proximity.microAltitudeM, 0)} m`} · diferencia ${proximity.altitudeDifferenceM == null ? '—' : `${numberText(proximity.altitudeDifferenceM, 0)} m`}</p>`
      : '<p class="aemet-proximity">Faltan coordenadas para calcular la distancia y la diferencia de altitud con la microestación.</p>';
  const upcoming = [
    ['💨', 'Viento'], ['🌧️', 'Precipitación'],
    ...(sensors.lux === true && latest?.lux != null ? [] : [['☀️', 'Lux']]),
    ['🔆', 'Radiación UV'],
  ].map(([icon, label]) => `<div class="upcoming-sensor"><span class="upcoming-icon" aria-hidden="true">${icon}</span><span>${label}</span><span class="upcoming-badge">Próximamente</span></div>`).join('');
  return `<div class="reading-comparison">
    <section class="reading-source local-readings"><div class="reading-source-head"><h3>Microestación</h3><small>${dateText(latest?.observedAt)}</small></div><div class="reading-grid">${local}</div></section>
    <section class="reading-source aemet-readings"><div class="reading-source-head"><h3>AEMET</h3><small>${aemetStatus}</small></div><div class="reading-grid">${aemetCards}</div>${proximityNote}</section>
    <section class="upcoming-sensors-panel"><div class="upcoming-heading"><h3>Próximas mediciones locales</h3><small>AEMET aporta ahora viento y precipitación</small></div><div class="upcoming-grid">${upcoming}</div></section>
    <p class="reading-legend"><span class="legend-green">●</span> rango habitual <span class="legend-blue">●</span> frío/fresco <span class="legend-amber">●</span> precaución <span class="legend-red">●</span> extremo. La presión se colorea respecto a la mediana del periodo.</p>
  </div>`;
}

const ADVISORY_PATTERNS = {
  helada: /helada|nieve|temperatura/i,
  calor: /calor|temperatura|máxima/i,
  lluvia: /lluvia|precipit|tormenta|chubasco/i,
  viento: /viento|racha/i,
};

function weatherBlock(weather, detailKey) {
  if (!weather?.configured) return '';
  const open = weather.openMeteo;
  const current = open?.current;
  const currentBlock = current && !weather.aemet?.observation ? `<div class="weather-current">
    <div class="weather-current-title"><div><span class="source-tag">Open-Meteo · condición actual estimada</span><h4>${weatherText(current.weatherCode)}</h4></div><small>Actualizado ${dateText(open.fetchedAt)}</small></div>
    <div class="weather-metrics">
      <div><span><span class="weather-icon" aria-hidden="true">🌡️</span> Temperatura</span><strong>${numberText(current.temperatureC)} °C</strong></div>
      <div><span><span class="weather-icon" aria-hidden="true">💧</span> Humedad</span><strong>${numberText(current.humidityPct)} %</strong></div>
      <div><span><span class="weather-icon" aria-hidden="true">🌧️</span> Lluvia</span><strong>${numberText(current.rainMm ?? current.precipitationMm)} mm</strong></div>
      <div><span><span class="weather-icon" aria-hidden="true">💨</span> Viento</span><strong>${numberText(current.windKmh)} km/h</strong></div>
      <div><span><span class="weather-icon" aria-hidden="true">🌬️</span> Racha</span><strong>${numberText(current.windGustKmh)} km/h</strong></div>
      <div><span><span class="weather-icon" aria-hidden="true">🧭</span> Presión</span><strong>${numberText(current.pressureHpa, 1)} mbar</strong></div>
    </div>
    <p class="hint">Estimación de modelo para ${escapeText(weather.location)}; no es una observación de la microestación ni de un pluviómetro local.</p>
  </div>` : '';
  const aemetHasForecast = Boolean(weather.aemet?.forecast?.days?.length);
  const openDays = open?.daily || [];
  const hours = aemetHasForecast ? [] : (open?.hourly || []).slice(0, 24).filter((_, index) => index % 3 === 0);
  const hourlyForecast = hours.length ? `<details class="weather-hourly"><summary>Previsión por horas · próximas 24 h</summary><div class="weather-hours">${hours.map((hour) => `<div><strong>${dateText(hour.forecastFor)}</strong><span><span class="weather-icon" aria-hidden="true">🌡️</span> ${numberText(hour.temperatureC)} °C · <span class="weather-icon" aria-hidden="true">💧</span> ${numberText(hour.humidityPct)} %</span><span><span class="weather-icon" aria-hidden="true">🌧️</span> ${numberText(hour.precipitationMm)} mm${hour.precipitationProbabilityPct != null ? ` · ${numberText(hour.precipitationProbabilityPct, 0)} %` : ''}</span><span><span class="weather-icon" aria-hidden="true">💨</span> ${numberText(hour.windKmh)} km/h · rachas ${numberText(hour.windGustKmh)} km/h</span></div>`).join('')}</div></details>` : '';
  const openForecast = !aemetHasForecast && openDays.length ? `<div class="weather-provider"><h4>Previsión Open-Meteo · 5 días</h4><div class="weather-days">${openDays.map((day) => `<div class="weather-day"${detailAttrs(detailKey, 'forecast', 'local')} data-detail-day="${escapeText(String(day.date).slice(0, 10))}">
    <strong>${dayText(`${day.date}T12:00:00`)}</strong><span>${weatherText(day.weatherCode)}</span>
    <span><span class="weather-icon" aria-hidden="true">🌡️</span> ${numberText(day.temperatureMinC)}–${numberText(day.temperatureMaxC)} °C</span>
    <span><span class="weather-icon" aria-hidden="true">🌧️</span> ${numberText(day.precipitationMm)} mm${day.precipitationProbabilityPct != null ? ` · ${numberText(day.precipitationProbabilityPct, 0)} %` : ''}</span>
    <span><span class="weather-icon" aria-hidden="true">💨</span> ${numberText(day.windKmh)} km/h · rachas ${numberText(day.windGustKmh)} km/h</span>
  </div>`).join('')}</div>${hourlyForecast}</div>` : hourlyForecast;
  const aemetDays = weather.aemet?.forecast?.days || [];
  const aemetForecast = aemetDays.length ? `<div class="weather-provider"><h4>Previsión municipal AEMET · ${escapeText(weather.aemet.forecast.municipality || weather.location)}</h4><div class="weather-days">${aemetDays.map((day) => `<div class="weather-day"${detailAttrs(detailKey, 'forecast', 'local')} data-detail-day="${escapeText(String(day.date).slice(0, 10))}">
    <strong>${dayText(`${String(day.date).slice(0, 10)}T12:00:00`)}</strong><span>${escapeText(day.sky || 'Sin descripción')}</span>
    <span><span class="weather-icon" aria-hidden="true">🌡️</span> ${numberText(day.temperatureMinC)}–${numberText(day.temperatureMaxC)} °C</span>
    <span><span class="weather-icon" aria-hidden="true">🌧️</span> Probabilidad máx. ${numberText(day.precipitationProbabilityPct, 0)} %</span>
    <span><span class="weather-icon" aria-hidden="true">💨</span> ${numberText(day.windKmh)} km/h ${escapeText(day.windDirection || '')}</span>
  </div>`).join('')}</div></div>` : '';
  const officialAlerts = weather.aemet?.warnings?.length ? `<div class="weather-alert-group"><h4>Avisos oficiales AEMET</h4>${weather.aemet.warnings.map((alert) => `<article class="weather-alert official">
    <strong>${escapeText(alert.event || alert.headline || 'Aviso meteorológico')} · ${escapeText(alert.severity || 'Sin nivel')}</strong>
    ${alert.area ? `<span>${escapeText(alert.area)}</span>` : ''}
    ${alert.description ? `<p>${escapeText(alert.description)}</p>` : ''}
    <small>${alert.onset ? `Desde ${dateText(alert.onset)}` : ''}${alert.expires ? ` · hasta ${dateText(alert.expires)}` : ''}</small>
  </article>`).join('')}</div>` : '';
  // Los riesgos orientativos no repiten un fenómeno ya cubierto por un aviso oficial.
  const warningsText = (weather.aemet?.warnings || [])
    .map((alert) => `${alert.event || ''} ${alert.headline || ''} ${alert.description || ''}`).join(' ');
  const advisories = (weather.advisories || []).filter((notice) => {
    const pattern = ADVISORY_PATTERNS[notice.kind];
    return !(pattern && pattern.test(warningsText));
  });
  const advisoriesBlock = advisories.length ? `<div class="weather-alert-group"><h4>Riesgos orientativos · ${aemetHasForecast ? 'AEMET' : 'Open-Meteo'}</h4>${advisories.map((notice) => `<article class="weather-alert advisory"><strong>${escapeText(notice.text)}</strong><span>${dayText(`${notice.date}T12:00:00`)}</span></article>`).join('')}<p class="hint">Indicadores preventivos con umbrales generales; no son avisos oficiales ni sustituyen umbrales específicos del cultivo o ganado.</p></div>` : '';
  const missing = weather.aemetMissing || [];
  const errors = [...new Set(weather.errors || [])];
  const notices = [
    missing.length ? `AEMET incompleto: falta ${missing.map(escapeText).join(', ')}. Completa esos datos en la ficha de estación; la API key se configura de forma privada en el servidor.` : null,
    ...errors,
  ].filter(Boolean);
  const noticeBlock = notices.length ? `<p class="hint">${notices.join(' ')}</p>` : '';
  if (!currentBlock && !openForecast && !aemetForecast && !officialAlerts && !advisoriesBlock && !noticeBlock) return '';
  return `<section class="weather-panel"><div class="weather-heading"><div><p class="eyebrow">CONTEXTO EXTERNO · ${escapeText(weather.location)}</p><h3>Tiempo en la localidad</h3></div><span class="badge badge-muted">Fuentes externas, separadas de las mediciones</span></div>
    ${currentBlock}${aemetHasForecast ? aemetForecast : openForecast}${officialAlerts}${advisoriesBlock}${noticeBlock}
    <p class="weather-attribution">Fuentes: <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a> · <a href="https://www.aemet.es/" target="_blank" rel="noopener noreferrer">AEMET</a></p></section>`;
}

// Tarjeta de estación del panel: estado operativo, cobertura y gráficas
// (el servidor ya excluye lo no validado y lo borrado del histórico).
export function renderStationCard(item) {
  const { device, status, latest, history, nearby, summary, weather } = item;
  const detailKey = registerDetail(item);
  const trendHistory = item.trendHistory?.length ? item.trendHistory : history;
  const displayLatest = latest?.isValidated ? latest : history.at(-1) || null;
  const sensors = device.sensors || {};
  const sensorState = Object.entries({ Temperatura: sensors.temperature, Humedad: sensors.humidity, Presión: sensors.pressure, Batería: sensors.battery, Lux: sensors.lux })
    .filter(([, ok]) => ok !== undefined)
    .map(([label, ok]) => `${label} ${ok ? 'OK' : 'desactivado'}`).join(' · ') || 'Sin sensores configurados';
  const updated = latest?.observedAt || status.lastContact;
  const latestNote = latest
    ? (latest.isValidated
      ? '<span class="badge badge-valid">Última lectura validada</span>'
      : `<span class="badge badge-invalid" title="${escapeText(latest.invalidatedReason || '')}">Última lectura inválida</span>`)
    : '<span class="badge badge-muted">Sin lecturas</span>';
  const coverage = summary.expected
    ? `Cobertura ${numberText(summary.coverage_pct)} % · ${summary.valid_count} válidas · ${summary.invalid_count} inválidas de ${summary.expected} esperadas`
    : 'Sin intervalo configurado para la cobertura';
  const coverageClass = summary.expected && summary.coverage_pct < 90 ? 'warn-box reliability-summary' : 'coverage reliability-summary';
  const nearbyRows = nearby.stations.length
    ? nearby.stations.map((station) => `<div class="nearby-row"><span>${escapeText(station.name)} · última conexión ${dateText(station.lastSeenAt)}</span><strong>${numberText(station.distanceKm, 1)} km</strong></div>`).join('')
    : '';
  const nearbyBlock = nearby.stations.length || !/ubicación.*no configurada/i.test(nearby.message)
    ? `<div class="subsection"><h3>Estaciones cercanas</h3><p class="coverage">${escapeText(nearby.message)} ${nearby.representative ? 'Cobertura representativa disponible.' : 'La cobertura puede ser insuficiente.'}</p>${nearbyRows}</div>`
    : '';

  return `<article class="station-card dashboard-station-card">
    <div class="station-head">
      <div>
        <p class="eyebrow">ESTACIÓN · ${escapeText(device.id)}</p>
        <h2><a href="#/estaciones/${encodeURIComponent(device.id)}">${escapeText(device.name)}</a></h2>
        <p class="updated">Última actualización: ${dateText(updated)} ${latestNote}</p>
      </div>
      <div class="station-tags">${connectivityBadge(status.connectivity)}<span class="badge badge-muted">Config v${status.configVersion}</span></div>
    </div>
    ${heroBlock({ latest: displayLatest, history: trendHistory, weather, detailKey })}
    ${comparisonBlock({ latest: displayLatest, history, trendHistory, weather, sensors, status, detailKey })}
    ${weatherBlock(weather, detailKey)}
    <div class="${coverageClass}"><strong>Fiabilidad de lecturas</strong><p>${escapeText(coverage)}</p>${summary.expected && summary.coverage_pct < 90 ? '<p>La estación está perdiendo lecturas y requiere revisión de conectividad.</p>' : ''}</div>
    <p class="coverage">Sensores: ${sensorState}</p>
    ${chartSection(history, summary, { detailKey, sensors, trendHistory })}
    ${nearbyBlock}
  </article>`;
}

function renderAlertRow(alert) {
  return `<div class="alert-row">
    <div><strong>${escapeText(alert.deviceName)} · ${escapeText(alert.message)}</strong>
      <div class="alert-detail">${dateText(alert.observedAt)} · fuente: ${escapeText(alert.source || 'regla')} · dato: ${escapeText(JSON.stringify(alert.value))}</div></div>
    <span class="alert-level ${alert.level === 2 ? 'warning' : ''}">${alert.level === 1 ? 'Prioritario' : 'Aviso'}</span>
  </div>`;
}

function focusMainCard(root) {
  const card = root.querySelector('.dashboard-station-card');
  if (!card) return;
  requestAnimationFrame(() => {
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    card.classList.add('dashboard-station-card--focus');
    setTimeout(() => card.classList.remove('dashboard-station-card--focus'), 1800);
  });
}

export async function renderPanel(root) {
  root.innerHTML = `
    <div class="page-heading">
      <div><p class="eyebrow">PANEL DE SUSCRIPTOR</p><h1>Estado de las estaciones</h1></div>
      <label class="period-label">Periodo de gráficas y resúmenes
        <select id="period"><option value="24h">24 horas</option><option value="7d">7 días</option><option value="30d">30 días</option></select>
      </label>
    </div>
    <p class="error" data-error role="alert"></p>
    <div id="panel-stations" class="station-list"></div>
    <section class="panel" id="panel-measurements"></section>
    <section class="panel">
      <div class="section-heading"><div><p class="eyebrow">AVISOS</p><h2>Avisos recientes</h2></div>
        <a class="link" href="#/avisos">Centro de avisos</a></div>
      <div id="panel-alerts" class="alerts"></div>
    </section>`;

  resetStationDetails();
  const loadDashboard = async ({ silent = false } = {}) => {
    if (!silent) $('[data-error]', root).textContent = '';
    try {
      const data = await api(`/api/v1/dashboard?period=${encodeURIComponent($('#period', root).value)}`);
      resetStationDetails();
      $('#panel-stations', root).innerHTML = data.devices.length
        ? data.devices.map(renderStationCard).join('')
        : '<section class="panel"><p class="empty">Tu suscripción aún no tiene estaciones vinculadas.</p></section>';
      $('#panel-alerts', root).innerHTML = data.alerts.length
        ? data.alerts.map(renderAlertRow).join('')
        : '<p class="empty">No hay avisos recientes.</p>';
      return data.devices.map((item) => ({ id: item.device.id, name: item.device.name }));
    } catch (error) {
      if (error.message === 'authentication_required' || error.message === 'session_expired') return [];
      $('[data-error]', root).textContent = `No se pudo cargar el panel: ${error.message}`;
      return [];
    }
  };

  const stations = await loadDashboard();
  mountMeasurements($('#panel-measurements', root), { stations });
  $('#period', root).addEventListener('change', loadDashboard);
  focusMainCard(root);

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
