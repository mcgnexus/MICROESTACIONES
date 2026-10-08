import { Router } from 'express';
import { z } from 'zod';
import { sql } from './db.js';
import { csrfGuard } from './auth.js';
import { audit } from './audit.js';
import { markMetric, metricFailure } from './analytics.js';
import { csvCell } from './csv.js';
import { revokeCommercialConsent } from './consent.js';
import { COMMERCIAL_STATES, filterProspects, authorizedExport } from './prospect-policy.js';

async function list() {
  const rows = await sql`SELECT 'subscriber' AS kind, s.id::text AS id, s.email AS name, s.email,
      (SELECT address FROM subscriber_contacts c WHERE c.subscriber_id = s.id AND channel = 'whatsapp' LIMIT 1) AS whatsapp,
      p.municipality, p.activity, p.interest, s.email_verified_at IS NOT NULL AS verified,
      s.active AS account_active, s.acquisition AS origin, s.created_at,
      t.status, t.notes, t.next_action, t.next_action_at,
      coalesce(t.installation_interest, p.interest = 'futura_instalacion') AS installation_interest, t.retain_until
    FROM subscribers s LEFT JOIN subscriber_profiles p ON p.subscriber_id = s.id
    LEFT JOIN prospect_tracking t ON t.subscriber_id = s.id
    UNION ALL
    SELECT 'lead', l.id::text, l.name, l.email, l.phone, l.zone, l.activity, l.interest,
      false, NULL::boolean, jsonb_build_object('source', l.source, 'campaign', l.campaign), l.created_at,
      t.status, coalesce(t.notes, l.admin_notes), t.next_action, t.next_action_at,
      coalesce(t.installation_interest, l.interest = 'futura_instalacion'), t.retain_until
    FROM farm_leads l LEFT JOIN prospect_tracking t ON t.lead_id = l.id`;
  const consents = await sql`SELECT DISTINCT ON (subscriber_id, lead_id, channel)
    subscriber_id, lead_id, channel, action FROM consent_records WHERE purpose = 'commercial'
    ORDER BY subscriber_id, lead_id, channel, recorded_at DESC, id DESC`;
  const permissions = new Map();
  for (const c of consents) {
    const key = c.subscriberId ? `subscriber:${c.subscriberId}` : `lead:${c.leadId}`;
    if (!permissions.has(key)) permissions.set(key, {});
    permissions.get(key)[c.channel] = c.action === 'granted';
  }
  return rows.map((r) => ({ ...r, status: r.status || (r.interest && r.interest !== 'general' ? 'interes_declarado' : 'registrado'),
    commercial: permissions.get(`${r.kind}:${r.id}`) || {} }));
}
const router = Router();
const filtersSchema = z.object({ municipality: z.string().max(160).optional(), activity: z.string().max(40).optional(),
  interest: z.string().max(40).optional(), status: z.enum(COMMERCIAL_STATES).optional(),
  verified: z.enum(['yes', 'no']).optional(), permission: z.enum(['yes', 'no']).optional(),
  installation: z.literal('yes').optional(), channel: z.enum(['email', 'whatsapp']).optional() }).strict();
router.get('/', async (req, res) => {
  const parsed = filtersSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_filters' });
  res.json({ prospects: filterProspects(await list(), parsed.data) });
});
router.get('/export', async (req, res) => {
  const parsed = filtersSchema.safeParse(req.query);
  if (!parsed.success || !parsed.data.channel) return res.status(400).json({ error: 'channel_required' });
  const rows = authorizedExport(filterProspects(await list(), parsed.data), parsed.data.channel);
  // Deduplicación por dirección del canal, aunque haya cuenta y solicitud.
  const unique = [...new Map(rows.map((r) => [r[parsed.data.channel].toLowerCase().replace(/\s/g, ''), r])).values()];
  const csv = [['Nombre', 'Contacto', 'Municipio', 'Actividad', 'Interés', 'Estado'],
    ...unique.map((r) => [r.name, r[parsed.data.channel], r.municipality, r.activity, r.interest, r.status])]
    .map((row) => row.map(csvCell).join(',')).join('\r\n');
  await audit(sql, req, 'prospect.export', 'system', null, null, { filters: parsed.data, count: unique.length });
  res.set('Cache-Control', 'no-store').attachment('contactos-autorizados.csv').type('text/csv').send(`\uFEFF${csv}`);
});
const patchSchema = z.object({ status: z.enum(COMMERCIAL_STATES), notes: z.string().max(2000),
  next_action: z.string().max(300), next_action_at: z.string().datetime().nullable(),
  installation_interest: z.boolean(), retain_until: z.string().datetime().nullable() }).partial().strict();
