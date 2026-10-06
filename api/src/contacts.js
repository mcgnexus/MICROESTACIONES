import { Router } from 'express';
import { randomInt, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { sql } from './db.js';
import { requireSubscriber, csrfGuard } from './auth.js';
import { audit } from './audit.js';
import { sha256 } from './security.js';
import { normalizePhone } from './leads.js';
import { enqueueVerificationCode } from './notify.js';

export const CONTACT_CHANNELS = ['whatsapp', 'email'];
export const MAX_VERIFICATION_ATTEMPTS = 5;
export const VERIFICATION_TTL_MINUTES = 10;

const codeSchema = z.string().regex(/^\d{6}$/);

const addressSchemas = {
  whatsapp: z.string().trim().max(30).transform(normalizePhone)
    .refine((value) => /^\+?\d{7,15}$/.test(value)),
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
  const addressParsed = addressSchemas[channel].safeParse(parsed.data.address);
  if (!addressParsed.success) return res.status(400).json({ error: 'invalid_address', details: addressParsed.error.issues });
  const address = addressParsed.data;
  const optIn = parsed.data.opt_in;

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
    if (addressChanged) {
      await sql`DELETE FROM contact_verifications WHERE contact_id = ${before.id} AND consumed_at IS NULL`;
    }
    [row] = await sql`UPDATE subscriber_contacts SET
        address = ${address},
        verified_at = CASE WHEN ${addressChanged} THEN null ELSE verified_at END,
        opted_in_at = ${optIn ? sql`coalesce(opted_in_at, now())` : null},
        opted_out_at = ${optIn ? null : sql`now()`},
        updated_at = now()
      WHERE id = ${before.id}
      RETURNING id, channel, address, verified_at, opted_in_at, opted_out_at, created_at, updated_at`;
  }
  await audit(sql, req, 'contact.update', 'subscriber', String(req.subscriber.id),
    before ?? null, { channel, address, opt_in: optIn });
  res.json({ contact: contactPayload(row) });
});

// Pide un código de verificación. El envío real por WhatsApp llega con el
// despachador (Fase 3); aquí se genera y se guarda solo el hash.
router.post('/:channel/verify', csrfGuard, async (req, res) => {
  const channel = parseChannel(req.params.channel);
  if (!channel) return res.status(404).json({ error: 'channel_not_supported' });
  const [contact] = await sql`SELECT id, address FROM subscriber_contacts
    WHERE subscriber_id = ${req.subscriber.id} AND channel = ${channel}`;
  if (!contact) return res.status(404).json({ error: 'contact_not_found' });

  const code = generateVerificationCode();
  const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MINUTES * 60 * 1000);
  await sql.begin(async (tx) => {
    await tx`UPDATE contact_verifications SET consumed_at = now()
      WHERE contact_id = ${contact.id} AND consumed_at IS NULL`;
    const [verification] = await tx`INSERT INTO contact_verifications (contact_id, code_hash, expires_at)
      VALUES (${contact.id}, ${verificationHash(contact.id, code)}, ${expiresAt}) RETURNING id`;
    await enqueueVerificationCode(tx, {
      verificationId: verification.id, subscriberId: req.subscriber.id,
      channel, address: contact.address, code, ttlMinutes: VERIFICATION_TTL_MINUTES,
    });
  });
  await audit(sql, req, 'contact.verify_request', 'subscriber', String(req.subscriber.id),
    null, { channel, address: contact.address });
  res.status(202).json({
    status: 'verification_pending',
    channel,
    expiresAt,
    // Solo en entornos de desarrollo con OTP_DEBUG=true, para poder probar sin proveedor.
    ...(process.env.OTP_DEBUG === 'true' ? { devCode: code } : {}),
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
  res.json({ verified: true, channel });
});

export default router;
