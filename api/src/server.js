import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { sql } from './db.js';
import { randomToken, sha256, verifyPassword } from './security.js';
import { clearLoginAttempts, consumeLoginAttempt, loginRateLimitKeys } from './login-rate-limit.js';
import { measurementSchema, hasAnyValue } from './contracts.js';
import { requireDevice, requireSubscriber, requireRole, csrfGuard, cookies, accessibleDeviceIds, alertableDeviceIds } from './auth.js';
import { alertEngineVerified } from './env.js';
import { evaluateMeasurement, VFLAG } from './validation.js';
import { evaluateMeasurementRules, releaseDirectives, pendingDirectiveIds, alertAge } from './alert-engine.js';
import { audit } from './audit.js';
import { csvCell } from './csv.js';
import stationsRouter, { statusPayload } from './stations.js';
import configsRouter from './configs.js';
import alertsRouter from './alerts.js';
import { NON_COMMUNICATION_ALERT } from './alert-visibility.js';
import { weatherForDevice } from './weather.js';
import { dewPointCelsius } from './statistics.js';
import adminRouter from './admin.js';
import accountRouter from './account.js';
import contactsRouter from './contacts.js';
import farmsRouter from './farms.js';
import publicRouter from './public.js';
import analyticsRouter, { countMetric, markMetric, metricFailure } from './analytics.js';
import { PUBLIC_PAGES, publicMetadata, siteOrigin, sitemapXml } from './seo.js';
import { completedAgriculturalProfile } from './analytics-policy.js';
import {
  leadSchema, isHoneypot, leadRateLimitKeys, leadColumns,
  commercialConsentChannels, serviceConsentChannels,
} from './leads.js';
import { enqueueLeadMessages, handleInboundWhatsApp } from './notify.js';
import {
  runScheduledPasses, schedulerConfig, schedulerRequestTick, startScheduler,
} from './scheduler.js';
import {
  verifyMetaSignature, verifySvixSignature, verifyTwilioSignature,
  parseDeliveryEvents, applyProviderStatus,
} from './webhooks.js';
import { effectiveConfig } from './device-config.js';
import { classifyMeasurementTime } from './measurement-policy.js';
import { normalizeAcquisition, recordConsent } from './consent.js';
import mcpRouter from './mcp.js';
import {
  MAGIC_REQUEST_MAX_ATTEMPTS, consumeMagicLink, deliverMagicLink, issueMagicLink,
  magicLinkHash, normalizeEmail, resolvePasswordlessAccount, safeReturnPath,
} from './magic-link.js';
import { emailDeliveryReady, emailFailureScope, emailProvider } from './email.js';

const app = express();
const port = Number(process.env.PORT || 8080);
const sessionDays = Math.max(1, Math.min(30, Number(process.env.SESSION_TTL_DAYS || 7)));
const cookieSecure = process.env.COOKIE_SECURE !== 'false';
app.disable('x-powered-by');
if (process.env.TRUST_PROXY === 'true' || process.env.VERCEL) app.set('trust proxy', 1);

// El cuerpo crudo se conserva para verificar las firmas de los webhooks: una
// firma se calcula sobre los bytes recibidos, no sobre el objeto ya parseado.
const captureRawBody = (req, _res, buf) => { req.rawBody = buf; };
app.use(express.json({ limit: '64kb', strict: true, verify: captureRawBody }));
app.use(express.urlencoded({ extended: false, limit: '32kb', verify: captureRawBody }));
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'same-origin');
  res.set('X-Frame-Options', 'DENY');
  res.set('Content-Security-Policy', "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'");
  if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
  next();
});

// Ejecución programada. Va ANTES de todas las rutas: si se monta después, la
// ruta que responde se come la petición y el middleware nunca se ejecuta (era el
// defecto que ataba los detectores y la cola a las visitas al panel). Es un
// respaldo; el mecanismo normal es el temporizador o el cron.
app.use(schedulerRequestTick());
app.use('/api/v1/metrics', analyticsRouter);

app.get('/health', async (_req, res) => {
  await sql`SELECT 1`;
  res.json({ status: 'ok' });
});

// Datos públicos de contacto para la landing y el panel (no expone secretos).
// `whatsappDelivery` no es un secreto: dice cómo se entrega hoy para no anunciar
// como automático algo que aún envía una persona.
app.get('/api/v1/public-config', (_req, res) => {
  res.json({
    supportPhone: process.env.SUPPORT_PHONE || null,
    supportWhatsapp: process.env.SUPPORT_WHATSAPP || null,
    whatsappDelivery: (process.env.WHATSAPP_PROVIDER || 'disabled').toLowerCase(),
    emailDelivery: (process.env.EMAIL_PROVIDER || 'disabled').toLowerCase(),
    // No secreto: permite a la interfaz cerrar la vía de acceso por correo
    // y ofrecer atención manual cuando no hay canal de entrega utilizable.
    emailAvailable: emailDeliveryReady(),
  });
});

// Crea la sesión y fija la cookie HttpOnly. El token nunca viaja en el cuerpo de
// la respuesta ni se guarda en el cliente. Se aplica la cookie después de que la
// transacción que crea la sesión haya confirmado.
async function createSession(client, subscriberId) {
  const token = randomToken();
  await client`INSERT INTO web_sessions (token_hash, subscriber_id, expires_at)
    VALUES (${sha256(token)}, ${subscriberId}, now() + (${sessionDays} * interval '1 day'))`;
  return token;
}

function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', `tr_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${sessionDays * 86400}${cookieSecure ? '; Secure' : ''}`);
}

app.post('/api/auth/login', async (req, res) => {
  const parsed = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(256) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_credentials' });
  const email = parsed.data.email.toLowerCase();
  const rateLimitKeys = loginRateLimitKeys(req.ip || req.socket.remoteAddress, email);
  if (await consumeLoginAttempt(sql, rateLimitKeys)) return res.status(429).json({ error: 'too_many_attempts' });
  const [subscriber] = await sql`SELECT id, email, password_hash, role FROM subscribers WHERE email = ${email} AND active = true`;
  // Un alta sin contraseña no tiene hash: queda fuera del login con contraseña.
  const valid = subscriber && subscriber.passwordHash && await verifyPassword(parsed.data.password, subscriber.passwordHash);
  if (!valid) return res.status(401).json({ error: 'invalid_credentials' });
  await clearLoginAttempts(sql, rateLimitKeys);
  setSessionCookie(res, await createSession(sql, subscriber.id));
  res.json({ email: subscriber.email, role: subscriber.role });
});

