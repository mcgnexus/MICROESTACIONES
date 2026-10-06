import { Router } from 'express';
import { z } from 'zod';
import { sql } from './db.js';
import { requireSubscriber, requireRole, csrfGuard } from './auth.js';
import { audit } from './audit.js';
import { hashPassword, randomToken } from './security.js';
import { dispatchOutbox, sendWhatsApp, sendEmail } from './notify.js';
import { LEAD_STATUSES } from './leads.js';
import { runRetention } from './retention.js';

const router = Router();

router.use(requireSubscriber, requireRole('admin'));

router.get('/subscribers', async (req, res) => {
  const role = ['admin', 'operator', 'viewer'].includes(req.query.role) ? req.query.role : null;
  const plan = ['free', 'pro', 'enterprise'].includes(req.query.plan) ? req.query.plan : null;
  const conditions = [];
  if (role) conditions.push(sql`role = ${role}`);
  if (plan) conditions.push(sql`plan = ${plan}`);
  const where = conditions.length
    ? sql`WHERE ${conditions.reduce((acc, cond, index) => (index === 0 ? cond : sql`${acc} AND ${cond}`))}`
    : sql``;
  const rows = await sql`SELECT s.id, s.email, s.role, s.plan, s.active, s.communication_consent,
      s.consent_at, s.created_at, s.pilot_requests,
      (SELECT count(*)::integer FROM subscriber_devices sd WHERE sd.subscriber_id = s.id) AS station_count,
      (SELECT count(*)::integer FROM web_sessions w WHERE w.subscriber_id = s.id AND w.expires_at > now()) AS session_count
    FROM subscribers s ${where} ORDER BY s.created_at`;
  res.json({
    subscribers: rows.map((row) => ({
      id: row.id,
      email: row.email,
      role: row.role,
      plan: row.plan,
      active: row.active,
      communicationConsent: row.communicationConsent,
      consentAt: row.consentAt,
      createdAt: row.createdAt,
      stationCount: row.stationCount,
      sessionCount: row.sessionCount,
      pilotRequests: row.pilotRequests ?? [],
    })),
  });
});

const subscriberPatchSchema = z.object({
  role: z.enum(['admin', 'operator', 'viewer']),
  plan: z.enum(['free', 'pro', 'enterprise']),
  active: z.boolean(),
  communication_consent: z.boolean(),
}).partial().refine((obj) => Object.keys(obj).length > 0, { message: 'empty_patch' });

router.patch('/subscribers/:id', csrfGuard, async (req, res) => {
  const subscriberId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(subscriberId) || subscriberId < 1) return res.status(400).json({ error: 'invalid_id' });
  const parsed = subscriberPatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.issues });
  const [before] = await sql`SELECT id, email, role, plan, active, communication_consent
    FROM subscribers WHERE id = ${subscriberId}`;
  if (!before) return res.status(404).json({ error: 'subscriber_not_found' });

  const patch = {};
  if (parsed.data.role !== undefined) patch.role = parsed.data.role;
  if (parsed.data.plan !== undefined) patch.plan = parsed.data.plan;
  if (parsed.data.active !== undefined) patch.active = parsed.data.active;
  if (parsed.data.communication_consent !== undefined) patch.communication_consent = parsed.data.communication_consent;

  // Nunca permitir quedarse sin administradores ni auto-desactivarse.
  if ((patch.role && patch.role !== 'admin') || patch.active === false) {
    const [admins] = await sql`SELECT count(*)::integer AS count FROM subscribers WHERE role = 'admin' AND active`;
    const losesAdmin = before.role === 'admin' && (patch.role !== 'admin' || patch.active === false);
    if (losesAdmin && admins.count <= 1) return res.status(409).json({ error: 'last_admin_required' });
    if (subscriberId === req.subscriber.id && patch.active === false) {
      return res.status(409).json({ error: 'cannot_deactivate_self' });
    }
  }

  const [row] = await sql`UPDATE subscribers SET ${sql(patch)},
      consent_at = CASE WHEN ${patch.communication_consent ?? before.communicationConsent}
        THEN coalesce(consent_at, now()) ELSE consent_at END
    WHERE id = ${subscriberId}
    RETURNING id, email, role, plan, active, communication_consent`;
  await audit(sql, req, 'subscriber.update', 'subscriber', String(subscriberId), before, row);
  res.json({ subscriber: row });
});

