import { sha256 } from './security.js';

export const loginLimitReached = (attempts, maxAttempts = 10) => attempts > maxAttempts;

export function loginRateLimitKeys(ip, email) {
  return [
    sha256(`ip:${String(ip || 'unknown').slice(0, 200)}`),
    sha256(`email:${String(email).trim().toLowerCase()}`),
  ];
}

// Counters live in PostgreSQL so Vercel instances and cold starts share them.
export async function consumeLoginAttempt(client, keys, maxAttempts = 10) {
  const rows = await Promise.all(keys.map((key) => client`
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
    RETURNING attempts`));

  // Low-frequency cleanup bounds the table without adding a request-path scan.
  if (Math.random() < 1 / 64) {
    await client`DELETE FROM login_rate_limits WHERE updated_at < now() - interval '1 day'`;
  }
  return rows.some(([row]) => loginLimitReached(row.attempts, maxAttempts));
}

export async function clearLoginAttempts(client, keys) {
  await client`DELETE FROM login_rate_limits WHERE limiter_key = ANY(${keys})`;
}
