// Taxonomía única de los avisos de esta versión.
//
// Todo aviso —en pantalla, en un correo o en WhatsApp— declara cinco datos:
// categoría, fuente, fecha, estado y vigencia. Y sobre todo, de qué clase de
// afirmación se trata:
//
//   real      dato observado o medido (estado de la estación, medida al umbral)
//   previsto  previsión externa o aviso oficial: aún no ha ocurrido
//   calculado derivado por una fórmula (estimación sobre previsión, punto de rocío)
//   simulado  valor de muestra de la demostración; no describe ninguna finca
//   comunicacion los dos tipos de mensaje (comercial y acceso) no son avisos de
//             riesgo: marcarlos así deja claro que no son ninguno de los cuatro
//
// El módulo es puro (sin DOM ni fetch) y vive en public/js porque el navegador
// solo puede importar desde ahí; src/ lo importa con ruta relativa, de modo que
// pantalla y mensaje describen un aviso de la misma manera.

export const NOTICE_CATEGORIES = {
  status: {
    label: 'Estado de la estación',
    nature: 'real',
    description: 'Datos antiguos, sensor ausente o estación caída: se observa, no se prevé.',
    audience: 'visitor',
  },
  forecast: {
    label: 'Riesgo por previsión externa',
    nature: 'previsto',
    description: 'Viene de un proveedor externo (AEMET u Open-Meteo). Es una previsión, no una medida.',
    audience: 'visitor',
  },
  threshold: {
    label: 'Umbral local',
    nature: 'real',
    description: 'Una regla cruza un umbral sobre una medida real de la estación. Solo se muestra con el motor comprobado.',
    audience: 'visitor',
    requiresEngine: true,
  },
  simulated: {
    label: 'Aviso agrícola simulado',
    nature: 'simulado',
    description: 'Valor ilustrativo de la demostración: no procede de ninguna estación ni finca existente.',
    audience: 'demo',
  },
  commercial: {
    label: 'Novedades comerciales',
    nature: 'comunicacion',
    description: 'Solo con autorización específica por canal. Nunca es un aviso de riesgo.',
    audience: 'visitor',
  },
  access: {
    label: 'Enlace o código de acceso',
    nature: 'comunicacion',
    description: 'Comunicación necesaria para autenticar. No es un aviso ni una novedad comercial.',
    audience: 'visitor',
  },
};

export const NOTICE_NATURES = {
  real: { label: 'Real', hint: 'Dato observado o medido.' },
  previsto: { label: 'Previsto', hint: 'Previsión externa o aviso oficial: aún no ha ocurrido.' },
  calculado: { label: 'Calculado', hint: 'Derivado por una fórmula a partir de otros datos.' },
  simulado: { label: 'Simulado', hint: 'Valor de muestra de la demostración.' },
  comunicacion: { label: 'Comunicación', hint: 'Mensaje operativo, no un aviso de riesgo.' },
};

// Las cuatro que la aceptación pide poder distinguir de un vistazo.
export const RISK_NATURES = ['real', 'previsto', 'calculado', 'simulado'];

export const NOTICE_SOURCES = {
  station_measurement: { label: 'Medición de tu estación', nature: 'real' },
  device_status: { label: 'Estado de tu estación', nature: 'real' },
  device_declared: { label: 'Aviso declarado por la estación', nature: 'real' },
  external_forecast: { label: 'Previsión externa', nature: 'previsto' },
  official_warning: { label: 'Aviso oficial de AEMET', nature: 'previsto', official: true },
  estimate: { label: 'Estimación de TecRural sobre la previsión', nature: 'calculado' },
  derived: { label: 'Cálculo a partir de tus datos', nature: 'calculado' },
  simulation: { label: 'Simulación de la demostración', nature: 'simulado' },
  consent: { label: 'Tu autorización de novedades', nature: 'comunicacion' },
  authentication: { label: 'Sistema de acceso', nature: 'comunicacion' },
};

export const NOTICE_STATES = {
  active: 'Activa',
  resolved: 'Resuelta',
  dismissed: 'Descartada',
  pending: 'Pendiente',
  sent: 'Enviada',
  delivered: 'Entregada',
  manual: 'Envío manual pendiente',
  cancelled: 'Cancelada',
  failed: 'Fallida',
  expired: 'Caducada',
  vigente: 'Vigente',
};

// Nota de entrega que la interfaz debe mostrar mientras el WhatsApp siga en
// modo manual: no se anuncia como un envío automático lo que un humano envía.
export const WHATSAPP_MANUAL_NOTE =
  'Durante el piloto el equipo envía el WhatsApp a mano desde administración: no es un envío automático.';

