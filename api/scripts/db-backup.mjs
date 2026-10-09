// Copia lógica de la base de datos con pg_dump (formato custom, restaurable con
// pg_restore). No imprime la URL de conexión ni la contraseña.
//
// Uso:  npm run db:backup
//       npm run db:backup -- --out C:\ruta\backup.dump
//
// Requiere que pg_dump esté instalado y en el PATH. Si no lo está, lo indica
// sin intentar nada más. No escribe en la base de datos de origen.
import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

if (!process.env.DATABASE_URL) {
  console.error('Falta DATABASE_URL. Define el entorno antes de copiar.');
  process.exit(1);
}

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
const out = outIndex >= 0 && args[outIndex + 1]
  ? resolve(args[outIndex + 1])
  : join(process.cwd(), 'backups', `backup-tecrural-${stamp}.dump`);

mkdirSync(dirname(out), { recursive: true });

const version = spawnSync('pg_dump', ['--version'], { encoding: 'utf8' });
if (version.error) {
  console.error('pg_dump no está disponible en el PATH.');
  console.error('Instala las herramientas cliente de PostgreSQL y vuelve a intentarlo.');
  console.error('Alternativa: crear una rama (branch) de la base en Neon como copia congelada.');
  process.exit(1);
}

console.log(`Creando copia en: ${out}`);
const dump = spawnSync('pg_dump', [
  process.env.DATABASE_URL,
  '--format=custom',
  '--no-owner',
  '--no-acl',
  `--file=${out}`,
], { stdio: ['ignore', 'inherit', 'inherit'] });

if (dump.status !== 0) {
  console.error('La copia falló. No se ha modificado la base de datos.');
  process.exit(dump.status ?? 1);
}
console.log('Copia completada. Verifica el tamaño y que contiene las tablas principales');
console.log('(subscribers, devices, measurements, farm_leads) antes de continuar.');
