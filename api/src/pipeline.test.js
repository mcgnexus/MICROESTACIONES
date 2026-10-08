// Prueba completa del circuito de avisos, sin ninguna visita al panel.
//
// El modelo anterior dependía de que alguien abriera el dashboard: aquí todo
// ocurre en el servidor. Se cubre el recorrido entero de un episodio —regla,
// incidente, mensaje por destinatario y entrega— más la concurrencia.
//
// El doble cliente (`store.client`) emula las sentencias que emite el código de
// producción y modela lo que la base de datos garantiza:
//   · `FOR UPDATE`      → `store.serialized()` serializa dos evaluaciones;
//   · `SKIP LOCKED`     → el reclamo retira la fila de forma atómica.
// Además se comprueba que el SQL emitido contiene esas cláusulas, de modo que la
// garantía real sigue siendo la de PostgreSQL.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { evaluateMeasurementRules, evaluateSystemRules } from './alert-engine.js';
import { dispatchOutbox, claimOutboxMessages } from './notify.js';
import { runScheduledPasses, resetSchedulerState } from './scheduler.js';

const DEVICE = 'dev-demo-01';
const AT = new Date('2026-01-05T05:00:00Z');

const frostRule = {
  id: 1,
  device_id: DEVICE,
  metric: 'temperature',
  comparator: 'lte',
  threshold: 2,
  level: 1,
  message: 'Helada en la finca',
  recipient: null,
  channel: 'email',
  enabled: true,
  urgent: false,
  system: false,
  category: 'frost',
  min_duration_s: 0,
  recovery_margin: 0,
  recovery_threshold: null,
  recovery_duration_s: 0,
  cooldown_s: 0,
  condition_active: false,
  condition_since: null,
  recovery_since: null,
  last_alert_at: null,
  active_alert_id: null,
};

const disconnectRule = {
  ...frostRule,
  id: 2,
  metric: 'connectivity',
  comparator: 'gt',
  threshold: 1800,
  level: 1,
  message: 'Estación sin comunicación',
  channel: 'email',
  system: true,
  category: 'general',
};

