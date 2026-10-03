import { hashPassword } from './security.js';
import { sql } from './db.js';

const [emailArg, password] = process.argv.slice(2);
const email = emailArg?.trim().toLowerCase();
if (!email || !password || password.length < 12 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('Usage: npm run create-user -- subscriber@example.com "password-at-least-12-chars"');
  process.exitCode = 2;
} else {
  try {
    await sql`INSERT INTO subscribers (email, password_hash) VALUES (${email}, ${await hashPassword(password)})
      ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, active = true`;
    console.log(`Subscriber provisioned: ${email}`);
  } finally {
    await sql.end();
  }
}
