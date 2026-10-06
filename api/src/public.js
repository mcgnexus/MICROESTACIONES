// Datos públicos agregados para la web: estaciones que han autorizado compartir
// su información. Nunca se exponen coordenadas exactas ni datos personales.
import { Router } from 'express';
import { sql } from './db.js';

const router = Router();

const round = (value, digits) => (value == null ? null : Number(Number(value).toFixed(digits)));

// Solo estaciones activas con permiso de publicación y contacto reciente.
const PUBLIC_WHERE = sql`d.active = true AND d.publish_permission = true`;

router.get('/stations', async (_req, res) => {
  const rows = await sql`SELECT d.name, d.public_zone, d.altitude,
      ds.connectivity, ds.last_contact,
      m.temperature_c, m.humidity_pct, m.observed_at
    FROM devices d
    LEFT JOIN device_status ds ON ds.device_id = d.id
    LEFT JOIN LATERAL (
      SELECT temperature_c, humidity_pct, observed_at FROM measurements
      WHERE device_id = d.id AND is_validated AND deleted_at IS NULL
      ORDER BY observed_at DESC LIMIT 1
    ) m ON true
    WHERE ${PUBLIC_WHERE}
    ORDER BY d.public_zone NULLS LAST, d.name`;
  res.json({
    stations: rows.map((row) => ({
      name: row.name,
      zone: row.publicZone ?? null,
      altitudeM: row.altitude ?? null,
      connectivity: row.connectivity ?? 'unknown',
      lastContact: row.lastContact ?? null,
      temperatureC: round(row.temperatureC, 1),
      humidityPct: round(row.humidityPct, 0),
      observedAt: row.observedAt ?? null,
    })),
  });
});

router.get('/summary', async (_req, res) => {
  const rows = await sql`SELECT d.name, d.public_zone, ds.last_contact,
      (SELECT max(observed_at) FROM measurements m
        WHERE m.device_id = d.id AND m.is_validated AND m.deleted_at IS NULL) AS last_data
    FROM devices d LEFT JOIN device_status ds ON ds.device_id = d.id
    WHERE ${PUBLIC_WHERE}`;
  const zones = [...new Set(rows.map((row) => row.publicZone).filter(Boolean))];
  const latest = rows.map((row) => row.lastData || row.lastContact).filter(Boolean)
    .sort((a, b) => new Date(b) - new Date(a))[0] ?? null;
  res.json({ stationCount: rows.length, zones, updatedAt: latest });
});

export default router;
