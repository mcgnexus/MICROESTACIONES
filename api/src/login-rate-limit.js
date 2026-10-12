import { sha256 } from './security.js';

export const loginLimitReached = (attempts, maxAttempts = 10) => attempts > maxAttempts;

// Ventana fija compartida por todos los contadores de la tabla. Es la misma que
// usan el acceso y los códigos de contacto, para no multiplicar relojes.
export const RATE_LIMIT_WINDOW_MINUTES = 15;
export const RATE_LIMIT_WINDOW_MS = RATE_LIMIT_WINDOW_MINUTES * 60 * 1000;

export function loginRateLimitKeys(ip, email) {
  return [
    sha256(`ip:${String(ip || 'unknown').slice(0, 200)}`),
    sha256(`email:${String(email).trim().toLowerCase()}`),
  ];
}

// Counters live in PostgreSQL so Vercel instances and cold starts share them.
// Devuelve el estado del contador (intentos, si superó el tope y cuándo se
// reinicia la ventana) para poder responder con `retryAt`.
export async function consumeAttempt(client, key, maxAttempts = 10) {
  const [row] = await client`
    INSERT INTO login_rate_limits (limiter_key, attempts, window_started_at, updated_at)
      VALUES (${key}, 1, now(), now())
    ON CONFLICT (limiter_key) DO UPDATE SET
      attempts = CASE
        WHEN login_rate_limits.window_started_at <= now() - interval '15 minutes' THEN 1
        ELSE login_rate_limits.attempts + 1
      END,
      window_started_at = CASE
        WHEN login_rate_limits.window_started_at <= now() - interval '15 minutes' THEN now()
        ELSE login_rate_limits.window_started_at
      END,
      updated_at = now()
    RETURNING attempts, window_started_at`;

  // Low-frequency cleanup bounds the table without adding a request-path scan.
  if (Math.random() < 1 / 64) {
    await client`DELETE FROM login_rate_limits WHERE updated_at < now() - interval '1 day'`;
  }

  const windowStartedAt = new Date(row.windowStartedAt ?? row.window_started_at);
  return {
    attempts: row.attempts,
    limited: loginLimitReached(row.attempts, maxAttempts),
    retryAt: new Date(windowStartedAt.getTime() + RATE_LIMIT_WINDOW_MS),
  };
}

export async function consumeLoginAttempt(client, keys, maxAttempts = 10) {
  const results = await Promise.all(keys.map((key) => consumeAttempt(client, key, maxAttempts)));
  return results.some((result) => result.limited);
}

export async function clearLoginAttempts(client, keys) {
  await client`DELETE FROM login_rate_limits WHERE limiter_key = ANY(${keys})`;
}
