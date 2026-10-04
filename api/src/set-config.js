import { readFileSync } from 'node:fs';
import { sql } from './db.js';

// Uso:
//   node src/set-config.js <device-id>              -> muestra la config actual
//   node src/set-config.js <device-id> '<json>'     -> fusiona el JSON y guarda
//   node src/set-config.js <device-id> @patch.json  -> igual, leyendo el JSON de un fichero
//
// El endpoint /api/config solo permite LEER; la config se escribe aquí (device_configs).
// Las claves se guardan en snake_case, que es lo que espera el firmware del dispositivo.

const [deviceId, patchArg] = process.argv.slice(2);
const patchJson = patchArg?.startsWith('@') ? readFileSync(patchArg.slice(1), 'utf8') : patchArg;

if (!deviceId) {
  console.error("Uso: node src/set-config.js <device-id> ['{\"clave\":valor}' | @fichero.json]");
  process.exit(2);
}

try {
  // config::text evita el transform camel, que reescribiria las claves snake_case.
  const [row] = await sql`SELECT device_id, config::text AS config, updated_at FROM device_configs WHERE device_id = ${deviceId}`;
  if (!row) {
    console.error(`No hay fila en device_configs para ${deviceId}`);
    process.exit(1);
  }

  const current = row.config ? JSON.parse(row.config) : {};
  console.log(`ACTUAL (${row.updatedAt?.toISOString?.() ?? row.updatedAt}):`);
  console.log(JSON.stringify(current, null, 2));

  if (!patchJson) process.exit(0);

  let patch;
  try {
    patch = JSON.parse(patchJson);
  } catch {
    console.error('El patch debe ser JSON válido');
    process.exit(2);
  }

  const merged = { ...current, ...patch };
  await sql`UPDATE device_configs SET config = ${sql.json(merged)}, updated_at = now() WHERE device_id = ${deviceId}`;
  console.log('NUEVA CONFIG:');
  console.log(JSON.stringify(merged, null, 2));
} finally {
  await sql.end();
}