// Identifica los avisos de comunicación (sin conexión) que solo ve administración.
export function isCommunicationNotice(notice = {}) {
  const metric = notice.metric ?? notice.ruleSnapshot?.metric ?? notice.rule_snapshot?.metric;
  const text = String(notice.message ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return metric === 'connectivity' || /comunicacion|conectividad|sin conexion/.test(text);
}

function inferCategory(notice) {
  if (notice.simulated === true) return 'simulated';
  const kind = notice.kind || notice.purpose;
  if (kind === 'commercial') return 'commercial';
  if (kind === 'access' || kind === 'magic_link' || kind === 'contact_verification') return 'access';
  if (kind === 'status') return 'status';
  if (notice.official === true) return 'forecast';
  const source = notice.source;
  if (source === 'external_forecast' || source === 'official_warning' || source === 'estimate') return 'forecast';
  if (isCommunicationNotice(notice)) return 'status';
  // Procedencia del motor: hay una regla identificable detrás del aviso. Sin
  // ella (marca enviada por el propio equipo) no es un umbral local y, por
  // tanto, no depende de que el motor esté comprobado.
  if (notice.ruleId != null || notice.rule_id != null
    || notice.ruleSnapshot != null || notice.rule_snapshot != null) return 'threshold';
  return 'status';
}

function stateOf(notice) {
  if (notice.closedAt || notice.closed_at) return notice.autoResolved ? 'resolved' : 'dismissed';
  if (notice.kind === 'access' || notice.kind === 'magic_link') {
    return notice.expiresAt && new Date(notice.expiresAt) <= new Date() ? 'expired' : 'vigente';
  }
  if (notice.kind === 'contact_verification') {
    return notice.expiresAt && new Date(notice.expiresAt) <= new Date() ? 'expired' : 'vigente';
  }
  const status = notice.status;
  if (status && NOTICE_STATES[status]) return status;
  if (notice.kind === 'commercial') return 'vigente';
  return 'active';
}

function numericValue(notice) {
  if (typeof notice.value === 'number') return notice.value;
  const raw = notice.value?.value;
  return typeof raw === 'number' ? raw : (notice.temperatureC ?? null);
}

const UNITS = { temperature: '°C', humidity: '%', pressure: 'hPa', battery: 'mV', lux: 'lx', connectivity: 's' };

// El aviso de regla no siempre lleva la métrica encima; para las categorías de
// temperatura y humedad la unidad se deduce, para no publicar "1,8" sin más.
const CATEGORY_METRIC = { frost: 'temperature', heat: 'temperature', humidity: 'humidity', general: null };

export function metricOf(notice) {
  const declared = notice.metric ?? notice.ruleSnapshot?.metric ?? notice.rule_snapshot?.metric;
  if (declared) return declared;
  if (notice.temperatureC != null) return 'temperature';
  const risk = notice.category ?? notice.ruleSnapshot?.category ?? notice.rule_snapshot?.category;
  return CATEGORY_METRIC[risk] ?? null;
}

export function formatValue(metric, value) {
  if (value == null) return null;
  const unit = UNITS[metric] || '';
  const digits = metric === 'battery' || metric === 'lux' ? 0 : 1;
  const text = Number(value).toLocaleString('es-ES', { maximumFractionDigits: digits });
  return unit ? `${text} ${unit}` : text;
}

// Describe el dato observado o la previsión que origina el aviso. Sustituye a
// frases genéricas tipo "detectamos que viene una helada": siempre cita la
// fuente y, si existe, el valor que la desencadenó.
export function originText(notice = {}) {
  const category = notice.__category || inferCategory(notice);
  const metric = metricOf(notice);
  const value = formatValue(metric, numericValue(notice));
  const when = notice.observedAt || notice.date || notice.forecastFor || null;
  const day = when ? new Date(when) : null;
  const dayLabel = day && !Number.isNaN(day.getTime())
    ? day.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) : null;

  switch (category) {
    case 'threshold':
      return value
        ? `Medida de ${value} de tu estación${dayLabel ? ` el ${dayLabel}` : ''} que cruza el umbral de la regla.`
        : 'Medida de tu estación que cruza el umbral de la regla.';
    case 'forecast':
      if (notice.official === true || notice.source === 'official_warning') {
        return `Aviso oficial de AEMET${dayLabel ? ` con vigencia desde el ${dayLabel}` : ''}.`;
      }
      if (notice.source === 'estimate') {
        return value
          ? `Estimación propia calculada sobre la previsión: ${value}.`
          : 'Estimación propia calculada sobre la previsión externa.';
      }
      return value
        ? `Previsión externa de ${value}${dayLabel ? ` para el ${dayLabel}` : ''}.`
        : 'Previsión externa; aún no ha ocurrido.';
    case 'status':
      return value
        ? `Estado observado de la estación (${value}).`
        : 'Estado observado de la estación.';
    case 'simulated':
      return 'Valor de una serie simulada dentro de la demostración.';
    case 'commercial':
      return 'Mensaje de novedades al que autorizaste expresamente por este canal.';
    case 'access':
      return 'Comunicación necesaria para completar tu acceso.';
    default:
      return value ? `Valor observado: ${value}.` : 'Dato observado.';
  }
}

