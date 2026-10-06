import {
  $, api, escapeText, dateText, dayText, numberText, pressureMbar, pressureText, chartTrend, connectivityBadge,
  chartSection,
} from './ui.js';
import { mountMeasurements } from './measurements.js';

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

function trendArrow(history, key) {
  const direction = chartTrend(history, key).direction;
  const icon = direction === 'sube' ? '↑' : direction === 'baja' ? '↓' : direction === 'estable' ? '→' : '·';
  const description = { sube: 'Tendencia ascendente', baja: 'Tendencia descendente', estable: 'Tendencia estable', insuficiente: 'Tendencia sin suficientes datos' }[direction];
  return `<span class="reading-trend trend-${direction}" role="img" aria-label="${description}" title="${description}">${icon}</span>`;
}

function readingCard({ label, icon, value, unit, tone, trend = '' }) {
  return `<div class="reading-card ${tone}"><span class="reading-label"><span class="reading-icon" aria-hidden="true">${icon}</span>${label}</span><div class="reading-value"><strong>${value == null ? '—' : value}</strong><small>${unit || ''}</small>${trend}</div></div>`;
}

function heroBlock({ latest, history, weather }) {
  const aemetDay = weather?.aemet?.forecast?.days?.[0];
  const openDay = weather?.openMeteo?.daily?.[0];
  const forecast = aemetDay || openDay;
  const aemetTemperature = weather?.aemet?.observation?.temperatureC;
  const openTemperature = weather?.openMeteo?.current?.temperatureC;
  const temperature = latest?.temperatureC ?? aemetTemperature ?? openTemperature;
  const temperatureSource = latest?.temperatureC != null ? 'MICROESTACIÓN · MEDICIÓN DIRECTA'
    : aemetTemperature != null ? 'AEMET · OBSERVACIÓN REAL'
      : openTemperature != null ? 'OPEN-METEO · ESTIMACIÓN' : 'TEMPERATURA · SIN DATO';
  const forecastProvider = aemetDay ? 'AEMET' : openDay ? 'Open-Meteo' : null;
  const forecastSky = aemetDay?.sky || (openDay ? weatherText(openDay.weatherCode) : 'Sin previsión disponible');
  const minimum = aemetDay?.temperatureMinC ?? openDay?.temperatureMinC;
  const maximum = aemetDay?.temperatureMaxC ?? openDay?.temperatureMaxC;
  return `<section class="station-hero">
    <div class="hero-ambient" aria-hidden="true"></div>
    <div class="hero-content">
      <div class="hero-source-row"><span class="hero-local-badge"><span aria-hidden="true">●</span> ${temperatureSource}</span>${latest?.temperatureC != null ? trendArrow(history, 'temperatureC') : ''}</div>
      <div class="hero-main">
        <div class="hero-temperature"><strong>${numberText(temperature)}</strong><span>°C</span></div>
        <div class="hero-forecast"><span class="hero-weather-icon" aria-hidden="true">${forecast ? (aemetDay ? '🌤️' : '☁️') : '🌱'}</span><strong>${escapeText(forecastSky)}</strong><small>${forecastProvider ? `Previsión · ${forecastProvider}` : 'Previsión no disponible'}</small>${minimum != null || maximum != null ? `<small>${numberText(minimum)}° / ${numberText(maximum)}°</small>` : ''}</div>
      </div>
      <div class="hero-readout-footer"><span>Microestación · ${dateText(latest?.observedAt)}</span><span class="hero-separator">·</span><span>Humedad ${numberText(latest?.humidityPct)}%</span><span class="hero-separator">·</span><span>Presión ${pressureText(latest?.pressurePa)} mbar</span></div>
    </div>
  </section>`;
}

