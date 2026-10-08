// Retención de datos: los leads que no avanzaron se eliminan pasado el plazo y
// la cola de entrega se limpia. Los leads convertidos (cliente/piloto activo) y
// las mediciones no se tocan aquí.
import { sql } from './db.js';
import { revokeCommercialConsent } from './consent.js';

export const LEAD_RETENTION_DAYS = Math.max(1, Number(process.env.LEAD_RETENTION_DAYS || 730));
export const OUTBOX_RETENTION_DAYS = Math.max(1, Number(process.env.OUTBOX_RETENTION_DAYS || 90));
export const AEMET_OBSERVATION_RETENTION_DAYS = Math.max(1, Number(process.env.AEMET_OBSERVATION_RETENTION_DAYS || 90));

const MAGIC_LINK_RETENTION_DAYS = 1;

export async function runRetention(client = sql, { now = new Date() } = {}) {
  const leadCutoff = new Date(now.getTime() - LEAD_RETENTION_DAYS * 86400000);
  const outboxCutoff = new Date(now.getTime() - OUTBOX_RETENTION_DAYS * 86400000);
  const magicCutoff = new Date(now.getTime() - MAGIC_LINK_RETENTION_DAYS * 86400000);
  const metricCutoff = new Date(now.getTime() - 400 * 86400000);
  const metrics = await client`DELETE FROM metric_daily WHERE day < ${metricCutoff}::date RETURNING day`;
  // La fecha de retención de una cuenta afecta a su seguimiento comercial;
  // el acceso contratado no se elimina al vencer este plazo.
  const expiredAccounts = await client`SELECT subscriber_id FROM prospect_tracking
    WHERE subscriber_id IS NOT NULL AND retain_until <= ${now}`;
  for (const row of expiredAccounts) {
    await client.begin(async (tx) => {
      for (const channel of ['email', 'whatsapp']) await revokeCommercialConsent(tx, {
        subscriberId: row.subscriberId, channel, source: 'admin',
      });
      await tx`UPDATE prospect_tracking SET status = 'archivado', notes = NULL, next_action = NULL,
        next_action_at = NULL, installation_interest = false, retain_until = NULL
        WHERE subscriber_id = ${row.subscriberId}`;
    });
  }
  const leads = await client.begin(async (tx) => {
    const candidates = await tx`SELECT id FROM farm_leads
    WHERE (EXISTS (SELECT 1 FROM prospect_tracking t WHERE t.lead_id = farm_leads.id AND t.retain_until <= ${now})
      OR (created_at < ${leadCutoff} AND status IN ('nuevo','contactado','interesado','descartado')
        AND NOT EXISTS (SELECT 1 FROM prospect_tracking t WHERE t.lead_id = farm_leads.id AND t.retain_until > ${now})))
    FOR UPDATE`;
    for (const row of candidates) {
      await tx`DELETE FROM notification_outbox WHERE lead_id = ${row.id}`;
      await tx`DELETE FROM audit_logs WHERE target_type IN ('farm_lead','lead') AND target_id = ${String(row.id)}`;
      await tx`DELETE FROM farm_leads WHERE id = ${row.id}`;
    }
    return candidates;
  });
  const outbox = await client`DELETE FROM notification_outbox
    WHERE created_at < ${outboxCutoff} AND status IN ('sent','failed','manual','cancelled')
    RETURNING id`;
  const magic = await client`DELETE FROM magic_links WHERE created_at < ${magicCutoff} RETURNING id`;
  const aemetCutoff = new Date(now.getTime() - AEMET_OBSERVATION_RETENTION_DAYS * 86400000);
  const aemet = await client`DELETE FROM aemet_observations WHERE observed_at < ${aemetCutoff} RETURNING id`;
  return {
    leadsDeleted: leads.length,
    metricBucketsDeleted: metrics.length,
    commercialAccountsArchived: expiredAccounts.length,
    outboxDeleted: outbox.length,
    magicLinksDeleted: magic.length,
    aemetObservationsDeleted: aemet.length,
    leadCutoff,
    outboxCutoff,
  };
}
