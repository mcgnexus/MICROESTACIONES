// Restaura una copia lógica en una base de datos DISTINTA de la de origen.
//
// Uso:  npm run db:restore -- --in backups\backup-tecrural-YYYYMMDDHHMM.dump --target "postgresql://..."
//
// Reglas de seguridad:
//   · El destino debe indicarse con --target (o DATABASE_URL_RESTORE). Nunca usa
//     DATABASE_URL como destino por defecto.
//   · Se rechaza si el host del destino coincide con el de DATABASE_URL: evita
//     sobrescribir producción por accidente.
//   · No imprime las URLs de conexión.
//
// No sustituye a una prueba de restauración cronometrada en entorno aislado.
import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const hostOf = (value) => {
  try { return new URL(value).hostname.toLowerCase(); } catch { return null; }
};

const args = process.argv.slice(2);
const readFlag = (name) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : null;
};

const file = readFlag('--in');
const target = readFlag('--target') || process.env.DATABASE_URL_RESTORE || null;

if (!file) {
  console.error('Falta --in <ruta del .dump>.');
  process.exit(1);
}
const filePath = resolve(file);
if (!existsSync(filePath)) {
  console.error(`No existe el fichero: ${filePath}`);
  process.exit(1);
}
if (!target) {
  console.error('Falta el destino. Usa --target "postgresql://..." o DATABASE_URL_RESTORE.');
  console.error('No se restaura sobre DATABASE_URL por defecto.');
  process.exit(1);
}

const sourceHost = hostOf(process.env.DATABASE_URL || '');
const targetHost = hostOf(target);
if (sourceHost && targetHost && sourceHost === targetHost) {
  console.error('El destino apunta al mismo host que DATABASE_URL.');
  console.error('Usa una base de datos de pruebas separada (p. ej. una rama de Neon).');
  process.exit(1);
}

const version = spawnSync('pg_restore', ['--version'], { encoding: 'utf8' });
if (version.error) {
  console.error('pg_restore no está disponible en el PATH.');
  console.error('Instala las herramientas cliente de PostgreSQL y vuelve a intentarlo.');
  process.exit(1);
}

console.log(`Restaurando ${filePath}`);
console.log(`Destino: host ${targetHost ?? '(desconocido)'}`);
const restore = spawnSync('pg_restore', [
  `--dbname=${target}`,
  '--clean',
  '--if-exists',
  '--no-owner',
  '--no-acl',
  filePath,
], { stdio: ['ignore', 'inherit', 'inherit'] });

if (restore.status !== 0) {
  console.error('La restauración devolvió un error. Revisa la salida anterior.');
  process.exit(restore.status ?? 1);
}
console.log('Restauración completada. Comprueba recuentos y tablas principales.');
