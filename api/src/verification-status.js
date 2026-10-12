// Estado real de un código de verificación de contacto.
//
// El encolado no es el envío, y el envío no es la entrega: el proveedor acepta
// (`sent`) y solo el webhook confirma que llegó (`delivered`). Este módulo
// traduce esa realidad —la fila de `contact_verifications` unida a su mensaje en
// `notification_outbox`— a un estado acotado que el cliente puede mostrar, sin
// exponer nunca el código ni datos de otros contactos.
import { emailDeliveryReady } from './email.js';
import { whatsappProvider } from './whatsapp.js';
import { isProduction } from './env.js';

// Estados visibles. `sin_codigo` es «todavía no se ha pedido nada»; `manual` es
// el modo piloto de WhatsApp, donde el código queda pendiente de envío humano.
export const VERIFICATION_STATES = [
  'sin_codigo', 'queued', 'manual', 'sent', 'delivered', 'failed', 'expired', 'verified',
];

function isExpired(expiresAt, now) {
  if (!expiresAt) return false;
  const at = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  return !Number.isNaN(at.getTime()) && at.getTime() <= now.getTime();
}

// Deriva el estado de la verificación más reciente de un contacto. Entrada:
// `{ id, status, consumedAt, expiresAt, verifiedAt }` (la fila ya unida).
export function verificationState(row = {}, now = new Date()) {
  if (!row || row.id == null) return 'sin_codigo';
  // Contacto ya verificado: el código se consumió al confirmar.
  if (row.verifiedAt && row.consumedAt) return 'verified';
  // Verificación consumida sin verificar: la sustituyó otra más reciente.
  if (row.consumedAt && !row.verifiedAt) return 'expired';

  const status = row.status || null;
  if (status === 'delivered') return 'delivered';
  if (status === 'sent') return 'sent';
  if (status === 'failed') return 'failed';
  if (status === 'cancelled') return 'expired';
  if (status === 'expired') return 'expired';
  // pending/sending/manual: si el código ya caducó, no se presenta como vivo.
  if (isExpired(row.expiresAt, now)) return 'expired';
  if (status === 'manual') return 'manual';
  return 'queued';
}

// ¿Se puede entregar un código por este canal ahora mismo? WhatsApp solo lo
// bloquea `disabled`; `manual` deja el código pendiente de envío humano y
// `console` cuenta solo fuera de producción (para desarrollo, no para demostrar
// entrega real). El correo depende de que haya proveedor configurado.
export function channelAvailable(channel, env = process.env) {
  if (channel === 'email') return emailDeliveryReady(env);
  if (channel === 'whatsapp') {
    const provider = whatsappProvider(env);
    if (provider === 'disabled') return false;
    if (provider === 'console') return !isProduction(env);
    return true;
  }
  return false;
}

// Disponibilidad por canal para la respuesta de `/me`: el cliente decide con
// ella si ofrece o no el botón de verificar.
export function channelAvailability(env = process.env) {
  return {
    email: channelAvailable('email', env),
    whatsapp: channelAvailable('whatsapp', env),
  };
}