// Acceso sin contraseña: se pide un enlace de un solo uso. La respuesta es
// siempre la misma para no revelar si el contacto existe ni si el envío tuvo éxito.
app.post('/api/auth/magic/request', csrfGuard, async (req, res) => {
  const parsed = z.object({
    email: z.string().email().max(254),
    next: z.string().max(200).optional(),
    // Publicidad y captación son opcionales y no condicionan el acceso.
    commercial_consent: z.boolean().optional(),
    acquisition: z.record(z.string(), z.unknown()).optional(),
  }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.issues });
  const email = normalizeEmail(parsed.data.email);
  const returnPath = safeReturnPath(parsed.data.next);
  const acquisition = normalizeAcquisition(parsed.data.acquisition);
  const ip = req.ip || req.socket.remoteAddress;
  const keys = [
    sha256(`magic:ip:${String(ip || 'unknown').slice(0, 200)}`),
    sha256(`magic:email:${email}`),
  ];
  if (await consumeLoginAttempt(sql, keys, MAGIC_REQUEST_MAX_ATTEMPTS)) {
    return res.status(202).json({ status: 'sent' });
  }
  // Disponibilidad global del canal: sin correo utilizable no se crean enlaces
  // muertos ni se promete un envío. Es una condición del servicio, no de la
  // cuenta, así que comunicarla no revela quién tiene acceso.
  if (!emailDeliveryReady()) {
    console.error('acceso por enlace: entrega de correo no disponible (EMAIL_PROVIDER=%s)', emailProvider());
    return res.status(503).json({ error: 'email_delivery_unavailable' });
  }
  try {
    // Las cuentas privilegiadas no acceden por enlace: se evita enviar un enlace
    // que no podrán usar. La respuesta sigue siendo indistinguible.
    const [privileged] = await sql`SELECT 1 FROM subscribers
      WHERE email_normalized = ${email} AND role <> 'viewer'`;
    if (privileged) return res.status(202).json({ status: 'sent' });
    const issued = await issueMagicLink(sql, {
      email, returnPath, ip,
      commercialConsent: Boolean(parsed.data.commercial_consent),
      acquisition,
    });
    if (issued.status === 'created') {
      await countMetric(sql, 'access_requested', acquisition).catch(metricFailure);
      // El resultado del envío ya no se ignora: un fallo global del canal se
      // comunica como indisponibilidad; un rechazo de la dirección concreta
      // sigue respondiendo genérico para no revelar nada.
      const delivery = await deliverMagicLink(email, siteUrl, issued.token, returnPath);
      const scope = emailFailureScope(delivery);
      if (scope === 'global') {
        console.error('acceso por enlace: canal de envío no disponible:', delivery.error || 'desconocido');
        if (!delivery.ambiguous) {
          // Claramente no enviado: se elimina el enlace muerto para no dejar
          // tokens inservibles ni bloquear un reintento por el cooldown.
          await sql`DELETE FROM magic_links WHERE token_hash = ${magicLinkHash(issued.token)}`;
        }
        return res.status(503).json({ error: 'email_delivery_unavailable' });
      }
      if (scope === 'recipient') {
        console.warn('acceso por enlace: envío rechazado para la dirección:', delivery.error);
      }
    }
  } catch (error) {
    console.error('acceso por enlace:', error.message);
    return res.status(503).json({ error: 'email_delivery_unavailable' });
  }
  res.status(202).json({ status: 'sent' });
});

