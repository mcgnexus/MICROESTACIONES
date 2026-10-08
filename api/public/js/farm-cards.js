// Tarjetas de estado para el agricultor: cada una responde qué ocurre, desde
// cuándo, qué significa y qué puede hacer el usuario. Sin jerga ni coordenadas.
import { escapeText, dateText, numberText } from './ui.js';
import { coverageCaveat, NOTICE_NATURES } from './notice-taxonomy.js';

export const FROST_C = 2;
export const FROST_HARD_C = 0;
export const HEAT_C = 35;
export const HEAT_HARD_C = 38;

const TONE_LABELS = { alert: 'Atención', warn: 'Vigilar', ok: 'Correcto', muted: 'Sin dato' };
export const toneLabel = (tone) => TONE_LABELS[tone] || TONE_LABELS.muted;

// La tarjeta declara si afirma un dato real, una previsión o un cálculo.
function natureBadge(nature) {
  if (!nature || !NOTICE_NATURES[nature]) return '';
  return `<span class="badge badge-muted" title="${escapeText(NOTICE_NATURES[nature].hint)}">${escapeText(NOTICE_NATURES[nature].label)}</span>`;
}

// Proveedor de la previsión que sostiene un aviso: sin nombrarlo, una previsión
// se leería como una detección local, que no hacemos.
function forecastProvider(item) {
  if (item.weather?.aemet?.forecast?.days?.length) return 'AEMET';
  if (item.weather?.openMeteo?.daily?.length) return 'Open-Meteo';
  return null;
}

// ¿La fuente externa está consultable? Si no, "sin avisos" no cubre nada.
function forecastUnavailable(item) {
  const weather = item.weather;
  if (!weather) return false;
  return Boolean(weather.stale)
    || (weather.errors || []).length > 0
    || ['stale', 'unavailable', 'unconfigured'].includes(weather.aemet?.warningsStatus);
}

// "hace X" a partir de una marca de tiempo.
export function sinceText(value, now = new Date()) {
  if (!value) return null;
  const then = new Date(value);
  if (Number.isNaN(then.getTime())) return null;
  const minutes = Math.round((now.getTime() - then.getTime()) / 60000);
  if (minutes < 2) return 'hace un momento';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `hace ${hours} h` : `hace ${Math.round(hours / 24)} días`;
}

const forecastDay = (item, key, picker) => {
  const days = item.weather?.aemet?.forecast?.days || item.weather?.openMeteo?.daily || [];
  const values = days.map((day) => Number(day[key])).filter(Number.isFinite);
  return values.length ? picker(...values) : null;
};

const advisory = (item, kind) => (item.weather?.advisories || []).find((notice) => notice.kind === kind) || null;

// ---- Riesgos ---------------------------------------------------------------

export function assessFrost(item) {
  const hasSensor = item.device?.sensors?.temperature !== false;
  const localFresh = item.status?.dataFreshness === 'fresh';
  const temperature = hasSensor && localFresh ? item.latest?.temperatureC : null;
  const observed = localFresh ? item.latest?.observedAt : null;
  const forecastMin = forecastDay(item, 'temperatureMinC', Math.min);
  if (temperature != null && temperature <= FROST_HARD_C) {
    return { tone: 'alert', value: `${numberText(temperature)} °C`, since: observed,
      nature: 'real',
      meaning: 'Hace suficiente frío para que se forme hielo sobre el cultivo.',
      action: 'Protege los cultivos sensibles esta noche si puedes.' };
  }
  if (temperature != null && temperature <= FROST_C) {
    return { tone: 'warn', value: `${numberText(temperature)} °C`, since: observed,
      nature: 'real',
      meaning: 'Está en el rango en el que puede empezar una helada.',
      action: 'Vigila el termómetro y ten a mano la protección.' };
  }
  if (forecastMin != null && forecastMin <= FROST_C) {
    const provider = forecastProvider(item) || 'La previsión externa';
    return { tone: 'warn', value: `previsión ${numberText(forecastMin)} °C`, since: null,
      nature: 'previsto',
      meaning: `${provider} prevé una mínima de ${numberText(forecastMin)} °C. Es una previsión, no una medida de tu estación.`,
      action: 'Prepárate para proteger los cultivos más sensibles.' };
  }
  const advisoryNotice = advisory(item, 'helada');
  if (advisoryNotice) {
    return { tone: 'warn', value: 'riesgo estimado', since: null, nature: 'calculado',
      meaning: advisoryNotice.text, action: 'Revisa tu cultivo y la previsión.' };
  }
  if (!hasSensor) return { tone: 'muted', value: 'sin sensor', since: null,
    meaning: 'Esta estación no mide temperatura, así que no se estima el riesgo de helada.',
    action: 'La previsión de la zona sigue disponible como referencia externa.' };
  if (!localFresh) return { tone: 'muted', value: 'sin lectura actual', since: item.status?.lastValidData,
    meaning: 'No hay una medición válida reciente para estimar el riesgo local.',
    action: 'Comprueba la conexión de la estación antes de tomar decisiones.' };
  if (temperature == null) return { tone: 'muted', value: 'sin dato', since: observed,
    meaning: 'La estación no ha entregado una temperatura válida en este periodo.',
    action: 'No se afirma que no haya riesgo: sencillamente no hay medición.' };
  const missingForecast = forecastMin == null && forecastProvider(item) == null;
  return { tone: 'ok', value: `${numberText(temperature)} °C`, since: observed, nature: 'real',
    meaning: `Sin riesgo de helada según la medición actual${missingForecast ? ' (sin previsión disponible: la afirmación solo cubre este momento)' : ''}.`,
    action: 'No hace falta hacer nada.' };
}

