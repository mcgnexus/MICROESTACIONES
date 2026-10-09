import { sql } from './db.js';
import { fetchJsonWithLimits, fetchBinaryWithLimits } from './http-limits.js';
import { decodeAemetCapBundle } from './aemet-cap.js';

const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';
const AEMET = 'https://opendata.aemet.es/opendata/api';
const WEATHER_TTL_MS = 30 * 60 * 1000;
export const AEMET_PAIR_WINDOW_MS = 10 * 60 * 1000;

export function aemetPairWindowMs(value = process.env.AEMET_COMPARISON_WINDOW_MINUTES) {
  const minutes = Number(value);
  return Math.trunc(Math.max(1, Math.min(60, Number.isFinite(minutes) && minutes > 0 ? minutes : 10))) * 60 * 1000;
}

// Consulta externa con tiempo máximo del entorno. Un tiempo agotado se marca
// como tal para que se reintente y no se lo confunda con "sin previsión".
async function fetchJson(url) {
  const { response, text, bodyTimedOut } = await fetchJsonWithLimits(url, {
    headers: { accept: 'application/json, application/xml, text/xml' },
  });
  if (!response.ok) throw new Error(`provider_http_${response.status}`);
  if (bodyTimedOut) {
    const timeout = new Error('provider_timeout_body');
    timeout.code = 'timeout';
    throw timeout;
  }
  try { return JSON.parse(text); } catch { return text; }
}

const at = (values, index) => values?.[index] ?? null;
const numeric = (value) => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);

export function normalizeOpenMeteo(payload) {
  const current = payload.current || {};
  const hourly = payload.hourly || {};
  const daily = payload.daily || {};
  const now = Date.parse(current.time || new Date().toISOString());
  const times = hourly.time || [];
  const hourlyForecast = times.map((time, index) => ({
    forecastFor: time,
    temperatureC: at(hourly.temperature_2m, index),
    humidityPct: at(hourly.relative_humidity_2m, index),
    precipitationMm: at(hourly.precipitation, index),
    precipitationProbabilityPct: at(hourly.precipitation_probability, index),
    windKmh: at(hourly.wind_speed_10m, index),
    windDirection: at(hourly.wind_direction_10m, index),
    windGustKmh: at(hourly.wind_gusts_10m, index),
    weatherCode: at(hourly.weather_code, index),
  })).filter((point) => Date.parse(point.forecastFor) >= now).slice(0, 36);
  const days = (daily.time || []).map((date, index) => ({
    date,
    temperatureMaxC: at(daily.temperature_2m_max, index),
    temperatureMinC: at(daily.temperature_2m_min, index),
    precipitationMm: at(daily.precipitation_sum, index),
    precipitationProbabilityPct: at(daily.precipitation_probability_max, index),
    windKmh: at(daily.wind_speed_10m_max, index),
    windGustKmh: at(daily.wind_gusts_10m_max, index),
    weatherCode: at(daily.weather_code, index),
  }));
  return {
    provider: 'Open-Meteo',
    fetchedAt: new Date().toISOString(),
    timezone: payload.timezone || 'auto',
    current: {
      time: current.time || null,
      temperatureC: current.temperature_2m ?? null,
      apparentTemperatureC: current.apparent_temperature ?? null,
      humidityPct: current.relative_humidity_2m ?? null,
      pressureHpa: current.pressure_msl ?? null,
      precipitationMm: current.precipitation ?? null,
      rainMm: current.rain ?? null,
      windKmh: current.wind_speed_10m ?? null,
      windDirection: current.wind_direction_10m ?? null,
      windGustKmh: current.wind_gusts_10m ?? null,
      weatherCode: current.weather_code ?? null,
    },
    hourly: hourlyForecast,
    daily: days,
  };
}

function decodeXml(value) {
  return String(value ?? '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function xmlValue(xml, tag) {
  const match = xml.match(new RegExp(`<(?:\\w+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`, 'i'));
  return match ? decodeXml(match[1].replace(/<[^>]+>/g, ' ').trim()) : null;
}

function parseAemetInstantDetailed(value) {
  if (!value) return { date: null, rule: 'empty' };
  const raw = String(value).trim();
  const normalized = raw.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  // AEMET usa el sufijo literal "UTC" en `fint`; equivale a la marca Z. Sin esto,
  // una hora UTC se reinterpretaría como hora de Madrid y se desplazaría 1-2 h.
  if (/utc$/i.test(normalized)) {
    const parsed = new Date(normalized.replace(/utc$/i, 'Z'));
    return { date: Number.isFinite(parsed.getTime()) ? parsed : null, rule: 'utc_suffix' };
  }
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(normalized)) {
    const parsed = new Date(normalized);
    return {
      date: Number.isFinite(parsed.getTime()) ? parsed : null,
      rule: /[zZ]/.test(normalized) ? 'z_suffix' : 'offset',
    };
  }
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return { date: null, rule: 'unparsed' };
  const [, year, month, day, hour, minute, second = '0'] = match;
  const targetUtc = Date.UTC(+year, +month - 1, +day, +hour, +minute, +second);
  let guess = targetUtc;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(guess)).map((part) => [part.type, part.value]));
    const representedUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day,
      +parts.hour, +parts.minute, +parts.second);
    guess += targetUtc - representedUtc;
  }
  // Sin sufijo: se asume hora local de Madrid. La regla se conserva para auditoría.
  return { date: new Date(guess), rule: 'madrid_assumed' };
}

export function parseAemetInstant(value) {
  return parseAemetInstantDetailed(value).date;
}

export { parseAemetInstantDetailed };

