import 'dotenv/config';
import { randomToken, sha256 } from './src/security.js';
import postgres from 'postgres';

const BASE = 'http://127.0.0.1:8123';
const sql = postgres(process.env.DATABASE_URL, { max: 2, ssl: 'require', transform: { ...postgres.camel, value: {} } });
const SESSION = randomToken();
await sql`INSERT INTO web_sessions (token_hash, subscriber_id, expires_at)
  SELECT ${sha256(SESSION)}, id, now() + interval '10 minutes' FROM subscribers ORDER BY id LIMIT 1`;

async function api(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { 'X-Requested-With': 'fetch', Cookie: `tr_session=${SESSION}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

const patch = await api('/api/v1/stations/esp32c3-01', { method: 'PATCH', body: { owner: 'QA UI' } });
console.log('PATCH status', patch.status, JSON.stringify(patch.body).slice(0, 160));
const audit = await api('/api/v1/admin/audit?limit=3');
console.log('audit status', audit.status, JSON.stringify(audit.body).slice(0, 300));
const restore = await api('/api/v1/stations/esp32c3-01', { method: 'PATCH', body: { owner: null } });
console.log('restore status', restore.status);

await sql`DELETE FROM web_sessions WHERE token_hash = ${sha256(SESSION)}`;
await sql.end();