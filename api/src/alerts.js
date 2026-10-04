import { Router } from 'express';
import { z } from 'zod';
import { sql } from './db.js';
import { requireSubscriber, requireRole, csrfGuard } from './auth.js';
import { audit } from './audit.js';

const router = Router();

const idSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:_-]{0,79}$/, 'identificador inválido');

async function hasStationAccess(subscriber, deviceId) {
  if (subscriber.role === 'admin') return true;
  const [row] = await sql`SELECT 1 AS ok FROM subscriber_devices
    WHERE subscriber_id = ${subscriber.id} AND device_id = ${deviceId}`;
  return !!row;
}

const ALERT_SELECT = sql`SELECT a.id::text AS id, a.device_id, d.name AS device_name, a.level, a.message,
  a.value, a.source, a.observed_at, a.created_at, a.acknowledged_at,
  a.rule_id::text AS rule_id, a.rule_snapshot, a.recipient, a.channel, a.delivery_status,
  a.delivered_at, a.closed_at, a.closure_reason, s.email AS closed_by_email
  FROM alerts a
  JOIN devices d ON d.id = a.device_id
  LEFT JOIN subscribers s ON s.id = a.closed_by`;

router.get('/', requireSubscriber, async (req, res) => {
  const status = ['open', 'closed', 'all'].includes(req.query.status) ? req.query.status : 'open';
  const channel = ['email', 'sms', 'webhook', 'push', 'in_app'].includes(req.query.channel) ? req.query.channel : null;
  const deviceId = typeof req.query.device_id === 'string' && req.query.device_id ? req.query.device_id : null;
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit ?? '100', 10) || 100, 1), 500);
  if (deviceId && !(await hasStationAccess(req.subscriber, deviceId))) {
    return res.status(404).json({ error: 'station_not_found' });
  }

  const conditions = [sql`a.device_id IN (SELECT sd.device_id FROM subscriber_devices sd WHERE sd.subscriber_id = ${req.subscriber.id})`];
  if (req.subscriber.role === 'admin') conditions.length = 0;
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
        FROM alerts a WHERE a.device_id IN
          (SELECT sd.device_id FROM subscriber_devices sd WHERE sd.subscriber_id = ${req.subscriber.id})`;
  const [counts] = await sql`${scopedAlerts}`;
  res.json({ alerts: rows, counts });
});

// ---- Reglas de aviso -------------------------------------------------------

const ruleSchema = z.object({
  device_id: idSchema,
  metric: z.enum(['temperature', 'humidity', 'pressure', 'battery', 'lux']),
  comparator: z.enum(['gt', 'gte', 'lt', 'lte']),
  threshold: z.number().finite(),
  level: z.union([z.literal(1), z.literal(2)]),
  message: z.string().min(1).max(200),
  recipient: z.string().max(200).nullable().optional(),
  channel: z.enum(['email', 'sms', 'webhook', 'push', 'in_app']).default('in_app'),
  enabled: z.boolean().default(true),
}).strict();

router.get('/rules', requireSubscriber, async (req, res) => {
  const deviceId = typeof req.query.device_id === 'string' && req.query.device_id ? req.query.device_id : null;
  if (deviceId && !(await hasStationAccess(req.subscriber, deviceId))) {
    return res.status(404).json({ error: 'station_not_found' });
  }
  const rows = deviceId
    ? await sql`SELECT r.*, d.name AS device_name FROM alert_rules r JOIN devices d ON d.id = r.device_id
        WHERE r.device_id = ${deviceId} ORDER BY r.metric, r.threshold`
    : await sql`SELECT r.*, d.name AS device_name FROM alert_rules r JOIN devices d ON d.id = r.device_id
        ${req.subscriber.role === 'admin' ? sql`` : sql`JOIN subscriber_devices sd ON sd.device_id = r.device_id AND sd.subscriber_id = ${req.subscriber.id}`}
        ORDER BY d.name, r.metric, r.threshold`;
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
    const [rule] = await sql`INSERT INTO alert_rules (device_id, metric, comparator, threshold, level, message, recipient, channel, enabled)
      VALUES (${data.device_id}, ${data.metric}, ${data.comparator}, ${data.threshold}, ${data.level},
        ${data.message}, ${data.recipient ?? null}, ${data.channel}, ${data.enabled})
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
  await sql`DELETE FROM alert_rules WHERE id = ${ruleId}`;
  await audit(sql, req, 'alert_rule.delete', 'alert_rule', String(ruleId), before, null);
  res.status(204).end();
});

// ---- Ciclo de vida de los avisos ------------------------------------------

async function loadAlert(subscriber, alertId) {
  if (!/^\d{1,18}$/.test(alertId)) return null;
  const rows = await sql`SELECT a.* FROM alerts a
    ${subscriber.role === 'admin' ? sql`` : sql`JOIN subscriber_devices sd ON sd.device_id = a.device_id AND sd.subscriber_id = ${subscriber.id}`}
    WHERE a.id = ${alertId}::bigint`;
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

export default router;
