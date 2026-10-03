import { hashPassword } from './security.js';
import { sql } from './db.js';

const [emailArg, password, ...deviceIds] = process.argv.slice(2);
const email = emailArg?.trim().toLowerCase();
if (!email || !password || password.length < 12 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ||
    deviceIds.some((id) => !/^[A-Za-z0-9][A-Za-z0-9:_-]{0,79}$/.test(id))) {
  console.error('Usage: npm run create-user -- subscriber@example.com "password-at-least-12-chars" [device-id ...]');
  process.exitCode = 2;
} else {
  try {
    const passwordHash = await hashPassword(password);
    await sql.begin(async (tx) => {
      const [subscriber] = await tx`INSERT INTO subscribers (email, password_hash) VALUES (${email}, ${passwordHash})
        ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, active = true
        RETURNING id`;
      for (const deviceId of deviceIds) {
        const [device] = await tx`SELECT id FROM devices WHERE id = ${deviceId} AND active = true`;
        if (!device) throw new Error(`Active device not found: ${deviceId}`);
        await tx`INSERT INTO subscriber_devices (subscriber_id, device_id)
          VALUES (${subscriber.id}, ${deviceId}) ON CONFLICT DO NOTHING`;
      }
    });
    console.log(`Subscriber provisioned: ${email}`);
  } finally {
    await sql.end();
  }
}