export function assessHeat(item) {
  const hasSensor = item.device?.sensors?.temperature !== false;
  const localFresh = item.status?.dataFreshness === 'fresh';
  const temperature = hasSensor && localFresh ? item.latest?.temperatureC : null;
  const observed = localFresh ? item.latest?.observedAt : null;
  const forecastMax = forecastDay(item, 'temperatureMaxC', Math.max);
  if (temperature != null && temperature >= HEAT_HARD_C) {
    return { tone: 'alert', value: `${numberText(temperature)} °C`, since: observed,
      nature: 'real',
      meaning: 'Calor extremo. El ganado y los cultivos sufren estrés.',
      action: 'Asegura agua y sombra, y evita trabajar en las horas centrales.' };
  }
  if (temperature != null && temperature >= HEAT_C) {
    return { tone: 'warn', value: `${numberText(temperature)} °C`, since: observed,
      nature: 'real',
      meaning: 'Temperatura elevada durante un rato.',
      action: 'Vigila el agua y la sombra del ganado.' };
  }
  if (forecastMax != null && forecastMax >= HEAT_C) {
    const provider = forecastProvider(item) || 'La previsión externa';
    return { tone: 'warn', value: `previsión ${numberText(forecastMax)} °C`, since: null,
      nature: 'previsto',
      meaning: `${provider} prevé una máxima de ${numberText(forecastMax)} °C. Es una previsión, no una medida de tu estación.`,
      action: 'Prepara agua y sombra para esos días.' };
  }
  const advisoryNotice = advisory(item, 'calor');
  if (advisoryNotice) {
    return { tone: 'warn', value: 'riesgo estimado', since: null, nature: 'calculado',
      meaning: advisoryNotice.text, action: 'Revisa tu cultivo y la previsión.' };
  }
  if (!hasSensor) return { tone: 'muted', value: 'sin sensor', since: null,
    meaning: 'Esta estación no mide temperatura, así que no se estima el calor local.',
    action: 'La previsión de la zona sigue disponible como referencia externa.' };
  if (!localFresh) return { tone: 'muted', value: 'sin lectura actual', since: item.status?.lastValidData,
    meaning: 'No hay una medición válida reciente para estimar el calor local.',
    action: 'Comprueba la conexión de la estación antes de tomar decisiones.' };
  if (temperature == null) return { tone: 'muted', value: 'sin dato', since: observed,
    meaning: 'La estación no ha entregado una temperatura válida en este periodo.',
    action: 'No se afirma que la temperatura sea normal: no hay medición.' };
  const missingForecast = forecastMax == null && forecastProvider(item) == null;
  return { tone: 'ok', value: `${numberText(temperature)} °C`, since: observed, nature: 'real',
    meaning: `Temperatura dentro de lo normal según la medición actual${missingForecast ? ' (sin previsión disponible: la afirmación solo cubre este momento)' : ''}.`,
    action: 'No hace falta hacer nada.' };
}

