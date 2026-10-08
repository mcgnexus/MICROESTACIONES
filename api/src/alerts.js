import { Router } from 'express';
import { z } from 'zod';
import { sql } from './db.js';
import { requireSubscriber, requireRole, csrfGuard, accessibleDeviceIds, alertableDeviceIds } from './auth.js';
import { audit } from './audit.js';
import { alertAge } from './alert-engine.js';
import { NON_COMMUNICATION_ALERT } from './alert-visibility.js';
import { alertEngineVerified } from './env.js';
import { renderAlertMessage, sendWhatsApp, sendEmail } from './notify.js';

const router = Router();

const idSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:_-]{0,79}$/, 'identificador inválido');

// Acceso a la estación: manda el ámbito de datos (para reglas y fichas).
async function hasStationAccess(subscriber, deviceId) {
  if (subscriber.role === 'admin') return true;
  const scope = accessibleDeviceIds(subscriber);
  const rows = await sql`SELECT 1 AS ok FROM devices d WHERE d.id = ${deviceId} AND d.id IN ${scope}`;
  return rows.length > 0;
}

// Ámbito de avisos: ver la estación de la demostración no suscribe a los suyos.
async function hasAlertAccess(subscriber, deviceId) {
  if (subscriber.role === 'admin') return true;
  const scope = alertableDeviceIds(subscriber);
  const rows = await sql`SELECT 1 AS ok FROM devices d WHERE d.id = ${deviceId} AND d.id IN ${scope}`;
  return rows.length > 0;
}

const ALERT_SELECT = sql`SELECT a.id::text AS id, a.device_id, d.name AS device_name, a.level, a.message,
  a.value, a.source, a.category, a.observed_at, a.created_at, a.acknowledged_at, a.auto_resolved,
  a.rule_id::text AS rule_id, a.rule_snapshot, a.recipient, a.channel, a.delivery_status,
  a.delivered_at, a.closed_at, a.closure_reason, s.email AS closed_by_email
  FROM alerts a
  JOIN devices d ON d.id = a.device_id
  LEFT JOIN subscribers s ON s.id = a.closed_by`;

router.get('/', requireSubscriber, async (req, res) => {
  const status = ['open', 'closed', 'all'].includes(req.query.status) ? req.query.status : 'open';
  const channel = ['email', 'sms', 'webhook', 'push', 'in_app', 'whatsapp'].includes(req.query.channel) ? req.query.channel : null;
  const deviceId = typeof req.query.device_id === 'string' && req.query.device_id ? req.query.device_id : null;
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit ?? '100', 10) || 100, 1), 500);
  if (deviceId) {
    if (!(await hasStationAccess(req.subscriber, deviceId))) {
      return res.status(404).json({ error: 'station_not_found' });
    }
    // Se ve la estación (demostración), pero no se está suscrito a sus avisos:
    // se responde vacío en lugar de 404 para no dar a entender que algo falla.
    if (!(await hasAlertAccess(req.subscriber, deviceId))) {
      return res.json({
        alerts: [], counts: { open: 0, closed: 0 },
        engine_verified: alertEngineVerified(), not_subscribed: true,
      });
    }
  }

  const conditions = [sql`a.device_id IN ${alertableDeviceIds(req.subscriber)}`];
  if (req.subscriber.role === 'admin') conditions.length = 0;
  else conditions.push(NON_COMMUNICATION_ALERT);
  if (status === 'open') conditions.push(sql`a.closed_at IS NULL`);
  if (status === 'closed') conditions.push(sql`a.closed_at IS NOT NULL`);
  if (channel) conditions.push(sql`a.channel = ${channel}`);
  if (deviceId) conditions.push(sql`a.device_id = ${deviceId}`);
  const where = conditions.length
    ? sql`WHERE ${conditions.reduce((acc, cond, index) => (index === 0 ? cond : sql`${acc} AND ${cond}`))}`
    : sql``;

  const rows = await sql`${ALERT_SELECT} ${where} ORDER BY a.created_at DESC LIMIT ${limit}`;
  const scopedAlerts = req.subscriber.role === 'admin'
    ? sql`SELECT count(*) FILTER (WHERE closed_at IS NULL)::integer AS open,
          count(*) FILTER (WHERE closed_at IS NOT NULL)::integer AS closed FROM alerts`
    : sql`SELECT count(*) FILTER (WHERE a.closed_at IS NULL)::integer AS open,
          count(*) FILTER (WHERE a.closed_at IS NOT NULL)::integer AS closed
        FROM alerts a WHERE a.device_id IN ${alertableDeviceIds(req.subscriber)}
          AND ${NON_COMMUNICATION_ALERT}`;
  const [counts] = await sql`${scopedAlerts}`;
  // Cada aviso lleva la antigüedad de su medida y el retraso de la entrega.
  // `engine_verified` indica si el motor de avisos está comprobado en esta
  // instalación: sin él, los avisos de umbral local no se presentan como tales.
  res.json({
    alerts: rows.map((row) => ({ ...row, ...alertAge(row) })),
    counts,
    engine_verified: alertEngineVerified(),
  });
});

