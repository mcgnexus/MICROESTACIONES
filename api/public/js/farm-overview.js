// Resumen de la finca en lenguaje llano: sin gráficas ni jerga. Traduce el
// estado técnico de cada estación a una frase que un agricultor entiende.
import { escapeText, dateText, numberText } from './ui.js';

export const TEMP_FROST_C = 0;
export const TEMP_HEAT_C = 35;

const TONE_LABELS = { alert: 'Requiere atención', warn: 'Vigilar', ok: 'Todo en orden', muted: 'Sin datos' };
export const toneLabel = (tone) => TONE_LABELS[tone] || TONE_LABELS.muted;

// Frase y tono de una estación a partir de su estado y su última lectura.
export function plainDeviceStatus({ status = {}, latest = {} } = {}) {
  const temperature = status.dataFreshness === 'stale' ? null : latest?.temperatureC;
  if (status.connectivity === 'offline' || status.connectivity === 'degraded') {
    return { tone: status.connectivity === 'offline' ? 'alert' : 'warn',
      text: status.connectivity === 'offline' ? 'Sin conexión con la estación' : 'Conexión intermitente' };
  }
  if (status.dataFreshness === 'stale') return { tone: 'warn', text: 'Últimas mediciones antiguas' };
  if (status.dataFreshness === 'unknown') return { tone: 'muted', text: 'Sin mediciones válidas' };
  if (status.batteryLevel === 'critical') return { tone: 'alert', text: 'Batería crítica: puede dejar de enviar' };
  if (temperature != null && Number(temperature) <= TEMP_FROST_C) {
    return { tone: 'alert', text: `Riesgo de helada (${numberText(temperature)} °C)` };
  }
  if (temperature != null && Number(temperature) >= TEMP_HEAT_C) {
    return { tone: 'alert', text: `Calor extremo (${numberText(temperature)} °C)` };
  }
  if (status.batteryLevel === 'low') return { tone: 'warn', text: 'Batería baja' };
  if (latest?.observedAt == null) return { tone: 'muted', text: 'Sin lecturas todavía' };
  return { tone: 'ok', text: 'Todo en orden' };
}

function worstTone(stations) {
  if (!stations.length) return 'muted';
  if (stations.some((station) => station.tone === 'alert')) return 'alert';
  if (stations.some((station) => station.tone === 'warn')) return 'warn';
  return 'ok';
}

// Agrupa las estaciones por finca y deja aparte las que no pertenecen a ninguna.
export function summarizeFarms(farms = [], devices = []) {
  const byId = new Map(devices.map((device) => [device.device?.id, device]));
  const assigned = new Set();
  const groups = farms.map((farm) => {
    const stations = (farm.devices || [])
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((item) => {
        assigned.add(item.device.id);
        return { id: item.device.id, name: item.device.name, ...plainDeviceStatus(item) };
      });
    return { id: farm.id, name: farm.name, stations, tone: worstTone(stations) };
  });
  const unassigned = devices
    .filter((item) => !assigned.has(item.device?.id))
    .map((item) => ({ id: item.device.id, name: item.device.name, ...plainDeviceStatus(item) }));
  return { farms: groups, unassigned };
}

function stationLine(station) {
  return `<li class="overview-station tone-${station.tone}">
    <span class="overview-dot" aria-hidden="true"></span>
    <span class="overview-station-name">${escapeText(station.name)}</span>
    <span class="overview-station-text">${escapeText(station.text)}</span>
  </li>`;
}

// HTML del bloque de estado. `overview` es el resultado de summarizeFarms.
export function renderFarmOverview(overview, { updatedAt = null } = {}) {
  const blocks = overview.farms.map((farm) => `<div class="overview-farm tone-${farm.tone}">
    <div class="overview-farm-head">
      <strong>${escapeText(farm.name)}</strong>
      <span class="overview-tag tone-${farm.tone}">${escapeText(toneLabel(farm.tone))}</span>
    </div>
    ${farm.stations.length ? `<ul class="overview-stations">${farm.stations.map(stationLine).join('')}</ul>`
      : '<p class="hint">Esta finca todavía no tiene estaciones asociadas.</p>'}
  </div>`).join('');
  const extra = overview.unassigned.length ? `<div class="overview-farm tone-${worstTone(overview.unassigned)}">
    <div class="overview-farm-head"><strong>Otras estaciones</strong></div>
    <ul class="overview-stations">${overview.unassigned.map(stationLine).join('')}</ul>
  </div>` : '';
  const empty = !overview.farms.length && !overview.unassigned.length
    ? '<p class="empty">Todavía no hay estaciones ni fincas que mostrar.</p>' : '';
  const stamp = updatedAt ? `<p class="overview-updated">Actualizado ${dateText(updatedAt)}</p>` : '';
  return `${empty}${blocks}${extra}${stamp}`;
}
