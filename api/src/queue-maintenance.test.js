import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { outboxSnapshot, heartbeatSnapshot, adminNoticeSnapshot } from './maintenance.js';

const read = (rel) => readFile(new URL(rel, import.meta.url), 'utf8');
const [server, notify, adminSrc, schema, migrate, n8n, envExample] = await Promise.all([
  read('./server.js'), read('./notify.js'), read('./admin.js'), read('./schema.sql'),
  read('./migrate.js'), read('../docs/n8n-planificador.json'), read('../.env.example'),
]);

function fakeClient(responses) {
  const calls = [];
  const fn = async (strings, ...values) => {
    calls.push({ text: strings.join('?'), values });
    return responses.shift() ?? [];
  };
  fn.calls = calls;
  return fn;
}

// Cambio 17: cola y planificación comprobables, y encolado durable del lead.

test('la cola reclama primero lo que antes caduca, con tipo como desempate', () => {
  assert.match(notify, /ORDER BY expires_at ASC NULLS LAST/);
  assert.match(notify, /WHEN 'contact_verification' THEN 0/);
  assert.match(notify, /WHEN 'alert' THEN 1/);
  assert.match(notify, /FOR UPDATE SKIP LOCKED/);
});

test('la confirmación del lead se encola dentro de la transacción', () => {
  assert.match(server, /await enqueueLeadMessages\(tx, parsed\.data\)/);
  // Ni rastro del encolado fire-and-forget que una función breve podía perder.
  assert.doesNotMatch(server, /enqueueLeadMessages\(sql,/);
});

test('el esquema y la migración traen la tabla del latido de forma idempotente', () => {
  assert.match(schema, /CREATE TABLE IF NOT EXISTS scheduler_heartbeat/);
  assert.match(migrate, /CREATE TABLE IF NOT EXISTS scheduler_heartbeat/);
  assert.match(schema, /source text PRIMARY KEY CHECK \(source IN \('external', 'timer', 'admin', 'traffic'\)\)/);
});

test('el estado y los límites exponen cola, latido y aviso al administrador', () => {
  for (const source of [server, adminSrc]) {
    assert.match(source, /outboxSnapshot\(/);
    assert.match(source, /heartbeatSnapshot\(/);
    assert.match(source, /adminNoticeSnapshot\(/);
  }
  // El disparo externo y el manual dejan latido persistido.
  assert.match(server, /recordSchedulerHeartbeat\(\{ source: 'external', result \}\)/);
  assert.match(adminSrc, /recordSchedulerHeartbeat\(\{ source: 'admin', result \}\)/);
  assert.match(server, /source: 'timer'/);
  assert.match(server, /source: 'traffic'/);
});

test('el disparador externo y las variables del planificador quedan documentados', () => {
  assert.match(n8n, /"minutesInterval": 3/);
  assert.match(envExample, /EXPECTED_SCHEDULER_INTERVAL_S=180/);
  assert.match(envExample, /OUTBOX_BLOCKED_S=900/);
});

test('outboxSnapshot resume estados, bloqueo y errores recientes', async () => {
  const now = new Date('2026-01-01T12:00:00Z');
  const client = fakeClient([
    [
      { status: 'pending', n: 2, oldest: new Date(now.getTime() - 2_000_000) },
      { status: 'failed', n: 1, oldest: new Date(now.getTime() - 1_000) },
    ],
    [{ id: '9', kind: 'alert', channel: 'whatsapp', lastError: 'meta_131047', providerDetail: { code: 131047 }, createdAt: new Date(now.getTime() - 1_000) }],
  ]);
  const snap = await outboxSnapshot({ client, env: { OUTBOX_BLOCKED_S: '900' }, now });
  assert.equal(snap.failed, 1);
  assert.equal(snap.expired, 0);
  assert.equal(snap.actionable, 2);
  assert.equal(snap.blocked, true);
  assert.equal(snap.oldestActionableSeconds, 2000);
  assert.equal(snap.recentErrors.length, 1);
  assert.equal(snap.recentErrors[0].providerDetail.code, 131047);
  assert.equal(snap.recentErrors[0].ageSeconds, 1);
});

test('outboxSnapshot no marca bloqueo si la cola es reciente', async () => {
  const now = new Date('2026-01-01T12:00:00Z');
  const client = fakeClient([[{ status: 'pending', n: 1, oldest: new Date(now.getTime() - 60_000) }], []]);
  const snap = await outboxSnapshot({ client, env: {}, now });
  assert.equal(snap.blocked, false);
  assert.equal(snap.blockedAfterS, 900);
});

test('heartbeatSnapshot marca obsoleto lo que supera el umbral', async () => {
  const now = new Date('2026-01-01T12:00:00Z');
  const client = fakeClient([[
    { source: 'external', lastRunAt: new Date(now.getTime() - 120_000), durationMs: 30 },
    { source: 'timer', lastRunAt: new Date(now.getTime() - 900_000), durationMs: 5 },
  ]]);
  const hb = await heartbeatSnapshot({ client, env: {}, now });
  assert.equal(hb.expectedIntervalS, 180);
  assert.equal(hb.staleAfterS, 540);
  assert.equal(hb.sources.external.stale, false);
  assert.equal(hb.sources.external.ageSeconds, 120);
  assert.equal(hb.sources.timer.stale, true);
});

test('heartbeatSnapshot tolera que la tabla no exista todavía', async () => {
  const boom = async () => { throw new Error('no existe'); };
  const hb = await heartbeatSnapshot({ client: boom, env: {}, now: new Date('2026-01-01T12:00:00Z') });
  assert.deepEqual(hb.sources, {});
  assert.equal(hb.staleAfterS, 540);
});

test('adminNoticeSnapshot informa sin exponer direcciones', async () => {
  const conAviso = await adminNoticeSnapshot({
    client: fakeClient([[{ n: 2 }]]),
    env: { ADMIN_NOTICE_EMAIL: 'avisos@example.com', EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'k', EMAIL_FROM: 'a@b.es' },
  });
  assert.deepEqual(conAviso, { configured: true, emailReady: true, recipients: 3 });
  const sinNada = await adminNoticeSnapshot({ client: fakeClient([[{ n: 0 }]]), env: { EMAIL_PROVIDER: 'disabled' } });
  assert.deepEqual(sinNada, { configured: false, emailReady: false, recipients: 0 });
});
