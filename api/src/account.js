import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { sql } from './db.js';
import { requireSubscriber, csrfGuard } from './auth.js';
import { audit } from './audit.js';
import { listStations } from './stations.js';

const router = Router();

router.get('/me', requireSubscriber, async (req, res) => {
  const [me] = await sql`SELECT id, email, role, plan, communication_consent, consent_at, pilot_requests
    FROM subscribers WHERE id = ${req.subscriber.id}`;
  const stations = await listStations(req.subscriber.id, req.subscriber.role);
  res.json({
    id: me.id,
    email: me.email,
    role: me.role,
    plan: me.plan,
    communicationConsent: me.communicationConsent,
    consentAt: me.consentAt,
    pilotRequests: me.pilotRequests ?? [],
    stations: stations.map((station) => ({ id: station.id, name: station.name, active: station.active })),
  });
});

const consentSchema = z.object({ communication_consent: z.boolean() }).strict();

router.patch('/me', requireSubscriber, csrfGuard, async (req, res) => {
  const parsed = consentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.issues });
  const granted = parsed.data.communication_consent;
  const [before] = await sql`SELECT communication_consent, consent_at FROM subscribers WHERE id = ${req.subscriber.id}`;
  await sql`UPDATE subscribers SET communication_consent = ${granted},
      consent_at = CASE WHEN ${granted} THEN now() ELSE NULL END
    WHERE id = ${req.subscriber.id}`;
  await audit(sql, req, 'consent.update', 'subscriber', String(req.subscriber.id), before,
    { communication_consent: granted });
  res.json({ communicationConsent: granted, consentAt: granted ? new Date().toISOString() : null });
});

const pilotSchema = z.object({
  farm_name: z.string().min(2).max(120),
  location: z.string().max(200).optional(),
  contact: z.string().max(200).optional(),
  notes: z.string().max(1000).optional(),
}).strict();

// Solicitud de piloto en fincas: queda pendiente de revisión por un administrador.
router.post('/pilot-requests', requireSubscriber, csrfGuard, async (req, res) => {
  const parsed = pilotSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.issues });
  const request = {
    id: randomUUID(),
    farm_name: parsed.data.farm_name,
    location: parsed.data.location ?? '',
    contact: parsed.data.contact ?? '',
    notes: parsed.data.notes ?? '',
    status: 'pending',
    created_at: new Date().toISOString(),
  };
  const [updated] = await sql`UPDATE subscribers
    SET pilot_requests = pilot_requests || ${sql.json([request])}
    WHERE id = ${req.subscriber.id} RETURNING pilot_requests`;
  await audit(sql, req, 'pilot_request.create', 'subscriber', String(req.subscriber.id), null, request);
  res.status(201).json({ request, pilotRequests: updated.pilotRequests });
});

export default router;