function makeStore({ rules = [frostRule], recipients = [], contactOk = true, devices = [] } = {}) {
  const state = {
    rules: rules.map((rule) => ({ ...rule })),
    alerts: [],
    outbox: [],
    recipients,
    contactOk,
    devices,
    deviceName: 'Estación de la finca',
    farmName: 'El Llano',
    log: [],
    queue: Promise.resolve(),
  };

  // Modela `FOR UPDATE`: dos evaluaciones no se pisan entre sí.
  const serialized = (fn) => {
    const run = state.queue.then(() => fn(), () => fn());
    state.queue = run.then(() => {}, () => {});
    return run;
  };

  const client = async (strings, ...values) => {
    const text = strings.join(' § ');
    state.log.push({ text, values });

    // --- Cola: reclamo exclusivo -----------------------------------------
    if (text.includes("SET status = 'expired'") && text.includes('expires_at IS NOT NULL')) {
      const [now] = values;
      const expired = [];
      for (const row of state.outbox) {
        if (['pending', 'manual'].includes(row.status) && row.expiresAt && row.expiresAt <= now) {
          row.status = 'expired';
          row.claimedAt = null;
          expired.push({ id: row.id, alertId: row.alertId });
        }
      }
      return expired;
    }
    if (text.includes("SET status = 'failed'") && text.includes('coalesce(claimed_at, updated_at)')) {
      const [, staleBefore] = values;
      const abandoned = [];
      for (const row of state.outbox) {
        if (row.status === 'sending' && (row.claimedAt ?? row.updatedAt) <= staleBefore) {
          row.status = 'failed';
          row.claimedAt = null;
          row.lastError = 'reclamo vencido; aceptación del proveedor incierta';
          abandoned.push({ id: row.id, alertId: row.alertId });
        }
      }
      return abandoned;
    }

    if (text.includes('FOR UPDATE SKIP LOCKED')) {
      const [now, , limit, workerId] = values;
      const taken = [];
      for (const row of state.outbox) {
        if (taken.length >= limit) break;
        const due = row.status === 'pending' && row.nextAttemptAt <= now;
        if (!due || (row.expiresAt && row.expiresAt <= now)) continue;
        row.status = 'sending';
        row.claimedAt = now;
        row.claimedBy = workerId;
        taken.push({
          id: row.id, kind: row.kind, channel: row.channel, address: row.address,
          subject: row.subject, body: row.body, attempts: row.attempts,
          alertId: row.alertId, subscriberId: row.subscriberId, leadId: null,
          expiresAt: row.expiresAt, claimedBy: row.claimedBy,
        });
      }
      return taken;
    }

    // --- Vigencia del contacto antes de enviar ---------------------------
    if (text.includes('AS contact_ok')) {
      return [{ subscriberActive: true, contactOk: state.contactOk }];
    }
    if (text.includes('FROM subscriber_contacts sc')) {
      return state.recipients.map((row) => ({
        subscriberId: row.subscriberId, channel: row.channel, address: row.address,
      }));
    }

    // Consultas de la pasada programada de desconexiones.
    if (text.includes('FROM devices d') && text.includes('d.created_at')) {
      return state.devices.map((device) => ({ ...device }));
    }
    if (text.includes('FROM measurements') && text.includes('battery_mv IS NOT NULL')) return [];

    // --- Reglas ------------------------------------------------------------
    if (text.includes('UPDATE alert_rules')) {
      const rule = state.rules.find((item) => item.id === values.at(-1));
      if (rule) {
        if (text.includes('condition_active = false')) {
          rule.condition_active = false;
          rule.condition_since = null;
          rule.recovery_since = null;
          rule.active_alert_id = null;
        } else if (text.includes('active_alert_id')) {
          rule.condition_active = true;
          rule.condition_since = values[0];
          rule.active_alert_id = values[1];
          rule.recovery_since = null;
        } else if (text.includes('condition_active = true')) {
          rule.condition_active = true;
          rule.condition_since = values[0];
        } else if (text.includes('recovery_since = NULL')) {
          rule.recovery_since = null;
        } else if (text.includes('recovery_since =')) {
          rule.recovery_since = values[0];
        }
      }
      return [];
    }
    if (text.includes('FROM alert_rules')) {
      const metric = /metric = '([^']+)'/.exec(text)?.[1];
      if (text.includes('AND system')) {
        return state.rules.filter((rule) => rule.system && (!metric || rule.metric === metric))
          .map((rule) => ({ ...rule }));
      }
      if (text.includes('AND enabled AND NOT system')) {
        return state.rules.filter((rule) => rule.enabled && !rule.system).map((rule) => ({ ...rule }));
      }
      return state.rules.map((rule) => ({ ...rule }));
    }

    // --- Incidente ---------------------------------------------------------
    if (text.includes('ON CONFLICT (dedupe_key)')) {
      const key = values.find((value) => typeof value === 'string' && value.startsWith('rule:'));
      if (state.alerts.some((alert) => alert.dedupeKey === key)) return []; // ya estaba
      const alert = { id: state.alerts.length + 1, dedupeKey: key, deliveryStatus: 'pending' };
      state.alerts.push(alert);
      return [{ id: alert.id }];
    }
    if (text.includes('SELECT id FROM alerts WHERE dedupe_key')) {
      const found = state.alerts.find((alert) => alert.dedupeKey === values[0]);
      return found ? [{ id: found.id }] : [];
    }
    if (text.includes('UPDATE alerts SET channel')) {
      const alert = state.alerts.find((item) => item.id === values.at(-1));
      if (alert) alert.channel = values[0];
      return [];
    }

    // --- Dispositivo (nombre para el mensaje) ------------------------------
    if (text.includes('AS farm_name')) {
      return [{ name: state.deviceName, farmName: state.farmName }];
    }

    // --- Mensajes ----------------------------------------------------------
    if (text.includes('INSERT INTO notification_outbox')) {
      const [alertId, subscriberId, channel, address, subject, body, expiresAt] = values;
      state.outbox.push({
        id: state.outbox.length + 1, kind: 'alert', status: 'pending', attempts: 0,
        nextAttemptAt: new Date(0), claimedAt: null, updatedAt: new Date(0),
        alertId, subscriberId, channel, address, subject, body, expiresAt,
        sentAt: null, lastError: null,
      });
      return [];
    }
    if (text.includes('UPDATE notification_outbox SET status')) {
      const row = state.outbox.find((item) => item.id === values.at(-2));
      const owner = values.at(-1);
      const status = /status = '([a-z]+)'/.exec(text)?.[1];
      if (row && status && row.claimedBy === owner && row.status === 'sending') {
        row.status = status;
        row.claimedAt = null;
        row.claimedBy = null;
        row.updatedAt = values.at(-2) instanceof Date ? values.at(-2) : row.updatedAt;
        if (status === 'sent') { row.sentAt = values[0]; }
        if (status === 'failed') row.attempts = values[0];
        if (status === 'pending') { row.attempts = values[0]; row.nextAttemptAt = values[1]; }
        if (status === 'cancelled') row.lastError = values[0];
        return [{ id: row.id }];
      }
      return [];
    }
    if (text.includes('UPDATE alerts SET delivery_status')) {
      const alert = state.alerts.find((item) => item.id === values.at(-1));
      const status = /delivery_status = '([a-z]+)'/.exec(text)?.[1];
      if (alert && status && alert.deliveryStatus !== 'delivered') {
        if (status !== 'sent' || alert.deliveryStatus === 'pending') alert.deliveryStatus = status;
      }
      return [];
    }

    throw new Error(`sentencia no prevista en el doble cliente: ${text.slice(0, 120)}`);
  };

  // `tx.json(...)` serializa los jsonb (value, rule_snapshot) para el INSERT.
  client.json = (value) => JSON.stringify(value);
  // La prueba completa usa la misma interfaz transaccional que sql.begin; la
  // cola de promesas modela el aislamiento serializable/los row locks.
  client.begin = (fn) => serialized(() => fn(client));

  return { client, state, serialized };
}