// Verificación: consume el enlace de forma atómica y abre una sesión `viewer`.
// Nunca eleva privilegios: una cuenta admin/operator debe usar su contraseña.
app.post('/api/auth/magic/verify', csrfGuard, async (req, res) => {
  const parsed = z.object({ token: z.string().min(16).max(200) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_token' });
  const ip = req.ip || req.socket.remoteAddress || null;
  const userAgent = String(req.get('user-agent') || '').slice(0, 200) || null;
  let outcome = null;
  await sql.begin(async (tx) => {
    const link = await consumeMagicLink(tx, { token: parsed.data.token });
    if (!link) return;
    const account = await resolvePasswordlessAccount(tx, link.email);
    outcome = { link, account, sessionToken: null };
    if (account.status !== 'privileged') {
      outcome.sessionToken = await createSession(tx, account.subscriber.id);
      // Pulsar el enlace demuestra que el correo es del interesado: es la
      // verificación de la cuenta, independiente de la publicidad.
      await tx`UPDATE subscribers SET email_verified_at = coalesce(email_verified_at, now())
        WHERE id = ${account.subscriber.id}`;
      if (account.status === 'created' && Object.keys(link.acquisition).length) {
        await tx`UPDATE subscribers SET acquisition = ${tx.json(link.acquisition)}
          WHERE id = ${account.subscriber.id}`;
      }
      // La casilla de novedades se aplicó al pedir el enlace; aquí se registra
      // como consentimiento vigente con la versión actual del texto.
      if (link.commercialConsent) {
        await recordConsent(tx, {
          subscriberId: account.subscriber.id, purpose: 'commercial', channel: 'email',
          action: 'granted', source: 'magic_link', ip, userAgent,
        });
      }
      await audit(tx, req, 'access.magic_link', 'subscriber', String(account.subscriber.id),
        null, { created: account.status === 'created', return_path: link.returnPath });
    }
  });
  if (!outcome) return res.status(400).json({ error: 'link_invalid_or_expired' });
  if (outcome.account.status === 'privileged') {
    return res.status(403).json({ error: 'password_login_required' });
  }
  await markMetric(sql, 'contact_verified', { subscriberId: outcome.account.subscriber.id }).catch(metricFailure);
  if (outcome.link.commercialConsent) await markMetric(sql, 'commercial_authorized', { subscriberId: outcome.account.subscriber.id }).catch(metricFailure);
  setSessionCookie(res, outcome.sessionToken);
  const subscriber = outcome.account.subscriber;
  res.json({ email: subscriber.email, role: subscriber.role, plan: subscriber.plan, next: outcome.link.returnPath });
});

app.post('/api/auth/logout', async (req, res) => {
  const token = cookies(req.headers.cookie).tr_session;
  if (token) await sql`DELETE FROM web_sessions WHERE token_hash = ${sha256(token)}`;
  res.setHeader('Set-Cookie', 'tr_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0' + (cookieSecure ? '; Secure' : ''));
  res.status(204).end();
});

// Captación pública de fincas: el CTA principal de la web llega aquí sin sesión.
// Se limita por IP y teléfono, y el campo trampa descarta envíos automáticos sin
// delatar el filtro. El consentimiento es obligatorio en el contrato.
app.post('/api/v1/leads', async (req, res) => {
  const parsed = leadSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.issues });
  if (isHoneypot(parsed.data)) return res.status(201).json({ received: true });
  const keys = leadRateLimitKeys(req.ip || req.socket.remoteAddress, parsed.data.phone);
  if (await consumeLoginAttempt(sql, keys, 5)) return res.status(429).json({ error: 'too_many_requests' });
  const lead = leadColumns(parsed.data);
  const ip = req.ip || req.socket.remoteAddress || null;
  const userAgent = String(req.get('user-agent') || '').slice(0, 200) || null;
  // El alta y sus consentimientos se guardan juntos: la solicitud (servicio) es
  // obligatoria; las novedades y ofertas solo si la casilla venía marcada.
  const inserted = await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${`lead:${lead.phone}`}))`;
    const [duplicate] = await tx`SELECT id FROM farm_leads WHERE phone = ${lead.phone}
      AND created_at > now() - interval '24 hours' AND name = ${lead.name}
      AND email IS NOT DISTINCT FROM ${lead.email} AND interest IS NOT DISTINCT FROM ${lead.interest}`;
    if (duplicate) return false;
    const [created] = await tx`INSERT INTO farm_leads (name, phone, email, activity, zone, crop_or_livestock, interest,
        notes, consent, consent_at, source, campaign)
      VALUES (${lead.name}, ${lead.phone}, ${lead.email}, ${lead.activity}, ${lead.zone},
        ${lead.crop_or_livestock}, ${lead.interest}, ${lead.notes}, true, now(), ${lead.source},
        ${tx.json(lead.campaign)}) RETURNING id`;
    for (const channel of serviceConsentChannels(parsed.data)) {
      await recordConsent(tx, { leadId: created.id, purpose: 'service', channel, action: 'granted', source: 'lead', ip, userAgent });
    }
    for (const channel of commercialConsentChannels(parsed.data)) {
      await recordConsent(tx, { leadId: created.id, purpose: 'commercial', channel, action: 'granted', source: 'lead', ip, userAgent });
    }
    return created.id;
  });
  // La confirmación y el aviso interno se encolan sin bloquear la respuesta: el
  // lead ya está guardado aunque el proveedor de email todavía no esté listo.
  if (inserted) enqueueLeadMessages(sql, parsed.data).catch((error) => console.error('aviso de lead:', error.message));
  if (inserted) {
    const subject = { leadId: inserted, acquisition: lead.campaign };
    await markMetric(sql, 'access_requested', subject).catch(metricFailure);
    if (parsed.data.commercial_consent) await markMetric(sql, 'commercial_authorized', subject).catch(metricFailure);
    if (lead.interest === 'futura_instalacion') await markMetric(sql, 'installation_interest', subject).catch(metricFailure);
    if (completedAgriculturalProfile({ municipality: lead.zone, activity: lead.activity, cropOrLivestock: lead.crop_or_livestock, interest: lead.interest })) {
      await markMetric(sql, 'agricultural_profile_completed', subject).catch(metricFailure);
    }
  }
  res.status(201).json({ received: true });
});

// ---------------------------------------------------------------------------
// Webhook de WhatsApp: estados de entrega del proveedor y altas/bajas.
// Autenticado por FIRMA del proveedor: con `WHATSAPP_APP_SECRET` se exige
// `X-Hub-Signature-256` sobre el cuerpo crudo; con Twilio, `X-Twilio-Signature`.
// Sin ninguna de las dos configuradas no se acepta nada.
// ---------------------------------------------------------------------------
const WHATSAPP_WEBHOOK_TOKEN = process.env.WHATSAPP_WEBHOOK_TOKEN || null;
const WHATSAPP_APP_SECRET = process.env.WHATSAPP_APP_SECRET || null;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || null;

app.get('/api/v1/whatsapp/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && WHATSAPP_WEBHOOK_TOKEN && token === WHATSAPP_WEBHOOK_TOKEN) {
    return res.type('text/plain').send(String(challenge ?? ''));
  }
  return res.status(403).end();
});

app.post('/api/v1/whatsapp/webhook', async (req, res) => {
  const body = req.body || {};

  // 1) Autenticación por firma del proveedor (preferente) o token compartido.
  if (WHATSAPP_APP_SECRET) {
    if (!verifyMetaSignature(req.rawBody, req.get('x-hub-signature-256'), WHATSAPP_APP_SECRET)) {
      return res.status(401).json({ error: 'bad_signature' });
    }
  } else if (body.From && TWILIO_AUTH_TOKEN) {
    const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    if (!verifyTwilioSignature(url, body, req.get('x-twilio-signature'), TWILIO_AUTH_TOKEN)) {
      return res.status(401).json({ error: 'bad_signature' });
    }
  } else if (!WHATSAPP_WEBHOOK_TOKEN || (req.get('x-webhook-token') || req.query.token) !== WHATSAPP_WEBHOOK_TOKEN) {
    return res.status(403).json({ error: 'forbidden' });
  }

  // 2) Estados de entrega: `delivered` solo lo declara el proveedor aquí.
  const events = parseDeliveryEvents(body);
  const statuses = [];
  for (const event of events) {
    statuses.push(await applyProviderStatus(sql, {
      providerMessageId: event.messageId, status: event.status, error: event.error,
    }));
  }

  // 3) Mensajes entrantes: BAJA/STOP retiran el consentimiento.
  const messages = [];
  for (const entry of body.entry || []) { // formato Meta
    for (const change of entry.changes || []) {
      for (const message of change.value?.messages || []) {
        messages.push({ from: message.from, text: message.text?.body });
      }
    }
  }
  if (body.From) { // formato Twilio (urlencoded)
    messages.push({ from: String(body.From).replace('whatsapp:', ''), text: body.Body });
  }
  const results = [];
  for (const message of messages) {
    if (message.text) results.push(await handleInboundWhatsApp(sql, message.from, message.text));
  }
  res.json({ received: messages.length, statuses, results });
});

// Webhook de correo (Resend, esquema SVIX): separa "aceptado" de "entregado".
app.post('/api/v1/email/webhook', async (req, res) => {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return res.status(503).json({ error: 'webhook_not_configured' });
  const ok = verifySvixSignature({
    rawBody: req.rawBody,
    id: req.get('svix-id'),
    timestamp: req.get('svix-timestamp'),
    signature: req.get('svix-signature'),
    secret,
  });
  if (!ok) return res.status(401).json({ error: 'bad_signature' });
  const events = parseDeliveryEvents(req.body || {});
  const statuses = [];
  for (const event of events) {
    statuses.push(await applyProviderStatus(sql, {
      providerMessageId: event.messageId, status: event.status, error: event.error,
    }));
  }
  res.json({ received: events.length, statuses });
});

// ---------------------------------------------------------------------------
// Ingesta de mediciones (compatible con el cliente ESP32 actual).
// El valor recibido se separa del dato validado: lo fuera de rango se conserva
// en raw_payload y la fila queda marcada como inválida, nunca se borra.
// ---------------------------------------------------------------------------
const batteryLevelFor = (batteryMv, config) => {
  if (batteryMv == null) return null;
  const critical = Number(config?.battery_critical_mv ?? 3200);
  const low = Number(config?.battery_low_mv ?? 3400);
  return batteryMv <= critical ? 'critical' : batteryMv <= low ? 'low' : 'ok';
};

// El equipo declara la versión de configuración que tiene aplicada. Solo entonces
// el cambio pasa de pendiente a aplicado. Una versión que no existe se ignora:
// no se acepta nada que el equipo no pueda haber recibido.
async function confirmConfigVersion(client, deviceId, version) {
  const [row] = await client`SELECT version FROM device_config_versions
    WHERE device_id = ${deviceId} AND version = ${version}`;
  if (!row) return false;
  const [applied] = await client`UPDATE device_config_versions
    SET confirmed_version = ${version}, applied_at = coalesce(applied_at, now()),
        requested_at = coalesce(requested_at, now())
    WHERE device_id = ${deviceId} AND version = ${version} AND confirmed_version IS DISTINCT FROM ${version}
    RETURNING version`;
  await client`UPDATE device_status SET config_version = ${version}, updated_at = now()
    WHERE device_id = ${deviceId}`;
  return !!applied;
}

app.post('/api/measurements', requireDevice, async (req, res) => {
  const parsed = z.array(measurementSchema).min(1).max(32).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_measurements', details: parsed.error.issues });
  if (parsed.data.some((record) => record.device_id !== req.deviceId)) {
    return res.status(403).json({ error: 'device_identity_mismatch' });
  }
  // Un registro sin ningun canal (sensor caido en ese ciclo) no se guarda, pero
  // se confirma: si se rechazara, la estacion reenviaria el mismo lote para
  // siempre y no subiria nada mas.
  const emptyRecords = parsed.data.filter((record) => !hasAnyValue(record)).length;
  if (emptyRecords > 0) {
    console.warn(`[measurements] ${emptyRecords} registros sin valores omitidos (device ${req.deviceId})`);
  }

  // Las directiva urgentes que ya estaban pendientes se liberan al final de este
  // envío; las que se creen ahora son para el siguiente despertar del equipo.
  const ackThrough = await sql.begin(async (tx) => {
    // Las directiva urgentes ya pendientes se liberan al final de este envío;
    // las que se creen ahora son para el siguiente despertar del equipo.
    const pendingDirectives = await pendingDirectiveIds(tx, req.deviceId);
    const [configRow] = await tx`SELECT config FROM device_configs WHERE device_id = ${req.deviceId}`;
    const config = effectiveConfig(configRow?.config ?? {});
    let highest = null;
    let lastBattery = null;
    let insertedCurrentValid = false;
    let appliedConfigVersion = null;
    const [latestValid] = await tx`SELECT max(observed_at) AS observed_at FROM measurements
      WHERE device_id = ${req.deviceId} AND is_validated AND deleted_at IS NULL`;
    let newestEvaluatedAt = latestValid?.observedAt ? new Date(latestValid.observedAt).getTime() : 0;
    const nowMs = Date.now();

    for (const record of parsed.data) {
      const observedAt = new Date(record.ts * 1000);
      // Registro sin ningún canal: no hay fila que crear, pero su secuencia sí
      // se confirma más abajo para que el equipo la retire de su cola.
      if (hasAnyValue(record)) {
        const evaluated = evaluateMeasurement(record);
        const observedMs = observedAt.getTime();
        const timeClass = classifyMeasurementTime({ observedAt, now: new Date(nowMs),
          newestObservedAt: newestEvaluatedAt ? new Date(newestEvaluatedAt) : null,
          measurementIntervalSeconds: config.interval_normal_s, timeValid: evaluated.time_valid });
        const currentAndOrdered = evaluated.is_validated && timeClass === 'current';
        const [inserted] = await tx`INSERT INTO measurements
          (device_id, sequence, observed_at, time_quality, temperature_c, humidity_pct, pressure_pa, battery_mv,
           flags, alert_level, lux, source, is_validated, validation_flags, raw_payload, invalidated_reason)
          VALUES (${req.deviceId}, ${record.sequence}, ${observedAt}, ${record.quality},
            ${evaluated.columns.temperature_c ?? null}, ${evaluated.columns.humidity_pct ?? null},
            ${evaluated.columns.pressure_pa ?? null}, ${evaluated.columns.battery_mv ?? null},
            ${record.flags}, ${record.alert}, ${evaluated.columns.lux ?? null}, ${record.source ?? 'wifi'},
            ${evaluated.is_validated}, ${evaluated.validation_flags},
            ${evaluated.raw_payload ? tx.json(evaluated.raw_payload) : null}, ${evaluated.invalidated_reason})
          ON CONFLICT (device_id, sequence, observed_at) DO NOTHING RETURNING id`;
        if (currentAndOrdered && evaluated.columns.battery_mv != null) lastBattery = evaluated.columns.battery_mv;

        if (inserted) {
          if (currentAndOrdered) {
            insertedCurrentValid = true;
            newestEvaluatedAt = observedMs;
          }
          // `record.alert` se conserva en measurements como dato legado del
          // firmware, pero no crea un segundo incidente fuera del motor. Los
          // avisos locales salen solo de alert_rules/evaluateMeasurementRules,
          // que deduplica por episodio y encola una vez por destinatario.
          // Solo datos temporalmente actuales y canales válidos llegan al motor.
          if (currentAndOrdered) {
            await evaluateMeasurementRules(tx, {
              deviceId: req.deviceId,
              measurementId: inserted.id,
              values: evaluated.valid_values,
              at: observedAt,
              config,
            });
          }
        }
      }
      // Confirmación de la configuración: el equipo declara qué versión tiene
      // aplicada. Hasta que lo dice, el cambio remoto sigue pendiente.
      if (record.config_version != null) {
        const confirmed = await confirmConfigVersion(tx, req.deviceId, record.config_version);
        if (confirmed) appliedConfigVersion = record.config_version;
      }
      highest = record.sequence;
    }

    // Estado operativo: último contacto, batería y conectividad.
    const batteryLevel = batteryLevelFor(lastBattery, config) ?? 'unknown';
    await tx`INSERT INTO device_status (device_id, last_contact, connectivity, battery_mv, battery_level, updated_at)
      VALUES (${req.deviceId}, now(), 'online', ${lastBattery}, ${batteryLevel}, now())
      ON CONFLICT (device_id) DO UPDATE SET
        last_contact = now(), connectivity = 'online',
        battery_mv = coalesce(${lastBattery}, device_status.battery_mv),
        battery_level = CASE WHEN ${lastBattery}::integer IS NULL THEN device_status.battery_level ELSE ${batteryLevel} END,
        updated_at = now()`;
    await tx`UPDATE devices SET last_seen_at = now() WHERE id = ${req.deviceId}`;
    // Este envío ya ha dado la oportunidad de subir la medida crítica antes de tiempo.
    await releaseDirectives(tx, req.deviceId, { batteryMv: lastBattery, ids: pendingDirectives });
    if (insertedCurrentValid) {
      await tx`UPDATE device_status s SET last_valid_data = (
          SELECT max(m.observed_at) FROM measurements m
          WHERE m.device_id = ${req.deviceId} AND m.is_validated AND m.deleted_at IS NULL)
        WHERE s.device_id = ${req.deviceId}`;
    }
    return { highest, appliedConfigVersion };
  });
  res.json({ ack_through: ackThrough.highest, ...(ackThrough.appliedConfigVersion
    ? { applied_config_version: ackThrough.appliedConfigVersion } : {}) });
});

app.get('/api/config', requireDevice, async (req, res) => {
  // Se sirve el JSON tal cual (como texto) para NO pasar por transform: postgres.camel
  // reescribiria las claves snake_case (pressure_alert_low_pa) a camelCase y el
  // firmware del dispositivo no las reconoceria.
  const [row] = await sql`SELECT config::text AS config FROM device_configs WHERE device_id = ${req.deviceId}`;
  // El equipo que pide la configuración deja constancia de contacto y de versión solicitada.
  await sql`UPDATE devices SET last_seen_at = now() WHERE id = ${req.deviceId}`;
  await sql`INSERT INTO device_status (device_id, last_contact) VALUES (${req.deviceId}, now())
    ON CONFLICT (device_id) DO UPDATE SET last_contact = now(), updated_at = now()`;
  await sql`UPDATE device_config_versions SET requested_version = version, requested_at = now()
    WHERE device_id = ${req.deviceId}
      AND version = (SELECT max(version) FROM device_config_versions WHERE device_id = ${req.deviceId})
      AND requested_version IS DISTINCT FROM version`;
  // Excepción urgente: si hay una directiva pendiente, el equipo debe intentar
  // subir la medida crítica en este mismo despertar. El firmware actual todavía
  // no la aplica; se mide su coste en batería antes de asumir el cambio.
  const [pending] = await sql`SELECT id, reason, issued_at FROM urgent_directives
    WHERE device_id = ${req.deviceId} AND released_at IS NULL ORDER BY issued_at LIMIT 1`;
  if (pending) {
    const config = row?.config ? JSON.parse(row.config) : {};
    res.json({
      ...config,
      _urgent: { id: pending.id, reason: pending.reason, issued_at: pending.issued_at },
    });
    return;
  }
  res.type('application/json').send(row?.config ?? '{}');
});

// Confirmación explícita de la configuración aplicada. Alternativa al campo
// config_version del lote, para un equipo que no pueda modificar su payload:
// una sola línea en el firmware tras aplicar la configuración.
app.post('/api/config/confirm', requireDevice, async (req, res) => {
  const version = Number.parseInt(String(req.query.version ?? req.body?.version ?? ''), 10);
  if (!Number.isInteger(version) || version < 1) return res.status(400).json({ error: 'invalid_version' });
  const confirmed = await sql.begin(async (tx) => confirmConfigVersion(tx, req.deviceId, version));
  if (!confirmed) return res.status(404).json({ error: 'version_not_found' });
  res.json({ version, state: 'aplicado', confirmed: true });
});

// A server-side provider adapter may push forecast data here; provider keys never reach the browser/device.
app.post('/api/v1/forecasts', async (req, res) => {
  const expected = process.env.FORECAST_INGEST_TOKEN;
  const supplied = req.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{32,})$/)?.[1];
  const suppliedDigest = supplied ? Buffer.from(sha256(supplied), 'hex') : null;
  const expectedDigest = expected ? Buffer.from(sha256(expected), 'hex') : null;
  if (!suppliedDigest || !expectedDigest || !timingSafeEqual(suppliedDigest, expectedDigest)) {
    return res.status(401).json({ error: 'forecast_ingest_auth_required' });
  }
  const forecastSchema = z.object({
    device_id: z.string().min(1).max(80), provider: z.string().min(1).max(80),
    forecasts: z.array(z.object({
      forecast_for: z.string().datetime(),
      temperature_c: z.number().finite().min(-80).max(100).nullable().optional(),
      humidity_pct: z.number().finite().min(0).max(100).nullable().optional(),
      precipitation_mm: z.number().finite().min(0).max(1000).nullable().optional(),
      payload: z.record(z.string(), z.unknown()).optional(),
    }).strict()).min(1).max(240),
  }).strict().safeParse(req.body);
  if (!forecastSchema.success) return res.status(400).json({ error: 'invalid_forecasts', details: forecastSchema.error.issues });
  const { device_id: deviceId, provider, forecasts } = forecastSchema.data;
  const [device] = await sql`SELECT id FROM devices WHERE id = ${deviceId} AND active = true`;
  if (!device) return res.status(404).json({ error: 'device_not_found' });
  await sql.begin(async (tx) => {
    for (const forecast of forecasts) {
      await tx`INSERT INTO external_forecasts
        (device_id, provider, forecast_for, temperature_c, humidity_pct, precipitation_mm, payload)
        VALUES (${deviceId}, ${provider}, ${new Date(forecast.forecast_for)}, ${forecast.temperature_c ?? null},
          ${forecast.humidity_pct ?? null}, ${forecast.precipitation_mm ?? null}, ${tx.json(forecast.payload || {})})
        ON CONFLICT (device_id, provider, forecast_for) DO UPDATE SET
          fetched_at = now(), temperature_c = EXCLUDED.temperature_c, humidity_pct = EXCLUDED.humidity_pct,
          precipitation_mm = EXCLUDED.precipitation_mm, payload = EXCLUDED.payload`;
    }
  });
  res.json({ stored: forecasts.length, source: 'external_provider' });
});

// ---------------------------------------------------------------------------
// Panel del suscriptor
// ---------------------------------------------------------------------------
function haversineKm(aLat, aLon, bLat, bLon) {
  const r = Math.PI / 180;
  const dLat = (bLat - aLat) * r;
  const dLon = (bLon - aLon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

app.get('/api/v1/dashboard', requireSubscriber, async (req, res) => {
  const period = req.query.period || '24h';
  const hours = { '24h': 24, '7d': 168, '30d': 720 }[period];
  if (!hours) return res.status(400).json({ error: 'period_must_be_24h_7d_or_30d' });
  // Ámbito en servidor: el usuario registrado solo ve las estaciones concedidas
  // y las autorizadas para la demostración; nunca todas las privadas.
  const scope = accessibleDeviceIds(req.subscriber);
  const scopeCondition = scope ? sql`AND d.id IN ${scope}` : sql``;
  const devices = await sql`SELECT d.id, d.name, d.latitude, d.longitude, d.coverage_km, d.last_seen_at,
      d.owner, d.location_type, d.public_zone, d.aemet_municipality_code, d.aemet_station_id,
      d.aemet_warning_area, d.altitude, d.sensors, d.firmware_version, d.publish_permission,
      c.config, st.last_contact, st.last_valid_data, st.battery_mv, st.battery_level,
      st.firmware_version AS status_firmware_version, st.config_version, st.pending_samples, st.updated_at
    FROM devices d
    LEFT JOIN device_configs c ON c.device_id = d.id
    LEFT JOIN device_status st ON st.device_id = d.id
    WHERE d.active = true ${scopeCondition} ORDER BY d.name`;
  const deviceIds = devices.map((device) => device.id);
  const [latestRows, historyRows, summaryRows, forecastRows, nearbyCandidates, trendRows] = deviceIds.length
    ? await Promise.all([
      sql`SELECT DISTINCT ON (device_id) device_id, sequence, observed_at, received_at, time_quality,
          temperature_c, humidity_pct, pressure_pa, battery_mv, lux, source, flags, alert_level,
          is_validated, validation_flags, invalidated_reason
        FROM measurements WHERE device_id = ANY(${deviceIds}) AND is_validated AND deleted_at IS NULL
        ORDER BY device_id, observed_at DESC, received_at DESC`,
      // Reduce a maximum de 500 puntos por estación, conservando el periodo y sus extremos.
      sql`WITH ranked AS (
          SELECT device_id, observed_at, received_at, temperature_c, humidity_pct, pressure_pa,
              battery_mv, lux, flags, alert_level, time_quality, source,
              row_number() OVER (PARTITION BY device_id ORDER BY observed_at, received_at) AS sample_no,
              count(*) OVER (PARTITION BY device_id) AS sample_count,
              min(temperature_c) OVER (PARTITION BY device_id) AS min_temp,
              max(temperature_c) OVER (PARTITION BY device_id) AS max_temp,
              min(humidity_pct) OVER (PARTITION BY device_id) AS min_humidity,
              max(humidity_pct) OVER (PARTITION BY device_id) AS max_humidity,
              min(pressure_pa) OVER (PARTITION BY device_id) AS min_pressure,
              max(pressure_pa) OVER (PARTITION BY device_id) AS max_pressure,
              min(battery_mv) OVER (PARTITION BY device_id) AS min_battery,
              max(battery_mv) OVER (PARTITION BY device_id) AS max_battery
            FROM measurements
            WHERE device_id = ANY(${deviceIds}) AND observed_at >= now() - (${hours} * interval '1 hour')
              AND is_validated AND deleted_at IS NULL
        )
        SELECT device_id, observed_at, received_at, temperature_c, humidity_pct, pressure_pa,
            battery_mv, lux, flags, alert_level, time_quality, source
          FROM ranked
          WHERE sample_count <= 500 OR sample_no = 1 OR sample_no = sample_count
            OR mod(sample_no, ceil(sample_count::numeric / 500)::bigint) = 0
            OR (min_temp IS NOT NULL AND temperature_c IN (min_temp, max_temp))
            OR (min_humidity IS NOT NULL AND humidity_pct IN (min_humidity, max_humidity))
            OR (min_pressure IS NOT NULL AND pressure_pa IN (min_pressure, max_pressure))
            OR (min_battery IS NOT NULL AND battery_mv IN (min_battery, max_battery))
          ORDER BY device_id, observed_at, received_at`,
      sql`SELECT device_id, count(*)::integer AS count,
          count(*) FILTER (WHERE is_validated)::integer AS valid_count,
          count(*) FILTER (WHERE NOT is_validated)::integer AS invalid_count,
          count(*) FILTER (WHERE temperature_c IS NOT NULL)::integer AS measured_count,
          min(temperature_c) FILTER (WHERE is_validated) AS temp_min,
          max(temperature_c) FILTER (WHERE is_validated) AS temp_max,
          avg(temperature_c) FILTER (WHERE is_validated) AS temp_avg,
          min(humidity_pct) FILTER (WHERE is_validated) AS humidity_min,
          max(humidity_pct) FILTER (WHERE is_validated) AS humidity_max,
          avg(humidity_pct) FILTER (WHERE is_validated) AS humidity_avg,
          min(pressure_pa) FILTER (WHERE is_validated) AS pressure_min,
          max(pressure_pa) FILTER (WHERE is_validated) AS pressure_max,
          avg(pressure_pa) FILTER (WHERE is_validated) AS pressure_avg,
          min(battery_mv) FILTER (WHERE is_validated) AS battery_min,
          max(battery_mv) FILTER (WHERE is_validated) AS battery_max,
          avg(battery_mv) FILTER (WHERE is_validated) AS battery_avg,
          min(lux) FILTER (WHERE is_validated) AS lux_min,
          max(lux) FILTER (WHERE is_validated) AS lux_max,
          avg(lux) FILTER (WHERE is_validated) AS lux_avg
        FROM measurements WHERE device_id = ANY(${deviceIds})
          AND observed_at >= now() - (${hours} * interval '1 hour') AND deleted_at IS NULL
        GROUP BY device_id`,
      sql`WITH ranked AS (
          SELECT device_id, provider, forecast_for, fetched_at, temperature_c, humidity_pct, precipitation_mm,
              row_number() OVER (PARTITION BY device_id ORDER BY forecast_for) AS row_no
            FROM external_forecasts WHERE device_id = ANY(${deviceIds})
              AND forecast_for >= now() - interval '1 hour'
        )
        SELECT device_id, provider, forecast_for, fetched_at, temperature_c, humidity_pct, precipitation_mm
          FROM ranked WHERE row_no <= 100 ORDER BY device_id, forecast_for`,
      sql`SELECT name, latitude, longitude, coverage_km, last_seen_at
        FROM devices WHERE active = true AND publish_permission = true
          AND latitude IS NOT NULL AND longitude IS NOT NULL
          AND last_seen_at >= now() - interval '2 hours'`,
      // Serie corta para las tendencias del día local (validada y sin borrados).
      sql`SELECT device_id, observed_at, temperature_c, humidity_pct, pressure_pa, battery_mv, lux
        FROM measurements
        WHERE device_id = ANY(${deviceIds}) AND observed_at >= now() - interval '36 hours'
          AND is_validated AND deleted_at IS NULL
        ORDER BY device_id, observed_at`,
    ])
    : [[], [], [], [], [], []];

  const latestByDevice = new Map(latestRows.map((row) => [row.deviceId, row]));
  const weatherByDevice = new Map(await Promise.all(devices.map(async (device) => [device.id, await weatherForDevice(device)])));
  const historyByDevice = new Map();
  for (const row of historyRows) {
    if (!historyByDevice.has(row.deviceId)) historyByDevice.set(row.deviceId, []);
    historyByDevice.get(row.deviceId).push(row);
  }
  const trendHistoryByDevice = new Map();
  for (const row of trendRows) {
    if (!trendHistoryByDevice.has(row.deviceId)) trendHistoryByDevice.set(row.deviceId, []);
    trendHistoryByDevice.get(row.deviceId).push(row);
  }
  const summaryByDevice = new Map(summaryRows.map((row) => [row.deviceId, row]));
  const forecastsByDevice = new Map();
  for (const row of forecastRows) {
    if (!forecastsByDevice.has(row.deviceId)) forecastsByDevice.set(row.deviceId, []);
    forecastsByDevice.get(row.deviceId).push(row);
  }

  const response = devices.map((device) => {
    const config = device.config ?? {};
    const latest = latestByDevice.get(device.id) ?? null;
    const history = historyByDevice.get(device.id) ?? [];
    const summary = summaryByDevice.get(device.id) ?? {
      count: 0, validCount: 0, invalidCount: 0, measuredCount: 0,
      tempMin: null, tempMax: null, tempAvg: null,
      humidityMin: null, humidityMax: null, humidityAvg: null,
      pressureMin: null, pressureMax: null, pressureAvg: null,
      batteryMin: null, batteryMax: null, batteryAvg: null,
      luxMin: null, luxMax: null, luxAvg: null,
    };
    const forecasts = forecastsByDevice.get(device.id) ?? [];

    // Cobertura: cuántos datos faltan frente a lo esperado por el intervalo configurado.
    const intervalSeconds = Number(config.interval_normal_s) || 360;
    const expected = Math.max(1, Math.floor((hours * 3600) / intervalSeconds));
    const coveragePct = Math.min(100, Math.round((summary.validCount / expected) * 1000) / 10);

    let nearby = { stations: [], representative: false, message: 'Ubicación de estación no configurada.' };
    if (device.latitude != null && device.longitude != null) {
      const stations = nearbyCandidates.map((candidate) => ({
        name: candidate.name,
        lastSeenAt: candidate.lastSeenAt,
        distanceKm: haversineKm(device.latitude, device.longitude, candidate.latitude, candidate.longitude),
        coverageKm: candidate.coverageKm,
      })).filter((station) => station.distanceKm <= station.coverageKm)
        .sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 3)
        .map(({ name, lastSeenAt, distanceKm }) => ({ name, lastSeenAt, distanceKm }));
      nearby = { stations, representative: stations.length === 3,
        message: stations.length === 3 ? 'Tres estaciones activas dentro de su cobertura.' : `Solo ${stations.length} de 3 estaciones cercanas disponibles y cubiertas.` };
    }

    return {
      device: {
        id: device.id, name: device.name, owner: device.owner, locationType: device.locationType,
        publicZone: device.publicZone, altitude: device.altitude, sensors: device.sensors,
        firmwareVersion: device.firmwareVersion, publishPermission: device.publishPermission,
      },
      status: statusPayload(device, config),
      latest: latest || null,
      // Indicador CALCULADO a partir de temperatura y humedad del último dato
      // válido; se etiqueta como tal en la interfaz.
      dewPointC: latest && latest.temperatureC != null && latest.humidityPct != null
        ? dewPointCelsius(latest.temperatureC, latest.humidityPct) : null,
      history,
      trendHistory: trendHistoryByDevice.get(device.id) ?? [],
      // El row llega camelizado por el transform de columna: el resumen se expone en snake_case.
      summary: {
        ...Object.fromEntries(Object.entries(summary).filter(([key]) => key !== 'deviceId')
          .map(([key, value]) => [key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`), value])),
        expected,
        coverage_pct: summary.validCount ? coveragePct : 0,
      },
      forecasts,
      forecast_source: forecasts.length ? 'external_provider' : null,
      estimates: [],
      nearby,
      weather: weatherByDevice.get(device.id),
    };
  });
  // Los avisos tienen ámbito propio: no se heredan de la estación de la
  // demostración, que solo da acceso a las mediciones.
  const alertScope = alertableDeviceIds(req.subscriber);
  const alerts = await sql`SELECT a.id::text AS id, a.device_id, d.name AS device_name, a.level, a.message,
      a.value, a.source, a.category, a.observed_at, a.created_at, a.recipient, a.channel, a.delivery_status,
      a.closed_at, a.acknowledged_at, a.rule_id::text AS rule_id, a.rule_snapshot, a.auto_resolved
    FROM alerts a JOIN devices d ON d.id = a.device_id
    WHERE ${alertScope ? sql`d.id IN ${alertScope}` : sql`TRUE`}
      ${req.subscriber.role === 'admin' ? sql`` : sql`AND ${NON_COMMUNICATION_ALERT}`}
    ORDER BY a.created_at DESC LIMIT 50`;
  // Cada aviso declara la antigüedad de la medida que lo originó y cuánto tardó
  // en llegar: con lotes de 30 min, no es lo mismo un aviso de ahora que de hace
  // media hora. `engine_verified` indica si el motor está comprobado aquí.
  res.json({
    period,
    devices: response,
    alerts: alerts.map((alert) => ({ ...alert, ...alertAge(alert) })),
    engine_verified: alertEngineVerified(),
  });
});

