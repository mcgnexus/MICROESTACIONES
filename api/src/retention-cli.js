import { sql } from './db.js';
import { runRetention } from './retention.js';
import { evaluateWriteTarget, reportWriteTarget } from './env-guard.js';

// La retención borra datos: no debe ejecutarse por accidente sobre producción.
if (reportWriteTarget('retención', evaluateWriteTarget())) process.exit(1);

try {
  const result = await runRetention(sql);
  console.log(`Retención: ${result.leadsDeleted} leads y ${result.outboxDeleted} envíos eliminados.`);
} finally {
  await sql.end();
}
