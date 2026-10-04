import { sql } from './db.js';

// Trazabilidad de cambios sensibles. `tx` permite reutilizar la transacción activa.
export async function audit(tx, req, action, targetType, targetId, before, after) {
  const client = tx || sql;
  await client`INSERT INTO audit_logs (actor_id, action, target_type, target_id, before_json, after_json, ip_address, user_agent)
    VALUES (${req.subscriber?.id ?? null}, ${action}, ${targetType ?? null}, ${targetId ?? null},
      ${before == null ? null : client.json(before)}, ${after == null ? null : client.json(after)},
      ${req.ip || null}, ${String(req.get('user-agent') || '').slice(0, 300) || null})`;
}