// Filtro común: rango de fechas + dispositivo, limitado siempre a las estaciones del suscriptor.
function measurementQuery(req) {
  const from = req.query.from ? new Date(String(req.query.from)) : null;
  const to = req.query.to ? new Date(String(req.query.to)) : null;
  if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) return null;
  const deviceId = typeof req.query.device_id === 'string' && req.query.device_id ? req.query.device_id : null;
  const role = req.subscriber.role;
  const includeDeleted = req.query.include_deleted === 'true' && role !== 'viewer';

  const conditions = [];
  if (role !== 'admin') {
    conditions.push(sql`m.device_id IN ${accessibleDeviceIds(req.subscriber)}`);
  }
  if (deviceId) conditions.push(sql`m.device_id = ${deviceId}`);
  if (from) conditions.push(sql`m.observed_at >= ${from}`);
  if (to) conditions.push(sql`m.observed_at < ${to}`);
  if (!includeDeleted) conditions.push(sql`m.deleted_at IS NULL`);
  if (req.query.validated === 'valid') conditions.push(sql`m.is_validated`);
  if (req.query.validated === 'invalid') conditions.push(sql`NOT m.is_validated`);
  if (!conditions.length) return { where: sql`TRUE` };
  let where = conditions[0];
  for (let i = 1; i < conditions.length; i++) where = sql`${where} AND ${conditions[i]}`;
  return { where };
}

