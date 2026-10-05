// Motor de avisos verificable.
//
// Una regla no dispara por una sola medida: exige que la condición se sostenga
// (min_duration_s), evita el baile alrededor del umbral (recovery_margin para
// recuperar) y solo mantiene un aviso abierto por regla. Los detectores de
// sistema (sin comunicación, batería baja) son reglas sembradas y se evalúan
// con el mismo motor, pero en la pasada periódica del servidor.

import { sql } from './db.js';

export const METRIC_KEYS = {
  temperature: 'temp_c',
  humidity: 'hum_pct',
  pressure: 'press_pa',
  battery: 'batt_mv',
  lux: 'lux',
};

const COMPARATORS = {
  gt: (value, threshold) => value > threshold,
  gte: (value, threshold) => value >= threshold,
  lt: (value, threshold) => value < threshold,
  lte: (value, threshold) => value <= threshold,
};

// Recuperación con margen: el aviso NO se cierra hasta que la medida ha vuelto
// al lado seguro del umbral con holgura (evita el baile por valores limiteres).
// Al rearmar, vuelve a exigir el umbral simple: margen 2 y umbral 30 mantienen
// la alarma mientras la medida siga por encima de 28.
const RECOVERY = {
  gt: (value, threshold, margin) => value > threshold - margin,
  gte: (value, threshold, margin) => value >= threshold - margin,
  lt: (value, threshold, margin) => value < threshold + margin,
  lte: (value, threshold, margin) => value <= threshold + margin,
};

export const hits = (comparator, value, threshold) => COMPARATORS[comparator](value, threshold);
export const recoveryHit = (comparator, value, threshold, margin) =>
  RECOVERY[comparator](value, threshold, Number(margin) || 0);

// Máquina de estados de una regla frente a una muestra.
// Devuelve: idle | pending | open | hold | recover
export function evaluateRule(rule, sample) {
  const { value, at } = sample;
  const moment = at instanceof Date ? at : new Date(at);
  if (value == null || !Number.isFinite(Number(value))) return { action: 'idle', at: moment };
  const measured = Number(value);
  const threshold = Number(rule.threshold);
  const margin = Number(rule.recoveryMargin ?? 0) || 0;
  const minDuration = Number(rule.minDurationS ?? 0) || 0;

  if (rule.activeAlertOpen) {
    if (recoveryHit(rule.comparator, measured, threshold, margin)) {
      return { action: 'hold', at: moment, value: measured, alertId: rule.activeAlertId };
    }
    return { action: 'recover', at: moment, value: measured, alertId: rule.activeAlertId };
  }

  if (!hits(rule.comparator, measured, threshold)) return { action: 'idle', at: moment, value: measured };

  // Sin duración mínima, la primera medida que incumple ya abre el aviso.
  if (!rule.conditionActive) {
    if (minDuration <= 0) return { action: 'open', at: moment, value: measured, conditionSince: moment, elapsed: 0 };
    return { action: 'start', at: moment, value: measured, conditionSince: moment };
  }
  const since = rule.conditionSince ? new Date(rule.conditionSince) : moment;
  const elapsed = (moment.getTime() - since.getTime()) / 1000;
  if (elapsed >= minDuration) return { action: 'open', at: moment, value: measured, conditionSince: since, elapsed };
  return { action: 'pending', at: moment, value: measured, conditionSince: since, elapsed };
}

export const severityFor = (value, config) => {
  const critical = Number(config?.battery_critical_mv ?? 3200);
  return Number(value) <= critical ? 1 : 2;
};

// Antigüedad de la medida que originó el aviso y retraso de la entrega.
export function alertAge(row, now = new Date()) {
  const reference = now instanceof Date ? now : new Date(now);
  const observed = row.observedAt ? new Date(row.observedAt) : null;
  const created = row.createdAt ? new Date(row.createdAt) : null;
  return {
    ageSeconds: observed ? Math.max(0, Math.round((reference.getTime() - observed.getTime()) / 1000)) : null,
    ingestDelaySeconds: observed && created
      ? Math.max(0, Math.round((created.getTime() - observed.getTime()) / 1000)) : null,
  };
}

