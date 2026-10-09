// Verificación de lanzamiento (SOLO LECTURA). No escribe nada.
//
// Uso:  npm run launch:check
//
// Comprueba los puntos de la lista de lanzamiento que se pueden verificar por
// código: configuración de entorno, canales, planificador y estado de la base.
// No imprime secretos. Los puntos manuales (identidad legal, pruebas en móvil,
// precios acordados) quedan fuera y se revisan a mano.
import 'dotenv/config';
import postgres from 'postgres';

const env = process.env;
const hostOf = (value) => { try { return new URL(value).hostname; } catch { return null; } };

const results = [];
const add = (level, label, detail = '') => results.push({ level, label, detail });
const pass = (l, d) => add('OK', l, d);
const warn = (l, d) => add('AVISO', l, d);
const fail = (l, d) => add('FALLO', l, d);

// ---- Entorno ---------------------------------------------------------------
const nodeEnv = (env.NODE_ENV || '').toLowerCase();
const vercelEnv = (env.VERCEL_ENV || '').toLowerCase();
const production = nodeEnv === 'production' || vercelEnv === 'production';
console.log(`Entorno: NODE_ENV=${nodeEnv || '—'} VERCEL_ENV=${vercelEnv || '—'} · host=${hostOf(env.DATABASE_URL) || '—'}`);

if (env.PUBLIC_SITE_URL) pass('PUBLIC_SITE_URL definido', env.PUBLIC_SITE_URL);
else fail('PUBLIC_SITE_URL', 'sin dominio público: canonical, sitemap y enlaces quedarían mal');

if (env.EMAIL_PROVIDER && env.EMAIL_PROVIDER !== 'disabled') pass('Canal de correo configurado', env.EMAIL_PROVIDER);
else warn('Canal de correo', 'EMAIL_PROVIDER=disabled: el acceso por enlace no está disponible');

if (env.AEMET_API_KEY) pass('AEMET configurada');
else warn('AEMET', 'sin AEMET_API_KEY: sin observación/previsión/avisos oficiales');

if (env.CRON_SECRET) pass('Planificador externo configurado (CRON_SECRET)');
else warn('Planificador', 'sin CRON_SECRET: no habrá pasadas de entrega/desconexión');

if (production && env.COOKIE_SECURE === 'false') fail('COOKIE_SECURE', 'no debe desactivarse en producción');
if (production && env.EMAIL_PROVIDER === 'console') fail('EMAIL_PROVIDER', 'console no debe usarse en producción');
if (production && env.OTP_DEBUG === 'true') warn('OTP_DEBUG', 'se ignora en producción, pero mejor quitarlo');

const sendEnabled = String(env.ALERT_SEND_ENABLED ?? 'true').toLowerCase() !== 'false';
const engineVerified = String(env.ALERT_ENGINE_VERIFIED ?? 'true').toLowerCase() !== 'false';
if (!sendEnabled) warn('Avisos externos', 'ALERT_SEND_ENABLED=false: fase de evaluación, sin envíos externos');
if (!engineVerified) warn('Motor de avisos', 'ALERT_ENGINE_VERIFIED=false: avisos locales ocultos a visitantes');

// ---- Base de datos ---------------------------------------------------------
if (!env.DATABASE_URL) {
  fail('DATABASE_URL', 'no definida');
} else {
  const sql = postgres(env.DATABASE_URL, { max: 1, ssl: 'require' });
  try {
    const [counts] = await sql`
      SELECT
        (SELECT count(*)::int FROM devices WHERE active) AS devices,
        (SELECT count(*)::int FROM devices WHERE active AND publish_permission) AS public_stations,
        (SELECT count(*)::int FROM measurements WHERE deleted_at IS NULL) AS measurements,
        (SELECT count(*)::int FROM subscribers) AS subscribers,
        (SELECT count(*)::int FROM farm_leads) AS leads,
        (SELECT count(*)::int FROM installations) AS installations,
        (SELECT count(*)::int FROM services) AS services,
        (SELECT count(*)::int FROM alerts WHERE closed_at IS NULL) AS open_alerts,
        (SELECT count(*)::int FROM notification_outbox WHERE status = 'pending') AS outbox_pending,
        (SELECT count(*)::int FROM notification_outbox WHERE status = 'failed') AS outbox_failed,
        (SELECT max(observed_at) FROM measurements WHERE is_validated AND deleted_at IS NULL) AS last_valid`;
    console.log(`Base: ${counts.devices} estaciones · ${counts.public_stations} públicas · ${counts.measurements} mediciones · ${counts.subscribers} cuentas · ${counts.leads} solicitudes · ${counts.installations} instalaciones · ${counts.services} servicios`);

    if (counts.devices > 0) pass('Hay estaciones activas', String(counts.devices));
    else fail('Estaciones', 'ninguna estación activa');
    if (counts.public_stations > 0) pass('Hay estación pública', String(counts.public_stations));
    else warn('Estación pública', 'ninguna con permiso de publicación: la portada no mostrará datos');

    if (counts.last_valid) {
      const ageMin = Math.round((Date.now() - new Date(counts.last_valid).getTime()) / 60000);
      const label = `Última medición válida hace ${ageMin} min`;
      if (ageMin <= 30) pass(label);
      else warn(label, 'puede indicar estación sin datos recientes');
    } else warn('Mediciones', 'sin mediciones válidas');

    if (counts.outbox_failed > 0) warn('Cola con fallidos', String(counts.outbox_failed));
    else pass('Cola sin fallidos');
    if (counts.open_alerts > 0) warn('Avisos abiertos', String(counts.open_alerts));

    // Integridad: toda estación debería tener una instalación vigente.
    const [orphans] = await sql`
      SELECT count(*)::int AS n FROM devices d
      WHERE d.active AND NOT EXISTS (
        SELECT 1 FROM installations i WHERE i.device_id = d.id AND i.ended_at IS NULL)`;
    if (orphans.n === 0) pass('Cada estación activa tiene instalación vigente');
    else warn('Instalaciones', `${orphans.n} estación(es) sin instalación abierta`);

    // Integridad de identidad de muestras (la clave única debería impedir duplicados).
    const [dupes] = await sql`
      SELECT count(*)::int AS n FROM (
        SELECT device_id, sequence, observed_at FROM measurements
        GROUP BY device_id, sequence, observed_at HAVING count(*) > 1) t`;
    if (dupes.n === 0) pass('Sin identidades de muestra duplicadas');
    else fail('Duplicados de muestra', String(dupes.n));
  } finally {
    await sql.end();
  }
}

// ---- Informe ---------------------------------------------------------------
const order = { FALLO: 0, AVISO: 1, OK: 2 };
results.sort((a, b) => order[a.level] - order[b.level]);
console.log('\nLista de lanzamiento (verificación automática):');
for (const r of results) console.log(`  [${r.level}] ${r.label}${r.detail ? ` — ${r.detail}` : ''}`);
const failures = results.filter((r) => r.level === 'FALLO').length;
const warnings = results.filter((r) => r.level === 'AVISO').length;
console.log(`\n${results.length - failures - warnings} OK · ${warnings} avisos · ${failures} fallos`);
console.log('Recuerda: la identidad legal, la privacidad, los precios acordados y las pruebas en móvil se revisan a mano.');
process.exit(failures > 0 ? 1 : 0);