const MEASUREMENT_COLUMNS = sql`m.id::text AS id, m.device_id, d.name AS device_name, m.sequence::text AS sequence,
  m.observed_at, m.received_at, m.time_quality, m.temperature_c, m.humidity_pct, m.pressure_pa, m.battery_mv,
  m.lux, m.source, m.flags, m.alert_level, m.is_validated, m.validation_flags, m.validated_at,
  m.invalidated_reason, m.deleted_at`;

// Listado de mediciones por rango de fechas (solo suscriptor y solo sus equipos).
app.get('/api/v1/measurements', requireSubscriber, async (req, res) => {
  const query = measurementQuery(req);
  if (!query) return res.status(400).json({ error: 'invalid_range' });
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit ?? '100', 10) || 100, 1), 500);
  const offset = Math.max(Number.parseInt(req.query.offset ?? '0', 10) || 0, 0);

  const rows = await sql`SELECT ${MEASUREMENT_COLUMNS}
    FROM measurements m JOIN devices d ON d.id = m.device_id
    WHERE ${query.where} ORDER BY m.observed_at DESC, m.received_at DESC LIMIT ${limit} OFFSET ${offset}`;
  const [counts] = await sql`SELECT count(*)::integer AS total,
      count(*) FILTER (WHERE m.is_validated)::integer AS valid,
      count(*) FILTER (WHERE NOT m.is_validated)::integer AS invalid
    FROM measurements m WHERE ${query.where}`;
  res.json({
    measurements: rows,
    total: counts.total,
    valid: counts.valid,
    invalid: counts.invalid,
    limit,
    offset,
  });
});

