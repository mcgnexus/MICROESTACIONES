import 'dotenv/config';
import postgres from 'postgres';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

export const sql = postgres(process.env.DATABASE_URL, {
  max: Number(process.env.DB_POOL_SIZE || 5),
  idle_timeout: 20,
  connect_timeout: 15,
  ssl: 'require',
  // Solo se transforman los nombres de columna. Las claves internas de los jsonb
  // (config del firmware, raw_payload, pilot_requests…) deben conservarse tal cual
  // están almacenadas: transform.camel reescribiría interval_normal_s a intervalNormalS.
  transform: { ...postgres.camel, value: {} },
});
