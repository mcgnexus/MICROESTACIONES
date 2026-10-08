// Ejecución programada independiente de las visitas al panel.
//
// Antes, los detectores de desconexión y la cola de entrega solo se evaluaban
// cuando alguien abrió el panel (y, encima, desde un middleware montado DESPUÉS
// de las rutas, así que casi nunca llegaba a ejecutarse). Aquí la pasada es un
// proceso propio:
//
//   · disparo principal  → planificador externo (n8n o cron externo) llamando a
//                          `POST /api/v1/maintenance/scheduler` con `CRON_SECRET`
//                          cada pocos minutos. Es el mecanismo efectivo en este
//                          despliegue: el plan gratuito de Vercel solo admite un
//                          cron diario y no se usa para avisos.
//   · proceso largo      → temporizadores (`startScheduler`).
//   · respaldo opcional  → `schedulerRequestTick`, montado ANTES de las rutas,
//                          activable solo si se necesita (`SCHEDULER_REQUEST_TICK=true`).
//
// Exclusión: dentro de un proceso, un guardián de reentrada impide dos pasadas a
// la vez. Entre procesos, la exclusión real la da la cola (`FOR UPDATE SKIP
// LOCKED`) y el bloqueo de filas de regla: aunque dos planificadores corran a la
// vez, un episodio abre un solo incidente y un mensaje se envía una sola vez.
//
// Frecuencia y latencia esperada
// ------------------------------
// La latencia la marca el intervalo del disparador externo: con n8n cada 5 min,
// entrega y desconexión tardan como mucho ese intervalo más la pasada. Sin
// disparador externo y con el respaldo por tráfico desactivado, las pasadas
// solo ocurren si alguien llama al endpoint protegido: no hay entrega.
// Los reintentos fallidos usan backoff: 30 s, 60 s, 120 s… hasta 1 h (5 intentos).

import { evaluateSystemRules } from './alert-engine.js';
import { dispatchOutbox } from './notify.js';

// Tope de frecuencia que respeta el plan contratado: por debajo no se ejecuta.
export const SCHEDULER_MIN_INTERVAL_MS = 30_000;

// Presupuesto de fila por invocación del disparo externo. El plan gratuito de
// Vercel limita la función a 30 s: por defecto se procesa una fila (el disparo
// externo puede repetirse o pedir más con el parámetro acotado).
export const OUTBOX_LIMIT_FLOOR = 1;
export const OUTBOX_LIMIT_CEILING = 20;

// Límite de filas de la cola que procesa una invocación. `raw` llega del
// parámetro `outbox` del disparo externo; acotado para no agotar el presupuesto
// temporal de la función. Sin valor: 1 en serverless, el lote del proceso largo.
export function outboxLimitForRequest(raw, serverless = false, batchSize = 20) {
  const parsed = Number.parseInt(raw, 10);
  if (Number.isFinite(parsed)) return Math.min(Math.max(parsed, OUTBOX_LIMIT_FLOOR), OUTBOX_LIMIT_CEILING);
  return serverless ? OUTBOX_LIMIT_FLOOR : Math.max(1, Number(batchSize) || 20);
}

function toMs(seconds, fallback) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return fallback * 1000;
  return value * 1000;
}

export function schedulerConfig(env = process.env) {
  return {
    systemIntervalMs: Math.max(SCHEDULER_MIN_INTERVAL_MS, toMs(env.SYSTEM_EVAL_INTERVAL_S, 60)),
    outboxIntervalMs: Math.max(SCHEDULER_MIN_INTERVAL_MS, toMs(env.OUTBOX_EVAL_INTERVAL_S, 60)),
    systemEnabled: env.SYSTEM_EVAL_DISABLED !== 'true',
    outboxEnabled: env.OUTBOX_DISPATCH_DISABLED !== 'true',
    // El respaldo por petición requiere activación explícita. En serverless la
    // ejecución normal es el cron independiente; no se usa el tráfico del panel
    // para fingir un planificador.
    requestTickEnabled: env.SCHEDULER_REQUEST_TICK === 'true',
    outboxBatchSize: Math.max(1, Math.min(100, Number(env.OUTBOX_BATCH_SIZE) || 20)),
  };
}

