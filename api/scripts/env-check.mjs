// Diagnóstico del entorno de ejecución SIN exponer secretos.
//
// Uso:  npm run env:check
//
// Clasifica el entorno y muestra el host y la base de datos a los que apunta
// DATABASE_URL, sin imprimir usuario ni contraseña. Sirve para confirmar que una
// prueba o una migración se ejecuta contra la base correcta antes de tocarla.
import 'dotenv/config';

const safeHost = (value) => {
  try {
    const url = new URL(value);
    return { host: url.hostname, database: url.pathname.replace(/^\//, '') || null, ssl: url.searchParams.get('sslmode') || null };
  } catch {
    return { host: null, database: null, ssl: null };
  }
};

const nodeEnv = (process.env.NODE_ENV || '').toLowerCase();
const vercelEnv = (process.env.VERCEL_ENV || '').toLowerCase();
const target = safeHost(process.env.DATABASE_URL || '');

// Lista opcional de hosts considerados producción (separados por coma).
const productionHosts = (process.env.PRODUCTION_DB_HOSTS || '')
  .split(',').map((host) => host.trim().toLowerCase()).filter(Boolean);

const looksProduction = vercelEnv === 'production'
  || nodeEnv === 'production'
  || (target.host != null && productionHosts.includes(target.host.toLowerCase()));

console.log('Entorno de ejecución');
console.log(`  NODE_ENV:   ${nodeEnv || '(sin definir)'}`);
console.log(`  VERCEL_ENV: ${vercelEnv || '(sin definir)'}`);
console.log('Base de datos');
console.log(`  host:     ${target.host ?? '(DATABASE_URL no válida o ausente)'}`);
console.log(`  database: ${target.database ?? '(sin nombre)'}`);
console.log(`  sslmode:  ${target.ssl ?? '(por defecto)'}`);
console.log(`  hosts de producción configurados: ${productionHosts.length || 0}`);
console.log(`Clasificación: ${looksProduction ? 'PRODUCCIÓN (tratar con cuidado)' : 'desarrollo / pruebas'}`);

if (looksProduction) {
  console.log('\nAviso: esta configuración parece producción. No ejecutes migraciones ni');
  console.log('retención sobre ella sin copia y confirmación explícita.');
}
