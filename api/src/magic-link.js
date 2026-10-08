// Acceso sin contraseña mediante enlace de un solo uso por email.
//
// El enlace es un token aleatorio que viaja una sola vez; la base solo guarda su
// hash. Al abrirlo, el token se consume de forma atómica (una sola transición de
// `consumed_at`), caduca y nunca se reutiliza. La cuenta resultante es siempre
// `viewer`/`free`: el registro público no puede elegir rol, plan ni estaciones.
import { randomToken, sha256 } from './security.js';
import { sendEmail, emailProvider } from './email.js';
import { isProduction } from './env.js';

export const MAGIC_LINK_TTL_MINUTES = Math.min(60, Math.max(5, Number(process.env.MAGIC_LINK_TTL_MINUTES || 15)));
export const MAGIC_RESEND_COOLDOWN_SECONDS = Math.max(15, Number(process.env.MAGIC_RESEND_COOLDOWN_SECONDS || 60));
export const MAGIC_REQUEST_MAX_ATTEMPTS = 5;

// Destinos internos permitidos tras verificar. El valor guardado es siempre uno
// de estos fragmentos hash; un enlace no puede redirigir fuera del sitio.
export const RETURN_PATHS = new Map([
  ['panel', '#/panel'],
  ['estaciones', '#/estaciones'],
  ['avisos', '#/avisos'],
  ['cuenta', '#/cuenta'],
  ['tiempo-local', '#/tiempo-local'],
  ['comparacion-aemet', '#/comparacion-aemet'],
  ['evolucion', '#/evolucion'],
  ['fincas', '#/fincas'],
  ['herramientas', '#/herramientas'],
  ['solicitar-piloto', '#/solicitar-piloto'],
  ['preguntas', '#/preguntas'],
  ['herramientas-pro', '#/herramientas'],
]);
export const DEFAULT_RETURN_PATH = '#/panel';

export const normalizeEmail = (value) => String(value ?? '').trim().toLowerCase();

// El hash se liga al propósito y al token: un digest no sirve para otro flujo.
export const magicLinkHash = (token) => sha256(`magic-link:${token}`);

