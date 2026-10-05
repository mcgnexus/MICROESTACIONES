import { sql } from './db.js';

// Communication outages are operational alerts for administrators only.
export function isCommunicationAlert(alert) {
  const metric = alert?.ruleSnapshot?.metric ?? alert?.rule_snapshot?.metric;
  const message = String(alert?.message ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return metric === 'connectivity' || /comunicacion|conectividad|sin conexion/.test(message);
}

export function canViewAlert(role, alert) {
  return role === 'admin' || !isCommunicationAlert(alert);
}

// SQL equivalent, so restricted alerts are excluded before pagination/counts.
export const NON_COMMUNICATION_ALERT = sql`(
  COALESCE(a.rule_snapshot->>'metric', '') <> 'connectivity'
  AND lower(translate(COALESCE(a.message, ''), 'óÓ', 'oO')) NOT LIKE '%comunicacion%'
  AND lower(translate(COALESCE(a.message, ''), 'óÓ', 'oO')) NOT LIKE '%conectividad%'
  AND lower(translate(COALESCE(a.message, ''), 'óÓ', 'oO')) NOT LIKE '%sin conexion%'
)`;