router.get('/subscribers/:id/access', async (req, res) => {
  const subscriberId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(subscriberId) || subscriberId < 1) return res.status(400).json({ error: 'invalid_id' });
  const [subscriber] = await sql`SELECT id, email FROM subscribers WHERE id = ${subscriberId}`;
  if (!subscriber) return res.status(404).json({ error: 'subscriber_not_found' });
  const granted = await sql`SELECT d.id, d.name, d.active, d.location_type FROM subscriber_devices sd
    JOIN devices d ON d.id = sd.device_id WHERE sd.subscriber_id = ${subscriberId} ORDER BY d.name`;
  const available = await sql`SELECT d.id, d.name, d.active, d.location_type FROM devices d
    WHERE d.id NOT IN (SELECT device_id FROM subscriber_devices WHERE subscriber_id = ${subscriberId})
    ORDER BY d.name`;
  res.json({ subscriber, granted, available });
});

const accessSchema = z.object({ device_id: z.string().min(1).max(80) }).strict();

router.post('/subscribers/:id/access', csrfGuard, async (req, res) => {
  const subscriberId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(subscriberId) || subscriberId < 1) return res.status(400).json({ error: 'invalid_id' });
  const parsed = accessSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.issues });
  const [subscriber] = await sql`SELECT id FROM subscribers WHERE id = ${subscriberId}`;
  if (!subscriber) return res.status(404).json({ error: 'subscriber_not_found' });
  const [device] = await sql`SELECT id, name FROM devices WHERE id = ${parsed.data.device_id}`;
  if (!device) return res.status(404).json({ error: 'station_not_found' });
  await sql`INSERT INTO subscriber_devices (subscriber_id, device_id)
    VALUES (${subscriberId}, ${device.id}) ON CONFLICT DO NOTHING`;
  await audit(sql, req, 'access.grant', 'subscriber', String(subscriberId), null, device);
  res.status(201).json({ device });
});

router.delete('/subscribers/:id/access/:deviceId', csrfGuard, async (req, res) => {
  const subscriberId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(subscriberId) || subscriberId < 1) return res.status(400).json({ error: 'invalid_id' });
  const [subscriber] = await sql`SELECT id FROM subscribers WHERE id = ${subscriberId}`;
  if (!subscriber) return res.status(404).json({ error: 'subscriber_not_found' });
  const removed = await sql`DELETE FROM subscriber_devices
    WHERE subscriber_id = ${subscriberId} AND device_id = ${req.params.deviceId}
    RETURNING device_id`;
  if (!removed.length) return res.status(404).json({ error: 'grant_not_found' });
  await audit(sql, req, 'access.revoke', 'subscriber', String(subscriberId), { device_id: removed[0].deviceId }, null);
  res.status(204).end();
});

// ---- Solicitudes de piloto en fincas --------------------------------------

router.get('/pilot-requests', async (_req, res) => {
  const rows = await sql`SELECT id, email, pilot_requests FROM subscribers
    WHERE jsonb_array_length(pilot_requests) > 0 ORDER BY created_at`;
  const requests = rows.flatMap((row) => (row.pilotRequests ?? []).map((request) => ({
    ...request,
    subscriber_id: row.id,
    subscriber_email: row.email,
  })));
  requests.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  res.json({ requests });
});

const decisionSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']),
  decision_notes: z.string().max(1000).optional(),
}).strict();

router.patch('/pilot-requests/:subscriberId/:requestId', csrfGuard, async (req, res) => {
  const subscriberId = Number.parseInt(req.params.subscriberId, 10);
  if (!Number.isInteger(subscriberId) || subscriberId < 1) return res.status(400).json({ error: 'invalid_id' });
  const parsed = decisionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.issues });

  const [subscriber] = await sql`SELECT id, email, pilot_requests FROM subscribers WHERE id = ${subscriberId}`;
  if (!subscriber) return res.status(404).json({ error: 'subscriber_not_found' });
  const request = (subscriber.pilotRequests ?? []).find((item) => item.id === req.params.requestId);
  if (!request) return res.status(404).json({ error: 'request_not_found' });

  const updated = {
    ...request,
    status: parsed.data.status,
    decision_notes: parsed.data.decision_notes ?? request.decision_notes ?? '',
    decided_at: new Date().toISOString(),
    decided_by: req.subscriber.email,
  };
  const next = (subscriber.pilotRequests ?? []).map((item) => (item.id === request.id ? updated : item));
  await sql`UPDATE subscribers SET pilot_requests = ${sql.json(next)} WHERE id = ${subscriberId}`;
  await audit(sql, req, 'pilot_request.decide', 'subscriber', String(subscriberId), request, updated);
  res.json({ request: updated });
});

