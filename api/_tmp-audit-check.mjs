import 'dotenv/config';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: 'require', transform: { ...postgres.camel, value: {} } });
const rows = await sql`SELECT id::text AS id, action, target_type, target_id, actor_id, ip_address, created_at FROM audit_logs ORDER BY id DESC LIMIT 5`;
console.log('audit rows:', JSON.stringify(rows, null, 1));
await sql.end();