// Datos públicos agregados para la web: estaciones que han autorizado compartir
// su información. Nunca se exponen coordenadas exactas ni datos personales.
import { Router } from 'express';
import { sql } from './db.js';
import { connectivityFor, dataFreshnessFor } from './station-status.js';
import { weatherForDevice } from './weather.js';

const router = Router();

const round = (value, digits) => (value == null ? null : Number(Number(value).toFixed(digits)));

// Solo estaciones activas que han autorizado compartir sus datos.
const PUBLIC_WHERE = sql`d.active = true AND d.publish_permission = true`;

// Estaciones públicas con su última lectura y su contexto externo. Lo usan la
// ruta /stations y el render en servidor de la portada, para no duplicar consulta.
export async function loadPublicStations() {
  const rows = await sql`SELECT d.id, d.name, d.location_type, d.public_zone, d.altitude, d.latitude, d.longitude,
      d.aemet_municipality_code, d.aemet_station_id, d.aemet_warning_area, c.config,
      ds.connectivity, ds.last_contact, ds.last_valid_data,
      m_temp.temperature_c, m_temp.temperature_observed_at, m_hum.humidity_pct, m_hum.humidity_observed_at
    FROM devices d
    LEFT JOIN device_configs c ON c.device_id = d.id
    LEFT JOIN device_status ds ON ds.device_id = d.id
    LEFT JOIN LATERAL (
      SELECT temperature_c, observed_at AS temperature_observed_at
      FROM measurements
      WHERE device_id = d.id AND is_validated AND deleted_at IS NULL AND temperature_c IS NOT NULL
      ORDER BY observed_at DESC LIMIT 1
    ) m_temp ON true
    LEFT JOIN LATERAL (
      SELECT humidity_pct, observed_at AS humidity_observed_at
      FROM measurements
      WHERE device_id = d.id AND is_validated AND deleted_at IS NULL AND humidity_pct IS NOT NULL
      ORDER BY observed_at DESC LIMIT 1
    ) m_hum ON true
    WHERE ${PUBLIC_WHERE}
    ORDER BY d.public_zone NULLS LAST, d.name`;
  const stationIds = rows.map((row) => row.id);
  const recentHistory = stationIds.length
    ? await sql`WITH ranked AS (
        SELECT device_id, observed_at, temperature_c, humidity_pct,
          row_number() OVER (PARTITION BY device_id ORDER BY observed_at) AS sample_no,
          count(*) OVER (PARTITION BY device_id) AS sample_count
        FROM measurements
        WHERE device_id = ANY(${stationIds}) AND is_validated AND deleted_at IS NULL
          AND observed_at >= now() - interval '24 hours' AND observed_at <= now()
      )
      SELECT device_id, observed_at, temperature_c, humidity_pct
      FROM ranked
      WHERE sample_count <= 200 OR sample_no = 1 OR sample_no = sample_count
        OR mod(sample_no, ceil(sample_count::numeric / 200)::integer) = 0
      ORDER BY device_id, observed_at`
    : [];
  const historyByStation = new Map();
  for (const point of recentHistory) {
    if (!historyByStation.has(point.deviceId)) historyByStation.set(point.deviceId, []);
    historyByStation.get(point.deviceId).push({
      observedAt: point.observedAt,
      temperatureC: point.temperatureC == null ? null : Number(point.temperatureC),
      humidityPct: point.humidityPct == null ? null : Number(point.humidityPct),
    });
  }
  const stations = await Promise.all(rows.map(async (row) => {
    const weather = await weatherForDevice({
      id: row.id, name: row.name, publicZone: row.publicZone, latitude: row.latitude, longitude: row.longitude,
      altitude: row.altitude, aemetMunicipalityCode: row.aemetMunicipalityCode,
      aemetStationId: row.aemetStationId, aemetWarningArea: row.aemetWarningArea,
    }, { backgroundRefresh: true }).catch(() => null);
    return {
      name: row.name,
      locationType: row.locationType,
      zone: row.publicZone ?? null,
      altitudeM: row.altitude ?? null,
      connectivity: connectivityFor(row.lastContact, row.config?.sync_interval_s),
      dataFreshness: dataFreshnessFor(row.lastValidData, row.config?.interval_normal_s),
      temperatureFreshness: dataFreshnessFor(row.temperatureObservedAt, row.config?.interval_normal_s),
      humidityFreshness: dataFreshnessFor(row.humidityObservedAt, row.config?.interval_normal_s),
      lastContact: row.lastContact ?? null,
      lastValidData: row.lastValidData ?? null,
      temperatureC: round(row.temperatureC, 1),
      temperatureObservedAt: row.temperatureObservedAt ?? null,
      humidityPct: round(row.humidityPct, 0),
      humidityObservedAt: row.humidityObservedAt ?? null,
      // Backward-compatible alias for the latest real urban temperature.
      observedAt: row.temperatureObservedAt ?? null,
      history: historyByStation.get(row.id) ?? [],
      aemet: weather ? {
        observation: weather.aemet?.observation ? {
          stationId: weather.aemet.observation.stationId,
          temperatureC: weather.aemet.observation.temperatureC,
          observedAt: weather.aemet.observation.observedAt,
          proximity: weather.aemet.observation.proximity,
        } : null,
        observationStatus: weather.aemet?.observationStatus || (!weather.configured || weather.aemetMissing?.includes('API key AEMET_API_KEY') || weather.aemetMissing?.includes('indicativo de estación observadora') ? 'unconfigured' : 'unavailable'),
        observationAgeSeconds: weather.aemet?.observationAgeSeconds ?? null,
        forecast: weather.aemet?.forecast ?? null,
        forecastStatus: weather.aemet?.forecastStatus || 'unavailable',
        forecastAgeSeconds: weather.aemet?.forecastAgeSeconds ?? null,
        warnings: weather.aemet?.warnings ?? [],
        upcomingWarnings: weather.aemet?.upcomingWarnings ?? [],
        warningStatus: weather.aemet?.warningsStatus || (!weather.configured || weather.aemetMissing?.includes('API key AEMET_API_KEY') || weather.aemetMissing?.includes('área de avisos') ? 'unconfigured' : 'unavailable'),
        warningsFetchedAt: weather.aemet?.warningsFetchedAt ?? null,
        warningsAgeSeconds: weather.aemet?.warningsAgeSeconds ?? null,
        warningsAreaCode: weather.aemet?.warningsAreaCode ?? null,
        warningsDownloadArea: weather.aemet?.warningsDownloadArea ?? null,
        errors: weather.errors ?? [],
      } : null,
      comparison: weather?.comparison ?? null,
      weatherErrors: weather?.errors ?? [],
    };
  }));
  return stations;
}

