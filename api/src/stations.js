import { Router } from 'express';
import { z } from 'zod';
import { sql } from './db.js';
import { requireSubscriber, requireRole, requireStationAccess, csrfGuard } from './auth.js';
import { audit } from './audit.js';
import { CONFIG_DEFAULTS } from './device-config.js';
import { ensureSystemRules, batteryImpact } from './alert-engine.js';
import { statisticsFor } from './statistics.js';

const router = Router();

const idSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:_-]{0,79}$/, 'identificador inválido');

const sensorsSchema = z.object({
  temperature: z.boolean(),
  humidity: z.boolean(),
  pressure: z.boolean(),
  battery: z.boolean(),
  lux: z.boolean(),
}).partial();

const patchSchema = z.object({
  name: z.string().min(1).max(120),
  owner: z.string().max(200).nullable(),
  location_type: z.enum(['urbano', 'finca', 'otro']),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  public_zone: z.string().max(200).nullable(),
  aemet_municipality_code: z.string().regex(/^\d{5}$/, 'el código municipal AEMET debe tener 5 dígitos').nullable(),
  aemet_station_id: z.string().regex(/^[A-Za-z0-9]{4,5}$/, 'indicativo de estación AEMET inválido').nullable(),
  aemet_warning_area: z.string().regex(/^[A-Za-z0-9_-]{2,12}$/, 'código de área AEMET inválido').nullable(),
  altitude: z.number().int().min(-500).max(9000).nullable(),
  installation_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  sensors: sensorsSchema,
  firmware_version: z.string().max(60).nullable(),
  publish_permission: z.boolean(),
  coverage_km: z.number().gt(0).max(500),
  active: z.boolean(),
}).partial().strict();

const createSchema = patchSchema.extend({
  id: idSchema,
  name: z.string().min(1).max(120),
}).required({ id: true, name: true });

// Fragmento reutilizable: en sql`` se inserta como SQL crudo, nunca como valor.
const deviceCols = sql`id, name, owner, location_type, latitude, longitude, public_zone,
  aemet_municipality_code, aemet_station_id, aemet_warning_area, altitude, installation_date, sensors, firmware_version, publish_permission,
  coverage_km, active, created_at, last_seen_at`;

const deviceSelect = sql`SELECT ${deviceCols} FROM devices`;

// Mismo listado calificado para el JOIN con device_status (firmware_version existe en ambas tablas).
const deviceColsJoined = sql`d.id, d.name, d.owner, d.location_type, d.latitude, d.longitude, d.public_zone,
  d.aemet_municipality_code, d.aemet_station_id, d.aemet_warning_area, d.altitude, d.installation_date, d.sensors, d.firmware_version, d.publish_permission,
  d.coverage_km, d.active, d.created_at, d.last_seen_at`;

const stationSelect = sql`SELECT ${deviceColsJoined}, c.config,
  s.last_contact, s.last_valid_data, s.battery_mv, s.battery_level,
  s.firmware_version AS status_firmware_version, s.config_version, s.pending_samples, s.updated_at
  FROM devices d
  LEFT JOIN device_configs c ON c.device_id = d.id
  LEFT JOIN device_status s ON s.device_id = d.id`;

// Conectividad derivada del último contacto y el intervalo de medida configurado.
export function connectivityFor(lastContact, intervalSeconds) {
  if (!lastContact) return 'unknown';
  const ageMs = Date.now() - new Date(lastContact).getTime();
  const interval = Math.max(10, Number(intervalSeconds) || 900) * 1000;
  if (ageMs <= 2 * interval) return 'online';
  if (ageMs <= 10 * interval) return 'degraded';
  return 'offline';
}

export function statusPayload(row, config) {
  return {
    lastContact: row.lastContact ?? null,
    lastValidData: row.lastValidData ?? null,
    connectivity: connectivityFor(row.lastContact, config?.interval_normal_s),
    batteryMv: row.batteryMv ?? null,
    batteryLevel: row.batteryLevel ?? 'unknown',
    firmwareVersion: row.statusFirmwareVersion ?? row.firmwareVersion ?? null,
    configVersion: Number(row.configVersion ?? 0),
    pendingSamples: Number(row.pendingSamples ?? 0),
    updatedAt: row.updatedAt ?? null,
  };
}

