// Suscripción explícita de cuentas verificadas a los avisos públicos de una
// estación habilitada por TecRural.
//
// Consultar datos o gráficos no suscribe a nadie: todo pasa por estos
// endpoints, con validación en servidor de que la estación existe, está
// habilitada para avisos públicos (`public_alerts_enabled`) y el contacto del
// canal está verificado y autorizado. El acceso a una estación privada
// (`subscriber_devices`/`farms`) es otra cosa y no se toca aquí.
import { Router } from 'express';
import { z } from 'zod';
import { sql } from './db.js';
import { requireSubscriber, csrfGuard } from './auth.js';
import { audit } from './audit.js';
import { recordConsent } from './consent.js';
import { consumeAttempt } from './login-rate-limit.js';
import { sha256 } from './security.js';
import { messageExpiresAt } from './message-ttl.js';
import { cancelPendingPublicAlerts } from './notify.js';
import { CATEGORY_COLUMNS } from './alert-preferences.js';

const router = Router();
router.use(requireSubscriber);

const ALL_CATEGORIES = Object.keys(CATEGORY_COLUMNS);

const channelSchema = z.enum(['email', 'whatsapp']);
const subscribeSchema = z.object({
  device_id: z.string().min(1).max(80),
  channel: channelSchema,
  categories: z.array(z.enum(ALL_CATEGORIES)).max(ALL_CATEGORIES.length).optional(),
}).strict();

const targetSchema = z.object({
  device_id: z.string().min(1).max(80),
  channel: channelSchema,
}).strict();

const interestSchema = z.object({
  device_id: z.string().min(1).max(80).nullable().optional(),
}).strict();

// La estación debe existir, estar activa y habilitada HOY para avisos públicos.
async function loadEnabledStation(client, deviceId) {
  const [station] = await client`SELECT id, name, public_zone,
      (SELECT max(observed_at) FROM measurements m
        WHERE m.device_id = d.id AND m.is_validated AND m.deleted_at IS NULL) AS last_data
    FROM devices d WHERE d.id = ${deviceId}`;
  if (!station) return { error: 'station_not_found', status: 404 };
  const [state] = await client`SELECT active, public_alerts_enabled FROM devices WHERE id = ${deviceId}`;
  if (!state.active || !state.publicAlertsEnabled) return { error: 'station_not_enabled', status: 409 };
  return { station };
}

// Solo cuentas con el correo de acceso confirmado pueden suscribirse, y el
// contacto del canal debe estar verificado y autorizado (como cualquier aviso).
async function requireVerifiedSubscriber(client, subscriberId, channel) {
  const [state] = await client`
    SELECT (s.email_verified_at IS NOT NULL) AS account_verified,
           (sc.opted_in_at IS NOT NULL AND sc.opted_out_at IS NULL AND sc.verified_at IS NOT NULL) AS contact_ok
    FROM subscribers s
    LEFT JOIN subscriber_contacts sc ON sc.subscriber_id = s.id AND sc.channel = ${channel}
    WHERE s.id = ${subscriberId}`;
  if (!state?.accountVerified) return { error: 'account_not_verified', status: 409 };
  if (!state?.contactOk) return { error: 'contact_not_verified', status: 409 };
  return { ok: true };
}

// Estaciones habilitadas (datos públicos) y estado de las suscripciones propias.
router.get('/options', async (req, res) => {
  const stations = await sql`SELECT d.id, d.name, d.public_zone,
      (SELECT max(observed_at) FROM measurements m
        WHERE m.device_id = d.id AND m.is_validated AND m.deleted_at IS NULL) AS last_data
    FROM devices d
    WHERE d.active = true AND d.public_alerts_enabled = true
    ORDER BY d.name`;
  const [subscriptions, [interest]] = await Promise.all([
    sql`SELECT device_id, channel, categories, subscribed_at, unsubscribed_at
      FROM public_alert_subscriptions WHERE subscriber_id = ${req.subscriber.id}
      ORDER BY device_id, channel`,
    sql`SELECT device_id, created_at FROM public_alert_interest WHERE subscriber_id = ${req.subscriber.id}`,
  ]);
  res.json({
    stations: stations.map((station) => ({
      id: station.id,
      name: station.name,
      zone: station.publicZone ?? null,
      lastDataAt: station.lastData ?? null,
      categories: ALL_CATEGORIES,
    })),
    subscriptions: subscriptions.map((row) => ({
      deviceId: row.deviceId, channel: row.channel, categories: row.categories ?? [],
      subscribedAt: row.subscribedAt, unsubscribedAt: row.unsubscribedAt ?? null,
      active: row.unsubscribedAt == null,
    })),
    interest: interest ? { joined: true, deviceId: interest.deviceId ?? null, createdAt: interest.createdAt } : { joined: false },
  });
});

