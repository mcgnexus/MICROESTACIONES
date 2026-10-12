import { Router } from 'express';
import { randomInt, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { sql } from './db.js';
import { requireSubscriber, csrfGuard } from './auth.js';
import { audit } from './audit.js';
import { sha256 } from './security.js';
import { normalizePhoneE164, DEFAULT_COUNTRY, isSupportedCountryCode } from './phone.js';
import { revokeCommercialConsent } from './consent.js';
import { enqueueVerificationCode } from './notify.js';
import { otpDebugEnabled } from './env.js';
import { markMetric, metricFailure } from './analytics.js';
import { channelAvailable, verificationState } from './verification-status.js';
import { consumeAttempt } from './login-rate-limit.js';

export const CONTACT_CHANNELS = ['whatsapp', 'email'];
export const MAX_VERIFICATION_ATTEMPTS = 5;
export const VERIFICATION_TTL_MINUTES = Math.max(1, Math.min(60, Number(process.env.VERIFICATION_TTL_MINUTES) || 10));
// Espera mínima entre códigos del mismo contacto (evita ráfagas de envíos).
export const RESEND_COOLDOWN_SECONDS = 60;
// Topes de peticiones en la ventana de 15 minutos: por contacto, por cuenta y por
// IP. Los 5 intentos de CONFIRMAR un código siguen contándose aparte.
export const VERIFY_REQUEST_LIMITS = { contact: 5, account: 10, ip: 10 };

const codeSchema = z.string().regex(/^\d{6}$/);

// Normaliza la dirección de WhatsApp a E.164 con el país indicado (España por
// defecto), reutilizando la validación con metadatos del resto del sistema.
export function normalizeWhatsappAddress(value, country = DEFAULT_COUNTRY) {
  return normalizePhoneE164(value, country);
}

const addressSchemas = {
  whatsapp: (defaultCountry = DEFAULT_COUNTRY) => z.string().trim().max(40)
    .transform((value) => normalizeWhatsappAddress(value, defaultCountry))
    .refine((value) => value !== null, { message: 'Teléfono no válido para el país indicado.' }),
  email: z.string().trim().toLowerCase().email().max(254),
};

export function generateVerificationCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

// El hash ata el código a un contacto concreto: un código válido para una fila no
// sirve para otra, y la base solo guarda el digest, nunca el código en claro.
export function verificationHash(contactId, code) {
  return sha256(`contact-otp:${contactId}:${code}`);
}

export function verificationMatches(contactId, code, storedHash) {
  const expected = Buffer.from(String(storedHash), 'hex');
  const actual = Buffer.from(verificationHash(contactId, code), 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function parseChannel(value) {
  return CONTACT_CHANNELS.includes(value) ? value : null;
}

function contactPayload(row) {
  return {
    id: String(row.id),
    channel: row.channel,
    address: row.address,
    verified: Boolean(row.verifiedAt),
    verifiedAt: row.verifiedAt,
    optedIn: Boolean(row.optedInAt) && !row.optedOutAt,
    optedInAt: row.optedInAt,
    optedOutAt: row.optedOutAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const contactSchema = z.object({
  address: z.string(),
  opt_in: z.boolean(),
  country: z.string().trim().toUpperCase().length(2).refine(isSupportedCountryCode, { message: 'País no soportado.' }).optional(),
}).strict();

const confirmSchema = z.object({ code: codeSchema }).strict();

const router = Router();
router.use(requireSubscriber);

export async function listContacts(subscriberId, client = sql) {
  const rows = await client`SELECT id, channel, address, verified_at, opted_in_at, opted_out_at, created_at, updated_at
    FROM subscriber_contacts WHERE subscriber_id = ${subscriberId} ORDER BY channel`;
  return rows.map(contactPayload);
}

router.get('/', async (req, res) => {
  res.json({ contacts: await listContacts(req.subscriber.id) });
});

// Alta o cambio de un contacto. Si cambia la dirección se pierde la verificación:
// no se hereda un OTP de un número distinto. `opt_in` concede o revoca el envío.
router.put('/:channel', csrfGuard, async (req, res) => {
  const channel = parseChannel(req.params.channel);
  if (!channel) return res.status(404).json({ error: 'channel_not_supported' });
  const parsed = contactSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.issues });
  const addressParser = channel === 'whatsapp'
    ? addressSchemas.whatsapp(parsed.data.country || DEFAULT_COUNTRY) : addressSchemas[channel];
  const addressParsed = addressParser.safeParse(parsed.data.address);
  if (!addressParsed.success) return res.status(400).json({ error: 'invalid_address', details: addressParsed.error.issues });
  const address = addressParsed.data;
  const optIn = parsed.data.opt_in;
  const ip = req.ip || req.socket.remoteAddress || null;
  const userAgent = String(req.get('user-agent') || '').slice(0, 200) || null;

  const [before] = await sql`SELECT id, channel, address, verified_at, opted_in_at, opted_out_at
    FROM subscriber_contacts WHERE subscriber_id = ${req.subscriber.id} AND channel = ${channel}`;

  let row;
  if (!before) {
    [row] = await sql`INSERT INTO subscriber_contacts
      (subscriber_id, channel, address, opted_in_at, opted_out_at)
      VALUES (${req.subscriber.id}, ${channel}, ${address},
        ${optIn ? sql`now()` : null}, ${optIn ? null : sql`now()`})
      RETURNING id, channel, address, verified_at, opted_in_at, opted_out_at, created_at, updated_at`;
  } else {
    const addressChanged = before.address !== address;
    // Un número nuevo no hereda nada del anterior: se pierde la verificación, el
    // permiso comercial de ese canal queda revocado (y su cola cancelada) y los
    // avisos solo siguen si el usuario los vuelve a autorizar en este guardado.
    row = await sql.begin(async (tx) => {
      if (addressChanged) {
        await tx`DELETE FROM contact_verifications WHERE contact_id = ${before.id} AND consumed_at IS NULL`;
        await revokeCommercialConsent(tx, {
          subscriberId: req.subscriber.id, channel, source: 'account', ip, userAgent,
        });
      }
      const [updated] = await tx`UPDATE subscriber_contacts SET
          address = ${address},
          verified_at = CASE WHEN ${addressChanged} THEN null ELSE verified_at END,
          opted_in_at = ${optIn
            ? (addressChanged ? sql`now()` : sql`coalesce(opted_in_at, now())`)
            : null},
          opted_out_at = ${optIn ? null : sql`now()`},
          updated_at = now()
        WHERE id = ${before.id}
        RETURNING id, channel, address, verified_at, opted_in_at, opted_out_at, created_at, updated_at`;
      return updated;
    });
  }
  await audit(sql, req, 'contact.update', 'subscriber', String(req.subscriber.id),
    before ?? null, { channel, address, opt_in: optIn });
  res.json({ contact: contactPayload(row) });
});

// Pide un código de verificación. Antes de gastar un envío comprueba que el
// canal puede entregar hoy, que ha pasado la espera mínima y que no se ha pedido
// demasiadas veces. El código anterior se caduca y su mensaje en cola se aparta
// en la misma transacción: un código viejo no puede llegar después del nuevo.
router.post('/:channel/verify', csrfGuard, async (req, res) => {
  const channel = parseChannel(req.params.channel);
  if (!channel) return res.status(404).json({ error: 'channel_not_supported' });
  if (!channelAvailable(channel)) return res.status(409).json({ error: 'channel_unavailable' });
  const [contact] = await sql`SELECT id, address FROM subscriber_contacts
    WHERE subscriber_id = ${req.subscriber.id} AND channel = ${channel}`;
  if (!contact) return res.status(404).json({ error: 'contact_not_found' });

  // Espera mínima desde el último código del contacto.
  const [last] = await sql`SELECT created_at FROM contact_verifications
    WHERE contact_id = ${contact.id} ORDER BY created_at DESC LIMIT 1`;
  if (last) {
    const resendAt = new Date(new Date(last.createdAt).getTime() + RESEND_COOLDOWN_SECONDS * 1000);
    if (resendAt.getTime() > Date.now()) {
      return res.status(429).json({ error: 'cooldown', retryAt: resendAt.toISOString() });
    }
  }

  // Topes de peticiones (contacto, cuenta e IP) en la ventana compartida.
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const rateLimits = [
    { key: sha256(`contact-verify:contact:${contact.id}`), max: VERIFY_REQUEST_LIMITS.contact },
    { key: sha256(`contact-verify:account:${req.subscriber.id}`), max: VERIFY_REQUEST_LIMITS.account },
    { key: sha256(`contact-verify-ip:${String(ip).slice(0, 200)}`), max: VERIFY_REQUEST_LIMITS.ip },
  ];
  const results = await Promise.all(rateLimits.map(({ key, max }) => consumeAttempt(sql, key, max)));
  const blocked = results.filter((result) => result.limited);
  if (blocked.length) {
    const retryAt = new Date(Math.max(...blocked.map((result) => result.retryAt.getTime())));
    return res.status(429).json({ error: 'rate_limited', retryAt: retryAt.toISOString() });
  }

  const code = generateVerificationCode();
  const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MINUTES * 60 * 1000);
  await sql.begin(async (tx) => {
    await tx`UPDATE contact_verifications SET consumed_at = now()
      WHERE contact_id = ${contact.id} AND consumed_at IS NULL`;
    const [verification] = await tx`INSERT INTO contact_verifications (contact_id, code_hash, expires_at)
      VALUES (${contact.id}, ${verificationHash(contact.id, code)}, ${expiresAt}) RETURNING id`;
    // Solo se apartan los códigos anteriores de ESTE contacto: ni avisos ni
    // mensajes de otros contactos se ven afectados.
    await tx`UPDATE notification_outbox SET status = 'cancelled',
        last_error = 'sustituido por un código nuevo', updated_at = now(),
        claimed_by = NULL, claimed_at = NULL
      WHERE status IN ('pending', 'manual')
        AND contact_verification_id IN (
          SELECT id FROM contact_verifications WHERE contact_id = ${contact.id} AND id <> ${verification.id})`;
    await enqueueVerificationCode(tx, {
      verificationId: verification.id, subscriberId: req.subscriber.id,
      channel, address: contact.address, code, ttlMinutes: VERIFICATION_TTL_MINUTES,
    });
  });
  await audit(sql, req, 'contact.verify_request', 'subscriber', String(req.subscriber.id),
    null, { channel, address: contact.address });
  const resendAt = new Date(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
  res.status(202).json({
    status: 'preparing',
    channel,
    expiresAt,
    resendAt,
    // Solo fuera de producción y con OTP_DEBUG=true, para poder probar sin proveedor.
    ...(otpDebugEnabled() ? { devCode: code } : {}),
  });
});

// Estado real de la verificación más reciente del propio contacto. Solo datos del
// usuario: nunca el código, ni nada de otros contactos o cuentas.
router.get('/:channel/verification', async (req, res) => {
  const channel = parseChannel(req.params.channel);
  if (!channel) return res.status(404).json({ error: 'channel_not_supported' });
  const [contact] = await sql`SELECT id, verified_at FROM subscriber_contacts
    WHERE subscriber_id = ${req.subscriber.id} AND channel = ${channel}`;
  if (!contact) return res.status(404).json({ error: 'contact_not_found' });

  const [row] = await sql`SELECT cv.id, cv.consumed_at, cv.expires_at, cv.created_at,
      o.status, o.sent_at, o.delivered_at, o.updated_at
    FROM contact_verifications cv
    LEFT JOIN notification_outbox o ON o.contact_verification_id = cv.id
    WHERE cv.contact_id = ${contact.id}
    ORDER BY cv.created_at DESC, o.id DESC LIMIT 1`;

  const state = verificationState({
    id: row?.id, status: row?.status, consumedAt: row?.consumedAt,
    expiresAt: row?.expiresAt, verifiedAt: contact.verifiedAt,
  });
  const resendAt = row?.createdAt
    ? new Date(new Date(row.createdAt).getTime() + RESEND_COOLDOWN_SECONDS * 1000)
    : null;
  res.json({
    channel,
    state,
    expiresAt: row?.expiresAt ?? null,
    resendAt,
    updatedAt: row?.updatedAt ?? row?.createdAt ?? null,
  });
});

// Confirma el código. Caduca, limita intentos y consume el código al acertar.
router.post('/:channel/confirm', csrfGuard, async (req, res) => {
  const channel = parseChannel(req.params.channel);
  if (!channel) return res.status(404).json({ error: 'channel_not_supported' });
  const parsed = confirmSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.issues });
  const [contact] = await sql`SELECT id FROM subscriber_contacts
    WHERE subscriber_id = ${req.subscriber.id} AND channel = ${channel}`;
  if (!contact) return res.status(404).json({ error: 'contact_not_found' });

  const [verification] = await sql`SELECT id, code_hash, attempts FROM contact_verifications
    WHERE contact_id = ${contact.id} AND consumed_at IS NULL AND expires_at > now()
    ORDER BY created_at DESC LIMIT 1`;
  if (!verification) return res.status(400).json({ error: 'no_active_code' });

  if (verification.attempts + 1 > MAX_VERIFICATION_ATTEMPTS) {
    await sql`UPDATE contact_verifications SET consumed_at = now(), attempts = attempts + 1 WHERE id = ${verification.id}`;
    return res.status(429).json({ error: 'too_many_attempts' });
  }

  if (!verificationMatches(contact.id, parsed.data.code, verification.codeHash)) {
    await sql`UPDATE contact_verifications SET attempts = attempts + 1 WHERE id = ${verification.id}`;
    return res.status(400).json({ error: 'invalid_code' });
  }

  await sql.begin(async (tx) => {
    await tx`UPDATE contact_verifications SET consumed_at = now() WHERE id = ${verification.id}`;
    await tx`UPDATE subscriber_contacts SET verified_at = now(), updated_at = now() WHERE id = ${contact.id}`;
  });
  await audit(sql, req, 'contact.verified', 'subscriber', String(req.subscriber.id), null, { channel });
  await markMetric(sql, 'contact_verified', { subscriberId: req.subscriber.id }).catch(metricFailure);
  res.json({ verified: true, channel });
});

export default router;
