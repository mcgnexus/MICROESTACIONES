import { sql } from './db.js';

const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';
const AEMET = 'https://opendata.aemet.es/opendata/api';
const WEATHER_TTL_MS = 30 * 60 * 1000;

async function fetchJson(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json, application/xml, text/xml' } });
    if (!response.ok) throw new Error(`provider_http_${response.status}`);
    const text = await response.text();
    try { return JSON.parse(text); } catch { return text; }
  } finally {
    clearTimeout(timer);
  }
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
  const match = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? decodeXml(match[1].replace(/<[^>]+>/g, ' ').trim()) : null;
}

export function parseAemetWarnings(xml) {
  if (typeof xml !== 'string') return [];
  return [...xml.matchAll(/<(?:\w+:)?info\b[^>]*>([\s\S]*?)<\/(?:\w+:)?info>/gi)].map(([, info]) => ({
    provider: 'AEMET',
    event: xmlValue(info, 'event'),
    headline: xmlValue(info, 'headline'),
    description: xmlValue(info, 'description'),
    instruction: xmlValue(info, 'instruction'),
    severity: xmlValue(info, 'severity'),
    certainty: xmlValue(info, 'certainty'),
    onset: xmlValue(info, 'onset'),
    expires: xmlValue(info, 'expires'),
    area: xmlValue(info, 'areaDesc'),
  })).filter((warning) => warning.event || warning.headline || warning.description);
}

export function normalizeAemetObservation(rows, stationId) {
  if (!Array.isArray(rows) || !rows.length) return null;
  const row = rows.at(-1);
  const number = (value) => numeric(value);
  const windSpeed = number(row.vv);
  const gustSpeed = number(row.vmax);
  return {
    provider: 'AEMET',
    stationId: row.idema || stationId,
    observedAt: row.fint || null,
    temperatureC: number(row.ta),
    humidityPct: number(row.hr),
    pressureHpa: number(row.pres),
    precipitationMm: number(row.prec),
    windKmh: windSpeed == null ? null : Math.round(windSpeed * 3.6 * 10) / 10,
    windGustKmh: gustSpeed == null ? null : Math.round(gustSpeed * 3.6 * 10) / 10,
    windDirection: row.dv || null,
  };
}

export function forecastAdvisories(daily = []) {
  const notices = [];
  for (const day of daily) {
    const date = day.date;
    if (day.temperatureMinC != null && day.temperatureMinC <= 0) {
      notices.push({ kind: 'helada', date, level: 'preventive', text: `Riesgo orientativo de helada: mínima prevista ${day.temperatureMinC} °C.` });
    }
    if (day.temperatureMaxC != null && day.temperatureMaxC >= 35) {
      notices.push({ kind: 'calor', date, level: 'preventive', text: `Calor elevado previsto: máxima ${day.temperatureMaxC} °C.` });
    }
    if (day.precipitationMm != null && day.precipitationMm >= 20) {
      notices.push({ kind: 'lluvia', date, level: 'preventive', text: `Precipitación abundante prevista: ${day.precipitationMm} mm.` });
    }
    if (day.windGustKmh != null && day.windGustKmh >= 50) {
      notices.push({ kind: 'viento', date, level: 'preventive', text: `Rachas fuertes previstas: ${day.windGustKmh} km/h.` });
    }
  }
  return notices;
}

async function aemetData(path) {
  const key = process.env.AEMET_API_KEY;
  if (!key) return null;
  const base = `${AEMET}${path}${path.includes('?') ? '&' : '?'}api_key=${encodeURIComponent(key)}`;
  const locator = await fetchJson(base);
  if (!locator?.datos || Number(locator.estado) !== 200) throw new Error(`aemet_status_${locator?.estado ?? 'unknown'}`);
  const dataUrl = new URL(locator.datos);
  if (dataUrl.protocol !== 'https:' || dataUrl.hostname !== 'opendata.aemet.es') throw new Error('aemet_data_url_invalid');
  return fetchJson(dataUrl);
}

