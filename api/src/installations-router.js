// Router de instalaciones, montado bajo /api/v1/stations. Se mantiene aparte de
// stations.js para no mezclar cambios heredados y por responsabilidad clara.
//
// La estación puede trasladarse a otro emplazamiento. El historial no se
// reescribe: cada muestra se asocia a su instalación por rango temporal.
import { Router } from 'express';
import { z } from 'zod';
import { sql } from './db.js';
import { requireSubscriber, requireRole, requireStationAccess, csrfGuard } from './auth.js';
import { audit } from './audit.js';
import { installationPayload } from './installations.js';

const router = Router();

router.get('/:id/installations', requireSubscriber, requireStationAccess, async (req, res) => {
  const rows = await sql`SELECT * FROM installations WHERE device_id = ${req.stationId}
    ORDER BY started_at DESC`;
  res.json({ installations: rows.map(installationPayload) });
});

const installationSchema = z.object({
  site_name: z.string().max(160).nullable().optional(),
  location_type: z.enum(['urbano', 'finca', 'otro']).optional(),
  zone: z.string().max(200).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  altitude: z.number().int().min(-500).max(9000).nullable().optional(),
  height_m: z.number().min(-50).max(9000).nullable().optional(),
  shelter: z.string().max(160).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
}).strict();

router.post('/:id/installations', requireSubscriber, requireRole('operator'), csrfGuard, requireStationAccess, async (req, res) => {
  const parsed = installationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_installation', details: parsed.error.issues });
  const data = parsed.data;
  if ((data.latitude == null) !== (data.longitude == null)) {
    return res.status(400).json({ error: 'latitude_longitude_both_required' });
  }
  const created = await sql.begin(async (tx) => {
    // Cierra la instalación vigente y abre la nueva. Un traslado no borra historial.
    await tx`UPDATE installations SET ended_at = now() WHERE device_id = ${req.stationId} AND ended_at IS NULL`;
    const [row] = await tx`INSERT INTO installations
        (device_id, site_name, location_type, zone, latitude, longitude, altitude, height_m, shelter, notes, started_at)
      VALUES (${req.stationId}, ${data.site_name ?? null}, ${data.location_type ?? null}, ${data.zone ?? null},
        ${data.latitude ?? null}, ${data.longitude ?? null}, ${data.altitude ?? null}, ${data.height_m ?? null},
        ${data.shelter ?? null}, ${data.notes ?? null}, now()) RETURNING *`;
    // El emplazamiento vigente de la estación pasa a la nueva instalación.
    await tx`UPDATE devices SET
        latitude = coalesce(${data.latitude ?? null}, latitude),
        longitude = coalesce(${data.longitude ?? null}, longitude),
        public_zone = coalesce(${data.zone ?? null}, public_zone),
        altitude = coalesce(${data.altitude ?? null}, altitude),
        location_type = coalesce(${data.location_type ?? null}, location_type)
      WHERE id = ${req.stationId}`;
    await audit(tx, req, 'installation.open', 'station', req.stationId, null, installationPayload(row));
    return row;
  });
  res.status(201).json({ installation: installationPayload(created) });
});

export default router;