// Detalle de una medición, incluido el valor bruto recibido.
app.get('/api/v1/measurements/:id', requireSubscriber, async (req, res) => {
  if (!/^\d{1,18}$/.test(req.params.id)) return res.status(400).json({ error: 'invalid_id' });
  const scope = req.subscriber.role === 'admin'
    ? sql`TRUE`
    : sql`m.device_id IN ${accessibleDeviceIds(req.subscriber)}`;
  const rows = await sql`SELECT ${MEASUREMENT_COLUMNS}, m.raw_payload, s.email AS validated_by_email
    FROM measurements m JOIN devices d ON d.id = m.device_id
    LEFT JOIN subscribers s ON s.id = m.validated_by
    WHERE m.id = ${req.params.id}::bigint AND ${scope}`;
  if (!rows.length) return res.status(404).json({ error: 'measurement_not_found' });
  res.json({ measurement: rows[0] });
});

// Revisión manual: un operador puede marcar/desmarcar una lectura sin borrarla.
app.patch('/api/v1/measurements/:id/validate', requireSubscriber, requireRole('operator'), csrfGuard, async (req, res) => {
  if (!/^\d{1,18}$/.test(req.params.id)) return res.status(400).json({ error: 'invalid_id' });
  const parsed = z.object({
    is_validated: z.boolean(),
    reason: z.string().max(300).optional(),
  }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.issues });
  const { is_validated: isValidated, reason } = parsed.data;

  const scope = req.subscriber.role === 'admin'
    ? sql`TRUE`
    : sql`m.device_id IN ${accessibleDeviceIds(req.subscriber)}`;
  const rows = await sql`SELECT m.id::text AS id, m.device_id, m.is_validated, m.validation_flags, m.invalidated_reason,
      m.observed_at, m.sequence
    FROM measurements m WHERE m.id = ${req.params.id}::bigint AND ${scope}`;
  if (!rows.length) return res.status(404).json({ error: 'measurement_not_found' });
  const before = rows[0];

  const [updated] = await sql`UPDATE measurements m SET
      is_validated = ${isValidated},
      validation_flags = m.validation_flags | ${VFLAG.MANUAL},
      invalidated_reason = ${isValidated ? null : (reason?.trim() || 'revisión manual')},
      validated_by = ${req.subscriber.id},
      validated_at = now()
    WHERE m.id = ${before.id}::bigint
    RETURNING m.id::text AS id, m.is_validated, m.validation_flags, m.invalidated_reason, m.validated_at`;
  await sql`UPDATE device_status s SET last_valid_data = (
      SELECT max(m.observed_at) FROM measurements m
      WHERE m.device_id = ${before.deviceId} AND m.is_validated AND m.deleted_at IS NULL)
    WHERE s.device_id = ${before.deviceId}`;
  await audit(sql, req, 'measurement.validate', 'measurement', before.id, before, updated);
  res.json({ measurement: updated });
});

