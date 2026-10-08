import { Router } from 'express';
import { z } from 'zod';
import { sql } from './db.js';
import { consumeLoginAttempt } from './login-rate-limit.js';
import { sha256 } from './security.js';
import { csrfGuard, requireSubscriber } from './auth.js';
import { campaignBucket, METRIC_EVENTS, PUBLIC_METRIC_EVENTS, aggregateMetrics } from './analytics-policy.js';
export const campaigns = (process.env.ANALYTICS_CAMPAIGNS || '').split(',').map((s) => s.trim().toLowerCase())
  .filter((s) => /^[a-z][a-z_-]{0,39}$/.test(s)).slice(0, 30);

export async function countMetric(client, event, acquisition = {}) {
  if (!METRIC_EVENTS.includes(event)) throw new Error('invalid_metric_event');
  const bucket = campaignBucket(acquisition, campaigns);
  await client`INSERT INTO metric_daily (day, event, bucket, count)
    VALUES (current_date, ${event}, ${bucket}, 1)
    ON CONFLICT (day, event, bucket) DO UPDATE SET count = metric_daily.count + 1`;
}
// Una única sentencia deduplica el hito y actualiza su agregado de forma atómica.
// Los identificadores solo permanecen como marcadores operativos de deduplicación,
// con borrado en cascada. El contador analítico no contiene sujetos ni direcciones.
export async function markMetric(client, event, { subscriberId = null, leadId = null, acquisition = null } = {}) {
  if (!METRIC_EVENTS.includes(event) || (!subscriberId && !leadId)) throw new Error('invalid_metric_subject');
  if (!acquisition) {
    const [row] = subscriberId
      ? await client`SELECT acquisition, role FROM subscribers WHERE id = ${subscriberId}`
      : await client`SELECT campaign AS acquisition FROM farm_leads WHERE id = ${leadId}`;
    if (!row || (subscriberId && row.role !== 'viewer')) return;
    acquisition = row?.acquisition || {};
  }
  const bucket = campaignBucket(acquisition, campaigns);
  await client`WITH first_event AS (
    INSERT INTO metric_milestones (subscriber_id, lead_id, event)
    VALUES (${subscriberId}, ${leadId}, ${event}) ON CONFLICT DO NOTHING RETURNING id
  ) INSERT INTO metric_daily (day, event, bucket, count)
    SELECT current_date, ${event}, ${bucket}, 1 FROM first_event WHERE true
    ON CONFLICT (day, event, bucket) DO UPDATE SET count = metric_daily.count + 1`;
}
export function metricFailure(error) { console.error('No se pudo actualizar la métrica agregada:', error.code || 'metric_error'); }

const router = Router();
router.get('/config', (_req, res) => res.set('Cache-Control', 'no-store').json({ campaigns }));
const campaignInput = z.object({ source: z.string().max(80).optional(), medium: z.string().max(80).optional(), campaign: z.string().max(80).optional() }).strict();
router.post('/events', csrfGuard, async (req, res) => {
  const parsed = z.object({ event: z.enum(PUBLIC_METRIC_EVENTS), consent: z.literal(true), campaign: campaignInput.optional() }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_metric' });
  if (await consumeLoginAttempt(sql, [sha256(`metric-rate:${req.ip || req.socket.remoteAddress}`)], 60)) return res.status(429).json({ error: 'too_many_requests' });
  // Sin IP, agente, cookie, identificador de visitante, URL ni referrer almacenados.
  await countMetric(sql, parsed.data.event, parsed.data.campaign);
  res.status(204).end();
});
router.post('/activation', requireSubscriber, csrfGuard, async (req, res) => {
  if (req.subscriber.role !== 'viewer') return res.status(204).end();
  const parsed = z.object({ tool: z.enum(['panel', 'estaciones', 'avisos']) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_tool' });
  await markMetric(sql, 'first_expanded_query', { subscriberId: req.subscriber.id });
  res.status(204).end();
});
export default router;

export async function analyticsReport(req, res) {
  const schema = z.object({ from: z.iso.date(), to: z.iso.date() }).strict();
  const parsed = schema.safeParse(req.query);
  if (!parsed.success || parsed.data.from > parsed.data.to
    || new Date(parsed.data.to) - new Date(parsed.data.from) > 366 * 86400000) return res.status(400).json({ error: 'invalid_period' });
  const { from, to } = parsed.data;
  const counters = await sql`SELECT event, bucket, sum(count)::integer AS count FROM metric_daily
    WHERE day BETWEEN ${from}::date AND ${to}::date GROUP BY event, bucket`;
  // Cohorte real de cuentas: el embudo no infiere que una visita anónima y un
  // registro son la misma persona. Solo se devuelven agregados al administrador.
  const subjects = await sql`SELECT s.acquisition, (s.email_verified_at IS NOT NULL
      OR EXISTS (SELECT 1 FROM subscriber_contacts c WHERE c.subscriber_id = s.id AND c.verified_at IS NOT NULL)) AS verified,
      (p.activity IN ('agricultura','ganaderia','mixta') AND length(trim(p.municipality)) > 0
        AND length(trim(p.crop_or_livestock)) > 0 AND p.interest IS NOT NULL) AS agricultural,
      EXISTS (SELECT 1 FROM metric_milestones m WHERE m.subscriber_id = s.id AND event = 'first_expanded_query') AS activated,
      EXISTS (SELECT 1 FROM prospect_tracking t WHERE t.subscriber_id = s.id AND t.installation_interest = true)
        OR p.interest = 'futura_instalacion' AS installation,
      EXISTS (SELECT 1 FROM (SELECT DISTINCT ON (channel) action FROM consent_records c
        WHERE c.subscriber_id = s.id AND purpose = 'commercial' ORDER BY channel, recorded_at DESC, id DESC) c WHERE action = 'granted') AS authorized
    FROM subscribers s LEFT JOIN subscriber_profiles p ON p.subscriber_id = s.id
    WHERE s.role = 'viewer' AND s.created_at >= ${from}::date AND s.created_at < ${to}::date + interval '1 day'`;
  res.set('Cache-Control', 'no-store').json({ from, to, ...aggregateMetrics(counters, subjects, campaigns),
    definitions: { visits: 'Aperturas consentidas por carga de página; no visitantes únicos. Muestra parcial, no comparable como conversión personal.',
      events: 'Hitos nuevos desde la puesta en servicio; primera ocurrencia por cuenta o solicitud salvo visitas y solicitudes de enlace.',
      cohort: 'Cuentas viewer creadas en el período. Estado actual del perfil, verificación e intención; incluye cuentas anteriores al inicio de medición.',
      denominator: 'Cada porcentaje de cohorte divide entre cuentas registradas del mismo canal y período. No es un embudo secuencial.',
      attribution: 'Primer origen conservado de la cuenta. Solo source/medium/campaign del catálogo; desconocidos agrupados. No se atribuye a la última visita.' } });
}
