// Diagnóstico de la cola y del planificador para la comprobación en producción.
//
// Reúne en un solo módulo lo que exponen `/api/v1/maintenance/status` (para el
// disparador externo) y `GET /api/v1/admin/maintenance/limits` (para el panel):
// estado de la cola con su antigüedad y errores recientes, latido del
// planificador por origen y disponibilidad del aviso al administrador. Es de
// solo lectura: un endpoint de diagnóstico no envía nada.
import { sql } from './db.js';
import { emailDeliveryReady } from './email.js';
import { heartbeatConfig } from './scheduler.js';

const RECENT_ERROR_LIMIT = 10;
const ACTIONABLE_STATES = ['pending', 'manual', 'sending'];

// Cola de entrega: recuento por estado, pendientes accionables con su antigüedad,
// aviso de bloqueo y una lista corta de errores recientes.
export async function outboxSnapshot({ client = sql, env = process.env, now = new Date() } = {}) {
  const rows = await client`SELECT status, count(*)::integer AS n, min(created_at) AS oldest
    FROM notification_outbox GROUP BY status`;
  const counts = Object.fromEntries(rows.map((row) => [row.status, row.n]));
  const actionable = rows.filter((row) => ACTIONABLE_STATES.includes(row.status));
  const oldest = actionable.map((row) => row.oldest).filter(Boolean)
    .sort((a, b) => new Date(a) - new Date(b))[0] ?? null;
  const recent = await client`SELECT id::text AS id, kind, channel, last_error, provider_detail, created_at
    FROM notification_outbox
    WHERE status IN ('failed', 'manual')
    ORDER BY updated_at DESC LIMIT ${RECENT_ERROR_LIMIT}`;

  const { blockedAfterS } = heartbeatConfig(env);
  const oldestActionableSeconds = oldest ? Math.round((now - new Date(oldest)) / 1000) : 0;
  return {
    counts,
    failed: counts.failed ?? 0,
    expired: counts.expired ?? 0,
    actionable: actionable.reduce((sum, row) => sum + row.n, 0),
    oldestActionableAt: oldest,
    oldestActionableSeconds,
    // Un pendiente accionable demasiado viejo apunta a un disparador caído o a
    // una cola bloqueada; es un aviso de diagnóstico, no un límite duro.
    blocked: oldestActionableSeconds > blockedAfterS,
    blockedAfterS,
    recentErrors: recent.map((row) => ({
      id: row.id,
      kind: row.kind,
      channel: row.channel,
      lastError: row.lastError ?? null,
      providerDetail: row.providerDetail ?? null,
      createdAt: row.createdAt,
      ageSeconds: Math.round((now - new Date(row.createdAt)) / 1000),
    })),
  };
}

// Latido por origen: cuándo corrió cada disparador por última vez y si está
// obsoleto respecto a la cadencia esperada.
export async function heartbeatSnapshot({ client = sql, env = process.env, now = new Date() } = {}) {
  const { expectedIntervalS, staleAfterS } = heartbeatConfig(env);
  // Tolerante a que la tabla aún no exista (antes de aplicar la migración): el
  // diagnóstico no debe romper el estado por un despliegue a medias.
  let rows = [];
  try {
    rows = await client`SELECT source, last_run_at, duration_ms, result FROM scheduler_heartbeat`;
  } catch {
    rows = [];
  }
  const sources = {};
  for (const row of rows) {
    const ageSeconds = Math.round((now - new Date(row.lastRunAt)) / 1000);
    sources[row.source] = {
      lastRunAt: row.lastRunAt,
      ageSeconds,
      durationMs: row.durationMs ?? null,
      stale: ageSeconds > staleAfterS,
    };
  }
  return { expectedIntervalS, staleAfterS, sources };
}

// Aviso interno al administrador: si hay destinatarios y si el correo puede
// entregar. Devuelve recuentos, nunca direcciones.
export async function adminNoticeSnapshot({ client = sql, env = process.env } = {}) {
  const [row] = await client`SELECT count(*)::integer AS n
    FROM subscribers WHERE role = 'admin' AND active = true`;
  const recipients = row.n + (env.ADMIN_NOTICE_EMAIL ? 1 : 0);
  return { configured: recipients > 0, emailReady: emailDeliveryReady(env), recipients };
}