// ---- Captación pública de fincas ------------------------------------------

router.get('/leads', async (req, res) => {
  const status = LEAD_STATUSES.includes(req.query.status) ? req.query.status : null;
  const rows = await sql`SELECT id::text AS id, name, phone, email, activity, zone, crop_or_livestock,
      interest, notes, admin_notes, consent, consent_at, status, source, created_at, updated_at
    FROM farm_leads
    ${status ? sql`WHERE status = ${status}` : sql``}
    ORDER BY created_at DESC LIMIT 500`;
  res.json({ leads: rows });
});

const leadPatchSchema = z.object({
  status: z.enum(LEAD_STATUSES).optional(),
  admin_notes: z.string().max(1000).optional(),
}).strict().refine((obj) => Object.keys(obj).length > 0, { message: 'empty_patch' });

router.patch('/leads/:id', csrfGuard, async (req, res) => {
  const leadId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(leadId) || leadId < 1) return res.status(400).json({ error: 'invalid_id' });
  const parsed = leadPatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.issues });
  const [before] = await sql`SELECT id::text AS id, status, admin_notes FROM farm_leads WHERE id = ${leadId}`;
  if (!before) return res.status(404).json({ error: 'lead_not_found' });
  const patch = {};
  if (parsed.data.status !== undefined) patch.status = parsed.data.status;
  if (parsed.data.admin_notes !== undefined) patch.admin_notes = parsed.data.admin_notes;
  const [row] = await sql`UPDATE farm_leads SET ${sql(patch)}, updated_at = now()
    WHERE id = ${leadId} RETURNING id::text AS id, status, admin_notes, updated_at`;
  await audit(sql, req, 'lead.update', 'farm_lead', before.id, before, row);
  res.json({ lead: row });
});

// Activación guiada: convierte una solicitud en un suscriptor real. La contraseña
// temporal se devuelve una sola vez (como el token de aprovisionamiento) y no se
// vuelve a mostrar; el cliente debe cambiarla o usarla tal cual.
const activateSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  plan: z.enum(['free', 'pro', 'enterprise']).optional(),
}).strict();

router.post('/leads/:id/activate', csrfGuard, async (req, res) => {
  const leadId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(leadId) || leadId < 1) return res.status(400).json({ error: 'invalid_id' });
  const parsed = activateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.issues });
  const [lead] = await sql`SELECT id::text AS id, name, phone, status FROM farm_leads WHERE id = ${leadId}`;
  if (!lead) return res.status(404).json({ error: 'lead_not_found' });
  const [existing] = await sql`SELECT id FROM subscribers WHERE email = ${parsed.data.email}`;
  if (existing) return res.status(409).json({ error: 'email_already_registered' });

  const temporaryPassword = randomToken().slice(0, 16);
  const passwordHash = await hashPassword(temporaryPassword);
  const subscriber = await sql.begin(async (tx) => {
    const [created] = await tx`INSERT INTO subscribers (email, password_hash, plan, communication_consent, consent_at)
      VALUES (${parsed.data.email}, ${passwordHash}, ${parsed.data.plan ?? 'pro'}, true, now())
      RETURNING id, email, role, plan`;
    await tx`UPDATE farm_leads SET status = 'piloto_activo', updated_at = now() WHERE id = ${leadId}`;
    return created;
  });
  await audit(sql, req, 'lead.activate', 'farm_lead', lead.id, { status: lead.status }, { subscriber_id: subscriber.id });
  res.status(201).json({
    subscriber: { id: subscriber.id, email: subscriber.email, role: subscriber.role, plan: subscriber.plan },
    temporaryPassword,
  });
});