export function stationPayload(row) {
  return {
    id: row.id,
    name: row.name,
    owner: row.owner,
    locationType: row.locationType,
    // Ubicación exacta privada: solo sale a quien tenga acceso a la estación.
    latitude: row.latitude,
    longitude: row.longitude,
    publicZone: row.publicZone,
    aemetMunicipalityCode: row.aemetMunicipalityCode ?? null,
    aemetStationId: row.aemetStationId ?? null,
    aemetWarningArea: row.aemetWarningArea ?? null,
    altitude: row.altitude,
    installationDate: row.installationDate,
    sensors: row.sensors,
    firmwareVersion: row.firmwareVersion,
    publishPermission: row.publishPermission,
    coverageKm: row.coverageKm,
    active: row.active,
    createdAt: row.createdAt,
    status: row.status ?? null,
  };
}

// Listado con estado operativo; el ámbito lo decide el rol del suscriptor.
export async function listStations(userId, role) {
  const rows = role === 'admin'
    ? await sql`${stationSelect} ORDER BY d.name`
    : await sql`${stationSelect}
        JOIN subscriber_devices sd ON sd.device_id = d.id AND sd.subscriber_id = ${userId}
        ORDER BY d.name`;
  return rows.map((row) => stationPayload({
    ...row,
    status: statusPayload(row, row.config ?? {}),
  }));
}

router.get('/', requireSubscriber, async (req, res) => {
  const locationType = typeof req.query.location_type === 'string' ? req.query.location_type : null;
  const search = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 80) : '';
  const onlyActive = req.query.active === 'true';
  let stations = await listStations(req.subscriber.id, req.subscriber.role);
  stations = stations.filter((station) => {
    if (locationType && station.locationType !== locationType) return false;
    if (onlyActive && !station.active) return false;
    if (search) {
      const haystack = `${station.id} ${station.name} ${station.owner || ''} ${station.publicZone || ''}`.toLowerCase();
      if (!haystack.includes(search.toLowerCase())) return false;
    }
    return true;
  });
  res.json({ stations });
});

router.get('/sensors-catalog', requireSubscriber, async (_req, res) => {
  const sensors = await sql`SELECT id, name, unit, min_value, max_value, description, is_core
    FROM station_sensors ORDER BY is_core DESC, id`;
  res.json({ sensors });
});

router.get('/:id', requireSubscriber, requireStationAccess, async (req, res) => {
  const rows = await sql`${stationSelect} WHERE d.id = ${req.stationId}`;
  const row = rows[0];
  if (!row) return res.status(404).json({ error: 'station_not_found' });
  const [versions] = await sql`SELECT count(*)::integer AS count FROM device_config_versions WHERE device_id = ${row.id}`;
  const [measurements] = await sql`SELECT count(*)::integer AS total,
      count(*) FILTER (WHERE is_validated AND deleted_at IS NULL)::integer AS valid,
      max(observed_at) AS last_observed
    FROM measurements WHERE device_id = ${row.id}`;
  const [rules] = await sql`SELECT count(*)::integer AS count FROM alert_rules WHERE device_id = ${row.id} AND enabled`;
  res.json({
    station: stationPayload(row),
    status: statusPayload(row, row.config ?? {}),
    configVersionCount: versions.count,
    measurementStats: { total: measurements.total, valid: measurements.valid, lastObserved: measurements.lastObserved },
    alertRuleCount: rules.count,
  });
});