// Exportacion CSV con los mismos filtros que la tabla.
app.get('/api/v1/measurements.csv', requireSubscriber, async (req, res) => {
  const query = measurementQuery(req);
  if (!query) return res.status(400).json({ error: 'invalid_range' });
  const rows = await sql`SELECT ${MEASUREMENT_COLUMNS}
    FROM measurements m JOIN devices d ON d.id = m.device_id
    WHERE ${query.where} ORDER BY m.observed_at DESC LIMIT 20000`;

  const alertName = (level) => level === 1 ? 'prioritaria' : level === 2 ? 'aviso' : '';
  const columns = ['estacion', 'dispositivo', 'secuencia', 'fecha_hora_utc', 'recibido_utc', 'calidad_hora',
    'temperatura_c', 'humedad_pct', 'presion_mbar', 'bateria_mv', 'lux', 'origen', 'validado',
    'flags_validacion', 'motivo_invalido', 'flags', 'alerta'];
  const lines = [columns.join(',')];
  for (const row of rows) {
    lines.push([row.deviceName, row.deviceId, row.sequence, row.observedAt?.toISOString?.() ?? row.observed_at,
      row.receivedAt?.toISOString?.() ?? row.received_at, row.timeQuality,
      row.temperatureC, row.humidityPct, row.pressurePa == null ? null : Number(row.pressurePa) / 100, row.batteryMv, row.lux, row.source,
      row.isValidated ? 'si' : 'no', row.validationFlags, row.invalidatedReason, row.flags,
      alertName(row.alertLevel)]
       .map(csvCell).join(','));
  }
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="tecrural-mediciones.csv"');
  res.send('\uFEFF' + lines.join('\r\n') + '\r\n');
});