// Envío de prueba: comprueba que el canal del suscriptor está bien configurado.
router.post('/subscribers/:id/test-message', csrfGuard, async (req, res) => {
  const subscriberId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(subscriberId) || subscriberId < 1) return res.status(400).json({ error: 'invalid_id' });
  const contacts = await sql`SELECT channel, address FROM subscriber_contacts
    WHERE subscriber_id = ${subscriberId}
    ORDER BY CASE channel WHEN 'whatsapp' THEN 0 ELSE 1 END LIMIT 1`;
  if (!contacts.length) return res.status(404).json({ error: 'contact_not_found' });
  const contact = contacts[0];
  const text = 'Prueba de TecRural: si recibes este mensaje, tus alertas de finca llegarán por este canal.';
  const result = contact.channel === 'whatsapp'
    ? await sendWhatsApp(contact.address, text)
    : await sendEmail(contact.address, 'Prueba de TecRural', text);
  await audit(sql, req, 'contact.test', 'subscriber', String(subscriberId),
    null, { channel: contact.channel, ok: result.ok, error: result.error ?? null });
  res.json({ channel: contact.channel, address: contact.address, ...result });
});

// ---- Cola de entrega de avisos --------------------------------------------

const OUTBOX_STATUSES = ['pending', 'sending', 'sent', 'delivered', 'failed', 'manual'];

router.get('/outbox', async (req, res) => {
  const status = OUTBOX_STATUSES.includes(req.query.status) ? req.query.status : null;
  const rows = await sql`SELECT id::text AS id, kind, alert_id::text AS alert_id, subscriber_id,
      channel, address, subject, body, status, attempts, next_attempt_at, last_error,
      provider_message_id, sent_at, created_at
    FROM notification_outbox
    ${status ? sql`WHERE status = ${status}` : sql``}
    ORDER BY created_at DESC LIMIT 200`;
  res.json({ outbox: rows });
});

router.post('/outbox/dispatch', csrfGuard, async (req, res) => {
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit ?? '50', 10) || 50, 1), 200);
  const result = await dispatchOutbox({ limit });
  await audit(sql, req, 'outbox.dispatch', 'notification_outbox', null, null, result);
  res.json(result);
});

// Marca de forma manual un envío de la bandeja (por ejemplo, un WhatsApp enviado a mano).
const outboxPatchSchema = z.object({ status: z.enum(['sent', 'failed', 'pending', 'manual']) }).strict();

router.patch('/outbox/:id', csrfGuard, async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'invalid_id' });
  const parsed = outboxPatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.issues });
  const [before] = await sql`SELECT id::text AS id, status, alert_id FROM notification_outbox WHERE id = ${id}`;
  if (!before) return res.status(404).json({ error: 'outbox_not_found' });
  const status = parsed.data.status;
  const [row] = await sql`UPDATE notification_outbox SET status = ${status},
      sent_at = CASE WHEN ${status} = 'sent' THEN now() ELSE sent_at END,
      last_error = CASE WHEN ${status} = 'sent' THEN null ELSE last_error END,
      updated_at = now()
    WHERE id = ${id} RETURNING id::text AS id, status, sent_at`;
  if (status === 'sent' && before.alertId) {
    await sql`UPDATE alerts SET delivery_status = 'delivered', delivered_at = now() WHERE id = ${before.alertId}`;
  }
  await audit(sql, req, 'outbox.update', 'notification_outbox', before.id, { status: before.status }, { status });
  res.json({ outbox: row });
});

// ---- Retención de datos ---------------------------------------------------

router.post('/maintenance/retention', csrfGuard, async (req, res) => {
  const result = await runRetention(sql);
  await audit(sql, req, 'retention.run', 'system', null, null, result);
  res.json(result);
});

// ---- Auditoría -------------------------------------------------------------

router.get('/audit', async (req, res) => {
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit ?? '200', 10) || 200, 1), 500);
  const targetType = typeof req.query.target_type === 'string' ? req.query.target_type.slice(0, 40) : null;
  const targetId = typeof req.query.target_id === 'string' ? req.query.target_id.slice(0, 80) : null;
  const conditions = [];
  if (targetType) conditions.push(sql`l.target_type = ${targetType}`);
  if (targetId) conditions.push(sql`l.target_id = ${targetId}`);
  const where = conditions.length
    ? sql`WHERE ${conditions.reduce((acc, cond, index) => (index === 0 ? cond : sql`${acc} AND ${cond}`))}`
    : sql``;
  const rows = await sql`SELECT l.id::text AS id, l.action, l.target_type, l.target_id,
      l.before_json, l.after_json, l.ip_address, l.created_at, s.email AS actor_email
    FROM audit_logs l LEFT JOIN subscribers s ON s.id = l.actor_id
    ${where} ORDER BY l.created_at DESC LIMIT ${limit}`;
  res.json({ entries: rows });
});

export default router;
