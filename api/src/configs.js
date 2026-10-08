import { Router } from 'express';
import { z } from 'zod';
import { sql } from './db.js';
import { requireSubscriber, requireRole, requireStationAccess, csrfGuard } from './auth.js';
import { audit } from './audit.js';
import {
  CONFIG_RULES, CONFIG_GROUPS, CONFIG_DEFAULTS, validateConfigObject, configWarnings,
  mergeConfig, versionState, stateTimeline, hasAppliedHint, firmwarePendingKeys,
} from './device-config.js';

const router = Router({ mergeParams: true });

// Las reglas y sus límites viven en device-config.js (alineados con el firmware).
export { CONFIG_RULES } from './device-config.js';

function diffConfigs(previous, next) {
  const changes = {};
  const keys = new Set([...Object.keys(previous || {}), ...Object.keys(next || {})]);
  for (const key of keys) {
    const from = previous?.[key];
    const to = next?.[key];
    if (JSON.stringify(from) !== JSON.stringify(to)) changes[key] = { from: from ?? null, to: to ?? null };
  }
  return changes;
}

const putSchema = z.object({
  config: z.record(z.string(), z.unknown()),
  reason: z.string().max(300).optional(),
}).strict();

// Un valor null elimina la clave: el equipo vuelve a su valor de fábrica.
const cleanIncoming = (config) => Object.fromEntries(
  Object.entries(config).filter(([, value]) => value !== null),
);

// La configuración es una herramienta de operación: queda fuera del rol de
// demostración (viewer).
router.get('/:id/config', requireSubscriber, requireRole('operator'), requireStationAccess, async (req, res) => {
  const [device] = await sql`SELECT d.id, d.name, d.firmware_version, s.firmware_version AS status_firmware,
      s.config_version, s.last_contact
    FROM devices d LEFT JOIN device_status s ON s.device_id = d.id
    WHERE d.id = ${req.stationId}`;
  if (!device) return res.status(404).json({ error: 'station_not_found' });

  const [current] = await sql`SELECT config, updated_at FROM device_configs WHERE device_id = ${req.stationId}`;
  // Datos recibidos tras publicar cada versión: permiten inferir que el equipo la aplicó.
  const history = await sql`SELECT v.version, v.config, v.requested_version, v.requested_at,
      v.confirmed_version, v.change_reason, v.applied_at, v.created_at, s.email AS changed_by_email,
      (SELECT max(m.received_at) FROM measurements m
        WHERE m.device_id = v.device_id AND m.deleted_at IS NULL AND m.received_at > v.created_at
      ) AS data_after
    FROM device_config_versions v LEFT JOIN subscribers s ON s.id = v.changed_by
    WHERE v.device_id = ${req.stationId} ORDER BY v.version DESC LIMIT 50`;

  const enriched = history.map((row, index) => ({
    version: row.version,
    config: row.config,
    requestedVersion: row.requestedVersion,
    requestedAt: row.requestedAt,
    confirmedVersion: row.confirmedVersion,
    changeReason: row.changeReason,
    appliedAt: row.appliedAt,
    createdAt: row.createdAt,
    changedByEmail: row.changedByEmail,
    dataAfter: row.dataAfter,
    state: versionState(row),
    appliedHint: hasAppliedHint(row),
    timeline: stateTimeline(row),
    changes: diffConfigs(history[index + 1]?.config ?? null, row.config),
  }));

  const latest = enriched[0] ?? null;
  const config = current?.config ?? {};
  res.json({
    config,
    effectiveConfig: { ...CONFIG_DEFAULTS, ...config },
    updatedAt: current?.updatedAt ?? null,
    version: latest?.version ?? 0,
    state: latest?.state ?? 'solicitado',
    timeline: latest?.timeline ?? null,
    appliedHint: latest?.appliedHint ?? false,
    requestedVersion: latest?.requestedVersion ?? null,
    requestedAt: latest?.requestedAt ?? null,
    confirmedVersion: latest?.confirmedVersion ?? null,
    appliedAt: latest?.appliedAt ?? null,
    history: enriched,
    allowedKeys: CONFIG_RULES,
    groups: CONFIG_GROUPS,
    defaults: CONFIG_DEFAULTS,
    pendingFirmwareKeys: firmwarePendingKeys(),
    warnings: configWarnings(config),
    firmware: {
      declared: device.firmwareVersion ?? null,
      reported: device.statusFirmware ?? null,
      // El firmware actual no envía su versión: la declarada es la de la ficha.
      reportedByDevice: false,
    },
    deviceConfigVersion: Number(device.configVersion ?? 0),
    lastContact: device.lastContact ?? null,
  });
});