// Borrado suave: la fila se conserva con deleted_at para no perder rastro.
app.delete('/api/v1/measurements/:id', requireSubscriber, requireRole('operator'), csrfGuard, async (req, res) => {
  if (!/^\d{1,18}$/.test(req.params.id)) return res.status(400).json({ error: 'invalid_id' });
  const scope = req.subscriber.role === 'admin'
    ? sql`TRUE`
    : sql`m.device_id IN ${accessibleDeviceIds(req.subscriber)}`;
  const removed = await sql`UPDATE measurements m SET deleted_at = now(), deleted_by = ${req.subscriber.id}
    WHERE m.id = ${req.params.id}::bigint AND m.deleted_at IS NULL AND ${scope}
    RETURNING m.id::text AS id, m.device_id, m.sequence::text AS sequence, m.observed_at`;
  if (!removed.length) return res.status(404).json({ error: 'measurement_not_found' });
  await audit(sql, req, 'measurement.delete', 'measurement', removed[0].id, removed[0], { deleted: true });
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Routers de estaciones, configuración, avisos, cuenta y administración
// ---------------------------------------------------------------------------
app.use('/api/v1/stations', stationsRouter);
app.use('/api/v1/stations', configsRouter);
app.use('/api/v1/alerts', alertsRouter);
app.use('/api/v1/admin', adminRouter);
app.use('/api/v1/contacts', contactsRouter);
app.use('/api/v1/farms', farmsRouter);
app.use('/api/v1/public', publicRouter);
app.use('/api/v1', accountRouter);
// Servidor MCP para agentes de IA (solo lectura, token de servidor). Va antes
// del catch-all de la SPA para que no se lo coma la ruta de páginas.
app.use('/mcp', mcpRouter);

// ---------------------------------------------------------------------------
// Ejecución programada: detectores de sistema y cola de entrega
// ---------------------------------------------------------------------------
// El mecanismo normal es independiente de las visitas al panel:
//   · proceso largo      → temporizadores (`startScheduler`).
//   · servidor sin cron  → `POST /api/v1/maintenance/scheduler` con `CRON_SECRET`.
//   · respaldo           → `schedulerRequestTick`, montado al principio de la
//                           aplicación y disponible para cualquier petición de la
//                           API, no solo para el panel.
// Antes las dos pasadas vivían en middlewares montados DESPUÉS de las rutas, así
// que las peticiones que respondían (dashboard incluido) nunca los alcanzaban.
// El orden está corregido, pero no se depende de él: ver `scheduler.js`.
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

// Disparo para un cron externo (Vercel Cron o crontab). Autenticado con un
// secreto compartido por cabecera; sin secreto configurado no se abre a nadie.
const CRON_SECRET = process.env.CRON_SECRET || null;

function sameSecret(provided, expected) {
  const a = Buffer.from(String(provided || ''), 'utf8');
  const b = Buffer.from(String(expected || ''), 'utf8');
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function cronScheduler(req, res) {
  if (!CRON_SECRET) return res.status(503).json({ error: 'cron_not_configured' });
  const provided = (req.get('authorization') || '').replace(/^Bearer\s+/i, '') || req.get('x-cron-secret');
  if (!sameSecret(provided, CRON_SECRET)) return res.status(403).json({ error: 'forbidden' });
  // Vercel Functions tienen maxDuration=30 s en este proyecto: una sola fila por
  // invocación evita agotar el presupuesto en varios timeouts de proveedor.
  const result = await runScheduledPasses({ force: true, outboxLimit: isServerless ? 1 : undefined });
  res.json(result);
}

// Vercel Cron hace GET; cron externo también puede usar POST.
app.get('/api/v1/maintenance/scheduler', cronScheduler);
app.post('/api/v1/maintenance/scheduler', cronScheduler);

if (!isServerless) {
  const stopScheduler = startScheduler({ config: schedulerConfig() });
  // El temporizador se detiene si el proceso se va a cerrar con orden.
  process.once('SIGTERM', stopScheduler);
  process.once('SIGINT', stopScheduler);
}

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const siteUrl = siteOrigin(process.env.PUBLIC_SITE_URL);
// El HTML fuente vive en views/ (fuera de public/ para que Vercel no lo sirva
// estático en '/' sin las referencias con hash). El build lo procesa a
// public/dist/index.html; sin build, se sirve el fuente tal cual.
const renderPage = async (file) => {
  let html;
  if (file === 'index.html') {
    try {
      html = await readFile(new URL('../public/dist/index.html', import.meta.url), 'utf8');
    } catch {
      html = await readFile(new URL('../views/index.html', import.meta.url), 'utf8');
    }
  } else {
    html = await readFile(new URL(`../public/${file}`, import.meta.url), 'utf8');
  }
  return html
    .replaceAll('__SITE_URL__', siteUrl)
    .replaceAll('__SUPPORT_PHONE__', process.env.SUPPORT_PHONE || '')
    .replaceAll('__SUPPORT_WHATSAPP__', process.env.SUPPORT_WHATSAPP || '');
};

// SEO: robots y sitemap con el dominio real del despliegue.
app.get('/robots.txt', (_req, res) => {
  res.type('text/plain').send(
    `User-agent: *\nAllow: /\nDisallow: /panel\nDisallow: /estaciones\nDisallow: /avisos\nDisallow: /admin\nDisallow: /cuenta\nDisallow: /entrar\nDisallow: /api/\n\nSitemap: ${siteUrl}/sitemap.xml\n`);
});

app.get('/sitemap.xml', (_req, res) => {
  res.type('application/xml').send(sitemapXml(siteUrl));
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }));
app.get('/index.html', async (_req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.type('html').send(publicMetadata(await renderPage('index.html'), '/', siteUrl));
});
app.get(['/privacidad.html', '/cookies.html', '/aviso-legal.html', '/contacto.html'], (req, res) => res.redirect(301, req.path.replace(/\.html$/, '')));
// Caché conservadora: solo los assets firmados con hash (dist/assets) son
// inmutables; el service worker se revalida siempre y el resto de ficheros
// públicos caduca en un día con revalidación en segundo plano.
app.use(express.static(publicDir, {
  index: false,
  setHeaders: (res, filePath) => {
    // publicDir acaba en separador: se antepone '/' para comparar por URL.
    const relative = `/${filePath.slice(publicDir.length).replaceAll('\\', '/')}`;
    if (relative === '/service-worker.js') res.setHeader('Cache-Control', 'no-cache');
    else if (relative.startsWith('/dist/assets/')) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    else res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
  },
}));

// Rutas de la SPA (misma página) y páginas estáticas, con el dominio inyectado.
const SPA_ROUTES = new Set([...Object.keys(PUBLIC_PAGES), '/panel', '/estaciones', '/avisos', '/admin', '/cuenta',
  '/como-funciona', '/zonas', '/alertas', '/solicitar-piloto', '/entrar']);
const STATIC_PAGES = {
  '/privacidad': 'privacidad.html',
  '/aviso-legal': 'aviso-legal.html',
  '/cookies': 'cookies.html',
  '/contacto': 'contacto.html',
};

app.get('*path', async (req, res, next) => {
  const path = req.path.replace(/\/+$/, '') || '/';
  try {
    if (STATIC_PAGES[path]) {
      res.type('html').send(await renderPage(STATIC_PAGES[path]));
      return;
    }
    if (SPA_ROUTES.has(path)) {
      let html = publicMetadata(await renderPage('index.html'), path, siteUrl);
      if (!PUBLIC_PAGES[path] || req.query.token) html = html.replace('content="index, follow"', 'content="noindex, nofollow"');
      res.set('Cache-Control', 'no-cache');
      res.type('html').send(html);
      return;
    }
    res.status(404).type('html').send(await renderPage('404.html'));
  } catch (error) { next(error); }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  if (res.headersSent) return;
  if (error instanceof SyntaxError && 'body' in error) return res.status(400).json({ error: 'invalid_json' });
  res.status(500).json({ error: 'internal_error' });
});

export { app };
// Vercel toma src/server.js como entrada de una de las funciones: además del
// export con nombre hace falta el por defecto, o la función arranca con error.
export default app;

// En local el proceso escucha; en Vercel la función recibe (req, res).
if (!isServerless) {
  app.listen(port, () => console.log(`TECRURAL API listening on ${port}`));
}