// Clasifica un aviso y devuelve los cinco datos más la naturaleza.
export function classifyNotice(notice = {}) {
  const category = inferCategory(notice);
  const enriched = { ...notice, __category: category };
  const sourceKey = notice.source && NOTICE_SOURCES[notice.source] ? notice.source
    : category === 'simulated' ? 'simulation'
      : category === 'commercial' ? 'consent'
        : category === 'access' ? 'authentication'
          : category === 'status' ? 'device_status'
            : category === 'forecast' ? 'external_forecast'
              : 'station_measurement';
  const source = NOTICE_SOURCES[sourceKey];
  // La naturaleza manda la fuente sobre la categoría por defecto: una estimación
  // sobre la previsión es calculada aunque la categoría sea "por previsión".
  const nature = notice.nature || source.nature || NOTICE_CATEGORIES[category].nature;
  const state = stateOf(notice);
  const date = notice.observedAt || notice.createdAt || notice.created_at
    || notice.date || notice.forecastFor || notice.expiresAt || null;
  const engineVerified = category !== 'threshold' || notice.engineVerified !== false;

  return {
    category,
    categoryLabel: NOTICE_CATEGORIES[category].label,
    description: NOTICE_CATEGORIES[category].description,
    requiresEngine: Boolean(NOTICE_CATEGORIES[category].requiresEngine),
    engineVerified,
    nature,
    natureLabel: NOTICE_NATURES[nature].label,
    natureHint: NOTICE_NATURES[nature].hint,
    source: sourceKey,
    sourceLabel: source.label,
    official: Boolean(source.official),
    date,
    state,
    stateLabel: NOTICE_STATES[state] || state,
    origin: originText(enriched),
  };
}

// Vigencia en palabras: hasta cuándo vale el aviso. `until` es ISO o null.
export function validityText(category, until = null) {
  if (category === 'access') return until
    ? `Caduca el ${new Date(until).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}.`
    : 'Caduca pronto y solo puede usarse una vez.';
  if (category === 'commercial') return 'Vigente mientras tu autorización siga activa; la revocación cancela los envíos pendientes.';
  if (category === 'simulated') return 'Sin vigencia: es una demostración, no un aviso real.';
  if (category === 'forecast') return until
    ? `Vigente hasta ${new Date(until).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}.`
    : 'Vigente hasta que el proveedor lo sustituya o caduque.';
  return until
    ? `Cerrado el ${new Date(until).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}.`
    : 'Mientras se mantenga la condición que lo originó.';
}

// ---- "Sin alertas" no es "sin riesgo" --------------------------------------
// Devuelve una advertencia (o null si los datos permiten afirmar algo) para que
// un listado vacío no se lea como "no hay riesgo" cuando faltan mediciones o
// la previsión externa no está disponible.
export function coverageCaveat(devices = []) {
  if (!devices.length) {
    return {
      tone: 'warn',
      gaps: ['sin estaciones'],
      text: 'No hay estaciones que consultar: no se puede afirmar nada sobre el riesgo.',
    };
  }
  const gaps = [];
  const offline = devices.filter((item) => item.status?.connectivity === 'offline');
  const withoutData = devices.filter((item) => {
    const freshness = item.status?.dataFreshness;
    return freshness === 'stale' || freshness === 'unknown';
  });
  const noTemperature = devices.filter((item) => (item.device?.sensors ?? item.sensors)?.temperature === false);
  const weatherDown = devices.filter((item) => item.weather
    && (item.weather.stale || (item.weather.errors || []).length > 0));

  if (offline.length) gaps.push(`${offline.length} estación(es) sin conexión`);
  if (withoutData.length) gaps.push(`${withoutData.length} estación(es) sin mediciones recientes`);
  if (noTemperature.length) gaps.push(`${noTemperature.length} estación(es) sin sensor de temperatura`);
  if (weatherDown.length) gaps.push(`previsión externa no disponible en ${weatherDown.length} estación(es)`);
  if (!gaps.length) return null;

  const measured = `${devices.length - withoutData.length - offline.length} de ${devices.length}`;
  return {
    tone: offline.length || withoutData.length || weatherDown.length ? 'warn' : 'muted',
    gaps,
    text: `Un listado vacío de avisos no significa que no haya riesgo: hay datos incompletos (${gaps.join('; ')}). `
      + `Solo ${measured} estación(es) están aportando lecturas actuales.`,
  };
}