router.post('/subscribe', csrfGuard, async (req, res) => {
  const parsed = subscribeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.issues });
  const { device_id: deviceId, channel } = parsed.data;
  const categories = parsed.data.categories?.length ? [...new Set(parsed.data.categories)] : ALL_CATEGORIES;

  const found = await loadEnabledStation(sql, deviceId);
  if (found.error) return res.status(found.status).json({ error: found.error });
  const verified = await requireVerifiedSubscriber(sql, req.subscriber.id, channel);
  if (verified.error) return res.status(verified.status).json({ error: verified.error });

  const [subscription] = await sql.begin(async (tx) => {
    const [row] = await tx`INSERT INTO public_alert_subscriptions
        (subscriber_id, device_id, channel, categories, subscribed_at, unsubscribed_at)
      VALUES (${req.subscriber.id}, ${deviceId}, ${channel}, ${categories}, now(), NULL)
      ON CONFLICT (subscriber_id, device_id, channel) DO UPDATE SET
        categories = ${categories}, subscribed_at = now(), unsubscribed_at = NULL
      RETURNING device_id, channel, categories, subscribed_at`;
    await recordConsent(tx, {
      subscriberId: req.subscriber.id, purpose: 'service', channel,
      action: 'granted', source: 'public_alerts',
      ip: req.ip || req.socket.remoteAddress || null,
      userAgent: String(req.get('user-agent') || '').slice(0, 200) || null,
    });
    return row;
  });
  await audit(sql, req, 'public_alerts.subscribe', 'device', deviceId, null,
    { channel, categories });
  res.status(201).json({
    subscription: {
      deviceId: subscription.deviceId, channel: subscription.channel,
      categories: subscription.categories ?? [], subscribedAt: subscription.subscribedAt, active: true,
    },
  });
});

router.post('/unsubscribe', csrfGuard, async (req, res) => {
  const parsed = targetSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.issues });
  const { device_id: deviceId, channel } = parsed.data;
  const [removed] = await sql`UPDATE public_alert_subscriptions
    SET unsubscribed_at = now()
    WHERE subscriber_id = ${req.subscriber.id} AND device_id = ${deviceId}
      AND channel = ${channel} AND unsubscribed_at IS NULL
    RETURNING device_id`;
  if (!removed) return res.status(404).json({ error: 'subscription_not_found' });
  await sql.begin(async (tx) => {
    await recordConsent(tx, {
      subscriberId: req.subscriber.id, purpose: 'service', channel,
      action: 'revoked', source: 'public_alerts',
      ip: req.ip || req.socket.remoteAddress || null,
      userAgent: String(req.get('user-agent') || '').slice(0, 200) || null,
    });
    // Los avisos públicos ya en cola de esa estación ya no están autorizados.
    await cancelPendingPublicAlerts(tx, { subscriberId: req.subscriber.id, deviceId });
  });
  await audit(sql, req, 'public_alerts.unsubscribe', 'device', deviceId, null, { channel });
  res.json({ deviceId, channel, active: false });
});

// Envío de PRUEBA de la suscripción: etiquetado, de vida corta y nunca un
// episodio real (no toca `alerts` ni las métricas de avisos).
router.post('/test', csrfGuard, async (req, res) => {
  const parsed = targetSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.issues });
  const { device_id: deviceId, channel } = parsed.data;

  const [subscription] = await sql`SELECT device_id, categories FROM public_alert_subscriptions
    WHERE subscriber_id = ${req.subscriber.id} AND device_id = ${deviceId}
      AND channel = ${channel} AND unsubscribed_at IS NULL`;
  if (!subscription) return res.status(404).json({ error: 'subscription_not_found' });

  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  // Topes de pruebas: 3 por contacto, 10 por cuenta y 10 por IP (ventana de 15 min).
  const limits = [
    { key: sha256(`public-alert-test:contact:${req.subscriber.id}:${channel}`), max: 3 },
    { key: sha256(`public-alert-test:account:${req.subscriber.id}`), max: 10 },
    { key: sha256(`public-alert-test-ip:${String(ip).slice(0, 200)}`), max: 10 },
  ];
  const results = await Promise.all(limits.map(({ key, max }) => consumeAttempt(sql, key, max)));
  if (results.some((result) => result.limited)) {
    return res.status(429).json({ error: 'too_many_requests' });
  }

  const [contact] = await sql`SELECT address FROM subscriber_contacts
    WHERE subscriber_id = ${req.subscriber.id} AND channel = ${channel}`;
  if (!contact) return res.status(409).json({ error: 'contact_not_verified' });

  await sql`INSERT INTO notification_outbox
    (kind, subscriber_id, channel, address, subject, body, expires_at)
    VALUES ('subscription_test', ${req.subscriber.id}, ${channel}, ${contact.address},
      'PRUEBA — Aviso de TecRural',
      'PRUEBA — Comprobación de tu suscripción a los avisos de esta estación. No es un episodio real.',
      ${messageExpiresAt('subscription_test')})`;
  await audit(sql, req, 'public_alerts.test', 'device', deviceId, null, { channel });
  res.status(202).json({ status: 'queued', test: true, channel });
});

// Lista de interés del servicio de avisos públicos (se ofrece cuando aún no hay
// estaciones habilitadas o la estación querida no las tiene).
router.post('/interest', csrfGuard, async (req, res) => {
  const parsed = interestSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.issues });
  const deviceId = parsed.data.device_id ?? null;
  if (deviceId) {
    const [station] = await sql`SELECT id FROM devices WHERE id = ${deviceId}`;
    if (!station) return res.status(404).json({ error: 'station_not_found' });
  }
  await sql`INSERT INTO public_alert_interest (subscriber_id, device_id)
    VALUES (${req.subscriber.id}, ${deviceId})
    ON CONFLICT (subscriber_id) DO UPDATE SET
      device_id = COALESCE(EXCLUDED.device_id, public_alert_interest.device_id)`;
  await audit(sql, req, 'public_alerts.interest', 'subscriber', String(req.subscriber.id), null, { deviceId });
  res.status(201).json({ interest: { joined: true, deviceId } });
});

export default router;