// Las tormentas no se detectan con los sensores actuales: se muestran avisos
// oficiales y riesgo estimado, nunca una detección local.
export function assessStorm(item) {
  const official = (item.weather?.aemet?.warnings || []).find((warning) =>
    /tormenta|lluvia|precipit|chubasco|granizo/i.test(`${warning.event} ${warning.headline} ${warning.description}`));
  if (official) {
    return { tone: 'alert', value: official.severity || 'aviso oficial', since: official.onset,
      nature: 'previsto',
      meaning: official.headline || official.event || 'Aviso oficial de AEMET para tu zona.',
      action: 'Sigue las indicaciones oficiales y protege lo que puedas.' };
  }
  const advisoryNotice = advisory(item, 'lluvia');
  if (advisoryNotice) {
    return { tone: 'warn', value: 'riesgo estimado', since: advisoryNotice.date, nature: 'calculado',
      meaning: advisoryNotice.text, action: 'Revisa la previsión antes de planificar el trabajo.' };
  }
  // Sin fuente consultable no se afirma que no haya tormenta.
  if (forecastUnavailable(item)) {
    return { tone: 'muted', value: 'fuente no disponible', since: item.weather?.aemet?.warningsFetchedAt || null,
      meaning: 'La previsión externa y los avisos oficiales no se pueden consultar ahora mismo: no se afirma que no haya tormenta.',
      action: 'Vuelve a comprobarlo cuando la fuente vuelva, o consulta la previsión oficial directamente.' };
  }
  return { tone: 'muted', value: 'sin avisos', since: null,
    meaning: 'Sin avisos oficiales ni riesgo estimado de tormenta en las fuentes consultadas.',
    action: 'Sin acción. Añadir pluviómetro y anemómetro permitiría afinar esto.' };
}

export function assessConnectivity(item) {
  const status = item.status || {};
  const last = status.lastContact || item.latest?.observedAt;
  if (status.connectivity === 'offline') {
    return { tone: 'alert', value: 'sin conexión', since: last, nature: 'real',
      meaning: 'La estación no está enviando datos.',
      action: 'Comprueba la cobertura o avísanos para revisarla.' };
  }
  if (status.connectivity === 'degraded') {
    return { tone: 'warn', value: 'intermitente', since: last, nature: 'real',
      meaning: 'La estación conecta a ratos.',
      action: 'Si sigue así, avísanos para revisarla.' };
  }
  if (status.dataFreshness === 'stale') {
    return { tone: 'warn', value: 'datos antiguos', since: status.lastValidData, nature: 'real',
      meaning: 'La estación se ha comunicado, pero no hay una medición válida reciente.',
      action: 'Las lecturas mostradas no representan necesariamente las condiciones actuales.' };
  }
  if (status.dataFreshness === 'unknown') {
    return { tone: 'muted', value: 'sin datos válidos', since: status.lastContact,
      meaning: 'Aún no hay mediciones válidas de esta estación.',
      action: 'No se muestran valores como si fueran actuales.' };
  }
  return { tone: 'ok', value: 'conectada', since: last, nature: 'real',
    meaning: 'La estación envía datos con normalidad.', action: 'No hace falta hacer nada.' };
}

export function assessStation(item) {
  const battery = item.status?.batteryLevel;
  const hasBattery = item.device?.sensors?.battery !== false;
  // Sin mediciones válidas no se afirma que la estación esté "en orden".
  if (item.status?.dataFreshness === 'unknown') {
    return { tone: 'muted', value: 'sin datos', since: item.status?.lastContact,
      meaning: 'Esta estación aún no ha entregado mediciones válidas.',
      action: 'No se muestra como correcta: simplemente no hay datos todavía.' };
  }
  if (item.status?.dataFreshness === 'stale') {
    return { tone: 'warn', value: 'datos antiguos', since: item.status?.lastValidData, nature: 'real',
      meaning: 'El estado de los sensores no tiene una medición válida reciente.',
      action: 'Comprueba la conexión antes de confiar en el estado de la estación.' };
  }
  if (!hasBattery) {
    return { tone: 'muted', value: 'sin dato', since: item.status?.updatedAt,
      meaning: 'Esta estación no mide batería.',
      action: 'No se afirma nada sobre su energía.' };
  }
  if (battery === 'critical') {
    return { tone: 'alert', value: 'batería crítica', since: item.status?.updatedAt, nature: 'real',
      meaning: 'La batería puede agotarse y dejar de enviar.',
      action: 'Avísanos cuanto antes para revisar la energía.' };
  }
  if (battery === 'low') {
    return { tone: 'warn', value: 'batería baja', since: item.status?.updatedAt, nature: 'real',
      meaning: 'La batería está bajando, aunque la estación sigue enviando.',
      action: 'Conviene revisarla en los próximos días.' };
  }
  return { tone: 'ok', value: 'en orden', since: item.status?.updatedAt, nature: 'real',
    meaning: 'La estación y su batería están bien.', action: 'No hace falta hacer nada.' };
}

