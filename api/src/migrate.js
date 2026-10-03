import { readFile } from 'node:fs/promises';
import { sql } from './db.js';

try {
  const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
  for (const statement of schema.split(';').map((part) => part.trim()).filter(Boolean)) {
    await sql.unsafe(statement);
  }
  // The ESP32 queue stores monotonically increasing uint32 sequence numbers.
  await sql`ALTER TABLE measurements ALTER COLUMN sequence TYPE bigint`;
  await sql`ALTER TABLE measurements DROP CONSTRAINT IF EXISTS measurements_sequence_check`;
  await sql`ALTER TABLE measurements ADD CONSTRAINT measurements_sequence_check CHECK (sequence BETWEEN 0 AND 4294967295)`;
  console.log('Neon schema is up to date');
} finally {
  await sql.end();
}
