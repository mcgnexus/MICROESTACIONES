// Rutas y secciones de la web pública. La portada no pide sesión; el panel sí.
import { api, escapeText, numberText, dateText, makeChart } from './ui.js';
import { mountLeadForms } from './leads.js';
import { sinceText } from './farm-cards.js';
import { mountFarmSimulation, renderSimulationShell } from './farm-sim.js';

export const PUBLIC_SECTIONS = new Set([
  'tiempo-local', 'comparacion-aemet', 'evolucion', 'fincas', 'demo-agricola', 'herramientas',
  'preguntas', 'solicitar-piloto', 'acceso-gratuito', 'zonas', 'alertas', 'como-funciona', 'microclimas',
]);
export const PRIVATE_SECTIONS = new Set(['panel', 'estaciones', 'avisos', 'admin', 'cuenta']);

const PUBLIC_SECTION_ALIASES = {
  zonas: 'comparacion-aemet',
  alertas: 'herramientas',
  'como-funciona': 'fincas',
  microclimas: 'fincas',
  'solicitar-acceso': 'solicitar-piloto',
  demo: 'demo-agricola',
  demostracion: 'demo-agricola',
};

// Desplaza la vista a una sección pública de la portada.
export function scrollToPublicSection(section) {
  const target = document.getElementById(PUBLIC_SECTION_ALIASES[section] || section);
  if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function selectUrbanStation(stations = []) {
  const urban = stations.filter((station) => station.locationType === 'urbano'
    && (station.temperatureObservedAt || station.humidityObservedAt));
  const freshnessRank = (station) => station.temperatureFreshness === 'fresh' ? 2
    : station.humidityFreshness === 'fresh' ? 1 : 0;
  return urban.sort((a, b) => freshnessRank(b) - freshnessRank(a)
    || new Date(b.temperatureObservedAt || b.humidityObservedAt || 0)
      - new Date(a.temperatureObservedAt || a.humidityObservedAt || 0))[0] || null;
}

export function renderLocalWeatherCard(station) {
  if (!station) return `<div class="public-data-card public-state-card tone-muted">
    <strong>No hay una medición urbana pública disponible ahora.</strong>
    <p>No sustituimos el dato del casco urbano por una lectura de finca ni por una previsión.</p>
  </div>`;
  const tempFresh = station.temperatureFreshness === 'fresh' && station.temperatureC != null;
  const humidityFresh = station.humidityFreshness === 'fresh' && station.humidityPct != null;
  const lastUpdate = [station.temperatureObservedAt, station.humidityObservedAt]
    .filter(Boolean).sort((a, b) => new Date(b) - new Date(a))[0] || null;
  const point = station.zone || station.name || 'punto urbano';
  const stale = !tempFresh || !humidityFresh;
  return `<article class="public-data-card public-now-card${stale ? ' is-stale' : ''}">
    <div class="public-now-heading"><div><p class="eyebrow">PUNTO DE MEDIDA · CASCO URBANO</p><h3>${escapeText(point)}</h3><p>${escapeText(station.name || '')} · un emplazamiento concreto, no toda la ciudad</p></div>
      <span class="badge ${station.connectivity === 'offline' ? 'badge-invalid' : stale ? 'badge-warn' : 'badge-valid'}">${station.connectivity === 'offline' ? 'Sin conexión' : stale ? 'Lectura no reciente' : 'Datos recientes'}</span></div>
    <div class="public-now-readings">
      <div><span>Temperatura</span><strong>${station.temperatureC != null ? `${numberText(station.temperatureC, 1)} °C` : 'Sin lectura registrada'}</strong><small>${tempFresh ? `Medida ${dateText(station.temperatureObservedAt)}` : `Última medición ${dateText(station.temperatureObservedAt)}`}</small></div>
      <div><span>Humedad</span><strong>${station.humidityPct != null ? `${numberText(station.humidityPct, 0)} %` : 'Sin lectura registrada'}</strong><small>${humidityFresh ? `Medida ${dateText(station.humidityObservedAt)}` : `Última medición ${dateText(station.humidityObservedAt)}`}</small></div>
    </div>
    <p class="public-update">Última actualización de los sensores: <time datetime="${escapeText(lastUpdate || '')}">${escapeText(dateText(lastUpdate))}</time>. La lectura describe este punto del casco urbano.</p>
  </article>`;
}

// Tabla comparativa con datos públicos reales (sin coordenadas).
export function renderPublicZones(stations) {
  const table = `<div class="table-wrap"><table class="comparison-table">
    <thead><tr><th>Ubicación urbana</th><th>Temperatura medida</th><th>Hora local</th><th>Observación AEMET</th><th>Hora AEMET</th><th>Diferencia emparejada</th></tr></thead>
    <tbody>${stations.map((station) => {
      const comparison = station.comparison;
      const aemetObservation = comparison?.aemet || station.aemet?.observation;
      const localValue = comparison?.local?.temperatureC ?? station.temperatureC;
      const localAt = comparison?.local?.observedAt || station.observedAt;
      const diff = comparison?.state === 'matched' && comparison.differenceC != null
        ? `${comparison.differenceC > 0 ? '+' : ''}${numberText(comparison.differenceC, 1)} °C`
        : 'No calculada';
      const locationKind = station.locationType === 'urbano' ? 'zona urbana'
        : station.locationType === 'finca' ? 'finca' : null;
      const label = [station.zone, station.name, locationKind].filter(Boolean).join(' · ');
      return `<tr>
        <td>${escapeText(label)}</td>
        <td>${localValue == null ? '—' : `${numberText(localValue, 1)} °C`}<br><small>${station.temperatureFreshness === 'stale' ? 'Dato antiguo' : station.connectivity === 'offline' ? 'Estación sin conexión' : station.temperatureFreshness === 'unknown' ? 'Sin dato válido' : 'Medición reciente'}</small></td>
        <td>${escapeText(dateText(localAt) || '—')}<br><small>${escapeText(sinceText(localAt) || '')}</small></td>
        <td>${aemetObservation?.temperatureC == null ? (station.aemet?.observationStatus === 'unconfigured' ? 'No configurada' : station.aemet?.observationStatus === 'unavailable' ? 'Consulta no disponible' : 'Sin observación') : `${numberText(aemetObservation.temperatureC, 1)} °C`}<br><small>${escapeText(aemetObservation?.stationId || 'AEMET')}${station.aemet?.observationStatus === 'stale' ? ' · respuesta antigua' : ''}</small></td>
        <td>${escapeText(dateText(aemetObservation?.observedAt) || '—')}</td>
        <td><strong>${escapeText(diff)}</strong>${comparison?.state !== 'matched' ? `<br><small>Sin pareja dentro de ±${numberText(comparison?.windowMinutes || 10, 0)} min</small>` : ''}</td>
      </tr>`;
    }).join('')}</tbody>
  </table></div>`;
  const metadata = stations.map((station) => {
    const proximity = station.comparison?.proximity || station.aemet?.observation?.proximity;
    if (!proximity) return '';
    return `<p class="aemet-proximity"><strong>${escapeText(station.zone || station.name)}:</strong> ${numberText(proximity.distanceKm, 1)} km entre emplazamientos · altitud AEMET ${proximity.aemetAltitudeM == null ? '—' : `${numberText(proximity.aemetAltitudeM, 0)} m`} (${escapeText(proximity.aemetAltitudeSource || 'sin fuente')}) · urbana ${proximity.microAltitudeM == null ? '—' : `${numberText(proximity.microAltitudeM, 0)} m`} (${escapeText(proximity.microAltitudeSource || 'sin fuente')}). Coordenadas AEMET: ${escapeText(proximity.aemetLocationSource || 'sin fuente')}; urbanas: ${escapeText(proximity.microLocationSource || 'sin fuente')}.</p>`;
  }).filter(Boolean).join('');
  const forecastKeys = new Set();
  const forecasts = stations.map((station) => {
    const days = station.aemet?.forecast?.days || [];
    if (!days.length) return '';
    const key = station.aemet.forecast.municipality || station.zone || station.name;
    if (forecastKeys.has(key)) return '';
    forecastKeys.add(key);
    const age = station.aemet.forecastStatus === 'stale' && station.aemet.forecastAgeSeconds != null
      ? ` · respuesta antigua (${Math.round(station.aemet.forecastAgeSeconds / 60)} min)` : '';
    return `<article class="weather-provider"><h4>Previsión municipal AEMET · ${escapeText(key)}${age}</h4><div class="weather-days">${days.map((day) => `<div class="weather-day"><strong>${escapeText(String(day.date).slice(0, 10))}</strong><span>${escapeText(day.sky || 'Sin descripción')}</span><span>${numberText(day.temperatureMinC)}° / ${numberText(day.temperatureMaxC)} °C</span></div>`).join('')}</div></article>`;
  }).filter(Boolean).join('');
  const hasForecast = stations.some((station) => station.aemet?.forecast?.days?.length);
  const forecastNotice = !hasForecast && stations.some((station) => station.aemet)
    ? `<article class="weather-provider"><h4>Previsión municipal · independiente de las observaciones</h4><p>${stations.some((station) => station.aemet?.forecastStatus === 'unconfigured') ? 'Previsión AEMET no configurada para esta ubicación.' : stations.some((station) => station.aemet?.forecastStatus === 'unavailable') ? 'No se ha podido consultar la previsión municipal AEMET.' : 'AEMET no ha devuelto días de previsión utilizables.'}</p></article>` : '';
  const warningKeys = new Set();
  const warnings = stations.map((station) => {
    const aemet = station.aemet;
    if (!aemet) return '';
    const key = `${aemet.warningsAreaCode || station.zone || station.name}|${aemet.warningStatus}|${(aemet.warnings || []).map((warning) => warning.identifier || warning.event).sort().join(',')}`;
    if (warningKeys.has(key)) return '';
    warningKeys.add(key);
    const state = aemet.warningStatus;
    const active = aemet.warnings || [];
    const banner = state === 'current'
      ? active.length ? `Avisos vigentes · área ${aemet.warningsAreaCode || 'AEMET'} · consultado ${dateText(aemet.warningsFetchedAt)}`
        : `Sin avisos vigentes · área ${aemet.warningsAreaCode || 'AEMET'} · consultado ${dateText(aemet.warningsFetchedAt)}`
      : state === 'empty' ? `AEMET no devolvió datos de avisos (${dateText(aemet.warningsCheckedAt)}); no se interpreta como ausencia de avisos`
        : state === 'stale' ? `Consulta no disponible; última respuesta utilizable ${dateText(aemet.warningsFetchedAt)} (hace ${Math.round((aemet.warningsAgeSeconds || 0) / 60)} min)${active.length ? '' : ', sin avisos vigentes en esa respuesta'}.`
          : state === 'unconfigured' ? 'Consulta de avisos AEMET no configurada.' : 'No se ha podido consultar avisos AEMET.';
    return `<article class="weather-provider"><h4>Avisos oficiales · ${escapeText(station.zone || station.name)}</h4><p>${escapeText(banner)}</p>${active.map((warning) => `<p><strong>${escapeText(warning.event || warning.headline || 'Aviso')} · ${escapeText(warning.severity || 'sin nivel')}</strong> ${escapeText(warning.area || '')} · ${warning.expires ? `vigente hasta ${escapeText(dateText(warning.expires))}` : ''}</p>`).join('')}</article>`;
  }).filter(Boolean).join('');
  return `${table}${metadata ? `<div class="public-metadata">${metadata}</div>` : ''}<p class="hint">Las diferencias solo se calculan cuando observación y medición están separadas por un máximo de ±10 minutos. Positivo significa que la urbana midió más; negativo, menos. La distancia, altitud, exposición y entorno pueden influir; no se atribuye el resultado a un factor único.</p>${forecasts || forecastNotice ? `<section class="public-forecast"><h3>Previsión · independiente de las observaciones</h3>${forecasts}${forecastNotice}</section>` : ''}${warnings ? `<section class="public-forecast"><h3>Avisos oficiales AEMET</h3>${warnings}</section>` : ''}`;
}

export function renderDayHistory(station, now = Date.now()) {
  const start = now - 24 * 60 * 60 * 1000;
  const history = (station?.history || []).filter((row) => {
    const timestamp = new Date(row.observedAt).getTime();
    return Number.isFinite(timestamp) && timestamp >= start && timestamp <= now;
  });
  if (!station) return '<p class="public-state-card tone-muted">No hay un punto urbano público para mostrar su evolución.</p>';
  const temperature = history.filter((row) => row.temperatureC != null);
  const humidity = history.filter((row) => row.humidityPct != null);
  if (temperature.length < 2 && humidity.length < 2) {
    return `<p class="public-state-card tone-muted">No hay suficientes mediciones reales de las últimas 24 horas para dibujar una evolución.</p>`;
  }
  return `<div class="public-chart-grid">
    ${temperature.length >= 2 ? makeChart('Temperatura · últimas 24 horas', temperature, 'temperatureC', '#c97742', '°C', 1) : '<div class="public-state-card tone-muted">Aún no hay dos mediciones de temperatura en las últimas 24 horas.</div>'}
    ${humidity.length >= 2 ? makeChart('Humedad · últimas 24 horas', humidity, 'humidityPct', '#168b80', '%', 0) : '<div class="public-state-card tone-muted">Aún no hay dos mediciones de humedad en las últimas 24 horas.</div>'}
  </div>`;
}

// La vista se centra en la tarjeta grande del tiempo local al abrir la portada.
function focusWeatherCard(container) {
  const card = container?.firstElementChild;
  if (!card || typeof card.scrollIntoView !== 'function') return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  card.setAttribute('tabindex', '-1');
  card.focus({ preventScroll: true });
  card.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
}

function setPublicFailure(root, message) {
  const loading = root.querySelector('#local-weather-state');
  const card = root.querySelector('#local-weather-card');
  const comparison = root.querySelector('#public-comparison');
  const evolution = root.querySelector('#public-evolution');
  if (loading) settle(loading).innerHTML = `<p class="public-state-card tone-warn" role="alert">${escapeText(message)}</p>`;
  if (card) card.innerHTML = '';
  if (comparison) settle(comparison).innerHTML = '<p class="public-state-card tone-muted">La comparación no está disponible hasta recuperar las observaciones.</p>';
  if (evolution) settle(evolution).innerHTML = '<p class="public-state-card tone-muted">La evolución no está disponible hasta recuperar las mediciones.</p>';
}

// El contenedor nace con `public-loading` (fila para el indicador de carga); al
// llegar el contenido se retira la clase para que deje de ser un flex en fila y
// el contenido fluya en bloque (evita el desbordamiento horizontal).
const settle = (el) => {
  if (el) el.classList.remove('public-loading');
  return el;
};

// Carga únicamente observaciones autorizadas y publica estados claros si no
// llegan datos. Los refrescos periódicos pasan `focus: false` para no mover
// el scroll ni el foco de quien está leyendo.
let publicWeatherInFlight = false;

export async function loadPublicWeather(root = document, { focus = true } = {}) {
  if (!root.querySelector('#local-weather-state') || publicWeatherInFlight) return;
  publicWeatherInFlight = true;
  try {
    const { stations } = await api('/api/v1/public/stations');
    const station = selectUrbanStation(stations);
    settle(root.querySelector('#local-weather-state')).innerHTML = '';
    root.querySelector('#local-weather-card').innerHTML = renderLocalWeatherCard(station);
    // Solo en la carga inicial y solo si se abre en la portada: en otras
    // secciones públicas el scroll lo manda la ruta y no se le disputa.
    if (focus && (!location.hash || location.hash === '#' || location.hash === '#/')) {
      focusWeatherCard(root.querySelector('#local-weather-card'));
    }
    settle(root.querySelector('#public-comparison')).innerHTML = station
      ? renderPublicZones([station])
      : '<p class="public-state-card tone-muted">Aún no hay una estación urbana con permiso de publicación. La comparación con AEMET aparecerá cuando haya observaciones reales.</p>';
    settle(root.querySelector('#public-evolution')).innerHTML = renderDayHistory(station);
  } catch {
    setPublicFailure(root, 'No se han podido cargar las mediciones públicas. Inténtalo de nuevo más tarde.');
  } finally {
    publicWeatherInFlight = false;
  }
}

// Compatibilidad con el nombre anterior que usaban pruebas y enlaces internos.
export const loadPublicZones = loadPublicWeather;

// Monta los formularios de captación, la demostración simulada y las zonas
// reales si las hay. El orden importa: la captación necesita el bloque creado
// por la simulación para precargar el interés de futura instalación.
export function initLanding() {
  const simMount = document.querySelector('[data-farm-sim]');
  if (simMount) {
    simMount.innerHTML = renderSimulationShell();
    mountFarmSimulation(simMount);
  }
  mountLeadForms();
  loadPublicWeather();
  initLandingRefresh();
}

// Auto-refresco de la portada: cada 15 min y al volver a la pestaña, siempre
// que la portada esté visible (con sesión abierta queda oculta y el
// temporizador queda inerte). Mismo patrón que el panel.
const LANDING_REFRESH_MS = 15 * 60 * 1000;

function initLandingRefresh() {
  const landingView = document.querySelector('#landing-view');
  const visible = () => landingView && !landingView.classList.contains('hidden') && !document.hidden;
  const silentRefresh = () => { if (visible()) loadPublicWeather(document, { focus: false }); };
  let refreshTimer = null;
  const stopTimer = () => { if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; } };
  const startTimer = () => { stopTimer(); refreshTimer = setInterval(silentRefresh, LANDING_REFRESH_MS); };
  const onVisibility = () => { if (document.hidden) stopTimer(); else { silentRefresh(); startTimer(); } };
  document.addEventListener('visibilitychange', onVisibility);
  startTimer();
}
