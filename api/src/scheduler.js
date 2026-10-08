// Ejecución programada independiente de las visitas al panel.
//
// Antes, los detectores de desconexión y la cola de entrega solo se evaluaban
// cuando alguien abría el panel (y, encima, desde un middleware montado DESPUÉS
// de las rutas, así que casi nunca llegaba a ejecutarse). Aquí la pasada es un
// proceso propio:
//
//   · proceso largo      → temporizador (`startScheduler`).
//   · servidor sin cron  → `POST /api/v1/maintenance/scheduler` para que un cron
//                           externo (Vercel Cron, crontab) lo llame.
//   · respaldo opcional  → `schedulerRequestTick`, montado ANTES de las rutas,
//                           activable solo si se necesita (`SCHEDULER_REQUEST_TICK=true`).
//
// Exclusión: dentro de un proceso, un guardián de reentrada impide dos pasadas a
// la vez. Entre procesos, la exclusión real la da la cola (`FOR UPDATE SKIP
// LOCKED`) y el bloqueo de filas de regla: aunque dos planificadores corran a la
// vez, un episodio abre un solo incidente y un mensaje se envía una sola vez.
//
// Frecuencia y latencia esperada
// ------------------------------
// El plan contratado del alojamiento no admite disparos continuos: el intervalo
// mínimo es `SCHEDULER_MIN_INTERVAL_MS` (30 s) y por defecto se usa 60 s. Con
// eso, la latencia real esperada es:
//
//   · desconexión de una estación   → hasta 1 intervalo + el tiempo que tarde la
//                                     pasada (segundos).
//   · entrega de un mensaje         → hasta 1 intervalo + backoff del proveedor.
//   · reintentos fallidos           → 30 s, 60 s, 120 s… hasta 1 h (5 intentos).
//
// No se promete inmediatez. En Vercel Hobby el cron diario tiene precisión de
// ±59 min: la latencia máxima esperada es por tanto de unas 25 h. En planes que
// admitan más frecuencia, ajusta el cron al límite contratado. Sin cron
// configurado, y con el respaldo desactivado por defecto, las pasadas solo
// ocurren si se llama al endpoint protegido.

import { evaluateSystemRules } from './alert-engine.js';
import { dispatchOutbox } from './notify.js';

// Tope de frecuencia que respeta el plan contratado: por debajo no se ejecuta.
export const SCHEDULER_MIN_INTERVAL_MS = 30_000;

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
