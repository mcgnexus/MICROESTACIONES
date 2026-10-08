import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  SCHEDULER_MIN_INTERVAL_MS, schedulerConfig, runScheduledPasses, schedulerRequestTick,
  schedulerState, resetSchedulerState, startScheduler, outboxLimitForRequest,
} from './scheduler.js';

const baseConfig = (over = {}) => ({
  systemIntervalMs: 60_000,
  outboxIntervalMs: 60_000,
  systemEnabled: true,
  outboxEnabled: true,
  requestTickEnabled: true,
  ...over,
});

test('el presupuesto de fila por invocación está acotado para no agotar la función', () => {
  // Sin parámetro: una fila en serverless, el lote del proceso largo.
  assert.equal(outboxLimitForRequest(undefined, true), 1);
  assert.equal(outboxLimitForRequest(undefined, false, 20), 20);
  // El disparo externo puede pedir más, dentro del techo.
  assert.equal(outboxLimitForRequest('5', true), 5);
  assert.equal(outboxLimitForRequest('10', false, 20), 10);
  // Acotado por abajo y por arriba, y basura numérica cae al valor por defecto.
  assert.equal(outboxLimitForRequest('0', true), 1);
  assert.equal(outboxLimitForRequest('-3', true), 1);
  assert.equal(outboxLimitForRequest('999', false, 20), 20);
  assert.equal(outboxLimitForRequest('diez', true), 1);
});

test('la frecuencia respeta el plan contratado del alojamiento', () => {
  assert.equal(SCHEDULER_MIN_INTERVAL_MS, 30_000, 'mínimo de 30 s por petición');
  // Un intervalo configurado por debajo del mínimo se sube, no se respeta.
  assert.equal(schedulerConfig({ SYSTEM_EVAL_INTERVAL_S: '1' }).systemIntervalMs, 30_000);
  assert.equal(schedulerConfig({ OUTBOX_EVAL_INTERVAL_S: '5' }).outboxIntervalMs, 30_000);
  assert.equal(schedulerConfig({ SYSTEM_EVAL_INTERVAL_S: '120' }).systemIntervalMs, 120_000);
  // Basura en el entorno no desactiva la pasada por accidente.
  assert.equal(schedulerConfig({ SYSTEM_EVAL_INTERVAL_S: 'abc' }).systemIntervalMs, 60_000);
  assert.equal(schedulerConfig({}).systemEnabled, true);
  assert.equal(schedulerConfig({ SYSTEM_EVAL_DISABLED: 'true' }).systemEnabled, false);
  assert.equal(schedulerConfig({ OUTBOX_DISPATCH_DISABLED: 'true' }).outboxEnabled, false);
  assert.equal(schedulerConfig({}).requestTickEnabled, false);
  assert.equal(schedulerConfig({ SCHEDULER_REQUEST_TICK: 'true' }).requestTickEnabled, true);
  assert.equal(schedulerConfig({ SCHEDULER_REQUEST_TICK: 'false' }).requestTickEnabled, false);
});

test('dos llamadas simultáneas comparten una sola pasada (reentrada)', async () => {
  resetSchedulerState();
  let systemRuns = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const runSystem = async () => { systemRuns += 1; await gate; return [{ deviceId: 'a', change: 'opened' }]; };

  const config = baseConfig();
  const first = runScheduledPasses({ config, runSystem, runOutbox: async () => ({ processed: 0 }) });
  const second = runScheduledPasses({ config, runSystem, runOutbox: async () => ({ processed: 0 }) });
  assert.equal(schedulerState().inFlight, true, 'la pasada queda marcada como en curso');
  release();
  const [a, b] = await Promise.all([first, second]);

  assert.equal(systemRuns, 1, 'solo una pasada aunque se pida dos veces a la vez');
  assert.equal(a, b, 'ambas llamadas reciben el mismo resultado');
  assert.equal(a.system.length, 1);
  assert.equal(schedulerState().inFlight, false, 'al terminar se suelta el guardián');
  resetSchedulerState();
});

