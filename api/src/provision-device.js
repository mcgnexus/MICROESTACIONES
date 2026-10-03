import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomToken, sha256 } from './security.js';
import { sql } from './db.js';

const args = process.argv.slice(2);
const secretsArgIndex = args.indexOf('--secrets-file');
const secretsPathArg = secretsArgIndex >= 0 ? args[secretsArgIndex + 1] : null;
const positional = secretsArgIndex < 0
  ? args
  : args.filter((arg, index) => index !== secretsArgIndex && index !== secretsArgIndex + 1);
const [deviceId, name, latArg, lonArg] = positional;
const secretsPath = secretsPathArg ? resolve(process.cwd(), secretsPathArg) : null;
const lat = latArg === undefined ? null : Number(latArg);
const lon = lonArg === undefined ? null : Number(lonArg);
if (!deviceId || !/^[A-Za-z0-9][A-Za-z0-9:_-]{0,79}$/.test(deviceId) || !name || ((lat === null) !== (lon === null)) ||
    (secretsArgIndex >= 0 && !secretsPathArg) ||
    (lat !== null && (!Number.isFinite(lat) || lat < -90 || lat > 90)) ||
    (lon !== null && (!Number.isFinite(lon) || lon < -180 || lon > 180))) {
  console.error('Usage: npm run provision-device -- device-id "Station name" [latitude longitude] [--secrets-file path]');
  process.exitCode = 2;
} else {
  const token = randomToken();
  const tokenLine = /^#define DEVICE_API_TOKEN ".*"$/m;
  let secretsContent = null;
  let apiBaseUrl = null;
  try {
    if (secretsPath) {
      secretsContent = await readFile(secretsPath, 'utf8');
      if (!tokenLine.test(secretsContent)) throw new Error('secrets.h must contain one DEVICE_API_TOKEN string macro');
      const configuredId = secretsContent.match(/^#define DEVICE_ID "([^"]+)"$/m)?.[1];
      apiBaseUrl = secretsContent.match(/^#define API_BASE_URL "(https:\/\/[^\"]+)"$/m)?.[1] || null;
      if (configuredId !== deviceId) throw new Error('DEVICE_ID in secrets.h must match the provisioned device id');
      if (!apiBaseUrl) throw new Error('secrets.h must contain an HTTPS API_BASE_URL');
      secretsContent = secretsContent.replace(tokenLine, `#define DEVICE_API_TOKEN "${token}"`);
    }
    await sql.begin(async (tx) => {
      await tx`INSERT INTO devices (id, name, latitude, longitude) VALUES (${deviceId}, ${name}, ${lat}, ${lon})
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude, active = true`;
      await tx`UPDATE device_credentials SET revoked_at = now() WHERE device_id = ${deviceId} AND revoked_at IS NULL`;
      await tx`INSERT INTO device_credentials (token_hash, device_id) VALUES (${sha256(token)}, ${deviceId})`;
      await tx`INSERT INTO device_configs (device_id) VALUES (${deviceId}) ON CONFLICT DO NOTHING`;
      if (secretsPath) await writeFile(secretsPath, secretsContent, { encoding: 'utf8', mode: 0o600 });
    });
    if (secretsPath) {
      console.log(`Device provisioned: ${deviceId}. Token saved to local secrets file: ${secretsPath}`);
      try {
        const response = await fetch(`${apiBaseUrl}/api/config`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(10000),
        });
        console.log(`Device authentication check: HTTP ${response.status}`);
        await response.body?.cancel();
      } catch {
        console.log('Device authentication check could not reach the deployed API.');
      }
    } else {
      console.log(`Device: ${deviceId}\nBearer token (shown once; provision it securely on the device):\n${token}`);
    }
  } finally {
    await sql.end();
  }
}