// ---- Detectores de sistema -------------------------------------------------
// Umbrales sembrados por estación. El de batería sigue la configuración vigente.
export const SYSTEM_RULES = [
  {
    metric: 'connectivity', comparator: 'gt', threshold: 1800, level: 1,
    minDurationS: 0, recoveryMargin: 60, message: 'Estación sin comunicación',
  },
  {
    metric: 'battery', comparator: 'lt', threshold: 3400, level: 2,
    minDurationS: 0, recoveryMargin: 100, message: 'Batería por debajo del umbral configurado',
  },
];

export async function ensureSystemRules(client, deviceId) {
  for (const rule of SYSTEM_RULES) {
    await client`INSERT INTO alert_rules
      (device_id, metric, comparator, threshold, level, message, channel, enabled, system,
       min_duration_s, recovery_margin, recipient)
      VALUES (${deviceId}, ${rule.metric}, ${rule.comparator}, ${rule.threshold}, ${rule.level},
        ${rule.message}, 'in_app', true, true, ${rule.minDurationS}, ${rule.recoveryMargin}, null)
      ON CONFLICT (device_id, metric, comparator, threshold) DO NOTHING`;
  }
}

// ---- Reglas de medición (se evalúan al recibir un lote) -------------------
// Traduce la fila de alert_rules a la forma que usa el motor.
// El cliente devuelve las columnas en camelCase, así que se leen en camelCase
// (con alternativa por si la consulta viniera sin transform). Sin esta
// conversión, minDurationS y recoveryMargin quedarían undefined y TODAS las
// reglas se evaluarían como inmediatas y sin histéresis.
export function ruleFromRow(row) {
  const pick = (camel, snake, fallback = null) => row[camel] ?? row[snake] ?? fallback;
  return {
    id: pick('id', 'id'),
    deviceId: pick('deviceId', 'device_id'),
    metric: pick('metric', 'metric'),
    comparator: pick('comparator', 'comparator'),
    threshold: Number(pick('threshold', 'threshold', 0)),
    level: Number(pick('level', 'level', 2)),
    message: pick('message', 'message'),
    recipient: pick('recipient', 'recipient'),
    channel: pick('channel', 'channel', 'in_app'),
    enabled: pick('enabled', 'enabled', true),
    urgent: !!pick('urgent', 'urgent', false),
    system: !!pick('system', 'system', false),
    minDurationS: Number(pick('minDurationS', 'min_duration_s', 0)),
    recoveryMargin: Number(pick('recoveryMargin', 'recovery_margin', 0)),
    conditionActive: !!pick('conditionActive', 'condition_active', false),
    conditionSince: pick('conditionSince', 'condition_since'),
    activeAlertId: pick('activeAlertId', 'active_alert_id'),
    activeAlertOpen: !!pick('activeAlertId', 'active_alert_id', false),
  };
}

const loadRules = async (client, deviceId) => {
  const rows = await client`SELECT * FROM alert_rules
    WHERE device_id = ${deviceId} AND enabled AND NOT system`;
  return rows.map(ruleFromRow);
};

// Traduce la fila de la regla al motor y devuelve el plan de acciones.
export function planForRules(rules, { values, at }) {
  const plan = [];
  for (const rule of rules) {
    const key = METRIC_KEYS[rule.metric];
    const outcome = evaluateRule(rule, {
      value: key ? values[key] : null,
      at,
    });
    plan.push({ rule, outcome });
  }
  return plan;
}

