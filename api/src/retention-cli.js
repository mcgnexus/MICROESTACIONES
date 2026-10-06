import { sql } from './db.js';
import { runRetention } from './retention.js';

try {
  const result = await runRetention(sql);
  console.log(`Retención: ${result.leadsDeleted} leads y ${result.outboxDeleted} envíos eliminados.`);
} finally {
  await sql.end();
}