// Acepta 'panel', '/panel', '#/panel' o una ruta con query y devuelve un destino
// interno conocido o el valor por defecto. Cualquier URL externa se descarta.
export function safeReturnPath(value, fallback = DEFAULT_RETURN_PATH) {
  if (typeof value !== 'string') return fallback;
  const key = value.trim()
    .replace(/^#\/?/, '')
    .replace(/^\/+/, '')
    .split(/[?#]/)[0]
    .replace(/\/+$/, '')
    .toLowerCase();
  return RETURN_PATHS.get(key) || fallback;
}

export function magicLinkUrl(siteUrl, token, returnPath) {
  const base = String(siteUrl).replace(/\/+$/, '');
  return `${base}/entrar?token=${encodeURIComponent(token)}&next=${encodeURIComponent(returnPath)}`;
}

export function renderMagicLink({ returnPath }) {
  const destination = returnPath === DEFAULT_RETURN_PATH ? 'tu panel' : 'la herramienta que querías abrir';
  const body = [
    'Has solicitado acceder a TecRural sin contraseña.',
    '',
    `Pulsa el enlace para entrar en ${destination} y volver a la herramienta solicitada.`,
    '',
    `El enlace caduca en ${MAGIC_LINK_TTL_MINUTES} minutos y solo puede usarse una vez.`,
    'Es una comunicación necesaria para completar tu acceso: no es un aviso meteorológico ni una novedad comercial.',
    'Si no lo has pedido, ignora este mensaje: sin pulsarlo no se crea ninguna sesión.',
  ].join('\n');
  return { subject: 'Tu acceso a TecRural', body };
}

export async function deliverMagicLink(address, siteUrl, token, returnPath, env = process.env) {
  const { subject, body } = renderMagicLink({ returnPath });
  const url = magicLinkUrl(siteUrl, token, returnPath);
  const text = `${body}\n\n${url}`;
  // En producción el proveedor `console` no se considera entrega: imprimiría un
  // enlace de acceso en los registros. Se trata como no entregable.
  if (emailProvider(env) === 'console' && isProduction(env)) {
    return { ok: false, permanent: false, error: 'console_not_allowed_in_production' };
  }
  return sendEmail(address, subject, text, env);
}

// Crea un enlace de un solo uso. Devuelve el token en claro (para enviarlo) pero
// la base guarda solo el hash. Rellena el hueco de reenvío y crea el registro.
// El consentimiento publicitario y la captación van aparte del acceso: son
// opcionales y se aplican a la cuenta solo cuando el enlace se verifica.
export async function issueMagicLink(client, {
  email, returnPath, ip, commercialConsent = false, acquisition = {}, now = new Date(),
}) {
  const normalized = normalizeEmail(email);
  const [recent] = await client`SELECT created_at FROM magic_links
    WHERE email = ${normalized} ORDER BY created_at DESC LIMIT 1`;
  if (recent && now.getTime() - new Date(recent.createdAt).getTime() < MAGIC_RESEND_COOLDOWN_SECONDS * 1000) {
    return { status: 'cooldown', cooldownSeconds: MAGIC_RESEND_COOLDOWN_SECONDS };
  }
  const token = randomToken();
  const expiresAt = new Date(now.getTime() + MAGIC_LINK_TTL_MINUTES * 60 * 1000);
  await client`INSERT INTO magic_links (email, token_hash, return_path, expires_at, commercial_consent, acquisition)
    VALUES (${normalized}, ${magicLinkHash(token)}, ${returnPath}, ${expiresAt},
      ${Boolean(commercialConsent)}, ${client.json ? client.json(acquisition) : acquisition})`;
  // Limpieza oportunista de enlaces vencidos, sin recorrer la tabla en cada solicitud.
  if (Math.random() < 0.1) {
    await client`DELETE FROM magic_links WHERE expires_at < now() - interval '1 day'`;
  }
  return { status: 'created', token, expiresAt, email: normalized };
}

// Consume el enlace de forma atómica: solo la transición NULL -> now() en
// `consumed_at` devuelve fila. Un token ya usado o caducado no produce fila.
export async function consumeMagicLink(client, { token, now = new Date() }) {
  const tokenHash = magicLinkHash(token);
  const [row] = await client`UPDATE magic_links SET consumed_at = now()
    WHERE token_hash = ${tokenHash} AND consumed_at IS NULL AND expires_at > ${now}
    RETURNING email, return_path, commercial_consent, acquisition`;
  return row ? {
    email: row.email,
    returnPath: safeReturnPath(row.returnPath),
    commercialConsent: Boolean(row.commercialConsent ?? row.commercial_consent),
    acquisition: row.acquisition ?? {},
  } : null;
}

// Busca o crea la cuenta de demostración. Nunca asigna rol privilegiado ni
// estaciones: una cuenta nueva es `viewer`/`free` y sin contacto autorizado.
export async function resolvePasswordlessAccount(client, email) {
  const normalized = normalizeEmail(email);
  const [created] = await client`INSERT INTO subscribers (email, role, plan)
    VALUES (${normalized}, 'viewer', 'free')
    ON CONFLICT (email_normalized) DO NOTHING
    RETURNING id, email, role, plan`;
  if (created) return { status: 'created', subscriber: created };
  // Ya existía (o ganó otra petición concurrente): se relee por la clave
  // normalizada. Un rol privilegiado no obtiene sesión por enlace.
  const [existing] = await client`SELECT id, email, role, plan FROM subscribers
    WHERE email_normalized = ${normalized}`;
  if (!existing) throw new Error('magic_link_account_conflict');
  if (existing.role !== 'viewer') return { status: 'privileged', subscriber: existing };
  return { status: 'existing', subscriber: existing };
}