function xmlBlocks(xml, tag) {
  const regex = new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`, 'gi');
  return [...String(xml).matchAll(regex)].map((match) => match[1]);
}

function warningContainsPoint(areaXml, latitude, longitude) {
  if (latitude == null || longitude == null
      || !Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) return null;
  const pointInPolygon = (points) => {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [yi, xi] = points[i]; const [yj, xj] = points[j];
      const crosses = (yi > latitude) !== (yj > latitude)
        && longitude < ((xj - xi) * (latitude - yi)) / ((yj - yi) || Number.EPSILON) + xi;
      if (crosses) inside = !inside;
    }
    return inside;
  };
  const polygons = xmlValueAll(areaXml, 'polygon').map((value) => value.trim().split(/\s+/)
    .map((pair) => pair.split(',').map(Number)).filter((pair) => pair.length === 2 && pair.every(Number.isFinite)));
  if (polygons.length) return polygons.some((points) => points.length >= 3 && pointInPolygon(points));
  const circles = xmlValueAll(areaXml, 'circle').map((value) => {
    const match = value.trim().match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\s+([\d.]+)$/);
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : [];
  });
  if (circles.length) return circles.some(([lat, lon, radiusKm]) => {
    if (![lat, lon, radiusKm].every(Number.isFinite)) return false;
    const radians = Math.PI / 180;
    const dLat = (latitude - lat) * radians; const dLon = (longitude - lon) * radians;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat * radians) * Math.cos(latitude * radians) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)) <= radiusKm;
  });
  return null;
}

function xmlValueAll(xml, tag) {
  return xmlBlocks(xml, tag).map((value) => decodeXml(value.replace(/<[^>]+>/g, ' ').trim()));
}

// Preferencia de idioma: AEMET publica varios <info> por idioma en el mismo
// <alert>; se elige español y, si no existe, el primero disponible.
const infoIsSpanish = (info) => /^es\b|^es-/i.test(String(xmlValue(info, 'language') || '').trim());

function pickInfoForArea(infos, area) {
  const candidates = infos.filter((info) => xmlBlocks(info, 'area').includes(area));
  if (!candidates.length) return null;
  return candidates.find(infoIsSpanish) || candidates[0];
}

function capMessage(xml, areaCode, latitude, longitude) {
  const infos = xmlBlocks(xml, 'info');
  const areas = xmlBlocks(xml, 'area');
  const records = areas.length
    ? areas.map((area) => ({ area, info: pickInfoForArea(infos, area) })).filter((record) => record.info)
    : (infos.length ? [{ area: '', info: infos[0] }] : [{ info: '', area: '' }]);
  const references = xmlValue(xml, 'references');
  return records.map(({ info, area }) => {
    const codeValues = xmlBlocks(area, 'value').map((value) => decodeXml(value.replace(/<[^>]+>/g, '').trim()));
    const areaCodes = codeValues.filter(Boolean);
    const pointMatch = warningContainsPoint(area, latitude, longitude);
    const explicitAreaMatch = areaCodes.includes(String(areaCode));
    const hasGeometry = xmlValueAll(area, 'polygon').length > 0 || xmlValueAll(area, 'circle').length > 0;
    // Filtrado por relevancia: geometría si hay coordenadas; si el bloque
    // declara códigos de zona, manda la coincidencia de zona (así un aviso de
    // otra provincia dentro del mismo tar no se cuela); sin códigos ni
    // geometría, no hay forma de discriminar y se incluye.
    const geographicallyRelevant = pointMatch ?? (areaCodes.length ? explicitAreaMatch : !hasGeometry);
    const geocodes = xmlBlocks(area, 'geocode').map((block) => ({
      name: xmlValue(block, 'valueName'), value: xmlValue(block, 'value'),
    }));
    return {
      provider: 'AEMET',
      identifier: xmlValue(xml, 'identifier'), sender: xmlValue(xml, 'sender'),
      sent: xmlValue(xml, 'sent'), status: xmlValue(xml, 'status'),
      messageType: xmlValue(xml, 'msgType') || 'Alert', references,
      event: xmlValue(info, 'event'), headline: xmlValue(info, 'headline'),
      description: xmlValue(info, 'description'), instruction: xmlValue(info, 'instruction'),
      severity: xmlValue(info, 'severity'), certainty: xmlValue(info, 'certainty'),
      effective: xmlValue(info, 'effective'), onset: xmlValue(info, 'onset'),
      expires: xmlValue(info, 'expires'), area: xmlValue(area, 'areaDesc'),
      areaCode: String(areaCode || ''), geocodes, geographicallyRelevant,
    };
  }).filter((warning) => warning.event || warning.headline || warning.description
    || String(warning.messageType).toLowerCase() === 'cancel');
}

// El nivel verde (CAP severity=Minor, o eventos «nivel verde»/«sin aviso») no
// es un aviso: es la ausencia declarada de fenómeno adverso. No debe contar
// como riesgo ni aparecer en las listas de avisos vigentes.
export function isNoWarning(warning = {}) {
  if (String(warning.severity || '').trim().toLowerCase() === 'minor') return true;
  return /nivel verde|sin aviso/i.test(`${warning.event || ''} ${warning.headline || ''}`);
}

// Resuelve el conjunto de mensajes CAP y los separa en activos y próximos.
// Orden garantizado: primero referencias de update/cancel (retiran el mensaje
// anterior), después exclusión de «sin aviso» (Minor/verde) y por último el
// filtrado temporal.
export function resolveAemetWarningsDetailed(messages, { now = new Date(), areaCode = null, latitude = null, longitude = null } = {}) {
  const all = (Array.isArray(messages) ? messages : []).flatMap((xml) => {
    const unpack = (document, depth = 0) => {
      const alerts = xmlBlocks(document, 'alert');
      if (alerts.length) return alerts;
      if (depth >= 2 || !/<(?:\w+:)?feed\b/i.test(document)) return [document];
      const contents = xmlBlocks(document, 'content').map(decodeXml);
      return contents.length ? contents.flatMap((content) => unpack(content, depth + 1)) : [document];
    };
    return unpack(String(xml)).flatMap((alert) => capMessage(alert, areaCode, latitude, longitude));
  });
  const cancelled = new Set();
  for (const message of all) {
    if (String(message.messageType).toLowerCase() !== 'cancel') continue;
    for (const ref of String(message.references || '').split(/\s+/).filter(Boolean)) cancelled.add(ref.split(',')[1] || ref);
  }
  const latest = new Map();
  const orderedMessages = [...all].sort((a, b) =>
    (parseAemetInstant(a.sent)?.getTime() ?? 0) - (parseAemetInstant(b.sent)?.getTime() ?? 0));
  for (const message of orderedMessages) {
    const type = String(message.messageType).toLowerCase();
    if (type === 'cancel' || !['actual', 'test', 'exercise', 'system'].includes(String(message.status || 'Actual').toLowerCase())) continue;
    if (['test', 'exercise', 'system'].includes(String(message.status || '').toLowerCase())) continue;
    if (message.messageType && !['alert', 'update'].includes(type)) continue;
    const refs = String(message.references || '').split(/\s+/).filter(Boolean);
    const replaces = refs.map((ref) => ref.split(',')[1]).filter(Boolean);
    for (const id of replaces) {
      for (const [key, existing] of latest) if (existing.identifier === id) latest.delete(key);
    }
    const id = message.identifier || `${message.sender || ''}:${message.sent || ''}:${message.event || ''}`;
    // Keep multiple CAP areas from the same message independently filterable.
    latest.set(`${id}\u0000${message.area || ''}`, message);
  }
  const instant = (value) => value ? parseAemetInstant(value)?.getTime() ?? null : null;
  const active = [];
  const upcoming = [];
  for (const warning of [...latest.values()]) {
    if (warning.geographicallyRelevant === false) continue;
    if (cancelled.has(warning.identifier)) continue;
    if (isNoWarning(warning)) continue;
    const effective = instant(warning.effective || warning.onset || warning.sent);
    const onset = instant(warning.onset);
    const expires = instant(warning.expires);
    if (expires != null && expires <= now.getTime()) continue;
    const started = (effective == null || effective <= now.getTime())
      && (onset == null || onset <= now.getTime());
    if (started) active.push(warning);
    else if (onset != null || effective != null) upcoming.push(warning);
  }
  return { active, upcoming };
}

export function resolveAemetWarnings(messages, options = {}) {
  return resolveAemetWarningsDetailed(messages, options).active;
}

export function parseAemetWarnings(xml, options = {}) {
  return resolveAemetWarnings([xml], options);
}

export function isAemetCapPayload(value) {
  if (value == null) return true;
  if (Array.isArray(value)) return value.every((entry) => typeof entry === 'string' && isAemetCapPayload(entry));
  if (typeof value !== 'string') return false;
  const text = value.trim();
  return !text || /<(?:\w+:)?(?:alert|feed)\b/i.test(text);
}

export function normalizeAemetObservation(rows, stationId, { now = new Date(), futureToleranceMs = 5 * 60 * 1000 } = {}) {
  if (!Array.isArray(rows) || !rows.length) return null;
  const observations = rows.map((row) => {
  const number = (value) => numeric(value);
  const windSpeed = number(row.vv);
  const gustSpeed = number(row.vmax);
  // Se conserva el valor original de `fint` y la regla aplicada, para poder
  // auditar la normalización sin desplazar el histórico por intuición.
  const parsed = parseAemetInstantDetailed(row.fint);
  return {
    provider: 'AEMET',
    stationId: row.idema || stationId,
    observedAt: parsed.date?.toISOString() ?? null,
    dateRule: parsed.rule,
    rawFint: row.fint ?? null,
    latitude: number(row.lat ?? row.latitude),
    longitude: number(row.lon ?? row.longitude),
    altitudeM: number(row.alt ?? row.altitude),
    temperatureC: number(row.ta),
    humidityPct: number(row.hr),
    pressureHpa: number(row.pres),
    precipitationMm: number(row.prec),
    windKmh: windSpeed == null ? null : Math.round(windSpeed * 3.6 * 10) / 10,
    windGustKmh: gustSpeed == null ? null : Math.round(gustSpeed * 3.6 * 10) / 10,
    windDirection: row.dv || null,
  };
  }).filter((row) => row.observedAt
    && new Date(row.observedAt).getTime() <= now.getTime() + futureToleranceMs)
    .sort((a, b) => new Date(a.observedAt) - new Date(b.observedAt));
  if (!observations.length) return null;
  return { ...observations.at(-1), observations, adapterVersion: 'aemet-observation-v1' };
}

export function compareTemperatures(local, external, windowMs = AEMET_PAIR_WINDOW_MS) {
  const localTemperature = numeric(local?.temperatureC);
  const localTime = local?.observedAt ? new Date(local.observedAt).getTime() : NaN;
  const candidates = (external?.observations || (external ? [external] : []))
    .filter((observation) => numeric(observation.temperatureC) != null && observation.observedAt)
    .map((observation) => ({ observation, at: new Date(observation.observedAt).getTime() }))
    .filter(({ at }) => Number.isFinite(at) && Number.isFinite(localTime))
    .sort((a, b) => Math.abs(a.at - localTime) - Math.abs(b.at - localTime));
  const nearest = candidates[0] || null;
  const differenceSeconds = nearest ? Math.round((localTime - nearest.at) / 1000) : null;
  const matched = localTemperature != null && nearest != null && Math.abs(differenceSeconds * 1000) <= windowMs;
  return {
    state: matched ? 'matched' : localTemperature == null || !external ? 'missing' : 'no_pair',
    windowMinutes: Math.round(windowMs / 60000),
    local: local ? { temperatureC: localTemperature, observedAt: local.observedAt, location: local.location || null } : null,
    aemet: nearest?.observation ? {
      temperatureC: numeric(nearest.observation.temperatureC), observedAt: nearest.observation.observedAt,
      stationId: nearest.observation.stationId,
    } : external ? { temperatureC: numeric(external.temperatureC), observedAt: external.observedAt, stationId: external.stationId } : null,
    proximity: external?.proximity ?? null,
    timeOffsetSeconds: differenceSeconds,
    differenceC: matched ? Math.round((localTemperature - numeric(nearest.observation.temperatureC)) * 10) / 10 : null,
    differenceDefinition: 'temperatura_microestacion_menos_AEMET',
  };
}

// Última comparación válida: recorre las muestras locales (de la más reciente a
// la más antigua) y empareja cada una con la observación AEMET temporalmente más
// próxima dentro de la ventana. Devuelve la pareja más reciente que cumple.
// Distingue «tiempo local más reciente» de «última comparación válida».
export function mostRecentComparison(localSamples, external, windowMs = AEMET_PAIR_WINDOW_MS) {
  const samples = (Array.isArray(localSamples) ? localSamples : [localSamples])
    .filter((sample) => sample && numeric(sample.temperatureC) != null && sample.observedAt)
    .map((sample) => ({ sample, at: new Date(sample.observedAt).getTime() }))
    .filter(({ at }) => Number.isFinite(at))
    .sort((a, b) => b.at - a.at);
  const observations = (external?.observations || (external ? [external] : []))
    .filter((observation) => observation && numeric(observation.temperatureC) != null && observation.observedAt)
    .map((observation) => ({ observation, at: new Date(observation.observedAt).getTime() }))
    .filter(({ at }) => Number.isFinite(at));

  for (const { sample, at } of samples) {
    const nearest = observations
      .map((entry) => ({ ...entry, deltaMs: at - entry.at }))
      .sort((a, b) => Math.abs(a.deltaMs) - Math.abs(b.deltaMs))[0] || null;
    if (nearest && Math.abs(nearest.deltaMs) <= windowMs) {
      const localTemperature = numeric(sample.temperatureC);
      return {
        state: 'matched',
        windowMinutes: Math.round(windowMs / 60000),
        local: { temperatureC: localTemperature, observedAt: sample.observedAt, location: sample.location || null },
        aemet: {
          temperatureC: numeric(nearest.observation.temperatureC),
          observedAt: nearest.observation.observedAt,
          stationId: nearest.observation.stationId,
        },
        proximity: external?.proximity ?? null,
        timeOffsetSeconds: Math.round(nearest.deltaMs / 1000),
        differenceC: Math.round((localTemperature - numeric(nearest.observation.temperatureC)) * 10) / 10,
        differenceDefinition: 'temperatura_microestacion_menos_AEMET',
        // La pareja puede ser anterior a la última muestra local: se declara.
        isLatestLocal: Boolean(samples[0] && sample.observedAt === samples[0].sample.observedAt),
      };
    }
  }

  const latest = samples[0]?.sample ?? null;
  const latestObservation = [...observations].sort((a, b) => b.at - a.at)[0]?.observation ?? null;
  return {
    state: !latest || !external ? 'missing' : 'no_pair',
    windowMinutes: Math.round(windowMs / 60000),
    local: latest
      ? { temperatureC: numeric(latest.temperatureC), observedAt: latest.observedAt, location: latest.location || null }
      : null,
    aemet: latestObservation
      ? { temperatureC: numeric(latestObservation.temperatureC), observedAt: latestObservation.observedAt, stationId: latestObservation.stationId }
      : (external ? { temperatureC: numeric(external.temperatureC), observedAt: external.observedAt, stationId: external.stationId } : null),
    proximity: external?.proximity ?? null,
    timeOffsetSeconds: null,
    differenceC: null,
    differenceDefinition: 'temperatura_microestacion_menos_AEMET',
    isLatestLocal: false,
  };
}

const AEMET_STATIONS = {
  // Coordenadas/altitud verificadas para el indicativo AEMET 5051X.
  '5051X': { latitude: 37 + 51 / 60 + 41 / 3600, longitude: -(2 + 39 / 60 + 10 / 3600), altitudeM: 1101, source: 'ficha de estación AEMET 5051X' },
};

export function aemetProximityForDevice(device, observation) {
  if (device.latitude == null || device.longitude == null || !observation) return null;
  const station = AEMET_STATIONS[String(observation.stationId || '').toUpperCase()];
  const latitude = observation.latitude ?? station?.latitude;
  const longitude = observation.longitude ?? station?.longitude;
  const aemetAltitudeM = observation.altitudeM ?? station?.altitudeM ?? null;
  if (latitude == null || longitude == null) return null;
  const toRadians = (value) => (value * Math.PI) / 180;
  const dLat = toRadians(latitude - Number(device.latitude));
  const dLon = toRadians(longitude - Number(device.longitude));
  const lat1 = toRadians(Number(device.latitude));
  const lat2 = toRadians(latitude);
  const haversine = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const distanceKm = 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  const microAltitudeM = numeric(device.altitude);
  return {
    distanceKm: Math.round(distanceKm * 10) / 10,
    microAltitudeM,
    aemetAltitudeM,
    altitudeDifferenceM: microAltitudeM == null || aemetAltitudeM == null ? null : Math.round((aemetAltitudeM - microAltitudeM) * 10) / 10,
    microLocationSource: 'coordenadas configuradas en la ficha de estación',
    microAltitudeSource: microAltitudeM == null ? null : 'altitud configurada en la ficha de estación',
    aemetLocationSource: observation.latitude != null && observation.longitude != null
      ? 'coordenadas devueltas por AEMET' : station?.source ?? null,
    aemetAltitudeSource: observation.altitudeM != null
      ? 'altitud devuelta por AEMET' : station?.altitudeM != null ? station.source : null,
  };
}

// AEMET publica el estado del cielo por periodos. En vez de concatenar todos
// (queda un texto largo y confuso), se elige una única descripción representativa:
// la del periodo que cubre el mediodía y, si no lo hay, la más repetida.
export function aemetSky(estadoCielo) {
  const entries = (estadoCielo || [])
    .map((state) => ({
      description: String(state?.descripcion || '').trim(),
      period: String(state?.periodo || '').trim(),
    }))
    .filter((entry) => entry.description);
  if (!entries.length) return null;
  const midday = entries.find((entry) => {
    const match = entry.period.match(/^(\d{2})-(\d{2})$/);
    if (!match) return false;
    const start = Number(match[1]);
    const end = Number(match[2]) === 0 ? 24 : Number(match[2]);
    return start <= 12 && 12 < end;
  });
  if (midday) return midday.description;
  const counts = new Map();
  for (const entry of entries) counts.set(entry.description, (counts.get(entry.description) || 0) + 1);
  let best = entries[0].description;
  let bestCount = 0;
  for (const [description, count] of counts) {
    if (count > bestCount) { best = description; bestCount = count; }
  }
  return best;
}

// Riesgos orientativos calculados sobre la previsión. Cada aviso declara su
// fuente y su proveedor: sin ellos se leería como una detección local, que no
// hacemos con los sensores actuales.
export function forecastAdvisories(daily = [], provider = null) {
  const notices = [];
  const origin = provider ? ` (${provider})` : '';
  const common = { level: 'preventive', provider, source: 'estimate' };
  for (const day of daily) {
    const date = day.date;
    if (day.temperatureMinC != null && day.temperatureMinC <= 0) {
      notices.push({ ...common, kind: 'helada', date,
        text: `Riesgo orientativo de helada: mínima prevista ${day.temperatureMinC} °C${origin}.` });
    }
    if (day.temperatureMaxC != null && day.temperatureMaxC >= 35) {
      notices.push({ ...common, kind: 'calor', date,
        text: `Calor elevado previsto: máxima ${day.temperatureMaxC} °C${origin}.` });
    }
    if (day.precipitationMm != null && day.precipitationMm >= 20) {
      notices.push({ ...common, kind: 'lluvia', date,
        text: `Precipitación abundante prevista: ${day.precipitationMm} mm${origin}.` });
    }
    if (day.windGustKmh != null && day.windGustKmh >= 50) {
      notices.push({ ...common, kind: 'viento', date,
        text: `Rachas fuertes previstas: ${day.windGustKmh} km/h${origin}.` });
    }
  }
  return notices;
}

export function describeAemetError(endpoint, error) {
  const message = String(error?.message || '');
  const status = Number(message.match(/(?:aemet_status_|provider_http_)(\d{3})/)?.[1]);
  let cause = 'fallo de conexión o respuesta no válida';
  if (status === 404) cause = 'AEMET no devolvió datos (HTTP 404): puede que no haya información en las últimas horas';
  else if (status === 401 || status === 403) cause = `API key o permisos rechazados (HTTP ${status})`;
  else if (status === 429) cause = 'límite de peticiones alcanzado (HTTP 429)';
  else if (status >= 500) cause = `servicio AEMET con error HTTP ${status}`;
  else if (status) cause = `respuesta HTTP ${status}`;
  else if (/abort|timeout/i.test(message)) cause = 'tiempo de espera agotado';
  else if (message === 'aemet_data_url_invalid') cause = 'AEMET devolvió una URL de datos no válida';
  return `AEMET: ${endpoint} no disponible (${cause}).`;
}

export function mergeWeatherErrors(...groups) {
  return [...new Set(groups.flat().filter(Boolean))];
}

async function aemetLocator(path) {
  const key = process.env.AEMET_API_KEY;
  if (!key) return null;
  const base = `${AEMET}${path}${path.includes('?') ? '&' : '?'}api_key=${encodeURIComponent(key)}`;
  const locator = await fetchJson(base);
  if (!locator?.datos || Number(locator.estado) !== 200) throw new Error(`aemet_status_${locator?.estado ?? 'unknown'}`);
  const dataUrl = new URL(locator.datos);
  if (dataUrl.protocol !== 'https:' || dataUrl.hostname !== 'opendata.aemet.es') throw new Error('aemet_data_url_invalid');
  return dataUrl;
}

async function aemetData(path) {
  const dataUrl = await aemetLocator(path);
  if (!dataUrl) return null;
  return fetchJson(dataUrl);
}

// El producto CAP se sirve como tar (`application/x-gtar`) con ficheros XML:
// se descarga en binario y se desempaqueta antes de interpretarlo.
async function aemetCapDocuments(path) {
  const dataUrl = await aemetLocator(path);
  if (!dataUrl) return null;
  const { response, buffer } = await fetchBinaryWithLimits(dataUrl, {
    headers: { accept: 'application/x-gtar, application/x-tar, application/gzip, application/json, application/xml, text/xml' },
  });
  if (!response.ok) throw new Error(`provider_http_${response.status}`);
  return decodeAemetCapBundle(buffer);
}

async function fetchAemet({ municipalityCode, stationId, warningZone, downloadArea }, device) {
  const key = process.env.AEMET_API_KEY;
  if (!key) return null;
  const [forecastResult, observationResult, warningsResult] = await Promise.allSettled([
    municipalityCode
      ? aemetData(`/prediccion/especifica/municipio/diaria/${encodeURIComponent(municipalityCode)}`)
      : Promise.resolve(null),
    stationId
      ? aemetData(`/observacion/convencional/datos/estacion/${encodeURIComponent(stationId)}`)
      : Promise.resolve(null),
    downloadArea
      ? aemetCapDocuments(`/avisos_cap/ultimoelaborado/area/${encodeURIComponent(downloadArea)}`)
      : Promise.resolve(null),
  ]);
  // Sin datos (HTTP 404) es una respuesta válida de AEMET, no un fallo del canal.
  const noData = (result) => result.status === 'rejected'
    && result.reason?.message === 'aemet_status_404';
  const observation = observationResult.status === 'fulfilled' && observationResult.value
    ? normalizeAemetObservation(observationResult.value, stationId) : null;
  const observationQueried = !!stationId;
  const forecastQueried = !!municipalityCode;
  const warningsQueried = !!downloadArea;
  const warningPayload = warningsResult.status === 'fulfilled' ? warningsResult.value : null;
  const warningPayloadUsable = warningsQueried && warningsResult.status === 'fulfilled' && isAemetCapPayload(warningPayload);
  const warningDocuments = warningPayload == null ? [] : Array.isArray(warningPayload) ? warningPayload
    : [typeof warningPayload === 'string' ? warningPayload : JSON.stringify(warningPayload)];
  const resolved = warningPayloadUsable
    ? resolveAemetWarningsDetailed(warningDocuments, { areaCode: warningZone, latitude: Number(device.latitude), longitude: Number(device.longitude) })
    : null;
  const warnings = resolved?.active ?? null;
  const forecastValue = forecastResult.status === 'fulfilled' && forecastResult.value;
  const errors = [];
  if (forecastResult.status === 'rejected') errors.push(describeAemetError('previsión municipal', forecastResult.reason));
  if (observationResult.status === 'rejected') errors.push(describeAemetError('observación de estación', observationResult.reason));
  if (warningsResult.status === 'rejected') errors.push(describeAemetError('avisos oficiales', warningsResult.reason));
  else if (warningsQueried && !warningPayloadUsable) errors.push('AEMET: avisos oficiales no disponibles (formato CAP no válido).');
  const fetchedAt = new Date().toISOString();
  return {
    provider: 'AEMET', fetchedAt,
    observationStationId: stationId || null,
    forecastMunicipalityCode: municipalityCode || null,
    observationCheckedAt: stationId ? fetchedAt : null,
    forecastCheckedAt: municipalityCode ? fetchedAt : null,
    warningsCheckedAt: downloadArea ? fetchedAt : null,
    observation,
    // 404 = AEMET no devolvió datos: la consulta es válida y el estado propio
    // es "sin datos", no un fallo del canal ni una ausencia de avisos.
    observationAvailable: !observationQueried || observationResult.status === 'fulfilled' || noData(observationResult),
    observationFetchedAt: observation ? fetchedAt : null,
    forecast: forecastValue ? {
      provider: 'AEMET', fetchedAt,
      municipality: (Array.isArray(forecastValue) ? forecastValue[0] : forecastValue)?.nombre
        ?? (Array.isArray(forecastValue) ? forecastValue[0] : forecastValue)?.municipio ?? null,
      days: ((Array.isArray(forecastValue) ? forecastValue[0] : forecastValue)?.prediccion?.dia || []).slice(0, 5).map((day) => ({
        date: day.fecha,
        temperatureMaxC: numeric(day.temperatura?.maxima),
        temperatureMinC: numeric(day.temperatura?.minima),
        precipitationProbabilityPct: day.probPrecipitacion?.map((p) => Number(p.value)).filter(Number.isFinite).reduce((max, value) => Math.max(max, value), 0) ?? null,
        windKmh: day.viento?.map((w) => Number(w.velocidad)).filter(Number.isFinite).reduce((max, value) => Math.max(max, value), 0) ?? null,
        windDirection: day.viento?.[0]?.direccion ?? null,
        sky: aemetSky(day.estadoCielo),
      })),
    } : null,
    forecastAvailable: !forecastQueried || forecastResult.status === 'fulfilled',
    forecastFetchedAt: forecastValue ? fetchedAt : null,
    warnings,
    warningsAvailable: !warningsQueried || warningPayloadUsable || noData(warningsResult),
    warningsNoData: warningsQueried && noData(warningsResult),
    warningsFetchedAt: warningPayloadUsable ? fetchedAt : null,
    warningsAreaCode: warningZone || null,
    warningsDownloadArea: downloadArea || null,
    // Avisos próximos (onset futuro, sin verde): utilidad preventiva separada
    // de los vigentes; nunca cuentan como avisos activos.
    upcomingWarnings: resolved?.upcoming ?? null,
    errors,
  };
}

export function mergeAemetSnapshot(previous, fresh) {
  if (!fresh) return previous || null;
  const merged = { ...(previous || {}), provider: 'AEMET', fetchedAt: fresh.fetchedAt, errors: fresh.errors || [] };
  merged.observationStationId = fresh.observationStationId || previous?.observationStationId || null;
  merged.forecastMunicipalityCode = fresh.forecastMunicipalityCode || previous?.forecastMunicipalityCode || null;
  for (const name of ['observation', 'forecast', 'warnings']) {
    merged[`${name}CheckedAt`] = fresh[`${name}CheckedAt`] || previous?.[`${name}CheckedAt`] || null;
  }
  for (const [name, availableKey, fetchedKey] of [
    ['observation', 'observationAvailable', 'observationFetchedAt'],
    ['forecast', 'forecastAvailable', 'forecastFetchedAt'],
    ['warnings', 'warningsAvailable', 'warningsFetchedAt'],
  ]) {
    const available = fresh[availableKey] !== false;
    const newValue = fresh[name];
    if (available && (name === 'warnings' || newValue)) {
      merged[name] = newValue;
      if (fresh[fetchedKey]) merged[fetchedKey] = fresh[fetchedKey];
    }
    // "empty" = consulta válida pero AEMET no devolvió datos (HTTP 404); en
    // avisos jamás se interpreta como ausencia de avisos.
    const noData = name === 'warnings' && fresh.warningsNoData;
    merged[`${name}Status`] = noData ? 'empty'
      : available && (name === 'warnings' || newValue) ? 'current'
        : merged[name] ? 'stale' : available ? 'empty' : 'unavailable';
    if (!merged[fetchedKey] && previous?.fetchedAt && merged[name]) merged[fetchedKey] = previous.fetchedAt;
  }
  if (fresh.warningsNoData !== undefined || previous?.warningsNoData !== undefined) {
    merged.warningsNoData = Boolean(fresh.warningsNoData);
  }
  merged.warningsAreaCode = fresh.warningsAreaCode || previous?.warningsAreaCode || null;
  merged.warningsDownloadArea = fresh.warningsDownloadArea || previous?.warningsDownloadArea || null;
  // Los próximos viajan con la misma frescura que los avisos: si la consulta
  // fue válida se sustituyen; si no, se conservan los anteriores.
  if (fresh.warningsAvailable !== false && !fresh.warningsNoData) {
    merged.upcomingWarnings = fresh.upcomingWarnings ?? [];
  }
  return merged;
}

function ageSeconds(value, now = new Date()) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return null;
  return Math.max(0, Math.round((now.getTime() - new Date(value).getTime()) / 1000));
}

async function saveSnapshot(deviceId, provider, payload) {
  await sql`INSERT INTO external_weather_snapshots (device_id, provider, fetched_at, payload)
    VALUES (${deviceId}, ${provider}, now(), ${sql.json(payload)})
    ON CONFLICT (device_id, provider) DO UPDATE SET fetched_at = now(), payload = EXCLUDED.payload`;
}

// Guarda la serie de observaciones AEMET para poder compararla con la
// microestación más adelante. Es idempotente por (estación, instante).
async function saveAemetObservations(deviceId, observation) {
  const rows = observation?.observations;
  if (!Array.isArray(rows) || !rows.length) return;
  for (const obs of rows) {
    if (!obs?.observedAt) continue;
    await sql`INSERT INTO aemet_observations
      (device_id, station_id, observed_at, temperature_c, humidity_pct, pressure_hpa,
        precipitation_mm, wind_kmh, wind_gust_kmh, raw_fint, date_rule, fetched_at)
      VALUES (${deviceId}, ${obs.stationId || observation.stationId || 'unknown'}, ${new Date(obs.observedAt)},
        ${obs.temperatureC ?? null}, ${obs.humidityPct ?? null}, ${obs.pressureHpa ?? null},
        ${obs.precipitationMm ?? null}, ${obs.windKmh ?? null}, ${obs.windGustKmh ?? null},
        ${obs.rawFint ?? null}, ${obs.dateRule ?? null}, now())
      ON CONFLICT (device_id, station_id, observed_at) DO UPDATE SET
        temperature_c = EXCLUDED.temperature_c, humidity_pct = EXCLUDED.humidity_pct,
        pressure_hpa = EXCLUDED.pressure_hpa, precipitation_mm = EXCLUDED.precipitation_mm,
        wind_kmh = EXCLUDED.wind_kmh, wind_gust_kmh = EXCLUDED.wind_gust_kmh,
        raw_fint = EXCLUDED.raw_fint, date_rule = EXCLUDED.date_rule, fetched_at = now()`;
  }
}

function isFresh(snapshot) {
  return snapshot && Date.now() - new Date(snapshot.fetchedAt).getTime() < WEATHER_TTL_MS;
}

// Área de descarga del producto CAP: la especificación admite `esp` o el
// código de CCAA (`61` Andalucía…). El código de zona CAP (`611802`) sirve para
// FILTRAR el contenido, nunca como área de descarga. Se deriva del prefijo.
export function downloadAreaForZone(zone) {
  const prefix = String(zone || '').trim().slice(0, 2);
  return /^(6[1-9]|7[0-9])$/.test(prefix) ? prefix : 'esp';
}

export function aemetConfigForDevice(device) {
  const location = [device.name, device.publicZone].filter(Boolean).join(' ')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const isHuescar = /(^|\W)huescar(\W|$)/.test(location);
  const warningZone = device.aemetWarningArea || (isHuescar ? '611803' : null);
  return {
    municipalityCode: device.aemetMunicipalityCode || (isHuescar ? '18098' : null),
    stationId: device.aemetStationId || (isHuescar ? '5051X' : null),
    // Zona CAP para filtrar mensajes y área de descarga para pedir el producto.
    warningZone,
    downloadArea: warningZone ? downloadAreaForZone(warningZone) : null,
  };
}

export async function weatherForDevice(device) {
  if (device.latitude == null || device.longitude == null) {
    return { configured: false, location: device.publicZone || null, message: 'Configura las coordenadas de la estación para consultar el tiempo externo.' };
  }
  const rows = await sql`SELECT provider, fetched_at, payload FROM external_weather_snapshots WHERE device_id = ${device.id}`;
  const cached = Object.fromEntries(rows.map((row) => [row.provider, { ...row.payload, fetchedAt: row.fetchedAt }]));
  let openMeteo = cached.open_meteo;
  let aemet = cached.aemet;
  const aemetConfig = aemetConfigForDevice(device);
  if (aemet) {
    if (String(aemet.observationStationId || aemet.observation?.stationId || '').toUpperCase()
        !== String(aemetConfig.stationId || '').toUpperCase()) {
      aemet = { ...aemet, observation: null, observationFetchedAt: null, observationCheckedAt: null, observationStatus: aemetConfig.stationId ? 'unavailable' : 'unconfigured' };
    }
    if (!aemetConfig.municipalityCode || (aemet.forecastMunicipalityCode
        && String(aemet.forecastMunicipalityCode) !== String(aemetConfig.municipalityCode))) {
      aemet = { ...aemet, forecast: null, forecastFetchedAt: null, forecastCheckedAt: null, forecastStatus: aemetConfig.municipalityCode ? 'unavailable' : 'unconfigured' };
    }
    if (!aemetConfig.warningZone || String(aemet.warningsAreaCode || '') !== String(aemetConfig.warningZone)) {
      aemet = { ...aemet, warnings: [], warningsFetchedAt: null, warningsCheckedAt: null, warningsStatus: aemetConfig.warningZone ? 'unavailable' : 'unconfigured' };
    }
  }
  const hasAemetConfig = Object.values(aemetConfig).some(Boolean);
  const componentStale = (value) => !value || Date.now() - new Date(value).getTime() >= WEATHER_TTL_MS;
  const aemetStale = !aemet || [['observationCheckedAt', 'stationId'], ['forecastCheckedAt', 'municipalityCode'], ['warningsCheckedAt', 'warningZone']]
    .some(([checkedAt, configKey]) => aemetConfig[configKey]
      && (!aemet[checkedAt] || componentStale(aemet[checkedAt])));
  const openMeteoStale = !isFresh(openMeteo);
  const shouldFetchAemet = Boolean(process.env.AEMET_API_KEY && hasAemetConfig && aemetStale);
  const errors = [];
  if (openMeteoStale || shouldFetchAemet) {
    const jobs = [];
    if (openMeteoStale) jobs.push(fetchOpenMeteo(device.latitude, device.longitude).then(async (value) => {
      await saveSnapshot(device.id, 'open_meteo', value);
      openMeteo = value;
    }).catch(() => errors.push('Open-Meteo no está disponible temporalmente.')));
    if (shouldFetchAemet) {
      jobs.push(fetchAemet(aemetConfig, device).then(async (value) => {
        if (value) {
          aemet = mergeAemetSnapshot(aemet, value);
          await saveSnapshot(device.id, 'aemet', aemet);
          await saveAemetObservations(device.id, value.observation);
          errors.push(...value.errors);
        }
      }).catch(() => errors.push('AEMET no está disponible temporalmente.')));
    }
    await Promise.all(jobs);
  }
  const localRows = aemet?.observation
    ? await sql`SELECT temperature_c, observed_at FROM measurements
        WHERE device_id = ${device.id} AND is_validated AND deleted_at IS NULL AND temperature_c IS NOT NULL
          AND observed_at >= now() - interval '24 hours'
        ORDER BY observed_at DESC LIMIT 500`
    : [];
  // La comparación no usa solo la última muestra: recorre el histórico reciente
  // para encontrar la última pareja válida con AEMET.
  const localSamples = localRows.map((row) => ({
    temperatureC: Number(row.temperatureC),
    observedAt: row.observedAt,
    location: device.publicZone || device.name,
  }));
  if (aemet?.observation) {
    aemet = {
      ...aemet,
      observation: { ...aemet.observation, proximity: aemetProximityForDevice(device, aemet.observation) },
    };
  }
  const now = new Date();
  const aemetResponse = aemet ? { ...aemet } : {
    provider: 'AEMET', observation: null, forecast: null, warnings: [], errors: [],
    observationStatus: 'unconfigured', forecastStatus: 'unconfigured', warningsStatus: 'unconfigured',
    warningsAreaCode: aemetConfig.warningZone || null,
    warningsDownloadArea: aemetConfig.downloadArea || null,
  };
  if (aemetResponse) {
    for (const [name, fetchedKey] of [['observation', 'observationFetchedAt'], ['forecast', 'forecastFetchedAt'], ['warnings', 'warningsFetchedAt']]) {
      if (!aemetResponse[`${name}Status`] && aemetResponse[name]) aemetResponse[`${name}Status`] = 'current';
      const status = aemetResponse[`${name}Status`];
      if (status === 'current' && componentStale(aemetResponse[fetchedKey])) aemetResponse[`${name}Status`] = 'stale';
      aemetResponse[`${name}AgeSeconds`] = ageSeconds(aemetResponse[fetchedKey], now);
      if (aemetResponse[`${name}Status`] === 'unavailable' && !aemetResponse[name]) aemetResponse[`${name}Status`] = 'unavailable';
    }
    aemetResponse.warnings = (aemetResponse.warnings || []).filter((warning) => {
      const onset = parseAemetInstant(warning.onset)?.getTime();
      const expires = parseAemetInstant(warning.expires)?.getTime();
      return (onset == null || onset <= now.getTime()) && (expires == null || expires > now.getTime());
    });
    // Próximos: solo los que aún no han empezado y no han caducado. Nunca se
    // mezclan con los vigentes.
    aemetResponse.upcomingWarnings = (aemetResponse.upcomingWarnings || []).filter((warning) => {
      const onset = parseAemetInstant(warning.onset)?.getTime();
      const expires = parseAemetInstant(warning.expires)?.getTime();
      return onset != null && onset > now.getTime() && (expires == null || expires > now.getTime());
    });
    if (!aemetConfig.stationId) aemetResponse.observationStatus = 'unconfigured';
    if (!aemetConfig.municipalityCode) aemetResponse.forecastStatus = 'unconfigured';
    if (!aemetConfig.warningZone) aemetResponse.warningsStatus = 'unconfigured';
    else if (!process.env.AEMET_API_KEY) {
      aemetResponse.observationStatus = aemetResponse.observation ? 'stale' : 'unconfigured';
      aemetResponse.forecastStatus = aemetResponse.forecast ? 'stale' : 'unconfigured';
      aemetResponse.warningsStatus = aemetResponse.warningsFetchedAt ? 'stale' : 'unconfigured';
    }
  }
  const openData = openMeteo || null;
  const advisoryForecast = aemet?.forecast?.days?.length ? aemet.forecast.days : openData?.daily;
  const aemetMissing = [
    !process.env.AEMET_API_KEY ? 'API key AEMET_API_KEY' : null,
    !aemetConfig.municipalityCode ? 'código municipal' : null,
    !aemetConfig.stationId ? 'indicativo de estación observadora' : null,
    !aemetConfig.warningZone ? 'área de avisos' : null,
  ].filter(Boolean);
  const comparison = mostRecentComparison(localSamples, aemetResponse?.observation, aemetPairWindowMs());
  return {
    configured: true,
    location: device.publicZone || `${Number(device.latitude).toFixed(3)}, ${Number(device.longitude).toFixed(3)}`,
    openMeteo: openData,
    aemet: aemetResponse,
    comparison: { ...comparison, proximity: aemetResponse?.observation?.proximity ?? null },
    advisories: forecastAdvisories(advisoryForecast,
      aemet?.forecast?.days?.length ? 'AEMET' : (openData?.daily?.length ? 'Open-Meteo' : null)),
    errors: mergeWeatherErrors(aemet?.errors || [], errors),
    aemetMissing,
    stale: Boolean(openData && !isFresh(openData)),
  };
}

async function fetchOpenMeteo(latitude, longitude) {
  const url = new URL(OPEN_METEO);
  url.search = new URLSearchParams({
    latitude: String(latitude), longitude: String(longitude), timezone: 'auto', forecast_days: '5',
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,weather_code,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
    hourly: 'temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,rain,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,weather_code',
  }).toString();
  return normalizeOpenMeteo(await fetchJson(url));
}