// ---- Tarjetas principales --------------------------------------------------

function stateCard({ icon, title, tone, value, since, meaning, action, nature = null }) {
  const sinceLine = since ? `Desde ${escapeText(sinceText(since) || '—')}` : 'Ahora mismo';
  return `<article class="state-card tone-${tone}">
    <div class="state-card-head">
      <span class="state-icon" aria-hidden="true">${icon}</span>
      <h3>${escapeText(title)}</h3>
      <span class="overview-tag tone-${tone}">${escapeText(toneLabel(tone))}</span>
      ${natureBadge(nature)}
    </div>
    <p class="state-value">${escapeText(value)}</p>
    <p class="state-since">${escapeText(sinceLine)}</p>
    <p class="state-meaning">${escapeText(meaning)}</p>
    <p class="state-action">${escapeText(action)}</p>
  </article>`;
}

const worst = (assessments) => assessments.some((entry) => entry.tone === 'alert') ? 'alert'
  : assessments.some((entry) => entry.tone === 'warn') ? 'warn'
    : assessments.some((entry) => entry.tone === 'ok') ? 'ok' : 'muted';

// Tarjetas de la primera pantalla: dos lecturas y cinco estados.
export function renderStateCards(devices, now = new Date()) {
  if (!devices.length) return '<p class="empty">Todavía no hay estaciones que mostrar.</p>';
  const primary = devices[0];
  const frost = assessFrost(primary);
  const heat = assessHeat(primary);
  const storm = assessStorm(primary);
  const connection = assessConnectivity(primary);
  const station = assessStation(primary);
  const sensors = primary.device?.sensors || {};
  const readingsFresh = primary.status?.dataFreshness === 'fresh';
  // Las lecturas se muestran aunque estén anticuadas: cambia el tono, el
  // título y el aviso, pero una medida vieja es mejor que un guion.
  const lastReading = primary.latest?.isValidated === false
    ? ((primary.history || []).at(-1) || primary.latest)
    : primary.latest;
  const temperature = lastReading?.temperatureC ?? null;
  const humidity = lastReading?.humidityPct ?? null;
  const lastSeen = lastReading?.observedAt ?? null;
  const reading = (icon, freshTitle, staleTitle, value, unit, since, hasSensor = true) => stateCard({
    icon,
    title: readingsFresh ? freshTitle : staleTitle,
    tone: hasSensor && value != null ? (readingsFresh ? 'ok' : 'warn') : 'muted',
    nature: hasSensor && value != null ? 'real' : null,
    value: !hasSensor ? 'sin sensor' : value == null ? 'sin dato' : `${numberText(value)} ${unit}`.trim(),
    since,
    meaning: !hasSensor ? 'La estación no tiene este sensor.'
      : value == null ? (readingsFresh ? 'Aún no hay una medición reciente.' : 'No hay medición válida registrada en el periodo.')
        : readingsFresh ? 'Última medición de la estación.' : 'Última medición disponible: los datos están anticuados.',
    action: !hasSensor ? 'No aplica.'
      : value == null ? 'Comprueba la conexión antes de usar estos datos.'
        : readingsFresh ? 'Sin acción.' : 'No la tomes como tiempo actual.',
  });
  return `<div class="state-grid">
    ${reading('🌡️', 'Temperatura actual', 'Última temperatura', temperature, '°C', lastSeen, sensors.temperature !== false)}
    ${reading('💧', 'Humedad actual', 'Última humedad', humidity, '%', lastSeen, sensors.humidity !== false)}
    ${stateCard({ icon: '❄️', title: 'Riesgo de helada', tone: frost.tone, value: frost.value, since: frost.since, meaning: frost.meaning, action: frost.action, nature: frost.nature })}
    ${stateCard({ icon: '🔥', title: 'Riesgo de calor', tone: heat.tone, value: heat.value, since: heat.since, meaning: heat.meaning, action: heat.action, nature: heat.nature })}
    ${stateCard({ icon: '⛈️', title: 'Riesgo de tormenta', tone: storm.tone, value: storm.value, since: storm.since, meaning: storm.meaning, action: storm.action, nature: storm.nature })}
    ${stateCard({ icon: '📡', title: 'Última comunicación', tone: connection.tone, value: connection.value, since: connection.since, meaning: connection.meaning, action: connection.action, nature: connection.nature })}
    ${stateCard({ icon: '🔋', title: 'Estado de la estación', tone: station.tone, value: station.value, since: station.since, meaning: station.meaning, action: station.action, nature: station.nature })}
  </div>`;
}

