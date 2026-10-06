// Retención de datos: los leads que no avanzaron se eliminan pasado el plazo y
// la cola de entrega se limpia. Los leads convertidos (cliente/piloto activo) y
// las mediciones no se tocan aquí.
import { sql } from './db.js';

export const LEAD_RETENTION_DAYS = Math.max(1, Number(process.env.LEAD_RETENTION_DAYS || 730));
export const OUTBOX_RETENTION_DAYS = Math.max(1, Number(process.env.OUTBOX_RETENTION_DAYS || 90));

export async function runRetention(client = sql, { now = new Date() } = {}) {
  const leadCutoff = new Date(now.getTime() - LEAD_RETENTION_DAYS * 86400000);
  const outboxCutoff = new Date(now.getTime() - OUTBOX_RETENTION_DAYS * 86400000);
  const leads = await client`DELETE FROM farm_leads
    WHERE created_at < ${leadCutoff} AND status IN ('nuevo','contactado','interesado','descartado')
    RETURNING id`;
  const outbox = await client`DELETE FROM notification_outbox
    WHERE created_at < ${outboxCutoff} AND status IN ('sent','failed','manual')
    RETURNING id`;
  return {
    leadsDeleted: leads.length,
    outboxDeleted: outbox.length,
    leadCutoff,
    outboxCutoff,
  };
}
