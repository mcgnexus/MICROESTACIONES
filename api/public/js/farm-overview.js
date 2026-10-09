// Resumen de la finca en lenguaje llano: sin gráficas ni jerga. Traduce el
// estado técnico de cada estación a una frase que un agricultor entiende.
import { escapeText, dateText, numberText } from './ui.js';

export const TEMP_FROST_C = 0;
export const TEMP_HEAT_C = 35;

const TONE_LABELS = { alert: 'Requiere atención', warn: 'Vigilar', ok: 'Todo en orden', muted: 'Sin datos' };
export const toneLabel = (tone) => TONE_LABELS[tone] || TONE_LABELS.muted;

const TONE_RANK = { alert: 2, warn: 1, ok: 0, muted: 0 };
// El tono más grave de dos. `muted` nunca tapa ni eleva un estado real.
function worstOf(a, b) {
  return (TONE_RANK[a] ?? 0) >= (TONE_RANK[b] ?? 0) ? a : b;
}

// Nivel de un aviso traducido a tono: prioritario (1) exige, el resto vigila.
const alertTone = (alert) => (Number(alert?.level) === 1 ? 'alert' : 'warn');

const pendingLabel = (count) => `${count} aviso${count === 1 ? '' : 's'} pendiente${count === 1 ? '' : 's'} de revisión`;

// Frase y tono de una estación a partir de su estado, su última lectura y los
// avisos abiertos. El estado del equipo y los avisos son dimensiones distintas:
// un equipo conectado puede tener avisos vigentes, y el resumen no debe
// tranquilizar sin decirlo. Devuelve también cuántos avisos siguen abiertos.
export function plainDeviceStatus({ status = {}, latest = {} } = {}, { openAlerts = [] } = {}) {
  const alerts = (openAlerts || []).filter((alert) => !(alert?.closedAt ?? alert?.closed_at));
  const base = baseDeviceState(status, latest);
  if (!alerts.length) return { ...base, pendingAlerts: 0 };
  const tone = alerts.reduce((acc, alert) => worstOf(acc, alertTone(alert)), base.tone);
  const suffix = `hay ${pendingLabel(alerts.length)}`;
  const text = base.tone === 'ok'
    ? `Estación conectada; ${suffix}`
    : `${base.text}; ${suffix}`;
  return { tone, text, pendingAlerts: alerts.length };
}

// Estado del equipo y de la cobertura, sin avisos: la base que luego se combina.
function baseDeviceState(status, latest) {
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

// Índice device_id → avisos abiertos, tolerando nombres en snake_case o camelCase.
export function openAlertsByDevice(alerts = []) {
  const map = new Map();
  for (const alert of alerts) {
    if (alert?.closedAt ?? alert?.closed_at) continue;
    const id = alert?.deviceId ?? alert?.device_id;
    if (id == null) continue;
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(alert);
  }
  return map;
}

function worstTone(stations) {
  if (!stations.length) return 'muted';
  if (stations.some((station) => station.tone === 'alert')) return 'alert';
  if (stations.some((station) => station.tone === 'warn')) return 'warn';
  return 'ok';
}

// Agrupa las estaciones por finca y deja aparte las que no pertenecen a ninguna.
// Los avisos abiertos entran en el cálculo del tono: el resumen no puede decir
// «Todo en orden» mientras hay avisos pendientes de revisión.
export function summarizeFarms(farms = [], devices = [], { alerts = [] } = {}) {
  const alertsByDevice = openAlertsByDevice(alerts);
  const byId = new Map(devices.map((device) => [device.device?.id, device]));
  const assigned = new Set();
  const groups = farms.map((farm) => {
    const stations = (farm.devices || [])
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((item) => {
        assigned.add(item.device.id);
        return { id: item.device.id, name: item.device.name, ...plainDeviceStatus(item, { openAlerts: alertsByDevice.get(item.device.id) || [] }) };
      });
    const pendingAlerts = stations.reduce((sum, station) => sum + (station.pendingAlerts || 0), 0);
    return { id: farm.id, name: farm.name, stations, tone: worstTone(stations), pendingAlerts };
  });
  const unassigned = devices
    .filter((item) => !assigned.has(item.device?.id))
    .map((item) => ({ id: item.device.id, name: item.device.name, ...plainDeviceStatus(item, { openAlerts: alertsByDevice.get(item.device.id) || [] }) }));
  const unassignedPending = unassigned.reduce((sum, station) => sum + (station.pendingAlerts || 0), 0);
  return { farms: groups, unassigned, pendingAlerts: groups.reduce((sum, farm) => sum + farm.pendingAlerts, 0) + unassignedPending };
}

function stationLine(station) {
  return `<li class="overview-station tone-${station.tone}">
    <span class="overview-dot" aria-hidden="true"></span>
    <span class="overview-station-name">${escapeText(station.name)}</span>
    <span class="overview-station-text">${escapeText(station.text)}</span>
  </li>`;
}

// HTML del bloque de estado. `overview` es el resultado de summarizeFarms.
// `caveat` (opcional, de coverageCaveat) explica los límites del resumen: ni un
// «Todo en orden» ni una ausencia de avisos equivalen a ausencia de riesgo.
export function renderFarmOverview(overview, { updatedAt = null, caveat = null } = {}) {
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
  const pending = Number(overview.pendingAlerts) || 0;
  const alertsNote = pending > 0
    ? `<p class="warn-box">El estado del equipo no resume los avisos: ${escapeText(pendingLabel(pending))} en esta vista. Revísalos en «Alertas abiertas».</p>`
    : '';
  const caveatNote = caveat
    ? `<p class="${caveat.tone === 'warn' ? 'warn-box' : 'empty'}">El resumen tiene límites y <strong>no sustituye a los avisos</strong>: ${escapeText(caveat.text)}</p>`
    : '';
  const stamp = updatedAt ? `<p class="overview-updated">Actualizado ${dateText(updatedAt)}</p>` : '';
  return `${empty}${blocks}${extra}${alertsNote}${caveatNote}${stamp}`;
}
