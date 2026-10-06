import { Router } from 'express';
import { z } from 'zod';
import { sql } from './db.js';
import { requireSubscriber, csrfGuard } from './auth.js';
import { audit } from './audit.js';

const coordinate = z.number().finite();

// Latitud y longitud van juntas o ninguna: media coordenada no ubica una finca.
export const farmSchema = z.object({
  name: z.string().trim().min(2).max(120),
  municipality: z.string().trim().max(120).optional(),
  latitude: coordinate.min(-90).max(90).optional().nullable(),
  longitude: coordinate.min(-180).max(180).optional().nullable(),
  crop: z.string().trim().max(120).optional(),
  livestock: z.string().trim().max(120).optional(),
}).strict().refine((farm) => (farm.latitude == null) === (farm.longitude == null), {
  message: 'coordenadas_incompletas',
});

function farmPayload(row) {
  return {
    id: String(row.id),
    name: row.name,
    municipality: row.municipality,
    latitude: row.latitude,
    longitude: row.longitude,
    crop: row.crop,
    livestock: row.livestock,
    devices: (row.devices ?? []).filter(Boolean),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function listFarms(subscriberId, client = sql) {
  const rows = await client`SELECT f.id, f.name, f.municipality, f.latitude, f.longitude, f.crop, f.livestock,
      f.created_at, f.updated_at,
      coalesce(array_agg(fd.device_id) FILTER (WHERE fd.device_id IS NOT NULL), '{}') AS devices
    FROM farms f LEFT JOIN farm_devices fd ON fd.farm_id = f.id
    WHERE f.subscriber_id = ${subscriberId}
    GROUP BY f.id ORDER BY f.name`;
  return rows.map(farmPayload);
}

export { listFarms };

async function ownedFarm(subscriberId, farmId, role) {
  const [farm] = role === 'admin'
    ? await sql`SELECT id FROM farms WHERE id = ${farmId}`
    : await sql`SELECT id FROM farms WHERE id = ${farmId} AND subscriber_id = ${subscriberId}`;
  return farm ?? null;
}

const router = Router();
router.use(requireSubscriber);

router.get('/', async (req, res) => {
  res.json({ farms: await listFarms(req.subscriber.id) });
});

router.post('/', csrfGuard, async (req, res) => {
  const parsed = farmSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.issues });
  const farm = parsed.data;
  const [row] = await sql`INSERT INTO farms
    (subscriber_id, name, municipality, latitude, longitude, crop, livestock)
    VALUES (${req.subscriber.id}, ${farm.name}, ${farm.municipality ?? null},
      ${farm.latitude ?? null}, ${farm.longitude ?? null}, ${farm.crop ?? null}, ${farm.livestock ?? null})
    RETURNING id, name, municipality, latitude, longitude, crop, livestock, created_at, updated_at`;
  await audit(sql, req, 'farm.create', 'farm', String(row.id), null, { name: farm.name });
  res.status(201).json({ farm: farmPayload(row) });
});

router.patch('/:id', csrfGuard, async (req, res) => {
  const farmId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(farmId) || farmId < 1) return res.status(400).json({ error: 'invalid_id' });
  const parsed = farmSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.issues });
  if (!await ownedFarm(req.subscriber.id, farmId, req.subscriber.role)) {
    return res.status(404).json({ error: 'farm_not_found' });
  }
  const farm = parsed.data;
  const [row] = await sql`UPDATE farms SET
      name = ${farm.name}, municipality = ${farm.municipality ?? null},
      latitude = ${farm.latitude ?? null}, longitude = ${farm.longitude ?? null},
      crop = ${farm.crop ?? null}, livestock = ${farm.livestock ?? null}, updated_at = now()
    WHERE id = ${farmId}
    RETURNING id, name, municipality, latitude, longitude, crop, livestock, created_at, updated_at`;
  await audit(sql, req, 'farm.update', 'farm', String(farmId), null, { name: farm.name });
  res.json({ farm: farmPayload(row) });
});

router.delete('/:id', csrfGuard, async (req, res) => {
  const farmId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(farmId) || farmId < 1) return res.status(400).json({ error: 'invalid_id' });
  if (!await ownedFarm(req.subscriber.id, farmId, req.subscriber.role)) {
    return res.status(404).json({ error: 'farm_not_found' });
  }
  await sql`DELETE FROM farms WHERE id = ${farmId}`;
  await audit(sql, req, 'farm.delete', 'farm', String(farmId), null, { deleted: true });
  res.status(204).end();
});

// La estación debe ser accesible para el suscriptor (o el actor es admin).
async function canUseDevice(req, deviceId) {
  if (req.subscriber.role === 'admin') {
    const [device] = await sql`SELECT id FROM devices WHERE id = ${deviceId}`;
    return device ?? null;
  }
  const [row] = await sql`SELECT device_id FROM subscriber_devices
    WHERE subscriber_id = ${req.subscriber.id} AND device_id = ${deviceId}`;
  return row ?? null;
}

const deviceSchema = z.object({ device_id: z.string().min(1).max(80) }).strict();

router.post('/:id/devices', csrfGuard, async (req, res) => {
  const farmId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(farmId) || farmId < 1) return res.status(400).json({ error: 'invalid_id' });
  const parsed = deviceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.issues });
  if (!await ownedFarm(req.subscriber.id, farmId, req.subscriber.role)) {
    return res.status(404).json({ error: 'farm_not_found' });
  }
  if (!await canUseDevice(req, parsed.data.device_id)) {
    return res.status(404).json({ error: 'station_not_found' });
  }
  await sql`INSERT INTO farm_devices (farm_id, device_id) VALUES (${farmId}, ${parsed.data.device_id})
    ON CONFLICT DO NOTHING`;
  await audit(sql, req, 'farm.device.link', 'farm', String(farmId), null, { device_id: parsed.data.device_id });
  res.status(201).json({ device_id: parsed.data.device_id });
});

router.delete('/:id/devices/:deviceId', csrfGuard, async (req, res) => {
  const farmId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(farmId) || farmId < 1) return res.status(400).json({ error: 'invalid_id' });
  if (!await ownedFarm(req.subscriber.id, farmId, req.subscriber.role)) {
    return res.status(404).json({ error: 'farm_not_found' });
  }
  const removed = await sql`DELETE FROM farm_devices
    WHERE farm_id = ${farmId} AND device_id = ${req.params.deviceId} RETURNING device_id`;
  if (!removed.length) return res.status(404).json({ error: 'link_not_found' });
  await audit(sql, req, 'farm.device.unlink', 'farm', String(farmId), { device_id: req.params.deviceId }, null);
  res.status(204).end();
});

export default router;
