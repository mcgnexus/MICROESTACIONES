// Rutas y secciones de la web pública. La portada no pide sesión; el panel sí.
import { api, escapeText, numberText, dateText, timeText, makeChart } from './ui.js';
import { mountLeadForms } from './leads.js';
import { sinceText } from './farm-cards.js';
import { mountFarmSimulation, renderSimulationShell } from './farm-sim.js';
import { mountWaSignup } from './wa-alerts-signup.js';

export const PUBLIC_SECTIONS = new Set([
  'tiempo-local', 'vias', 'comparacion-aemet', 'evolucion', 'fincas', 'demo-agricola', 'herramientas',
  'preguntas', 'contacto-publico', 'solicitar-piloto', 'acceso-gratuito', 'zonas', 'alertas', 'como-funciona', 'microclimas',
  'avisos-whatsapp',
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
  empezar: 'vias',
};

// Desplaza la vista a una sección pública de la portada.
//
// El encabezado de la sección recibe el foco: al seguir el enlace, el destino
// solo se anunciaba con el scroll y quien navega con lector de pantalla perdía
// el contexto de dónde estaba. Se usa preventScroll para que el foco no anule
// el desplazamiento suave que se pide después.
export function scrollToPublicSection(section) {
  const target = document.getElementById(PUBLIC_SECTION_ALIASES[section] || section);
  if (!target) return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  // Se prefiere el encabezado; si la sección no tiene ninguno, se enfoca ella.
  const heading = target.querySelector('h1, h2') || target;
  if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
  heading.focus({ preventScroll: true });
  target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}

export function showPublicSections(section = 'landing') {
  const weatherSections = new Set(['tiempo-local', 'comparacion-aemet', 'evolucion']);
  document.querySelectorAll('#landing-view > .landing-section, #landing-view > .landing-footnote')
    .forEach((element) => {
      // La app abre en la pantalla de tiempo local: la ruta sin sección
      // (landing) muestra lo mismo que #/tiempo-local.
      const show = section === 'landing' || section === 'tiempo-local'
        ? weatherSections.has(element.id)
        : element.id === section;
      element.classList.toggle('hidden', !show);
    });
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
    <div class="public-now-heading"><div><p class="eyebrow">PUNTO DE MEDIDA · CASCO URBANO</p><p class="public-location">${escapeText(point)}</p><p>${escapeText(station.name || '')} · un punto concreto, no toda la ciudad</p></div>
      <span class="badge ${station.connectivity === 'offline' ? 'badge-invalid' : stale ? 'badge-warn' : 'badge-valid'}">${station.connectivity === 'offline' ? 'Sin conexión' : stale ? 'Lectura no reciente' : 'Datos recientes'}</span></div>
    <div class="public-now-readings">
      <div><span>Temperatura</span><strong>${station.temperatureC != null ? `${numberText(station.temperatureC, 1)} °C` : 'Sin lectura registrada'}</strong><small>${tempFresh ? `Medido ${sinceText(station.temperatureObservedAt) || dateText(station.temperatureObservedAt)}` : `Última medición ${dateText(station.temperatureObservedAt)}`}</small></div>
      <div><span>Humedad</span><strong>${station.humidityPct != null ? `${numberText(station.humidityPct, 0)} %` : 'Sin lectura registrada'}</strong><small>${humidityFresh ? `Medido ${sinceText(station.humidityObservedAt) || dateText(station.humidityObservedAt)}` : `Última medición ${dateText(station.humidityObservedAt)}`}</small></div>
    </div>
    <p class="public-update">Última actualización de los sensores: <time datetime="${escapeText(lastUpdate || '')}">${escapeText(dateText(lastUpdate))}</time>. La lectura describe este punto del casco urbano.</p>
  </article>`;
}

// Comparación pública: dos valores enfrentados con su hora propia, la
// diferencia debajo y los metadatos (distancia, altitud) en un desplegable. Así
// se comparan en móvil sin barra horizontal y se mantienen las dos ubicaciones
// y sus tiempos por separado. La diferencia solo se calcula con dos lecturas
// comparables; si no las hay, se dice y no se infiere.
export function renderPublicZones(stations) {
  const cards = stations.map((station) => {
    const comparison = station.comparison;
    const aemetObservation = comparison?.aemet || station.aemet?.observation;
    const localValue = comparison?.local?.temperatureC ?? station.temperatureC;
    const localAt = comparison?.local?.observedAt || station.observedAt;
    // La pareja con AEMET puede ser anterior a la última lectura de la estación.
    // El servidor lo declara con `isLatestLocal`; si falta (respuesta antigua en
    // caché), se deduce comparando las horas. Mientras la última lectura no tenga
    // pareja, la comparación se presenta como histórica para no ofrecer dos
    // valores «actuales» distintos en la misma pantalla.
    const latestAt = station.temperatureObservedAt || station.observedAt || null;
    const pairIsHistorical = comparison?.state === 'matched'
      && (comparison.isLatestLocal === false
        || (comparison.local?.observedAt && latestAt
          && new Date(comparison.local.observedAt).getTime() < new Date(latestAt).getTime()));
    const aemetValue = aemetObservation?.temperatureC ?? station.aemet?.observation?.temperatureC;
    const aemetAt = aemetObservation?.observedAt;
    const localLabel = comparison?.local?.location || station.zone || station.name;
    const locationKind = station.locationType === 'urbano' ? 'casco urbano'
      : station.locationType === 'finca' ? 'finca' : null;
    const where = [station.zone, station.name, locationKind].filter(Boolean).join(' · ');
    const localState = pairIsHistorical ? 'Comparación con la estación oficial de una lectura anterior'
      : station.temperatureFreshness === 'stale' ? 'El dato es de hace tiempo'
        : station.connectivity === 'offline' ? 'La estación no envía datos'
          : station.temperatureFreshness === 'unknown' ? 'Sin dato fiable' : 'Dato reciente';
    const aemetStatus = station.aemet?.observationStatus;
    const aemetState = aemetStatus === 'unconfigured' ? 'No configurada'
      : aemetStatus === 'unavailable' ? 'Consulta no disponible'
        : aemetStatus === 'stale' ? 'El dato de AEMET está retrasado' : null;
    const diffValue = comparison?.state === 'matched' && comparison.differenceC != null
      ? `${comparison.differenceC > 0 ? '+' : ''}${numberText(comparison.differenceC, 1)} °C`
      : 'No calculada';
    // Si la pareja es anterior a la última lectura, la diferencia se fecha: no
    // describe el «ahora» sino el momento emparejado.
    const diff = pairIsHistorical && comparison?.state === 'matched'
      ? `a las ${timeText(localAt)} · ${diffValue}`
      : diffValue;
    const diffTone = comparison?.state === 'matched'
      ? (comparison.differenceC > 0 ? 'hace más calor' : comparison.differenceC < 0 ? 'hace más frío' : 'hace la misma temperatura')
      : null;
    const windowNote = comparison?.state !== 'matched'
      ? `Sin datos comparables: las dos lecturas se separan más de ${numberText(comparison?.windowMinutes || 10, 0)} minutos`
      : null;
    // La última lectura permanece como único valor «actual» (lo muestra la
    // tarjeta del tiempo local): aquí se dice que aún no se ha comparado.
    const latestNoPairNote = pairIsHistorical && latestAt
      ? `La última lectura${station.temperatureC != null ? ` (${numberText(station.temperatureC, 1)} °C a las ${timeText(latestAt)})` : ''} todavía no se ha podido comparar con la estación oficial.`
      : null;
    const proximity = comparison?.proximity || aemetObservation?.proximity || station.aemet?.observation?.proximity;
    const metadata = proximity ? `<details class="comparison-metadata"><summary>Distancia y altitud</summary>
      <p class="aemet-proximity"><strong>${escapeText(where)}:</strong> ${numberText(proximity.distanceKm, 1)} km entre emplazamientos · altitud AEMET ${proximity.aemetAltitudeM == null ? '—' : `${numberText(proximity.aemetAltitudeM, 0)} m`} (${escapeText(proximity.aemetAltitudeSource || 'sin fuente')}) · urbana ${proximity.microAltitudeM == null ? '—' : `${numberText(proximity.microAltitudeM, 0)} m`} (${escapeText(proximity.microAltitudeSource || 'sin fuente')}). Coordenadas AEMET: ${escapeText(proximity.aemetLocationSource || 'sin fuente')}; urbanas: ${escapeText(proximity.microLocationSource || 'sin fuente')}.</p></details>` : '';
    return `<article class="comparison-card">
      <h3>${escapeText(where)}</h3>
      <div class="comparison-readings">
        <div class="reading reading-local">
          <span class="reading-label">Medición local${escapeText(localLabel && localLabel !== where ? ` · ${localLabel}` : '')}</span>
          <strong>${localValue == null ? '—' : `${numberText(localValue, 1)} °C`}</strong>
          <span class="reading-time">${escapeText(dateText(localAt) || '—')}</span>
          <span class="reading-state">${escapeText(localState)}</span>
        </div>
        <div class="reading reading-aemet">
          <span class="reading-label">Observación AEMET · ${escapeText(aemetObservation?.stationId || station.aemet?.observation?.stationId || 'AEMET')}</span>
          <strong>${aemetValue == null ? '—' : `${numberText(aemetValue, 1)} °C`}</strong>
          <span class="reading-time">${escapeText(dateText(aemetAt) || '—')}</span>
          <span class="reading-state">${escapeText(aemetState || '—')}</span>
        </div>
      </div>
      <div class="comparison-diff">
        <strong>${escapeText(diff)}</strong>
        ${diffTone ? `<span>En este punto ${diffTone} · las dos lecturas se separan menos de ${numberText(comparison?.windowMinutes || 10, 0)} minutos</span>` : ''}
        ${windowNote ? `<span>${escapeText(windowNote)}</span>` : ''}
        ${latestNoPairNote ? `<span>${escapeText(latestNoPairNote)}</span>` : ''}
      </div>
      ${metadata}
    </article>`;
  }).join('');

  const forecastKeys = new Set();
  const forecasts = stations.map((station) => {
    const days = station.aemet?.forecast?.days || [];
    if (!days.length) return '';
    const key = station.aemet.forecast.municipality || station.zone || station.name;
    if (forecastKeys.has(key)) return '';
    forecastKeys.add(key);
    const age = station.aemet.forecastStatus === 'stale' && station.aemet.forecastAgeSeconds != null
      ? ` · el dato de AEMET está retrasado (${Math.round(station.aemet.forecastAgeSeconds / 60)} min)` : '';
    return `<article class="weather-provider"><h4>Previsión municipal AEMET · ${escapeText(key)}${age}</h4><div class="weather-days">${days.map((day) => `<div class="weather-day"><strong>${escapeText(String(day.date).slice(0, 10))}</strong><span>${escapeText(day.sky || 'Sin descripción')}</span><span>${numberText(day.temperatureMinC)}° / ${numberText(day.temperatureMaxC)} °C</span></div>`).join('')}</div></article>`;
  }).filter(Boolean).join('');
  const hasForecast = stations.some((station) => station.aemet?.forecast?.days?.length);
  const forecastNotice = !hasForecast && stations.some((station) => station.aemet)
    ? `<article class="weather-provider"><h4>Previsión municipal · independiente de las observaciones</h4><p>${stations.some((station) => station.aemet?.forecastStatus === 'unconfigured') ? 'Previsión AEMET no configurada para esta ubicación.' : stations.some((station) => station.aemet?.forecastStatus === 'unavailable') ? 'No se ha podido consultar la previsión municipal AEMET.' : 'AEMET no ha devuelto días de previsión que podemos mostrar.'}</p></article>` : '';
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
        : state === 'stale' ? `Consulta no disponible; el último dato que sí nos llegó es del ${dateText(aemet.warningsFetchedAt)} (hace ${Math.round((aemet.warningsAgeSeconds || 0) / 60)} min)${active.length ? '' : ', sin avisos vigentes en ese dato'}.`
          : state === 'unconfigured' ? 'Consulta de avisos AEMET no configurada.' : 'No se ha podido consultar avisos AEMET.';
    return `<article class="weather-provider"><h4>Avisos oficiales · ${escapeText(station.zone || station.name)}</h4><p>${escapeText(banner)}</p>${active.map((warning) => `<p><strong>${escapeText(warning.event || warning.headline || 'Aviso')} · ${escapeText(warning.severity || 'sin nivel')}</strong> ${escapeText(warning.area || '')} · ${warning.expires ? `vigente hasta ${escapeText(dateText(warning.expires))}` : ''}</p>`).join('')}</article>`;
  }).filter(Boolean).join('');
  return `${cards}<p class="hint">Las diferencias solo se calculan cuando la medición y la observación oficial están separadas por menos de 10 minutos. Si el número es positivo, en este punto hace más calor; si es negativo, hace más frío. La distancia, la altitud, la exposición y el entorno pueden influir; no se atribuye el resultado a un factor único.</p>${forecasts || forecastNotice ? `<section class="public-forecast"><h3>Previsión · independiente de las observaciones</h3>${forecasts}${forecastNotice}</section>` : ''}${warnings ? `<section class="public-forecast"><h3>Avisos oficiales AEMET</h3>${warnings}</section>` : ''}`;
}

// Contraste con el modelo (Open-Meteo): pareja la lectura local más reciente
// con la hora del modelo que la cubre. No es una comparación de verdad sino de
// coherencia: el modelo describe una celda de ~11 km y la estación su punto
// exacto, así que diferencias pequeñas son esperadas. Sin pareja, se dice y no
// se calcula nada (mismo criterio que la comparación con AEMET).
export function renderModelComparisonCard(stations) {
  const station = selectUrbanStation(stations);
  if (!station) return '';
  const comparison = station.modelComparison;
  if (!comparison) return '';
  const where = [station.zone, station.name].filter(Boolean).join(' · ');
  const matched = comparison.state === 'matched' && comparison.model;
  const model = matched ? comparison.model : null;
  const diff = matched && comparison.differenceC != null
    ? `${comparison.differenceC > 0 ? '+' : ''}${numberText(comparison.differenceC, 1)} °C`
    : 'No calculada';
  const diffTone = matched && comparison.differenceC != null
    ? comparison.differenceC > 0 ? 'La estación mide más calor que el modelo'
      : comparison.differenceC < 0 ? 'La estación mide más frío que el modelo'
        : 'La estación y el modelo coinciden'
    : null;
  const state = matched ? 'Estimación del modelo'
    : comparison.state === 'no_pair' ? `Sin pareja: la lectura se separa más de ${numberText(comparison.windowMinutes || 20, 0)} min de la hora del modelo`
      : 'El modelo no está disponible ahora mismo';
  const pressure = matched && comparison.pressureDifferenceHpa != null
    ? `<span>Presión: la estación marca ${comparison.pressureDifferenceHpa > 0 ? '+' : ''}${numberText(comparison.pressureDifferenceHpa, 1)} hPa frente a la superficie del modelo; refleja en parte la distinta altitud del emplazamiento y de la celda.</span>`
    : '';
  return `<article class="comparison-card comparison-model">
    <h3>Sensor vs modelo · ${escapeText(where)}</h3>
    <div class="comparison-readings">
      <div class="reading reading-local">
        <span class="reading-label">Medición local</span>
        <strong>${comparison.local?.temperatureC == null ? '—' : `${numberText(comparison.local.temperatureC, 1)} °C`}</strong>
        <span class="reading-time">${escapeText(dateText(comparison.local?.observedAt) || '—')}</span>
        <span class="reading-state">Dato medido</span>
      </div>
      <div class="reading reading-aemet">
        <span class="reading-label">Modelo Open-Meteo</span>
        <strong>${model?.temperatureC == null ? '—' : `${numberText(model.temperatureC, 1)} °C`}</strong>
        <span class="reading-time">${escapeText(dateText(model?.forecastFor) || '—')}</span>
        <span class="reading-state">${escapeText(state)}</span>
      </div>
    </div>
    <div class="comparison-diff">
      <strong>${escapeText(diff)}</strong>
      ${diffTone ? `<span>${escapeText(diffTone)} · las dos horas se separan menos de ${numberText(comparison.windowMinutes || 20, 0)} minutos</span>` : ''}
      <span>Diferencia esperable: el modelo describe una celda de ~11 km; la estación mide su punto exacto.</span>
      ${pressure}
    </div>
    <details class="comparison-metadata"><summary>Fuente del modelo</summary>
      <p class="aemet-proximity">Modelo agregado de Open-Meteo.com (licencia CC-BY 4.0), consultado ${escapeText(dateText(station.openMeteo?.fetchedAt))}. El modelo no mide: estima con simulación numérica; el contraste sirve para vigilar la coherencia del sensor, no para corregirlo.</p>
    </details>
  </article>`;
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
    return `<p class="public-state-card tone-muted">No hay datos suficientes de las últimas 24 horas para dibujar una evolución.</p>`;
  }
  return `<div class="public-chart-grid">
    ${temperature.length >= 2 ? makeChart('Temperatura · últimas 24 horas', temperature, 'temperatureC', '#c97742', '°C', 1) : '<div class="public-state-card tone-muted">Aún no hay dos mediciones de temperatura en las últimas 24 horas.</div>'}
    ${humidity.length >= 2 ? makeChart('Humedad · últimas 24 horas', humidity, 'humidityPct', '#168b80', '%', 0) : '<div class="public-state-card tone-muted">Aún no hay dos mediciones de humedad en las últimas 24 horas.</div>'}
  </div>
  <div class="landing-actions"><a class="cta secondary" href="#/entrar" data-return="evolucion">Consultar histórico</a></div>
  <p class="hint">El panel añade periodos de 7 y 30 días; los datos cubren desde la puesta en servicio de la estación, no antes.</p>`;
}

// La app abre en la pantalla de tiempo local: sin ruta (o con «#/») la vista se
// centra en la tarjeta grande de temperatura y humedad.
const isOpenRoute = () => !location.hash || location.hash === '#' || location.hash === '#/';

function focusWeatherCard(container) {
  const card = container?.firstElementChild;
  if (!card || typeof card.scrollIntoView !== 'function') return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  card.setAttribute('tabindex', '-1');
  card.focus({ preventScroll: true });
  card.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
}

// Si no hay tarjeta que enfocar (fallo de carga sin SSR), el foco va al estado
// de aviso de la propia sección para que no se pierda en un elemento oculto.
function focusWeatherFallback(root) {
  const card = root.querySelector('#local-weather-card');
  const state = root.querySelector('#local-weather-state');
  const target = card?.firstElementChild || state;
  if (!target || typeof target.focus !== 'function') return;
  target.setAttribute('tabindex', '-1');
  target.focus({ preventScroll: true });
}

function setPublicFailure(root, message) {
  const loading = root.querySelector('#local-weather-state');
  const card = root.querySelector('#local-weather-card');
  const comparison = root.querySelector('#public-comparison');
  const model = root.querySelector('#public-model');
  const evolution = root.querySelector('#public-evolution');
  if (loading) settle(loading).innerHTML = `<p class="public-state-card tone-warn" role="alert">${escapeText(message)}</p>`;
  // Si el servidor ya pintó la tarjeta (SSR), un fallo posterior no la borra:
  // se mantiene la última lectura mostrada en vez de dejar un hueco.
  if (card && !card.hasAttribute('data-public-ready')) card.innerHTML = '';
  if (comparison) settle(comparison).innerHTML = '<p class="public-state-card tone-muted">La comparación no está disponible hasta recuperar las observaciones.</p>';
  if (model) settle(model).innerHTML = '';
  if (evolution) settle(evolution).innerHTML = '<p class="public-state-card tone-muted">La evolución no está disponible hasta recuperar las mediciones.</p>';
}

// El contenedor nace con `public-loading` (fila para el indicador de carga); al
// llegar el contenido se retira la clase para que deje de ser un flex en fila y
// el contenido fluya en bloque (evita el desbordamiento horizontal).
const settle = (el) => {
  if (el) el.classList.remove('public-loading');
  return el;
};

// HTML de las tres piezas públicas a partir de las estaciones autorizadas. Lo
// comparten el cliente (al cargar, tras la API) y el servidor (primer pintado
// sin JS): una sola definición evita que el HTML servido y el del cliente
// diverjan. Si no hay estación urbana, devuelve los estados vacíos.
export function renderPublicWeather(stations = []) {
  const station = selectUrbanStation(stations);
  return {
    card: renderLocalWeatherCard(station),
    comparison: station
      ? renderPublicZones([station])
      : '<p class="public-state-card tone-muted">Aún no hay una estación urbana con permiso de publicación. La comparación con AEMET aparecerá cuando haya observaciones reales.</p>',
    model: renderModelComparisonCard(stations),
    evolution: renderDayHistory(station),
    observedAt: station ? (station.temperatureObservedAt || station.humidityObservedAt || null) : null,
  };
}

// Carga únicamente observaciones autorizadas y publica estados claros si no
// llegan datos. Los refrescos periódicos pasan `focus: false` para no mover
// el scroll ni el foco de quien está leyendo.
let publicWeatherInFlight = false;

export async function loadPublicWeather(root = document, { focus = true } = {}) {
  if (!root.querySelector('#local-weather-state') || publicWeatherInFlight) return;
  publicWeatherInFlight = true;
  try {
    const { stations } = await api('/api/v1/public/stations');
    const parts = renderPublicWeather(stations);
    settle(root.querySelector('#local-weather-state')).innerHTML = '';
    root.querySelector('#local-weather-card').innerHTML = parts.card;
    // Solo en la carga inicial y solo si se abre en la portada: en otras
    // secciones públicas el scroll lo manda la ruta y no se le disputa.
    if (focus && isOpenRoute()) {
      focusWeatherCard(root.querySelector('#local-weather-card'));
    }
    settle(root.querySelector('#public-comparison')).innerHTML = parts.comparison;
    settle(root.querySelector('#public-model')).innerHTML = parts.model || '';
    settle(root.querySelector('#public-evolution')).innerHTML = parts.evolution;
    // Señal para que la app ofrezca instalar la PWA después de consultar datos.
    if (typeof document !== 'undefined') document.dispatchEvent(new Event('tecrural:data-loaded'));
  } catch {
    setPublicFailure(root, 'No se han podido cargar las mediciones públicas. Inténtalo de nuevo más tarde.');
    if (focus && isOpenRoute()) focusWeatherFallback(root);
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
  mountWaSignup();
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