// Próximo riesgo: el aviso abierto más urgente o el riesgo estimado más cercano.
export function nextRisk(devices, alerts = [], now = new Date()) {
  const open = alerts.filter((alert) => !alert.closedAt);
  if (open.length) {
    const first = open.sort((a, b) => Number(b.level) - Number(a.level))[0];
    return { tone: first.level === 1 ? 'alert' : 'warn', title: first.message,
      when: first.observedAt, device: first.deviceName,
      meaning: 'Ya hay una alerta activa en tu finca.', action: 'Revisa la situación y actúa según la alerta.' };
  }
  const candidates = [];
  for (const item of devices) {
    for (const notice of item.weather?.advisories || []) {
      candidates.push({ tone: 'warn', title: notice.text, when: notice.date, device: item.device?.name });
    }
  }
  candidates.sort((a, b) => new Date(a.when).getTime() - new Date(b.when).getTime());
  if (candidates.length) {
    return { ...candidates[0], meaning: 'Es el riesgo previsto más próximo.',
      action: 'Tenlo en cuenta para los próximos días.' };
  }
  // Sin avisos ni riesgos estimados: hay que decir con qué datos se ha mirado.
  // Un vacío no es un "no hay riesgo" si faltan mediciones o la previsión cae.
  const caveat = coverageCaveat(devices);
  if (caveat) {
    return {
      tone: caveat.tone === 'warn' ? 'warn' : 'muted',
      title: 'Sin datos suficientes para descartar riesgos',
      when: null, device: null,
      meaning: caveat.text,
      action: 'Revisa la conexión de las estaciones y vuelve a mirar antes de dar nada por tranquilo.',
    };
  }
  return { tone: 'ok', title: 'Sin riesgos previstos', when: null, device: null,
    meaning: 'No hay alertas activas ni riesgos estimados próximos, con lecturas actuales y previsión disponible.',
    action: 'Puedes seguir con tu rutina.' };
}

// Comparación entre zonas: sin coordenadas, solo lecturas y diferencia.
export function zoneComparison(devices) {
  const withReadings = devices.filter((item) => item.latest);
  if (withReadings.length < 2) return null;
  const reference = withReadings[0].latest.temperatureC;
  const rows = withReadings.map((item) => {
    const temperature = item.latest.temperatureC;
    const difference = temperature != null && reference != null ? temperature - reference : null;
    return {
      name: item.device.name,
      temperature,
      humidity: item.latest.humidityPct,
      difference,
      observedAt: item.latest.observedAt,
    };
  });
  return rows;
}

export function renderZoneComparison(devices) {
  const rows = zoneComparison(devices);
  if (!rows) return '<p class="hint">Necesitas al menos dos estaciones con datos para comparar zonas.</p>';
  return `<div class="table-wrap"><table class="comparison-table">
    <thead><tr><th>Zona</th><th>Temperatura</th><th>Humedad</th><th>Diferencia</th><th>Última lectura</th></tr></thead>
    <tbody>${rows.map((row) => `<tr>
      <td>${escapeText(row.name)}</td>
      <td>${row.temperature == null ? '—' : `${numberText(row.temperature)} °C`}</td>
      <td>${row.humidity == null ? '—' : `${numberText(row.humidity)} %`}</td>
      <td>${row.difference == null ? 'referencia' : `${row.difference > 0 ? '+' : ''}${numberText(row.difference)} °C`}</td>
      <td>${escapeText(sinceText(row.observedAt) || dateText(row.observedAt))}</td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

export function renderNextRisk(risk) {
  return `<article class="next-risk tone-${risk.tone}">
    <div class="state-card-head"><span class="state-icon" aria-hidden="true">⚠️</span>
      <h3>${escapeText(risk.title)}</h3>
      <span class="overview-tag tone-${risk.tone}">${escapeText(toneLabel(risk.tone))}</span></div>
    <p class="state-since">${risk.when ? escapeText(dateText(risk.when)) : 'Ahora'}${risk.device ? ` · ${escapeText(risk.device)}` : ''}</p>
    <p class="state-meaning">${escapeText(risk.meaning)}</p>
    <p class="state-action">${escapeText(risk.action)}</p>
  </article>`;
}