const recipients = [
  { subscriberId: 11, channel: 'email', address: 'uno@example.test' },
  { subscriberId: 12, channel: 'email', address: 'dos@example.test' },
];

const episode = { deviceId: DEVICE, measurementId: 5, values: { temp_c: -3.4 }, at: AT, config: {} };

test('la lectura de reglas se serializa con FOR UPDATE', async () => {
  // El doble cliente modela el bloqueo para poder probar la concurrencia; la
  // garantía real la pone PostgreSQL, y esto comprueba que se le pide.
  const source = await readFile(new URL('./alert-engine.js', import.meta.url), 'utf8');
  assert.match(source, /FROM alert_rules\s+WHERE device_id = \$\{deviceId\} AND enabled AND NOT system\s+ORDER BY id FOR UPDATE/s);
  assert.match(source, /AND system AND metric = 'battery' FOR UPDATE/);
  assert.match(source, /AND system AND metric = 'connectivity' FOR UPDATE/);
  // Los detectores corren en una transacción: abrir, recuperar y deduplicar son
  // transaccionales, no pasos sueltos.
  assert.match(source, /return client\.begin\(async \(tx\)/);
  // La evaluación por lote recibe la transacción del servidor y no abre otra.
  assert.match(source, /export async function evaluateMeasurementRules\(tx,/);
  const store = makeStore();
  assert.equal(store.state.rules.length, 1);
});

test('un episodio produce un incidente y un mensaje por destinatario', async () => {
  const store = makeStore({ recipients });

  // Dos evaluaciones del mismo episodio a la vez: con el bloqueo, solo una abre.
  const results = await Promise.all([
    store.serialized(() => evaluateMeasurementRules(store.client, episode)),
    store.serialized(() => evaluateMeasurementRules(store.client, episode)),
  ]);

  assert.equal(store.state.alerts.length, 1, 'un episodio, un incidente');
  assert.equal(store.state.outbox.length, 2, 'un mensaje por destinatario');
  assert.equal(store.state.outbox.filter((row) => row.subscriberId === 11).length, 1);
  assert.equal(store.state.outbox.filter((row) => row.subscriberId === 12).length, 1);
  assert.equal(results.filter((result) => result.opened.length > 0).length, 1,
    'solo una de las dos evaluaciones declara apertura');
  assert.equal(results.filter((result) => result.recovered.length).length, 0);
  assert.ok(store.state.outbox.every((row) => row.expiresAt instanceof Date), 'cada mensaje lleva caducidad');
});

test('la cola reclama cada mensaje una sola vez aunque corran dos trabajadores', async () => {
  const store = makeStore({ recipients });
  await evaluateMeasurementRules(store.client, episode);
  assert.equal(store.state.outbox.length, 2);

  const options = () => ({
    client: store.client, limit: 20, now: new Date(), env: { EMAIL_PROVIDER: 'console' },
  });
  const [a, b] = await Promise.all([
    dispatchOutbox({ ...options(), workerId: 'worker-a' }),
    dispatchOutbox({ ...options(), workerId: 'worker-b' }),
  ]);

  assert.equal(a.processed + b.processed, 2, 'las dos filas se reparten, no se solapan');
  assert.equal(a.sent + b.sent, 2, 'cada mensaje se envía una sola vez');
  assert.ok(store.state.outbox.every((row) => row.status === 'sent'));
  // La cláusula que lo garantiza en la base está presente en el SQL emitido.
  const claim = store.state.log.find((entry) => entry.text.includes('FOR UPDATE SKIP LOCKED'));
  assert.ok(claim, 'el reclamo usa FOR UPDATE SKIP LOCKED');
  assert.match(claim.text, /claimed_by/);
  assert.equal(claim.values.filter((value) => typeof value === 'string' && value.startsWith('worker-')).length, 1);
});

test('una desconexión abre y entrega por cron sin ninguna visita al panel', async () => {
  resetSchedulerState();
  const lastContact = new Date(AT.getTime() - 900_000); // 15 min sin contacto
  const store = makeStore({
    rules: [disconnectRule],
    recipients,
    devices: [{
      id: DEVICE, name: 'Estación de la finca', createdAt: new Date(AT.getTime() - 86_400_000),
      lastContact, config: { sync_interval_s: 60, interval_normal_s: 360 },
    }],
  });

  // Ninguna llamada externa durante toda la pasada: no hay visitas ni HTTP.
  const realFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => { fetchCalls += 1; return { ok: true, json: async () => ({}) }; };
  try {
    const pass = await runScheduledPasses({
      now: AT.getTime(),
      force: true,
      config: { systemIntervalMs: 0, outboxIntervalMs: 0, systemEnabled: true, outboxEnabled: true, requestTickEnabled: true },
      runSystem: (now) => evaluateSystemRules(now, { client: store.client }),
      runOutbox: ({ now }) => dispatchOutbox({ client: store.client, now, env: { EMAIL_PROVIDER: 'console' } }),
      logger: { error: () => {}, log: () => {} },
    });
    assert.equal(pass.system.length, 1);
    assert.equal(pass.system[0].change, 'opened');
    assert.equal(store.state.alerts.length, 1, 'un episodio de desconexión = un incidente');
    assert.equal(store.state.outbox.length, 2, 'una fila de mensaje por destinatario');
    assert.equal(pass.outbox.processed, 2);
    assert.equal(pass.outbox.sent, 2);
    assert.equal(pass.outbox.failed, 0);
    assert.equal(fetchCalls, 0, 'sin llamadas externas: todo es local');
  } finally {
    globalThis.fetch = realFetch;
    resetSchedulerState();
  }
  assert.ok(store.state.outbox.every((row) => row.status === 'sent'));
  assert.ok(store.state.alerts.every((alert) => alert.deliveryStatus === 'sent'),
    'aceptado por el proveedor es `sent`, no `delivered`');
});

test('no se envía un mensaje caducado', async () => {
  const store = makeStore({ recipients });
  await evaluateMeasurementRules(store.client, episode);
  assert.equal(store.state.outbox.length, 2);
  for (const row of store.state.outbox) row.expiresAt = new Date('2020-01-01T00:00:00Z');

  const result = await dispatchOutbox({
    client: store.client, now: new Date(), env: { EMAIL_PROVIDER: 'console' },
  });
  assert.equal(result.expired, 2);
  assert.equal(result.sent, 0, 'nada caducado sale de la cola');
  assert.ok(store.state.outbox.every((row) => row.status === 'expired'));
  assert.ok(store.state.outbox.every((row) => row.sentAt === null));
});

test('no se envía un aviso a un contacto revocado', async () => {
  const store = makeStore({ recipients, contactOk: false });
  await evaluateMeasurementRules(store.client, episode);
  assert.equal(store.state.outbox.length, 2);

  const result = await dispatchOutbox({
    client: store.client, now: new Date(), env: { EMAIL_PROVIDER: 'console' },
  });
  assert.equal(result.cancelled, 2);
  assert.equal(result.sent, 0, 'el contacto revocado no recibe nada');
  assert.ok(store.state.outbox.every((row) => row.status === 'cancelled'));
  assert.ok(store.state.outbox.every((row) => row.lastError === 'contacto revocado'));
});

test('un reclamo vencido no se reenvía a ciegas: se marca fallido', async () => {
  // Si un proceso muere tras enviar el POST, el resultado es incierto. Reenviar
  // podría duplicar el mensaje, así que se marca `failed` para revisión.
  const store = makeStore({ recipients });
  await evaluateMeasurementRules(store.client, episode);
  const now = new Date('2026-01-05T05:10:00Z');
  for (const row of store.state.outbox) {
    row.status = 'sending';
    row.claimedAt = new Date('2026-01-05T05:00:00Z'); // justo en el límite del reclamo
  }

  const result = await dispatchOutbox({
    client: store.client, now, env: { EMAIL_PROVIDER: 'console' },
  });
  assert.equal(result.failed, 2, 'el reclamo vencido se marca fallido');
  assert.equal(result.sent, 0, 'no se duplica un envío cuyo resultado se desconoce');
  assert.ok(store.state.outbox.every((row) => row.status === 'failed'));
  assert.match(store.state.outbox[0].lastError, /aceptación del proveedor incierta/);
});

test('el reclamo solo toma filas pendientes y sin caducar', async () => {
  const store = makeStore({ recipients });
  await evaluateMeasurementRules(store.client, episode);
  const now = new Date();

  // Un reclamo ajeno y fresco no se toca; la pendiente sí.
  store.state.outbox[0].status = 'sending';
  store.state.outbox[0].claimedAt = new Date(now.getTime() - 1000);
  const taken = await claimOutboxMessages({ client: store.client, limit: 20, now, workerId: 'nuevo' });
  assert.equal(taken.length, 1, 'solo la fila pendiente');
  assert.equal(taken[0].id, store.state.outbox[1].id);

  // Una fila caducada tampoco se reclama: el barrido la aparta antes.
  store.state.outbox[1].status = 'pending';
  store.state.outbox[1].expiresAt = new Date(now.getTime() - 60_000);
  const afterExpiry = await claimOutboxMessages({ client: store.client, limit: 20, now, workerId: 'otro' });
  assert.equal(afterExpiry.length, 0, 'lo caducado no llega al proveedor');
});