async function fetchAemet({ municipalityCode, stationId, warningArea }) {
  const key = process.env.AEMET_API_KEY;
  if (!key) return null;
  const [forecastResult, observationResult, warningsResult] = await Promise.allSettled([
    municipalityCode
      ? aemetData(`/prediccion/especifica/municipio/diaria/${encodeURIComponent(municipalityCode)}`)
      : Promise.resolve(null),
    stationId
      ? aemetData(`/observacion/convencional/datos/estacion/${encodeURIComponent(stationId)}`)
      : Promise.resolve(null),
    warningArea
      ? aemetData(`/avisos_cap/ultimoelaborado/area/${encodeURIComponent(warningArea)}`)
      : Promise.resolve(null),
  ]);
  let forecast = null;
  if (forecastResult.status === 'fulfilled' && forecastResult.value) {
    const data = Array.isArray(forecastResult.value) ? forecastResult.value[0] : forecastResult.value;
    forecast = {
      provider: 'AEMET',
      fetchedAt: new Date().toISOString(),
      municipality: data?.nombre ?? data?.municipio ?? null,
      days: (data?.prediccion?.dia || []).slice(0, 5).map((day) => ({
        date: day.fecha,
        temperatureMaxC: numeric(day.temperatura?.maxima),
        temperatureMinC: numeric(day.temperatura?.minima),
        precipitationProbabilityPct: day.probPrecipitacion?.map((p) => Number(p.value)).filter(Number.isFinite).reduce((max, value) => Math.max(max, value), 0) ?? null,
        windKmh: day.viento?.map((w) => Number(w.velocidad)).filter(Number.isFinite).reduce((max, value) => Math.max(max, value), 0) ?? null,
        windDirection: day.viento?.[0]?.direccion ?? null,
        sky: day.estadoCielo?.map((state) => state.descripcion).filter(Boolean).join(', ') || null,
      })),
    };
  }
  const observation = observationResult.status === 'fulfilled' && observationResult.value
    ? normalizeAemetObservation(observationResult.value, stationId) : null;
  let warnings = [];
  if (warningsResult.status === 'fulfilled' && warningsResult.value) {
    const body = typeof warningsResult.value === 'string' ? warningsResult.value : JSON.stringify(warningsResult.value);
    warnings = parseAemetWarnings(body);
  }
  const errors = [];
  if (forecastResult.status === 'rejected') errors.push('AEMET: previsión municipal no disponible.');
  if (observationResult.status === 'rejected') errors.push('AEMET: observación de estación no disponible.');
  if (warningsResult.status === 'rejected') errors.push('AEMET: avisos oficiales no disponibles.');
  return { provider: 'AEMET', fetchedAt: new Date().toISOString(), observation, forecast, warnings, errors };
}

async function saveSnapshot(deviceId, provider, payload) {
  await sql`INSERT INTO external_weather_snapshots (device_id, provider, fetched_at, payload)
    VALUES (${deviceId}, ${provider}, now(), ${sql.json(payload)})
    ON CONFLICT (device_id, provider) DO UPDATE SET fetched_at = now(), payload = EXCLUDED.payload`;
}

function isFresh(snapshot) {
  return snapshot && Date.now() - new Date(snapshot.fetchedAt).getTime() < WEATHER_TTL_MS;
}

export async function weatherForDevice(device) {
  if (device.latitude == null || device.longitude == null) {
    return { configured: false, location: device.publicZone || null, message: 'Configura las coordenadas de la estación para consultar el tiempo externo.' };
  }
  const rows = await sql`SELECT provider, fetched_at, payload FROM external_weather_snapshots WHERE device_id = ${device.id}`;
  const cached = Object.fromEntries(rows.map((row) => [row.provider, { ...row.payload, fetchedAt: row.fetchedAt }]));
  let openMeteo = cached.open_meteo;
  let aemet = cached.aemet;
  const stale = !isFresh(openMeteo) || (process.env.AEMET_API_KEY && (device.aemetMunicipalityCode || device.aemetStationId || device.aemetWarningArea) && !isFresh(aemet));
  const errors = [];
  if (stale) {
    const jobs = [fetchOpenMeteo(device.latitude, device.longitude).then(async (value) => {
      await saveSnapshot(device.id, 'open_meteo', value);
      openMeteo = value;
    }).catch(() => errors.push('Open-Meteo no está disponible temporalmente.'))];
    if (process.env.AEMET_API_KEY && (device.aemetMunicipalityCode || device.aemetStationId || device.aemetWarningArea)) {
      jobs.push(fetchAemet({ municipalityCode: device.aemetMunicipalityCode, stationId: device.aemetStationId, warningArea: device.aemetWarningArea }).then(async (value) => {
        if (value) {
          await saveSnapshot(device.id, 'aemet', value);
          aemet = value;
          errors.push(...value.errors);
        }
      }).catch(() => errors.push('AEMET no está disponible temporalmente.')));
    }
    await Promise.all(jobs);
  }
  const openData = openMeteo || null;
  const aemetMissing = [
    !process.env.AEMET_API_KEY ? 'API key AEMET_API_KEY' : null,
    !device.aemetMunicipalityCode ? 'código municipal' : null,
    !device.aemetStationId ? 'indicativo de estación observadora' : null,
    !device.aemetWarningArea ? 'área de avisos' : null,
  ].filter(Boolean);
  return {
    configured: true,
    location: device.publicZone || `${Number(device.latitude).toFixed(3)}, ${Number(device.longitude).toFixed(3)}`,
    openMeteo: openData,
    aemet: aemet || null,
    advisories: forecastAdvisories(openData?.daily),
    errors: [...(aemet?.errors || []), ...errors],
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