async function openAlert(tx, { deviceId, measurementId, rule, value, at, config, conditionSince }) {
  const level = rule.metric === 'battery' ? severityFor(value, config) : Number(rule.level);
  const message = rule.metric === 'battery' && level === 1
    ? `${rule.message} (crítica)`
    : rule.message;
  // Clave estable por condición: dos pasadas con la misma condición no crean dos avisos.
  const onset = new Date(conditionSince ?? at).getTime();
  const dedupeKey = `rule:${rule.id}:${onset}`;
  const snapshot = {
    metric: rule.metric, comparator: rule.comparator, threshold: Number(rule.threshold),
    value, margin: rule.recoveryMargin, min_duration_s: rule.minDurationS,
    urgent: !!rule.urgent, condition_since: new Date(conditionSince ?? at).toISOString(),
  };
  const isInstant = rule.channel === 'in_app';
  const [alert] = await tx`INSERT INTO alerts
    (device_id, measurement_id, dedupe_key, level, message, value, source, observed_at,
     rule_id, rule_snapshot, recipient, channel, delivery_status, delivered_at, auto_resolved)
    VALUES (${deviceId}, ${measurementId}, ${dedupeKey}, ${level}, ${message}, ${tx.json({ value })},
      'station_measurement', ${at}, ${rule.id}, ${tx.json(snapshot)}, ${rule.recipient ?? null},
      ${rule.channel}, ${isInstant ? 'delivered' : 'pending'}, ${isInstant ? new Date() : null}, false)
    ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`;
  if (alert) return alert;
  // La condición ya tenía aviso (pasada duplicada): se reutiliza su identificador.
  const [existing] = await tx`SELECT id FROM alerts WHERE dedupe_key = ${dedupeKey}`;
  return existing ?? null;
}

// Evalúa el lote recibido. Devuelve los avisos que se han abierto para poder
// dejar constancia y, si eran urgentes, pedir un envío inmediato.
export async function evaluateMeasurementRules(tx, { deviceId, measurementId, values, at, config }) {
  const rules = await loadRules(tx, deviceId);
  const plan = planForRules(rules, { values, at });
  const opened = [];
  const recovered = [];

  for (const { rule, outcome } of plan) {
    if (outcome.action === 'start') {
      await tx`UPDATE alert_rules SET condition_active = true, condition_since = ${outcome.at} WHERE id = ${rule.id}`;
    } else if (outcome.action === 'pending') {
      await tx`UPDATE alert_rules SET condition_active = true, condition_since = ${outcome.conditionSince} WHERE id = ${rule.id}`;
    } else if (outcome.action === 'idle') {
      if (rule.conditionActive) {
        await tx`UPDATE alert_rules SET condition_active = false, condition_since = NULL WHERE id = ${rule.id}`;
      }
} else if (outcome.action === 'open') {
      const alert = await openAlert(tx, {
        deviceId, measurementId, rule, value: outcome.value, at: outcome.at,
        config, conditionSince: outcome.conditionSince,
      });
      await tx`UPDATE alert_rules SET condition_active = true, condition_since = ${outcome.conditionSince},
          active_alert_id = ${alert?.id ?? null} WHERE id = ${rule.id}`;
      if (alert && rule.urgent) {
        await issueUrgentDirective(tx, { deviceId, ruleId: rule.id, reason: rule.message, batteryMv: values.batt_mv ?? null });
      }
      if (alert) opened.push({ alert, rule });
    } else if (outcome.action === 'hold') {
      // La histéresis mantiene el aviso: no hay nada que hacer.
    } else if (outcome.action === 'recover') {
      if (outcome.alertId) {
        await tx`UPDATE alerts SET closed_at = now(), closed_by = NULL,
            closure_reason = 'recuperación automática', auto_resolved = true
          WHERE id = ${outcome.alertId} AND closed_at IS NULL`;
        recovered.push(Number(outcome.alertId));
      }
      await tx`UPDATE alert_rules SET condition_active = false, condition_since = NULL,
          active_alert_id = NULL WHERE id = ${rule.id}`;
    }
  }
  return { opened, recovered };
}

const messageOf = (rule) => rule.message ?? 'Condición crítica';

// ---- Alerta urgente: el equipo debe intentarlo en este despertar ----------
export async function issueUrgentDirective(tx, { deviceId, ruleId, reason, batteryMv }) {
  const [existing] = await tx`SELECT id FROM urgent_directives
    WHERE device_id = ${deviceId} AND released_at IS NULL LIMIT 1`;
  if (existing) return existing.id;
  const [row] = await tx`INSERT INTO urgent_directives (device_id, rule_id, reason, battery_mv_before)
    VALUES (${deviceId}, ${ruleId ?? null}, ${reason}, ${batteryMv ?? null}) RETURNING id`;
  return row.id;
}

