import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { sql } from './db.js';
import { requireSubscriber, csrfGuard } from './auth.js';
import { audit } from './audit.js';
import { listStations } from './stations.js';
import { listContacts } from './contacts.js';
import { listFarms } from './farms.js';
import { DEFAULT_PREFERENCES, preferenceSchema, preferenceColumns } from './alert-preferences.js';

const router = Router();

router.get('/me', requireSubscriber, async (req, res) => {
  const [me] = await sql`SELECT id, email, role, plan, communication_consent, consent_at, pilot_requests
    FROM subscribers WHERE id = ${req.subscriber.id}`;
  const [stations, contacts, farms] = await Promise.all([
    listStations(req.subscriber.id, req.subscriber.role),
    listContacts(req.subscriber.id),
    listFarms(req.subscriber.id),
  ]);
  res.json({
    id: me.id,
    email: me.email,
    role: me.role,
    plan: me.plan,
    communicationConsent: me.communicationConsent,
    consentAt: me.consentAt,
    pilotRequests: me.pilotRequests ?? [],
    contacts,
    farms,
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

// ---- Preferencias de alertas ----------------------------------------------

router.get('/alert-preferences', requireSubscriber, async (req, res) => {
  const [row] = await sql`SELECT receive_frost, receive_heat, receive_storm, receive_wind,
      receive_humidity, receive_general, channel_whatsapp, channel_email,
      quiet_start, quiet_end, zone, crop, custom_thresholds
    FROM alert_preferences WHERE subscriber_id = ${req.subscriber.id}`;
  res.json({ preferences: row ? { ...DEFAULT_PREFERENCES, ...row } : DEFAULT_PREFERENCES });
});

router.put('/alert-preferences', requireSubscriber, csrfGuard, async (req, res) => {
  const parsed = preferenceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.issues });
  const patch = parsed.data;
  // Horario silencioso: o los dos extremos o ninguno.
  const quietStart = patch.quiet_start !== undefined ? patch.quiet_start : undefined;
  const quietEnd = patch.quiet_end !== undefined ? patch.quiet_end : undefined;
  if ((quietStart == null) !== (quietEnd == null) && quietStart !== undefined && quietEnd !== undefined) {
    return res.status(400).json({ error: 'quiet_hours_incomplete' });
  }
  const provided = preferenceColumns(patch);
  // Asegura que exista la fila antes de aplicar el parche.
  await sql`INSERT INTO alert_preferences (subscriber_id) VALUES (${req.subscriber.id})
    ON CONFLICT (subscriber_id) DO NOTHING`;
  if (Object.keys(provided).length) {
    await sql`UPDATE alert_preferences SET ${sql(provided)}, updated_at = now()
      WHERE subscriber_id = ${req.subscriber.id}`;
  }
  if (patch.custom_thresholds !== undefined) {
    await sql`UPDATE alert_preferences SET custom_thresholds = ${sql.json(patch.custom_thresholds)}, updated_at = now()
      WHERE subscriber_id = ${req.subscriber.id}`;
  }
  const [row] = await sql`SELECT receive_frost, receive_heat, receive_storm, receive_wind, receive_humidity,
      receive_general, channel_whatsapp, channel_email, quiet_start, quiet_end, zone, crop, custom_thresholds
    FROM alert_preferences WHERE subscriber_id = ${req.subscriber.id}`;
  await audit(sql, req, 'alert_preferences.update', 'subscriber', String(req.subscriber.id), null, patch);
  res.json({ preferences: { ...DEFAULT_PREFERENCES, ...row } });
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