router.get('/stations', async (_req, res) => {
  const stations = await loadPublicStations();
  // Datos públicos, no personalizados: la ventana de refresco real es de ~30 min,
  // así que 60 s de caché en el CDN y en el navegador ahorran recalcular en cada
  // visita sin falsear la antigüedad (que se deriva de la hora del propio dato).
  res.set('Cache-Control', 'public, max-age=30, s-maxage=60, stale-while-revalidate=300');
  res.set('CDN-Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  res.json({ stations });
});

router.get('/summary', async (_req, res) => {
  const rows = await sql`SELECT d.name, d.public_zone, c.config, ds.last_contact, ds.last_valid_data,
      (SELECT max(observed_at) FROM measurements m
        WHERE m.device_id = d.id AND m.is_validated AND m.deleted_at IS NULL) AS last_data
    FROM devices d LEFT JOIN device_status ds ON ds.device_id = d.id
      LEFT JOIN device_configs c ON c.device_id = d.id
    WHERE ${PUBLIC_WHERE}`;
  const zones = [...new Set(rows.map((row) => row.publicZone).filter(Boolean))];
  const latest = rows.map((row) => row.lastData).filter(Boolean)
    .sort((a, b) => new Date(b) - new Date(a))[0] ?? null;
  res.set('Cache-Control', 'public, max-age=30, s-maxage=60, stale-while-revalidate=300');
  res.set('CDN-Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  res.json({ stationCount: rows.length, zones, updatedAt: latest,
    stations: rows.map((row) => ({
      name: row.name, zone: row.publicZone ?? null,
      connectivity: connectivityFor(row.lastContact, row.config?.sync_interval_s),
      dataFreshness: dataFreshnessFor(row.lastValidData, row.config?.interval_normal_s),
      lastContact: row.lastContact ?? null, lastValidData: row.lastValidData ?? null,
      lastData: row.lastData ?? null,
    })) });
});

export default router;