function comparisonBlock({ latest, history, weather, sensors, status }) {
  const observation = weather?.aemet?.observation;
  const localPressure = pressureMbar(latest?.pressurePa);
  const historyPressure = median(history.map((row) => pressureMbar(row.pressurePa)));
  const local = [
    readingCard({ label: 'Temperatura', icon: '🌡️', value: numberText(latest?.temperatureC), unit: '°C', tone: valueTone('temperature', latest?.temperatureC), trend: trendArrow(history, 'temperatureC') }),
    readingCard({ label: 'Humedad', icon: '💧', value: numberText(latest?.humidityPct), unit: '%', tone: valueTone('humidity', latest?.humidityPct), trend: trendArrow(history, 'humidityPct') }),
    readingCard({ label: 'Presión', icon: '🌬️', value: pressureText(latest?.pressurePa), unit: 'mbar', tone: valueTone('pressure', localPressure, historyPressure), trend: trendArrow(history, 'pressurePa') }),
    readingCard({ label: 'Batería', icon: '🔋', value: sensors.battery === false ? '—' : numberText(latest?.batteryMv, 0), unit: sensors.battery === false ? 'Desactivada' : 'mV', tone: sensors.battery === false ? 'tone-muted' : `tone-battery-${status.batteryLevel || 'unknown'}`, trend: trendArrow(history, 'batteryMv') }),
    ...(sensors.lux === true && latest?.lux != null
      ? [readingCard({ label: 'Iluminancia', icon: '☀️', value: numberText(latest.lux, 0), unit: 'lux', tone: 'tone-normal', trend: trendArrow(history, 'lux') })]
      : []),
  ].join('');
  const aemetCards = [
    readingCard({ label: 'Temperatura', icon: '🌡️', value: numberText(observation?.temperatureC), unit: '°C', tone: valueTone('temperature', observation?.temperatureC) }),
    readingCard({ label: 'Humedad', icon: '💧', value: numberText(observation?.humidityPct), unit: '%', tone: valueTone('humidity', observation?.humidityPct) }),
    readingCard({ label: 'Presión', icon: '🌬️', value: numberText(observation?.pressureHpa), unit: 'mbar', tone: valueTone('pressure', observation?.pressureHpa, historyPressure) }),
    readingCard({ label: 'Precipitación', icon: '🌧️', value: numberText(observation?.precipitationMm), unit: 'mm', tone: valueTone('rain', observation?.precipitationMm) }),
    readingCard({ label: 'Viento', icon: '💨', value: numberText(observation?.windKmh), unit: 'km/h', tone: valueTone('wind', observation?.windKmh) }),
    readingCard({ label: 'Racha', icon: '🌬️', value: numberText(observation?.windGustKmh), unit: 'km/h', tone: valueTone('wind', observation?.windGustKmh) }),
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

function weatherBlock(weather) {
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
  const openForecast = !aemetHasForecast && openDays.length ? `<div class="weather-provider"><h4>Previsión Open-Meteo · 5 días</h4><div class="weather-days">${openDays.map((day) => `<div class="weather-day">
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
  const advisories = weather.advisories?.length ? `<div class="weather-alert-group"><h4>Riesgos orientativos · ${aemetHasForecast ? 'AEMET' : 'Open-Meteo'}</h4>${weather.advisories.map((notice) => `<article class="weather-alert advisory"><strong>${escapeText(notice.text)}</strong><span>${dayText(`${notice.date}T12:00:00`)}</span></article>`).join('')}<p class="hint">Indicadores preventivos con umbrales generales; no son avisos oficiales ni sustituyen umbrales específicos del cultivo o ganado.</p></div>` : '';
  const aemetSetup = weather.aemetMissing?.length
    ? `<p class="hint">AEMET incompleto: falta ${weather.aemetMissing.map(escapeText).join(', ')}. Completa esos datos en la ficha de estación; la API key se configura de forma privada en el servidor.</p>`
    : '';
  const errors = weather.errors?.length ? `<p class="hint">${weather.errors.map(escapeText).join(' ')}</p>` : '';
  if (!currentBlock && !openForecast && !aemetForecast && !officialAlerts && !advisories && !aemetSetup && !errors) return '';
  return `<section class="weather-panel"><div class="weather-heading"><div><p class="eyebrow">CONTEXTO EXTERNO · ${escapeText(weather.location)}</p><h3>Tiempo en la localidad</h3></div><span class="badge badge-muted">Fuentes externas, separadas de las mediciones</span></div>
    ${currentBlock}${aemetHasForecast ? aemetForecast : openForecast}${officialAlerts}${advisories}${aemetSetup}${errors}
    <p class="weather-attribution">Fuentes: <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a> · <a href="https://www.aemet.es/" target="_blank" rel="noopener noreferrer">AEMET</a></p></section>`;
}

// Tarjeta de estación del panel: estado operativo, cobertura y gráficas
// (el servidor ya excluye lo no validado y lo borrado del histórico).
export function renderStationCard(item) {
  const { device, status, latest, history, nearby, summary, weather } = item;
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
    ${heroBlock({ latest: displayLatest, history, weather })}
    ${comparisonBlock({ latest: displayLatest, history, weather, sensors, status })}
    <div class="${coverageClass}"><strong>Fiabilidad de lecturas</strong><p>${escapeText(coverage)}</p>${summary.expected && summary.coverage_pct < 90 ? '<p>La estación está perdiendo lecturas y requiere revisión de conectividad.</p>' : ''}</div>
    <p class="coverage">Sensores: ${sensorState}</p>
    ${chartSection(history, summary)}
    ${weatherBlock(weather)}
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