// ---- Reglas de aviso -------------------------------------------------------
// Una regla es verificable si declara qué mide, desde cuándo se sostiene la
// condición (min_duration_s) y con cuánto margen se recupera (recovery_margin).
// La excepción urgente pide al equipo subir la medida crítica en ese despertar.
const ruleSchema = z.object({
  device_id: idSchema,
  metric: z.enum(['temperature', 'humidity', 'pressure', 'battery', 'lux']),
  comparator: z.enum(['gt', 'gte', 'lt', 'lte']),
  threshold: z.number().finite(),
  level: z.union([z.literal(1), z.literal(2)]),
  message: z.string().min(1).max(200),
  recipient: z.string().max(200).nullable().optional(),
  channel: z.enum(['email', 'sms', 'webhook', 'push', 'in_app', 'whatsapp']).default('in_app'),
  category: z.enum(['frost', 'heat', 'storm', 'wind', 'humidity', 'general']).default('general'),
  enabled: z.boolean().default(true),
  min_duration_s: z.number().int().min(0).max(86400).default(0),
  recovery_margin: z.number().min(0).max(100000).default(0),
  recovery_threshold: z.number().finite().nullable().optional(),
  recovery_duration_s: z.number().int().min(0).max(86400).default(0),
  cooldown_s: z.number().int().min(0).max(604800).default(0),
  urgent: z.boolean().default(false),
}).strict().superRefine((rule, ctx) => {
  if (rule.urgent && rule.level !== 1) {
    ctx.addIssue({ code: 'custom', path: ['urgent'], message: 'Una regla urgente debe ser de nivel prioritario' });
  }
  if (rule.metric === 'lux' && (rule.recovery_margin < 0 || rule.recovery_margin > 200000)) {
    ctx.addIssue({ code: 'custom', path: ['recovery_margin'], message: 'Margen fuera de rango para lux' });
  }
});

// Las reglas son configuración operativa: fuera del rol de demostración.
router.get('/rules', requireSubscriber, requireRole('operator'), async (req, res) => {
  const deviceId = typeof req.query.device_id === 'string' && req.query.device_id ? req.query.device_id : null;
  if (deviceId && !(await hasStationAccess(req.subscriber, deviceId))) {
    return res.status(404).json({ error: 'station_not_found' });
  }
  const rows = deviceId
    ? await sql`SELECT r.*, d.name AS device_name FROM alert_rules r JOIN devices d ON d.id = r.device_id
        WHERE r.device_id = ${deviceId} ${req.subscriber.role === 'admin' ? sql`` : sql`AND r.metric <> 'connectivity'`}
        ORDER BY r.system DESC, r.metric, r.threshold`
    : await sql`SELECT r.*, d.name AS device_name FROM alert_rules r JOIN devices d ON d.id = r.device_id
        ${req.subscriber.role === 'admin' ? sql`` : sql`JOIN subscriber_devices sd ON sd.device_id = r.device_id AND sd.subscriber_id = ${req.subscriber.id}`}
        ${req.subscriber.role === 'admin' ? sql`` : sql`WHERE r.metric <> 'connectivity'`}
        ORDER BY d.name, r.system DESC, r.metric, r.threshold`;
  res.json({ rules: rows });
});