// Huecos de secuencia en un rango: muestras que el equipo no llegó a entregar.
// Se calcula sobre observed_at para reconstruir correctamente lotes tardíos.
router.get('/:id/measurements/gaps', requireSubscriber, requireStationAccess, async (req, res) => {
  const to = req.query.to ? new Date(String(req.query.to)) : new Date();
  const from = req.query.from
    ? new Date(String(req.query.from))
    : new Date(to.getTime() - 7 * 24 * 3600 * 1000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return res.status(400).json({ error: 'invalid_range' });
  if (from >= to) return res.status(400).json({ error: 'invalid_range' });

  const [configRow] = await sql`SELECT config FROM device_configs WHERE device_id = ${req.stationId}`;
  const [counts] = await sql`SELECT count(*)::integer AS received,
      count(*) FILTER (WHERE is_validated)::integer AS valid,
      count(*) FILTER (WHERE NOT is_validated)::integer AS invalid
    FROM measurements
    WHERE device_id = ${req.stationId} AND observed_at >= ${from} AND observed_at < ${to}
      AND deleted_at IS NULL`;
  const gaps = await sql`WITH numbered AS (
      SELECT sequence, LAG(sequence) OVER (ORDER BY sequence) AS prev
      FROM measurements
      WHERE device_id = ${req.stationId} AND observed_at >= ${from} AND observed_at < ${to}
        AND deleted_at IS NULL
    )
    SELECT (prev + 1)::text AS gap_from, (sequence - 1)::text AS gap_to,
      (sequence - prev - 1)::integer AS missing
    FROM numbered WHERE prev IS NOT NULL AND sequence > prev + 1
    ORDER BY prev`;
  const interval = Number(configRow?.config?.interval_normal_s) || null;
  const expected = interval ? Math.max(1, Math.floor((to.getTime() - from.getTime()) / 1000 / interval)) : null;
  const missingTotal = gaps.reduce((acc, gap) => acc + Number(gap.missing || 0), 0);
  res.json({
    from: from.toISOString(),
    to: to.toISOString(),
    intervalSeconds: interval,
    received: counts.received,
    valid: counts.valid,
    invalid: counts.invalid,
    expected,
    missing: missingTotal,
    coveragePct: expected ? Math.round((counts.received / expected) * 1000) / 10 : null,
    gaps,
  });
});

// Informe estadístico del periodo: solo datos validados y no borrados.
router.get('/:id/statistics', requireSubscriber, requireStationAccess, async (req, res) => {
  const to = req.query.to ? new Date(String(req.query.to)) : new Date();
  const from = req.query.from
    ? new Date(String(req.query.from))
    : new Date(to.getTime() - 7 * 24 * 3600 * 1000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return res.status(400).json({ error: 'invalid_range' });
  if (from >= to) return res.status(400).json({ error: 'invalid_range' });
  res.json(await statisticsFor(req.stationId, {
    from, to, includeCommunicationAlerts: req.subscriber.role === 'admin',
  }));
});

// Coste medido de la excepción de envío urgente sobre la batería de la estación.
router.get('/:id/urgent-impact', requireSubscriber, requireStationAccess, async (req, res) => {
  const [configRow] = await sql`SELECT config FROM device_configs WHERE device_id = ${req.stationId}`;
  const config = configRow?.config ?? {};
  const directives = await sql`SELECT id::text AS id, reason, issued_at, released_at,
      battery_mv_before, battery_mv_after
    FROM urgent_directives WHERE device_id = ${req.stationId} ORDER BY issued_at DESC LIMIT 100`;
  const samples = await sql`SELECT observed_at, battery_mv FROM measurements
    WHERE device_id = ${req.stationId} AND is_validated AND deleted_at IS NULL
      AND battery_mv IS NOT NULL ORDER BY observed_at DESC LIMIT 500`;
  const pending = directives.filter((directive) => !directive.releasedAt).length;
  res.json({
    deviceId: req.stationId,
    pending,
    impact: batteryImpact({
      directives, samples, syncIntervalS: config.sync_interval_s ?? 1800,
    }),
    // Lo que costaría en retraso la excepción, medido con lo que ya hay hoy.
    delay: {
      syncIntervalS: config.sync_interval_s ?? null,
      note: 'Con lotes cada sync_interval_s, un aviso urgente llega como muy tarde ese tiempo después de la medida.',
    },
  });
});

router.post('/', requireSubscriber, requireRole('operator'), csrfGuard, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_station', details: parsed.error.issues });
  const data = parsed.data;
  if ((data.latitude == null) !== (data.longitude == null)) {
    return res.status(400).json({ error: 'latitude_longitude_both_required' });
  }
  try {
    const row = await sql.begin(async (tx) => {
      const [created] = await tx`INSERT INTO devices (id, name, owner, location_type, latitude, longitude,
          public_zone, aemet_municipality_code, aemet_station_id, aemet_warning_area, altitude, installation_date, sensors, firmware_version, publish_permission, coverage_km, active)
        VALUES (${data.id}, ${data.name}, ${data.owner ?? null}, ${data.location_type ?? 'finca'},
          ${data.latitude ?? null}, ${data.longitude ?? null}, ${data.public_zone ?? null},
          ${data.aemet_municipality_code ?? null}, ${data.aemet_station_id ?? null}, ${data.aemet_warning_area ?? null},
          ${data.altitude ?? null}, ${data.installation_date ?? null},
          ${tx.json({ temperature: true, humidity: true, pressure: true, battery: true, lux: false, ...(data.sensors || {}) })},
          ${data.firmware_version ?? null}, ${data.publish_permission ?? false},
          ${data.coverage_km ?? 25}, ${data.active ?? true})
        RETURNING ${deviceCols}`;
      // Una estación nueva nace con valores por defecto seguros (medir 6 min, enviar 30 min)
      // y su versión 1, para que el control remoto tenga desde el principio un historial.
      await tx`INSERT INTO device_configs (device_id, config) VALUES (${data.id}, ${tx.json(CONFIG_DEFAULTS)})
        ON CONFLICT (device_id) DO NOTHING`;
      await tx`INSERT INTO device_config_versions (device_id, version, config, changed_by, change_reason)
        VALUES (${data.id}, 1, ${tx.json(CONFIG_DEFAULTS)}, ${req.subscriber.id}, 'configuración inicial')
        ON CONFLICT (device_id, version) DO NOTHING`;
      await tx`INSERT INTO device_status (device_id) VALUES (${data.id}) ON CONFLICT DO NOTHING`;
      // Detectores de sistema: sin comunicación y batería baja, listos desde el alta.
      await ensureSystemRules(tx, data.id);
      // Toda estación nueva queda vinculada a quien la creó.
      await tx`INSERT INTO subscriber_devices (subscriber_id, device_id)
        VALUES (${req.subscriber.id}, ${data.id}) ON CONFLICT DO NOTHING`;
      await audit(tx, req, 'station.create', 'station', data.id, null, data);
      return created;
    });
    res.status(201).json({ station: stationPayload({ ...row, status: null }) });
  } catch (error) {
    if (error?.code === '23505') return res.status(409).json({ error: 'station_id_exists' });
    throw error;
  }
});

router.patch('/:id', requireSubscriber, requireRole('operator'), csrfGuard, requireStationAccess, async (req, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_station', details: parsed.error.issues });
  const data = parsed.data;
  if (!Object.keys(data).length) return res.status(400).json({ error: 'empty_patch' });
  if ((data.latitude === null && data.longitude != null) || (data.latitude != null && data.longitude === null)) {
    return res.status(400).json({ error: 'latitude_longitude_both_required' });
  }
  const before = (await sql`${deviceSelect} WHERE id = ${req.stationId}`)[0];
  if (!before) return res.status(404).json({ error: 'station_not_found' });

  const patch = {};
  for (const key of ['name', 'owner', 'location_type', 'latitude', 'longitude', 'public_zone',
    'aemet_municipality_code', 'aemet_station_id', 'aemet_warning_area',
    'altitude', 'installation_date', 'firmware_version', 'publish_permission', 'coverage_km', 'active']) {
    if (data[key] !== undefined) patch[key] = data[key];
  }
  if (data.sensors !== undefined) {
    // Se fusiona como objeto: un string pre-serializado se guardaría como JSON string (jsonb_typeof = 'string').
    const base = typeof before.sensors === 'string' ? JSON.parse(before.sensors) : (before.sensors || {});
    patch.sensors = { ...base, ...data.sensors };
  }
  if (!Object.keys(patch).length) return res.status(400).json({ error: 'empty_patch' });

  const updated = await sql.begin(async (tx) => {
    const [row] = await tx`UPDATE devices SET ${sql(patch)} WHERE id = ${req.stationId} RETURNING ${deviceCols}`;
    await audit(tx, req, 'station.update', 'station', req.stationId, before, row);
    return row;
  });
  res.json({ station: stationPayload({ ...updated, status: null }) });
});

router.delete('/:id', requireSubscriber, requireRole('admin'), csrfGuard, requireStationAccess, async (req, res) => {
  const before = (await sql`SELECT id, name, active FROM devices WHERE id = ${req.stationId}`)[0];
  if (!before) return res.status(404).json({ error: 'station_not_found' });
  await sql.begin(async (tx) => {
    await tx`UPDATE devices SET active = false WHERE id = ${req.stationId}`;
    await tx`UPDATE device_status SET connectivity = 'offline', updated_at = now() WHERE device_id = ${req.stationId}`;
    await audit(tx, req, 'station.deactivate', 'station', req.stationId, before, { active: false });
  });
  res.status(204).end();
});

export default router;
