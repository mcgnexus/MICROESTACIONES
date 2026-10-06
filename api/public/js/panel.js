import {
  $, api, escapeText, dateText, dayText, numberText, connectivityBadge,
  batteryLabel, metric, chartSection,
} from './ui.js';
import { mountMeasurements } from './measurements.js';

const weatherText = (code) => ({
  0: 'Despejado', 1: 'Mayormente despejado', 2: 'Parcialmente nuboso', 3: 'Nublado',
  45: 'Niebla', 48: 'Niebla con escarcha', 51: 'Llovizna débil', 53: 'Llovizna', 55: 'Llovizna intensa',
  61: 'Lluvia débil', 63: 'Lluvia', 65: 'Lluvia intensa', 71: 'Nieve débil', 73: 'Nieve', 75: 'Nieve intensa',
  80: 'Chubascos débiles', 81: 'Chubascos', 82: 'Chubascos intensos', 95: 'Tormenta', 96: 'Tormenta con granizo', 99: 'Tormenta intensa con granizo',
}[Number(code)] || 'Estado variable');

function weatherBlock(weather) {
  if (!weather?.configured) return '';
  const open = weather.openMeteo;
  const current = open?.current;
  const currentBlock = current ? `<div class="weather-current">
    <div class="weather-current-title"><div><span class="source-tag">Open-Meteo · condición actual estimada</span><h4>${weatherText(current.weatherCode)}</h4></div><small>Actualizado ${dateText(open.fetchedAt)}</small></div>
    <div class="weather-metrics">
      <div><span><span class="weather-icon" aria-hidden="true">🌡️</span> Temperatura</span><strong>${numberText(current.temperatureC)} °C</strong></div>
      <div><span><span class="weather-icon" aria-hidden="true">💧</span> Humedad</span><strong>${numberText(current.humidityPct)} %</strong></div>
      <div><span><span class="weather-icon" aria-hidden="true">🌧️</span> Lluvia</span><strong>${numberText(current.rainMm ?? current.precipitationMm)} mm</strong></div>
      <div><span><span class="weather-icon" aria-hidden="true">💨</span> Viento</span><strong>${numberText(current.windKmh)} km/h</strong></div>
      <div><span><span class="weather-icon" aria-hidden="true">🌬️</span> Racha</span><strong>${numberText(current.windGustKmh)} km/h</strong></div>
      <div><span><span class="weather-icon" aria-hidden="true">🧭</span> Presión</span><strong>${numberText(current.pressureHpa, 0)} hPa</strong></div>
    </div>
    <p class="hint">Estimación de modelo para ${escapeText(weather.location)}; no es una observación de la microestación ni de un pluviómetro local.</p>
  </div>` : '';
  const aemetObservation = weather.aemet?.observation ? `<div class="weather-current aemet-observation">
    <div class="weather-current-title"><div><span class="source-tag">AEMET · observación real de estación</span><h4>Estación ${escapeText(weather.aemet.observation.stationId)}</h4></div><small>Medida ${dateText(weather.aemet.observation.observedAt)} · recibido ${dateText(weather.aemet.fetchedAt)}</small></div>
    <div class="weather-metrics">
      <div><span><span class="weather-icon" aria-hidden="true">🌡️</span> Temperatura</span><strong>${numberText(weather.aemet.observation.temperatureC)} °C</strong></div>
      <div><span><span class="weather-icon" aria-hidden="true">💧</span> Humedad</span><strong>${numberText(weather.aemet.observation.humidityPct)} %</strong></div>
      <div><span><span class="weather-icon" aria-hidden="true">🌧️</span> Precipitación</span><strong>${numberText(weather.aemet.observation.precipitationMm)} mm</strong></div>
      <div><span><span class="weather-icon" aria-hidden="true">💨</span> Viento</span><strong>${numberText(weather.aemet.observation.windKmh)} km/h ${escapeText(weather.aemet.observation.windDirection || '')}</strong></div>
      <div><span><span class="weather-icon" aria-hidden="true">🌬️</span> Racha</span><strong>${numberText(weather.aemet.observation.windGustKmh)} km/h</strong></div>
      <div><span><span class="weather-icon" aria-hidden="true">🧭</span> Presión</span><strong>${numberText(weather.aemet.observation.pressureHpa, 0)} hPa</strong></div>
    </div>
    <p class="hint">Observación de la estación AEMET indicada en la ficha; puede estar a cierta distancia del equipo.</p>
  </div>` : '';
  const openDays = open?.daily || [];
  const hours = (open?.hourly || []).slice(0, 24).filter((_, index) => index % 3 === 0);
  const hourlyForecast = hours.length ? `<details class="weather-hourly"><summary>Previsión por horas · próximas 24 h</summary><div class="weather-hours">${hours.map((hour) => `<div><strong>${dateText(hour.forecastFor)}</strong><span><span class="weather-icon" aria-hidden="true">🌡️</span> ${numberText(hour.temperatureC)} °C · <span class="weather-icon" aria-hidden="true">💧</span> ${numberText(hour.humidityPct)} %</span><span><span class="weather-icon" aria-hidden="true">🌧️</span> ${numberText(hour.precipitationMm)} mm${hour.precipitationProbabilityPct != null ? ` · ${numberText(hour.precipitationProbabilityPct, 0)} %` : ''}</span><span><span class="weather-icon" aria-hidden="true">💨</span> ${numberText(hour.windKmh)} km/h · rachas ${numberText(hour.windGustKmh)} km/h</span></div>`).join('')}</div></details>` : '';
  const openForecast = openDays.length ? `<div class="weather-provider"><h4>Previsión Open-Meteo · 5 días</h4><div class="weather-days">${openDays.map((day) => `<div class="weather-day">
    <strong>${dayText(`${day.date}T12:00:00`)}</strong><span>${weatherText(day.weatherCode)}</span>
    <span><span class="weather-icon" aria-hidden="true">🌡️</span> ${numberText(day.temperatureMinC)}–${numberText(day.temperatureMaxC)} °C</span>
    <span><span class="weather-icon" aria-hidden="true">🌧️</span> ${numberText(day.precipitationMm)} mm${day.precipitationProbabilityPct != null ? ` · ${numberText(day.precipitationProbabilityPct, 0)} %` : ''}</span>
    <span><span class="weather-icon" aria-hidden="true">💨</span> ${numberText(day.windKmh)} km/h · rachas ${numberText(day.windGustKmh)} km/h</span>
  </div>`).join('')}</div>${hourlyForecast}</div>` : hourlyForecast;
  const aemetDays = weather.aemet?.forecast?.days || [];
  const aemetForecast = aemetDays.length ? `<div class="weather-provider"><h4>Previsión municipal AEMET · ${escapeText(weather.aemet.forecast.municipality || weather.location)}</h4><div class="weather-days">${aemetDays.map((day) => `<div class="weather-day">
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
  const advisories = weather.advisories?.length ? `<div class="weather-alert-group"><h4>Riesgos orientativos de la previsión</h4>${weather.advisories.map((notice) => `<article class="weather-alert advisory"><strong>${escapeText(notice.text)}</strong><span>${dayText(`${notice.date}T12:00:00`)}</span></article>`).join('')}<p class="hint">Indicadores preventivos con umbrales generales; no son avisos oficiales ni sustituyen umbrales específicos del cultivo o ganado.</p></div>` : '';
  const aemetSetup = weather.aemetMissing?.length
    ? `<p class="hint">AEMET incompleto: falta ${weather.aemetMissing.map(escapeText).join(', ')}. Completa esos datos en la ficha de estación; la API key se configura de forma privada en el servidor.</p>`
    : '';
  const errors = weather.errors?.length ? `<p class="hint">${weather.errors.map(escapeText).join(' ')}</p>` : '';
  if (!currentBlock && !aemetObservation && !openForecast && !aemetForecast && !officialAlerts && !advisories && !aemetSetup && !errors) return '';
  return `<section class="weather-panel"><div class="weather-heading"><div><p class="eyebrow">CONTEXTO EXTERNO · ${escapeText(weather.location)}</p><h3>Tiempo en la localidad</h3></div><span class="badge badge-muted">Fuentes externas, separadas de las mediciones</span></div>
    ${currentBlock}${aemetObservation}${openForecast}${aemetForecast}${officialAlerts}${advisories}${aemetSetup}${errors}
    <p class="weather-attribution">Fuentes: <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a> · <a href="https://www.aemet.es/" target="_blank" rel="noopener noreferrer">AEMET</a></p></section>`;
}

// Tarjeta de estación del panel: estado operativo, cobertura y gráficas
// (el servidor ya excluye lo no validado y lo borrado del histórico).
export function renderStationCard(item) {
  const { device, status, latest, history, forecasts, nearby, summary, weather } = item;
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
    ${weatherBlock(weather)}
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
