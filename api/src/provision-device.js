import { randomToken, sha256 } from './security.js';
import { sql } from './db.js';

const [deviceId, name, latArg, lonArg] = process.argv.slice(2);
const lat = latArg === undefined ? null : Number(latArg);
const lon = lonArg === undefined ? null : Number(lonArg);
if (!deviceId || !/^[A-Za-z0-9][A-Za-z0-9:_-]{0,79}$/.test(deviceId) || !name || ((lat === null) !== (lon === null)) ||
    (lat !== null && (!Number.isFinite(lat) || lat < -90 || lat > 90)) ||
    (lon !== null && (!Number.isFinite(lon) || lon < -180 || lon > 180))) {
  console.error('Usage: npm run provision-device -- device-id "Station name" [latitude longitude]');
  process.exitCode = 2;
} else {
  const token = randomToken();
  try {
    await sql.begin(async (tx) => {
      await tx`INSERT INTO devices (id, name, latitude, longitude) VALUES (${deviceId}, ${name}, ${lat}, ${lon})
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude, active = true`;
      await tx`UPDATE device_credentials SET revoked_at = now() WHERE device_id = ${deviceId} AND revoked_at IS NULL`;
      await tx`INSERT INTO device_credentials (token_hash, device_id) VALUES (${sha256(token)}, ${deviceId})`;
      await tx`INSERT INTO device_configs (device_id) VALUES (${deviceId}) ON CONFLICT DO NOTHING`;
    });
    console.log(`Device: ${deviceId}\nBearer token (shown once; provision it securely on the device):\n${token}`);
  } finally {
    await sql.end();
  }
}
