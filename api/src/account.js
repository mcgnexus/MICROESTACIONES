import { Router } from 'express';
import { markMetric, metricFailure } from './analytics.js';
import { completedAgriculturalProfile } from './analytics-policy.js';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { sql } from './db.js';
import { requireSubscriber, csrfGuard } from './auth.js';
import { audit } from './audit.js';
import { listStations } from './stations.js';
import { listContacts } from './contacts.js';
import { listFarms } from './farms.js';
import { DEFAULT_PREFERENCES, preferenceSchema, preferenceColumns } from './alert-preferences.js';
import { ACTIVITIES, INTERESTS } from './leads.js';
import {
  CONSENT_CHANNELS, CONSENT_TEXT_VERSION, consentSummary, grantCommercialConsent,
  latestConsent, revokeCommercialConsent,
} from './consent.js';

const router = Router();

router.get('/me', requireSubscriber, async (req, res) => {
  const [me] = await sql`SELECT id, email, role, plan, communication_consent, consent_at,
      email_verified_at, acquisition, pilot_requests
    FROM subscribers WHERE id = ${req.subscriber.id}`;
  const [[profile], [stations, contacts, farms, consents]] = await Promise.all([
    sql`SELECT municipality, activity, crop_or_livestock, interest
      FROM subscriber_profiles WHERE subscriber_id = ${req.subscriber.id}`,
    Promise.all([
      listStations(req.subscriber.id, req.subscriber.role),
      listContacts(req.subscriber.id),
      listFarms(req.subscriber.id),
      consentSummary(sql, { subscriberId: req.subscriber.id }),
    ]),
  ]);
  res.json({
    id: me.id,
    email: me.email,
    role: me.role,
    plan: me.plan,
    emailVerifiedAt: me.emailVerifiedAt ?? null,
    acquisition: me.acquisition ?? {},
    communicationConsent: me.communicationConsent,
    consentAt: me.consentAt,
    pilotRequests: me.pilotRequests ?? [],
    profile: profile ?? null,
    consents,
    consentTextVersion: CONSENT_TEXT_VERSION,
    contacts,
    farms,
    stations: stations.map((station) => ({ id: station.id, name: station.name, active: station.active })),
  });
});

// Perfil opcional: rellenarlo no condiciona el acceso, solo ayuda a afinar avisos.
const profileSchema = z.object({
  municipality: z.string().trim().max(120).nullable().optional(),
  activity: z.enum(ACTIVITIES).nullable().optional(),
  crop_or_livestock: z.string().trim().max(120).nullable().optional(),
  interest: z.enum(INTERESTS).nullable().optional(),
}).strict();

router.put('/account/profile', requireSubscriber, csrfGuard, async (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.issues });
  const fields = parsed.data;
  await sql`INSERT INTO subscriber_profiles (subscriber_id) VALUES (${req.subscriber.id})
    ON CONFLICT (subscriber_id) DO NOTHING`;
  if (Object.keys(fields).length) {
    await sql`UPDATE subscriber_profiles SET ${sql(fields)}, updated_at = now()
      WHERE subscriber_id = ${req.subscriber.id}`;
  }
  const [profile] = await sql`SELECT municipality, activity, crop_or_livestock, interest
    FROM subscriber_profiles WHERE subscriber_id = ${req.subscriber.id}`;
  await audit(sql, req, 'profile.update', 'subscriber', String(req.subscriber.id), null, fields);
  if (completedAgriculturalProfile(profile)) await markMetric(sql, 'agricultural_profile_completed', { subscriberId: req.subscriber.id }).catch(metricFailure);
  if (profile?.interest === 'futura_instalacion') await markMetric(sql, 'installation_interest', { subscriberId: req.subscriber.id }).catch(metricFailure);
  res.json({ profile: profile ?? null });
});

// Consentimiento publicitario gestionado por el propio usuario. La finalidad
// `service` no se toca aquí: retirarla no debe impedir usar el servicio.
const consentActionSchema = z.object({
  purpose: z.literal('commercial'),
  channel: z.enum(CONSENT_CHANNELS),
  action: z.enum(['granted', 'revoked']),
}).strict();

router.get('/account/consents', requireSubscriber, async (req, res) => {
  const consents = await consentSummary(sql, { subscriberId: req.subscriber.id });
  res.json({ consents, textVersion: CONSENT_TEXT_VERSION, channels: CONSENT_CHANNELS });
});

router.post('/account/consents', requireSubscriber, csrfGuard, async (req, res) => {
  const parsed = consentActionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.issues });
  const { channel, action } = parsed.data;
  if (action === 'granted' && channel === 'whatsapp') {
    // No se autoriza publicidad por un canal que aún no existe en la cuenta.
    const [contact] = await sql`SELECT 1 FROM subscriber_contacts
      WHERE subscriber_id = ${req.subscriber.id} AND channel = 'whatsapp'`;
    if (!contact) return res.status(409).json({ error: 'channel_not_available' });
  }
  const ip = req.ip || req.socket.remoteAddress || null;
  const userAgent = String(req.get('user-agent') || '').slice(0, 200) || null;
  const options = { subscriberId: req.subscriber.id, channel, source: 'account', ip, userAgent };
  if (action === 'granted') {
    await grantCommercialConsent(sql, options);
    await markMetric(sql, 'commercial_authorized', { subscriberId: req.subscriber.id }).catch(metricFailure);
    await audit(sql, req, 'consent.grant', 'subscriber', String(req.subscriber.id), null, { purpose: 'commercial', channel });
  } else {
    const cancelled = await sql.begin(async (tx) => revokeCommercialConsent(tx, options));
    await audit(sql, req, 'consent.revoke', 'subscriber', String(req.subscriber.id), null,
      { purpose: 'commercial', channel, cancelled });
  }
  const current = await latestConsent(sql, { subscriberId: req.subscriber.id, purpose: 'commercial', channel });
  res.json({ purpose: 'commercial', channel, current });
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