router.put('/:id/config', requireSubscriber, requireRole('operator'), csrfGuard, requireStationAccess, async (req, res) => {
  const parsed = putSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.issues });

  const [before] = await sql`SELECT config FROM device_configs WHERE device_id = ${req.stationId}`;
  if (!before) return res.status(404).json({ error: 'station_not_found' });

  const incoming = parsed.data.config;
  for (const key of Object.keys(incoming)) {
    if (!CONFIG_RULES[key]) {
      return res.status(400).json({ error: 'invalid_config', details: [{ key, message: 'Clave no permitida' }] });
    }
  }
  // Fusionar como hace el firmware: lo no enviado se conserva, null elimina la clave.
  const merged = mergeConfig(before.config, incoming);
  const validation = validateConfigObject(cleanIncoming(merged));
  if (!validation.ok) return res.status(400).json({ error: 'invalid_config', details: validation.errors });

  const result = await sql.begin(async (tx) => {
    const [maxRow] = await tx`SELECT coalesce(max(version), 0)::integer AS version
      FROM device_config_versions WHERE device_id = ${req.stationId}`;
    const version = maxRow.version + 1;
    await tx`INSERT INTO device_config_versions (device_id, version, config, changed_by, change_reason)
      VALUES (${req.stationId}, ${version}, ${tx.json(merged)},
        ${req.subscriber.id}, ${parsed.data.reason ?? null})`;
    await tx`UPDATE device_configs SET config = ${tx.json(merged)}, updated_at = now()
      WHERE device_id = ${req.stationId}`;
    await audit(tx, req, 'config.update', 'station', req.stationId, before.config, merged);
    return version;
  });
  res.status(201).json({
    version: result,
    state: 'solicitado',
    applied: false,
    warnings: configWarnings(merged),
    message: 'Configuración guardada. El equipo la solicitará en su próximo envío.',
  });
});

const confirmSchema = z.object({ reason: z.string().max(300).optional() }).strict();

// Confirmar que el equipo aplicó la versión. El estado "aplicado" también puede quedar
// registrado solo (inferido por los datos posteriores), por eso confirmar es opcional.
router.post('/:id/config/:version/confirm', requireSubscriber, requireRole('operator'), csrfGuard,
  requireStationAccess, async (req, res) => {
    const version = Number.parseInt(req.params.version, 10);
    if (!Number.isInteger(version) || version < 1) return res.status(400).json({ error: 'invalid_version' });
    const parsed = confirmSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.issues });
    const [row] = await sql`SELECT version, confirmed_version FROM device_config_versions
      WHERE device_id = ${req.stationId} AND version = ${version}`;
    if (!row) return res.status(404).json({ error: 'version_not_found' });

    await sql.begin(async (tx) => {
      await tx`UPDATE device_config_versions
        SET confirmed_version = ${version}, applied_at = now(),
            requested_version = coalesce(requested_version, ${version}),
            requested_at = coalesce(requested_at, now())
        WHERE device_id = ${req.stationId} AND version = ${version}`;
      await tx`UPDATE device_status SET config_version = ${version}, updated_at = now()
        WHERE device_id = ${req.stationId}`;
      await audit(tx, req, 'config.confirm', 'station', req.stationId, null,
        { version, reason: parsed.data.reason ?? null });
    });
    res.json({ version, state: 'aplicado', confirmed: true });
  });

export default router;