test('las pasadas se limitan al intervalo y `force` las salta', async () => {
  resetSchedulerState();
  const config = baseConfig({ systemIntervalMs: 60_000, outboxIntervalMs: 60_000 });
  let systemRuns = 0;
  let outboxRuns = 0;
  const runSystem = async () => { systemRuns += 1; return []; };
  const runOutbox = async () => { outboxRuns += 1; return { processed: 0, sent: 0, failed: 0 }; };

  const t0 = Date.parse('2026-01-01T10:00:00Z');
  const first = await runScheduledPasses({ now: t0, config, runSystem, runOutbox });
  assert.deepEqual(first.skipped, []);
  assert.equal(systemRuns, 1);
  assert.equal(outboxRuns, 1);

  // Dentro del intervalo no se vuelve a ejecutar: es lo que evita martillear.
  const throttled = await runScheduledPasses({ now: t0 + 5_000, config, runSystem, runOutbox });
  assert.deepEqual(throttled.skipped, ['system_throttled', 'outbox_throttled']);
  assert.equal(systemRuns, 1);
  assert.equal(outboxRuns, 1);

  // Pasado el intervalo vuelve a correr.
  await runScheduledPasses({ now: t0 + 61_000, config, runSystem, runOutbox });
  assert.equal(systemRuns, 2);

  // Un cron externo fuerza la pasada sin esperar al intervalo.
  const forced = await runScheduledPasses({ now: t0 + 62_000, config, runSystem, runOutbox, force: true });
  assert.deepEqual(forced.skipped, []);
  assert.equal(systemRuns, 3);
  assert.equal(outboxRuns, 3);
  resetSchedulerState();
});

test('una pasada que falla no detiene a la otra ni la siguiente', async () => {
  resetSchedulerState();
  const config = baseConfig({ systemIntervalMs: 0, outboxIntervalMs: 0 });
  const result = await runScheduledPasses({
    now: Date.parse('2026-01-01T10:00:00Z'),
    config,
    runSystem: async () => { throw new Error('base caída'); },
    runOutbox: async () => ({ processed: 1, sent: 1, failed: 0 }),
    logger: { error: () => {}, log: () => {} },
  });
  assert.equal(result.system.error, 'base caída');
  assert.deepEqual(result.outbox, { processed: 1, sent: 1, failed: 0 });
  assert.ok(result.durationMs >= 0);
  resetSchedulerState();
});

test('el respaldo por peticiones no bloquea y solo mira la API', async () => {
  resetSchedulerState();
  const config = baseConfig();
  const started = [];
  const middleware = schedulerRequestTick({
    config,
    runSystem: async () => { started.push('system'); return []; },
    runOutbox: async () => { started.push('outbox'); return { processed: 0 }; },
  });
  assert.equal(middleware.length, 3, 'es un middleware de express (req, res, next)');

  let nextCalls = 0;
  middleware({ path: '/panel' }, {}, () => { nextCalls += 1; });
  assert.equal(nextCalls, 1, 'la respuesta nunca se bloquea');
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(started, [], 'las rutas que no son de la API no disparan nada');

  resetSchedulerState();
  middleware({ path: '/api/v1/otra' }, {}, () => { nextCalls += 1; });
  assert.equal(nextCalls, 2);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(started, ['system', 'outbox'], 'cualquier llamada a la API da el empujón');
  resetSchedulerState();
});

test('el middleware va montado ANTES que las rutas que responden', async () => {
  // El defecto original: los triggers estaban después de los routers, así que
  // las peticiones que respondían (dashboard incluido) nunca los alcanzaban.
  const source = await readFile(new URL('../src/server.js', import.meta.url), 'utf8');
  const tick = source.indexOf('app.use(schedulerRequestTick())');
  const dashboard = source.indexOf("app.get('/api/v1/dashboard'");
  const routers = source.indexOf("app.use('/api/v1/stations'");
  assert.ok(tick > 0, 'el respaldo está declarado');
  assert.ok(dashboard > 0 && routers > 0, 'las rutas están declaradas');
  assert.ok(tick < routers, 'el respaldo se monta antes que los routers');
  assert.ok(tick < dashboard, 'el respaldo se monta antes del dashboard');
  // Y no queda ningún trigger antiguo atado al panel detrás de las rutas.
  assert.equal(source.includes('lastSystemPass'), false);
  assert.equal(source.includes('lastOutboxPass'), false);
});

test('startScheduler devuelve cómo detenerse y respeta los interruptores', () => {
  const off = startScheduler({ config: baseConfig({ systemEnabled: false, outboxEnabled: false }), logger: { log: () => {}, error: () => {} } });
  assert.equal(typeof off, 'function');
  off();
  const on = startScheduler({ config: baseConfig({ systemEnabled: true, outboxEnabled: true }), logger: { log: () => {}, error: () => {} } });
  assert.equal(typeof on, 'function');
  on();
  resetSchedulerState();
});
