import { Router } from 'express';
import { z } from 'zod';
import { sql } from './db.js';
import { requireSubscriber, requireRole, requireStationAccess, csrfGuard } from './auth.js';
import { audit } from './audit.js';

const router = Router({ mergeParams: true });

// Claves que reconoce el firmware (StationConfig) y sus rangos permitidos.
export const CONFIG_RULES = {
  interval_normal_s: { kind: 'integer', min: 10, max: 86400, label: 'Intervalo de medida (s)' },
  interval_risk_s: { kind: 'integer', min: 10, max: 86400, label: 'Intervalo en modo riesgo (s)' },
  interval_risk_min_s: { kind: 'integer', min: 10, max: 86400, label: 'Intervalo mínimo en riesgo (s)' },
  sync_interval_s: { kind: 'integer', min: 10, max: 86400, label: 'Intervalo de envío (s)' },
  battery_low_mv: { kind: 'integer', min: 2000, max: 5000, label: 'Batería baja (mV)' },
  battery_critical_mv: { kind: 'integer', min: 2000, max: 5000, label: 'Batería crítica (mV)' },
  temp_alert_high_c: { kind: 'number', min: -80, max: 100, label: 'Alerta temperatura alta (°C)' },
  temp_alert_low_c: { kind: 'number', min: -80, max: 100, label: 'Alerta temperatura baja (°C)' },
  humidity_alert_high_pct: { kind: 'number', min: 0, max: 100, label: 'Alerta humedad alta (%)' },
  pressure_alert_low_pa: { kind: 'integer', min: 30000, max: 120000, label: 'Alerta presión baja (Pa)' },
  risk_mode_enabled: { kind: 'boolean', label: 'Modo riesgo activo' },
  sync_enabled: { kind: 'boolean', label: 'Envío activo' },
};

export function validateConfigObject(config) {
  const errors = [];
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return { ok: false, errors: [{ key: '_root', message: 'La configuración debe ser un objeto JSON' }] };
  }
  for (const [key, value] of Object.entries(config)) {
    const rule = CONFIG_RULES[key];
    if (!rule) {
      errors.push({ key, message: `Clave no permitida. Válidas: ${Object.keys(CONFIG_RULES).join(', ')}` });
      continue;
    }
    if (rule.kind === 'boolean') {
      if (typeof value !== 'boolean') errors.push({ key, message: 'Debe ser true o false' });
    } else if (typeof value !== 'number' || !Number.isFinite(value)) {
      errors.push({ key, message: 'Debe ser un número' });
    } else {
      if (rule.kind === 'integer' && !Number.isInteger(value)) errors.push({ key, message: 'Debe ser un entero' });
      if (value < rule.min || value > rule.max) errors.push({ key, message: `Fuera de rango (${rule.min}… ${rule.max})` });
    }
  }
  // Umbral bajo nunca debe superar al alto.
  if (typeof config.temp_alert_low_c === 'number' && typeof config.temp_alert_high_c === 'number'
      && config.temp_alert_low_c > config.temp_alert_high_c) {
    errors.push({ key: 'temp_alert_low_c', message: 'El umbral bajo no puede superar al alto' });
  }
  return { ok: errors.length === 0, errors };
}

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

router.get('/:id/config', requireSubscriber, requireStationAccess, async (req, res) => {
  const [device] = await sql`SELECT id FROM devices WHERE id = ${req.stationId}`;
  if (!device) return res.status(404).json({ error: 'station_not_found' });
  const [current] = await sql`SELECT config, updated_at FROM device_configs WHERE device_id = ${req.stationId}`;
  const history = await sql`SELECT v.version, v.config, v.requested_version, v.confirmed_version,
      v.change_reason, v.applied_at, v.created_at, s.email AS changed_by_email
    FROM device_config_versions v LEFT JOIN subscribers s ON s.id = v.changed_by
    WHERE v.device_id = ${req.stationId} ORDER BY v.version DESC LIMIT 50`;
  const enriched = history.map((row, index) => ({
    version: row.version,
    config: row.config,
    requestedVersion: row.requestedVersion,
    confirmedVersion: row.confirmedVersion,
    changeReason: row.changeReason,
    appliedAt: row.appliedAt,
    createdAt: row.createdAt,
    changedByEmail: row.changedByEmail,
    changes: diffConfigs(history[index + 1]?.config ?? null, row.config),
  }));
  const latest = enriched[0] ?? null;
  res.json({
    config: current?.config ?? {},
    updatedAt: current?.updatedAt ?? null,
    version: latest?.version ?? 0,
    requestedVersion: latest?.requestedVersion ?? null,
    confirmedVersion: latest?.confirmedVersion ?? null,
    appliedAt: latest?.appliedAt ?? null,
    history: enriched,
    allowedKeys: CONFIG_RULES,
  });
});

router.put('/:id/config', requireSubscriber, requireRole('operator'), csrfGuard, requireStationAccess, async (req, res) => {
  const parsed = putSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.issues });
  const validation = validateConfigObject(parsed.data.config);
  if (!validation.ok) return res.status(400).json({ error: 'invalid_config', details: validation.errors });

  const [before] = await sql`SELECT config FROM device_configs WHERE device_id = ${req.stationId}`;
  if (!before) return res.status(404).json({ error: 'station_not_found' });

  const result = await sql.begin(async (tx) => {
    const [maxRow] = await tx`SELECT coalesce(max(version), 0)::integer AS version
      FROM device_config_versions WHERE device_id = ${req.stationId}`;
    const version = maxRow.version + 1;
    await tx`INSERT INTO device_config_versions (device_id, version, config, changed_by, change_reason)
      VALUES (${req.stationId}, ${version}, ${tx.json(parsed.data.config)},
        ${req.subscriber.id}, ${parsed.data.reason ?? null})`;
    await tx`UPDATE device_configs SET config = ${tx.json(parsed.data.config)}, updated_at = now()
      WHERE device_id = ${req.stationId}`;
    await audit(tx, req, 'config.update', 'station', req.stationId, before.config, parsed.data.config);
    return version;
  });
  res.status(201).json({
    version: result,
    applied: false,
    message: 'Configuración guardada. El equipo la solicitará en su próximo envío.',
  });
});

const confirmSchema = z.object({ reason: z.string().max(300).optional() }).strict();

router.post('/:id/config/:version/confirm', requireSubscriber, requireRole('operator'), csrfGuard,
  requireStationAccess, async (req, res) => {
    const version = Number.parseInt(req.params.version, 10);
    if (!Number.isInteger(version) || version < 1) return res.status(400).json({ error: 'invalid_version' });
    const parsed = confirmSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.issues });
    const [row] = await sql`SELECT version FROM device_config_versions
      WHERE device_id = ${req.stationId} AND version = ${version}`;
    if (!row) return res.status(404).json({ error: 'version_not_found' });

    await sql.begin(async (tx) => {
      await tx`UPDATE device_config_versions
        SET confirmed_version = ${version}, applied_at = now(),
            requested_version = coalesce(requested_version, ${version})
        WHERE device_id = ${req.stationId} AND version = ${version}`;
      await tx`UPDATE device_status SET config_version = ${version}, updated_at = now()
        WHERE device_id = ${req.stationId}`;
      await audit(tx, req, 'config.confirm', 'station', req.stationId, null,
        { version, reason: parsed.data.reason ?? null });
    });
    res.json({ version, confirmed: true });
  });

export default router;