router.post('/rules', requireSubscriber, requireRole('operator'), csrfGuard, async (req, res) => {
  const parsed = ruleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_rule', details: parsed.error.issues });
  const data = parsed.data;
  if (!(await hasStationAccess(req.subscriber, data.device_id))) {
    return res.status(404).json({ error: 'station_not_found' });
  }
  try {
    const [rule] = await sql`INSERT INTO alert_rules (device_id, metric, comparator, threshold, level, message,
        recipient, channel, category, enabled, min_duration_s, recovery_margin, recovery_threshold,
        recovery_duration_s, cooldown_s, urgent)
      VALUES (${data.device_id}, ${data.metric}, ${data.comparator}, ${data.threshold}, ${data.level},
        ${data.message}, ${data.recipient ?? null}, ${data.channel}, ${data.category}, ${data.enabled},
        ${data.min_duration_s}, ${data.recovery_margin}, ${data.recovery_threshold ?? null},
        ${data.recovery_duration_s}, ${data.cooldown_s}, ${data.urgent})
      RETURNING *`;
    await audit(sql, req, 'alert_rule.create', 'alert_rule', String(rule.id), null, data);
    res.status(201).json({ rule });
  } catch (error) {
    if (error?.code === '23505') return res.status(409).json({ error: 'rule_exists' });
    throw error;
  }
});

router.patch('/rules/:ruleId', requireSubscriber, requireRole('operator'), csrfGuard, async (req, res) => {
  const ruleId = Number.parseInt(req.params.ruleId, 10);
  if (!Number.isInteger(ruleId) || ruleId < 1) return res.status(400).json({ error: 'invalid_rule_id' });
  const [before] = await sql`SELECT * FROM alert_rules WHERE id = ${ruleId}`;
  if (!before) return res.status(404).json({ error: 'rule_not_found' });
  if (!(await hasStationAccess(req.subscriber, before.deviceId))) return res.status(404).json({ error: 'rule_not_found' });
  // Los detectores de sistema los mantiene el servidor: no se editan a mano.
  if (before.system) return res.status(409).json({ error: 'system_rule_readonly' });

  const patchSchema = ruleSchema.partial().omit({ device_id: true }).refine((obj) => Object.keys(obj).length > 0, { message: 'empty' });
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_rule', details: parsed.error.issues });
  const patch = Object.fromEntries(Object.entries(parsed.data).filter(([, value]) => value !== undefined));

  const [rule] = await sql`UPDATE alert_rules SET ${sql(patch)} WHERE id = ${ruleId} RETURNING *`;
  await audit(sql, req, 'alert_rule.update', 'alert_rule', String(ruleId), before, rule);
  res.json({ rule });
});

router.delete('/rules/:ruleId', requireSubscriber, requireRole('operator'), csrfGuard, async (req, res) => {
  const ruleId = Number.parseInt(req.params.ruleId, 10);
  if (!Number.isInteger(ruleId) || ruleId < 1) return res.status(400).json({ error: 'invalid_rule_id' });
  const [before] = await sql`SELECT * FROM alert_rules WHERE id = ${ruleId}`;
  if (!before) return res.status(404).json({ error: 'rule_not_found' });
  if (!(await hasStationAccess(req.subscriber, before.deviceId))) return res.status(404).json({ error: 'rule_not_found' });
  if (before.system) return res.status(409).json({ error: 'system_rule_readonly' });
  await sql`DELETE FROM alert_rules WHERE id = ${ruleId}`;
  await audit(sql, req, 'alert_rule.delete', 'alert_rule', String(ruleId), before, null);
  res.status(204).end();
});

// ---- Ciclo de vida de los avisos ------------------------------------------

async function loadAlert(subscriber, alertId) {
  if (!/^\d{1,18}$/.test(alertId)) return null;
  const rows = await sql`SELECT a.* FROM alerts a
    ${subscriber.role === 'admin' ? sql`` : sql`JOIN subscriber_devices sd ON sd.device_id = a.device_id AND sd.subscriber_id = ${subscriber.id}`}
    WHERE a.id = ${alertId}::bigint ${subscriber.role === 'admin' ? sql`` : NON_COMMUNICATION_ALERT}`;
  return rows[0] ?? null;
}