// Al llegar el siguiente envío, la directiva queda liberada: ya se ha dado la
// oportunidad de subir la medida crítica antes de tiempo. Solo se liberan las que
// were pendientes ANTES de este envío (una creada ahora es para el siguiente).
// Ids de las directiva pendientes al empezar un envío. Se capturan ANTES de
// evaluar el lote porque las que se creen ahora son para el siguiente despertar;
// comparar marcas de tiempo entre aplicación y base de datos no es fiable.
export async function pendingDirectiveIds(client, deviceId) {
  const rows = await client`SELECT id FROM urgent_directives
    WHERE device_id = ${deviceId} AND released_at IS NULL`;
  return rows.map((row) => row.id);
}

export async function releaseDirectives(client, deviceId, { batteryMv = null, ids = null } = {}) {
  // ids = [] significa "no había ninguna pendiente": no se libera nada.
  const released = ids
    ? await client`UPDATE urgent_directives SET released_at = now(), battery_mv_after = ${batteryMv ?? null}
        WHERE device_id = ${deviceId} AND released_at IS NULL AND id = ANY(${ids})
        RETURNING id`
    : await client`UPDATE urgent_directives SET released_at = now(), battery_mv_after = ${batteryMv ?? null}
        WHERE device_id = ${deviceId} AND released_at IS NULL RETURNING id`;
  return released.length;
}

// ---- Pasada periódica: detectores de sistema -------------------------------
// Sin communication: se mide el silencio del equipo contra el umbral sembrado.
// Batería: se usa la última medida validada y el umbral de la configuración.
export async function evaluateSystemRules(now = new Date()) {
  const devices = await sql`SELECT d.id, d.name, c.config, s.last_contact, s.battery_mv, s.battery_level
    FROM devices d
    LEFT JOIN device_configs c ON c.device_id = d.id
    LEFT JOIN device_status s ON s.device_id = d.id
    WHERE d.active = true`;
  const outcomes = [];

  for (const device of devices) {
    const config = device.config ?? {};
    const [latest] = await sql`SELECT battery_mv, observed_at FROM measurements
      WHERE device_id = ${device.id} AND is_validated AND deleted_at IS NULL
      ORDER BY observed_at DESC LIMIT 1`;
    const [lowRule] = await sql`SELECT * FROM alert_rules
      WHERE device_id = ${device.id} AND system AND metric = 'battery'`;
    const [netRule] = await sql`SELECT * FROM alert_rules
      WHERE device_id = ${device.id} AND system AND metric = 'connectivity'`;

    // Sin comunicación: el valor es el silencio acumulado en segundos.
    if (netRule) {
      const silence = device.lastContact ? Math.round((now - new Date(device.lastContact)) / 1000) : null;
      outcomes.push(...await applySystemRule(netRule, {
        deviceId: device.id, name: device.name, value: silence, at: now, config,
      }));
    }
// Batería: la última medida válida, con el umbral configurado.
    if (lowRule) {
      const value = latest?.batteryMv ?? device.batteryMv ?? null;
      const threshold = Number(config.battery_low_mv ?? lowRule.threshold);
      outcomes.push(...await applySystemRule(lowRule, {
        deviceId: device.id, name: device.name, value, at: now, config, threshold,
      }));
    }
  }
  return outcomes;
}

async function applySystemRule(row, { deviceId, value, at, config, threshold }) {
  const rule = ruleFromRow(row);
  if (threshold != null) rule.threshold = Number(threshold);
  const outcome = evaluateRule(rule, { value, at });
  const client = sql;
  const changes = [];
  if (outcome.action === 'start' || outcome.action === 'pending') {
    await client`UPDATE alert_rules SET condition_active = true, condition_since = ${outcome.at} WHERE id = ${rule.id}`;
    changes.push(outcome.action);
  } else if (outcome.action === 'idle' && rule.conditionActive) {
    await client`UPDATE alert_rules SET condition_active = false, condition_since = NULL WHERE id = ${rule.id}`;
  } else if (outcome.action === 'open') {
    const alert = await openAlert(client, {
      deviceId, measurementId: null, rule, value, at, config,
      conditionSince: outcome.conditionSince,
    });
    await client`UPDATE alert_rules SET condition_active = true, condition_since = ${outcome.conditionSince},
        active_alert_id = ${alert?.id ?? null} WHERE id = ${rule.id}`;
    if (alert) changes.push('opened');
  } else if (outcome.action === 'recover') {
    if (outcome.alertId) {
      await client`UPDATE alerts SET closed_at = now(), closed_by = NULL,
          closure_reason = 'recuperación automática', auto_resolved = true
        WHERE id = ${outcome.alertId} AND closed_at IS NULL`;
      changes.push('recovered');
    }
    await client`UPDATE alert_rules SET condition_active = false, condition_since = NULL,
        active_alert_id = NULL WHERE id = ${rule.id}`;
  }
  return changes.map((change) => ({ deviceId, ruleId: rule.id, change }));
}

