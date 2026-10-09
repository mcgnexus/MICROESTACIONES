// Guardián de escritura para scripts que crean, migran o borran en la base.
//
// Evita ejecutar por accidente una operación destructiva contra producción. NO
// cambia el comportamiento fuera de producción. La confirmación explícita se da
// con `--force` o `ALLOW_PRODUCTION_WRITES=true`.
//
// La detección combina dos señales:
//   · NODE_ENV/VERCEL_ENV = production (misma regla que el resto de la app).
//   · El host de DATABASE_URL está en PRODUCTION_DB_HOSTS (lista separada por comas).
import { isProduction } from './env.js';

export function hostOf(value) {
  try { return new URL(value).hostname.toLowerCase(); } catch { return null; }
}

export function productionHosts(env = process.env) {
  return String(env.PRODUCTION_DB_HOSTS || '')
    .split(',').map((host) => host.trim().toLowerCase()).filter(Boolean);
}

// Decide si la operación puede continuar. Función pura: no imprime ni sale.
export function evaluateWriteTarget({ env = process.env, argv = process.argv } = {}) {
  const reasons = [];
  if (isProduction(env)) reasons.push(`NODE_ENV/VERCEL_ENV = ${env.NODE_ENV || env.VERCEL_ENV}`);
  const host = hostOf(env.DATABASE_URL || '');
  if (host && productionHosts(env).includes(host)) reasons.push(`host de producción (${host})`);
  const forced = argv.includes('--force')
    || String(env.ALLOW_PRODUCTION_WRITES ?? '').toLowerCase() === 'true';
  const production = reasons.length > 0;
  return { production, forced, allowed: !production || forced, reasons, host };
}

// Imprime el resultado del guardián. Devuelve true si debe abortarse.
export function reportWriteTarget(action, target, { logger = console } = {}) {
  if (!target.production) return false;
  if (!target.allowed) {
    logger.error(`\n[guardián] ${action}: destino clasificado como PRODUCCIÓN.`);
    for (const reason of target.reasons) logger.error(`  · ${reason}`);
    logger.error('Si es intencionado, repite con --force o ALLOW_PRODUCTION_WRITES=true,');
    logger.error('y solo tras una copia restaurable y probada.');
    return true;
  }
  logger.warn(`\n[guardián] ${action}: se ejecuta sobre producción por confirmación explícita.`);
  return false;
}

// Resuelve la base de PRUEBAS: `DATABASE_URL_TEST` si existe; si no, `DATABASE_URL`.
// El destino se evalúa con el guardián para que una prueba de aceptación no se
// ejecute por accidente contra producción.
export function resolveTestDatabaseUrl({ env = process.env, argv = process.argv } = {}) {
  const url = env.DATABASE_URL_TEST || env.DATABASE_URL || null;
  const decision = evaluateWriteTarget({ env: { ...env, DATABASE_URL: url }, argv });
  return { url, ...decision };
}