router.post('/:id/acknowledge', requireSubscriber, requireRole('operator'), csrfGuard, async (req, res) => {
  const alert = await loadAlert(req.subscriber, req.params.id);
  if (!alert) return res.status(404).json({ error: 'alert_not_found' });
  if (alert.acknowledgedAt) return res.json({ acknowledged: true, already: true });
  await sql`UPDATE alerts SET acknowledged_at = now(),
      delivery_status = CASE WHEN delivery_status = 'pending' THEN 'delivered' ELSE delivery_status END,
      delivered_at = coalesce(delivered_at, now())
    WHERE id = ${alert.id}`;
  await audit(sql, req, 'alert.acknowledge', 'alert', String(alert.id), null, { message: alert.message });
  res.json({ acknowledged: true });
});

const closeSchema = z.object({ reason: z.string().max(300).optional() }).strict();

router.post('/:id/close', requireSubscriber, requireRole('operator'), csrfGuard, async (req, res) => {
  const alert = await loadAlert(req.subscriber, req.params.id);
  if (!alert) return res.status(404).json({ error: 'alert_not_found' });
  const parsed = closeSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.issues });
  if (alert.closedAt) return res.json({ closed: true, already: true });
  await sql`UPDATE alerts SET closed_at = now(), closed_by = ${req.subscriber.id}, closure_reason = ${parsed.data.reason ?? null}
    WHERE id = ${alert.id}`;
  await audit(sql, req, 'alert.close', 'alert', String(alert.id), null,
    { message: alert.message, reason: parsed.data.reason ?? null });
  res.json({ closed: true });
});

router.post('/:id/reopen', requireSubscriber, requireRole('operator'), csrfGuard, async (req, res) => {
  const alert = await loadAlert(req.subscriber, req.params.id);
  if (!alert) return res.status(404).json({ error: 'alert_not_found' });
  if (!alert.closedAt) return res.json({ reopened: true, already: true });
  await sql`UPDATE alerts SET closed_at = null, closed_by = null, closure_reason = null WHERE id = ${alert.id}`;
  await audit(sql, req, 'alert.reopen', 'alert', String(alert.id), { closed: true }, null);
  res.json({ reopened: true });
});

// Envío de prueba de una alerta concreta a la dirección que indique administración.
// No usa la cola ni afecta a la entrega real: sirve para comprobar el canal.
const testSchema = z.object({
  channel: z.enum(['whatsapp', 'email']),
  address: z.string().min(3).max(254),
}).strict();

router.post('/:id/test', requireSubscriber, requireRole('admin'), csrfGuard, async (req, res) => {
  const parsed = testSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.issues });
  const alert = await loadAlert(req.subscriber, req.params.id);
  if (!alert) return res.status(404).json({ error: 'alert_not_found' });
  const [device] = await sql`SELECT d.name,
      (SELECT f.name FROM farm_devices fd JOIN farms f ON f.id = fd.farm_id
        WHERE fd.device_id = d.id ORDER BY f.name LIMIT 1) AS farm_name
    FROM devices d WHERE d.id = ${alert.deviceId}`;
  const value = typeof alert.value === 'number' ? alert.value : alert.value?.value;
  const { subject, body } = renderAlertMessage({
    farmName: device?.farmName ?? null, deviceName: device?.name ?? null,
    metric: alert.ruleSnapshot?.metric, value, message: alert.message, level: alert.level,
    observedAt: alert.observedAt, source: alert.source ?? 'station_measurement',
    category: alert.category ?? 'general', ruleSnapshot: alert.ruleSnapshot ?? null,
  });
  const result = parsed.data.channel === 'whatsapp'
    ? await sendWhatsApp(parsed.data.address, body)
    : await sendEmail(parsed.data.address, subject, body);
  await audit(sql, req, 'alert.test', 'alert', String(alert.id),
    null, { channel: parsed.data.channel, ok: result.ok, error: result.error ?? null });
  res.json({ channel: parsed.data.channel, address: parsed.data.address, ...result });
});

export default router;