router.param('kind', (req, res, next, kind) => {
  if (!['subscriber', 'lead'].includes(kind)) return res.status(400).json({ error: 'invalid_kind' });
  next();
});
router.param('id', (req, res, next, id) => {
  if (!/^[1-9]\d*$/.test(id)) return res.status(400).json({ error: 'invalid_id' });
  next();
});
router.patch('/:kind/:id', csrfGuard, async (req, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success || !Object.keys(parsed.data).length) return res.status(400).json({ error: 'invalid_body' });
  const column = req.params.kind === 'subscriber' ? 'subscriber_id' : 'lead_id';
  const table = req.params.kind === 'subscriber' ? 'subscribers' : 'farm_leads';
  const [exists] = await sql`SELECT id FROM ${sql(table)} WHERE id = ${req.params.id}`;
  if (!exists) return res.status(404).json({ error: 'contact_not_found' });
  await sql.begin(async (tx) => {
    await tx`INSERT INTO prospect_tracking (${sql(column)}) VALUES (${req.params.id}) ON CONFLICT (${sql(column)}) DO NOTHING`;
    await tx`UPDATE prospect_tracking SET ${tx(parsed.data)} WHERE ${sql(column)} = ${req.params.id}`;
  });
  await audit(sql, req, 'prospect.update', req.params.kind, req.params.id, null, parsed.data);
  if (parsed.data.installation_interest) await markMetric(sql, 'installation_interest',
    req.params.kind === 'subscriber' ? { subscriberId: req.params.id } : { leadId: req.params.id }).catch(metricFailure);
  res.json({ ok: true });
});
router.post('/:kind/:id/unsubscribe', csrfGuard, async (req, res) => {
  await sql.begin(async (tx) => {
    for (const channel of ['email', 'whatsapp']) await revokeCommercialConsent(tx, {
      ...(req.params.kind === 'subscriber' ? { subscriberId: req.params.id } : { leadId: req.params.id }), channel, source: 'admin',
    });
  });
  await audit(sql, req, 'prospect.unsubscribe', req.params.kind, req.params.id, null, null);
  res.json({ ok: true });
});
router.delete('/:kind/:id', csrfGuard, async (req, res) => {
  const subscriber = req.params.kind === 'subscriber';
  if (subscriber) {
    const [row] = await sql`SELECT role FROM subscribers WHERE id = ${req.params.id}`;
    if (row?.role === 'admin') return res.status(409).json({ error: 'admin_account_protected' });
  }
  await sql.begin(async (tx) => {
    const column = subscriber ? 'subscriber_id' : 'lead_id';
    await tx`DELETE FROM notification_outbox WHERE ${sql(column)} = ${req.params.id}`;
    if (subscriber) {
      await tx`UPDATE measurements SET validated_by = NULL WHERE validated_by = ${req.params.id}`;
      await tx`UPDATE measurements SET deleted_by = NULL WHERE deleted_by = ${req.params.id}`;
      await tx`UPDATE alerts SET closed_by = NULL WHERE closed_by = ${req.params.id}`;
      await tx`UPDATE device_config_versions SET changed_by = NULL WHERE changed_by = ${req.params.id}`;
      await tx`DELETE FROM audit_logs WHERE actor_id = ${req.params.id}`;
    }
    await tx`DELETE FROM ${sql(subscriber ? 'subscribers' : 'farm_leads')} WHERE id = ${req.params.id}`;
    // Las auditorías antiguas pueden contener datos personales del contacto.
    await tx`DELETE FROM audit_logs WHERE target_id = ${req.params.id}
      AND target_type IN (${subscriber ? 'subscriber' : 'farm_lead'}, ${req.params.kind})`;
  });
  await audit(sql, req, 'prospect.erase', req.params.kind, req.params.id, null, null);
  res.status(204).end();
});
export default router;
