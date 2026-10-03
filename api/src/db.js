import 'dotenv/config';
import postgres from 'postgres';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

export const sql = postgres(process.env.DATABASE_URL, {
  max: Number(process.env.DB_POOL_SIZE || 5),
  idle_timeout: 20,
  connect_timeout: 15,
  ssl: 'require',
  transform: postgres.camel,
});
