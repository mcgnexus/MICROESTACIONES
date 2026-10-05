import {
  $, api, escapeText, dateText, numberText, connectivityBadge,
  batteryLabel, metric, chartSection,
} from './ui.js';
import { mountMeasurements } from './measurements.js';

// Tarjeta de estación del panel: estado operativo, cobertura y gráficas
// (el servidor ya excluye lo no validado y lo borrado del histórico).
export function renderStationCard(item) {
  const { device, status, latest, history, forecasts, nearby, summary } = item;
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
  const forecastSection = forecasts.length
    ? forecasts.map((forecast) => `<div class="forecast-row"><span><span class="source-tag">Previsión externa · ${escapeText(forecast.provider)}</span><br>${dateText(forecast.forecastFor)}</span><span>${numberText(forecast.temperatureC)} °C · lluvia ${numberText(forecast.precipitationMm)} mm</span></div>`).join('')
    : '';
  const nearbyRows = nearby.stations.length
    ? nearby.stations.map((station) => `<div class="nearby-row"><span>${escapeText(station.name)} · última conexión ${dateText(station.lastSeenAt)}</span><strong>${numberText(station.distanceKm, 1)} km</strong></div>`).join('')
    : '';
  const batteryDisabled = sensors.battery === false;
  const forecastBlock = forecasts.length
    ? `<div class="subsection"><h3>Previsión meteorológica</h3><p class="coverage">Fuente externa separada de las mediciones de la estación.</p>${forecastSection}</div>`
    : '';
  const nearbyBlock = nearby.stations.length || !/ubicación.*no configurada/i.test(nearby.message)
    ? `<div class="subsection"><h3>Estaciones cercanas</h3><p class="coverage">${escapeText(nearby.message)} ${nearby.representative ? 'Cobertura representativa disponible.' : 'La cobertura puede ser insuficiente.'}</p>${nearbyRows}</div>`
    : '';

  return `<article class="station-card">
    <div class="station-head">
      <div>
        <p class="eyebrow">ESTACIÓN · ${escapeText(device.id)}</p>
        <h2><a href="#/estaciones/${encodeURIComponent(device.id)}">${escapeText(device.name)}</a></h2>
        <p class="updated">Última actualización: ${dateText(updated)} ${latestNote}</p>
      </div>
      <div class="station-tags">${connectivityBadge(status.connectivity)}<span class="badge badge-muted">Config v${status.configVersion}</span></div>
    </div>
    <div class="metrics">
      ${metric('Temperatura', numberText(latest?.temperatureC), '°C')}
      ${metric('Humedad', numberText(latest?.humidityPct), '%')}
      ${metric('Presión', numberText(latest?.pressurePa, 0), 'Pa')}
      ${metric('Batería', batteryDisabled ? '—' : numberText(latest?.batteryMv, 0), batteryDisabled ? 'Desactivada' : `mV · ${batteryLabel(latest?.batteryMv == null ? 'unknown' : status.batteryLevel)}`)}
    </div>
    <div class="${coverageClass}"><strong>Fiabilidad de lecturas</strong><p>${escapeText(coverage)}</p>${summary.expected && summary.coverage_pct < 90 ? '<p>La estación está perdiendo lecturas y requiere revisión de conectividad.</p>' : ''}</div>
    <p class="coverage">Sensores: ${sensorState}</p>
    ${chartSection(history, summary)}
    ${forecastBlock}
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

  const loadDashboard = async () => {
    $('[data-error]', root).textContent = '';
    try {
      const data = await api(`/api/v1/dashboard?period=${encodeURIComponent($('#period', root).value)}`);
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
}