// ---- Impacto de las alertas urgentes en la batería -------------------------
// Con datos reales de este equipo: cuánto cuesta un envío extraordinario frente
// al gasto normal por el mismo tiempo y cuánto se ahorraría de retraso.
export function batteryImpact({ directives = [], samples = [], syncIntervalS = 1800 }) {
  const readings = (samples || [])
    .filter((sample) => sample.batteryMv != null && sample.observedAt)
    .map((sample) => ({ at: new Date(sample.observedAt), batteryMv: Number(sample.batteryMv) }))
    .sort((a, b) => a.at - b.at);

  const released = directives
    .filter((directive) => directive.releasedAt && directive.batteryMvBefore != null)
    .map((directive) => ({ ...directive, issued: new Date(directive.issuedAt), released: new Date(directive.releasedAt) }));

  // Gasto de referencia: mV por hora entre la primera y la última lectura validada.
  let baselineMvPerHour = null;
  if (readings.length >= 2) {
    const spanHours = (readings.at(-1).at - readings[0].at) / 3600000;
    if (spanHours > 0) baselineMvPerHour = (readings[0].batteryMv - readings.at(-1).batteryMv) / spanHours;
  }

  // Coste medido de cada despertar urgente: caída observada menos la de fondo.
  const events = [];
  for (const directive of released) {
    const before = readings.filter((reading) => reading.at <= directive.issued).at(-1);
    const after = readings.filter((reading) => reading.at >= directive.released)[0];
    if (!before || !after) continue;
    const hours = (after.at - before.at) / 3600000;
    if (hours <= 0) continue;
    const observedDrop = before.batteryMv - after.batteryMv;
    const expectedDrop = baselineMvPerHour != null ? baselineMvPerHour * hours : null;
    events.push({
      issuedAt: directive.issuedAt,
      releasedAt: directive.releasedAt,
      hours: Math.round(hours * 100) / 100,
      observedDropMv: Math.round(observedDrop * 100) / 100,
      extraDropMv: expectedDrop == null ? null : Math.round((observedDrop - expectedDrop) * 100) / 100,
    });
  }

  const measured = events.filter((event) => event.extraDropMv != null);
  const extraPerEvent = measured.length
    ? measured.reduce((total, event) => total + event.extraDropMv, 0) / measured.length : null;
  const windowDays = readings.length >= 2
    ? Math.max(1 / 24, (readings.at(-1).at - readings[0].at) / 86400000) : null;
  const urgentPerDay = windowDays && released.length ? released.length / windowDays : null;

  return {
    urgentEvents: directives.length,
    releasedEvents: released.length,
    measuredEvents: measured.length,
    baselineMvPerHour: baselineMvPerHour == null ? null : Math.round(baselineMvPerHour * 100) / 100,
    extraDropMvPerUrgentEvent: extraPerEvent == null ? null : Math.round(extraPerEvent * 100) / 100,
    urgentPerDay: urgentPerDay == null ? null : Math.round(urgentPerDay * 100) / 100,
    estimatedExtraDrainMvPerDay: extraPerEvent != null && urgentPerDay != null
      ? Math.round(Math.max(0, extraPerEvent) * urgentPerDay * 100) / 100 : null,
    events,
    // Retraso que causaría una alerta urgente: lo que hoy tarda un lote en llegar.
    baselineDelaySeconds: Number(syncIntervalS) || null,
    urgentDelaySeconds: 0,
    sufficiency: measured.length >= 3 ? 'suficiente' : measured.length ? 'parcial' : 'sin_datos',
    note: measured.length >= 3
      ? 'Coste medido sobre envíos urgentes reales de este equipo.'
      : 'Sin envíos urgentes medidos todavía: no se puede quantificar el coste en batería.',
  };
}