let inFlight = null;
const lastRun = { system: 0, outbox: 0 };

// Estado observable, para pruebas y para el diagnóstico de administración.
export function schedulerState() {
  return { inFlight: Boolean(inFlight), lastRun: { ...lastRun } };
}

// Reinicia los contadores (solo para pruebas).
export function resetSchedulerState() {
  inFlight = null;
  lastRun.system = 0;
  lastRun.outbox = 0;
}

// Ejecuta las pasadas pendientes. Si ya hay una en curso devuelve la misma
// promesa: nunca hay dos pasadas simultáneas dentro de este proceso.
export async function runScheduledPasses({
  now = Date.now(),
  config = schedulerConfig(),
  runSystem = evaluateSystemRules,
  runOutbox = dispatchOutbox,
  outboxLimit = config.outboxBatchSize || 20,
  force = false,
  logger = console,
} = {}) {
  if (inFlight) return inFlight;
  const work = (async () => {
    const started = Date.now();
    const result = { ranAt: new Date(now).toISOString(), durationMs: 0, system: null, outbox: null, skipped: [] };

    if (!config.systemEnabled) {
      result.skipped.push('system_disabled');
    } else if (!force && now - lastRun.system < config.systemIntervalMs) {
      result.skipped.push('system_throttled');
    } else {
      lastRun.system = now;
      try {
        result.system = await runSystem(new Date(now));
      } catch (error) {
        // Una pasada que falla no detiene la siguiente.
        result.system = { error: error.message };
        logger.error?.('pasada de detectores:', error.message);
      }
    }

    if (!config.outboxEnabled) {
      result.skipped.push('outbox_disabled');
    } else if (!force && now - lastRun.outbox < config.outboxIntervalMs) {
      result.skipped.push('outbox_throttled');
    } else {
      lastRun.outbox = now;
      try {
        result.outbox = await runOutbox({ limit: outboxLimit, now: new Date(now) });
      } catch (error) {
        result.outbox = { error: error.message };
        logger.error?.('pasada de entrega:', error.message);
      }
    }

    result.durationMs = Date.now() - started;
    return result;
  })();
  inFlight = work.finally(() => { inFlight = null; });
  return inFlight;
}

// Temporizadores del proceso largo. Devuelve la función que los detiene.
export function startScheduler({ config = schedulerConfig(), logger = console } = {}) {
  const timers = [];
  const kick = (label) => {
    runScheduledPasses({ config, logger })
      .then((result) => {
        const parts = [];
        if (result.system) parts.push(`detectores: ${Array.isArray(result.system) ? `${result.system.length} cambios` : 'ok'}`);
        if (result.outbox) {
          parts.push(`entrega: ${result.outbox.sent ?? 0} enviados, ${result.outbox.failed ?? 0} fallidos`);
        }
        if (parts.length) logger.log?.(`[scheduler] ${label}: ${parts.join(' · ')} ( ${result.durationMs} ms)`);
      })
      .catch((error) => logger.error?.(`[scheduler] ${label}:`, error.message));
  };

  if (config.systemEnabled) {
    const timer = setInterval(() => kick('system'), config.systemIntervalMs);
    timer.unref?.();
    timers.push(timer);
  }
  if (config.outboxEnabled) {
    const timer = setInterval(() => kick('outbox'), config.outboxIntervalMs);
    timer.unref?.();
    timers.push(timer);
  }
  const initial = setTimeout(() => kick('inicio'), 2000);
  initial.unref?.();
  timers.push(initial);

  return function stopScheduler() {
    for (const timer of timers) clearInterval(timer);
  };
}

// Respaldo: cualquier petición de la API puede dar un empujón, no solo el panel.
// Se monta ANTES de las rutas (si se monta después, la ruta que responde se come
// la petición y el middleware nunca se ejecuta). Nunca bloquea la respuesta.
export function schedulerRequestTick({
  config = schedulerConfig(), logger = console, runSystem, runOutbox,
} = {}) {
  return function tick(req, res, next) {
    next();
    if (!config.requestTickEnabled) return;
    if (!req.path.startsWith('/api/')) return;
    runScheduledPasses({ config, logger, runSystem, runOutbox }).catch(() => {});
  };
}
