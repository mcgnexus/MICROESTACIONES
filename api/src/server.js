import express from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { sql } from './db.js';
import { randomToken, sha256, verifyPassword } from './security.js';
import { measurementSchema } from './contracts.js';

const app = express();
const port = Number(process.env.PORT || 8080);
const sessionDays = Math.max(1, Math.min(30, Number(process.env.SESSION_TTL_DAYS || 7)));
const cookieSecure = process.env.COOKIE_SECURE !== 'false';
app.disable('x-powered-by');
if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1);
app.use(express.json({ limit: '64kb', strict: true }));
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'same-origin');
  res.set('X-Frame-Options', 'DENY');
  if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
  next();
});

function cookies(header = '') {
  return Object.fromEntries(header.split(';').map((part) => {
    const i = part.indexOf('=');
    return i < 0 ? ['', ''] : [part.slice(0, i).trim(), decodeURIComponent(part.slice(i + 1).trim())];
  }).filter(([key]) => key));
}

async function requireDevice(req, res, next) {
  const token = req.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{32,})$/)?.[1];
  if (!token) return res.status(401).json({ error: 'device_auth_required' });
  const [credential] = await sql`SELECT d.id FROM device_credentials c
    JOIN devices d ON d.id = c.device_id
    WHERE c.token_hash = ${sha256(token)} AND c.revoked_at IS NULL AND d.active = true`;
  if (!credential) return res.status(401).json({ error: 'invalid_device_token' });
  req.deviceId = credential.id;
  next();
}

async function requireSubscriber(req, res, next) {
  const token = cookies(req.headers.cookie).tr_session;
  if (!token) return res.status(401).json({ error: 'authentication_required' });
  const [subscriber] = await sql`SELECT s.id, s.email FROM web_sessions w
    JOIN subscribers s ON s.id = w.subscriber_id
    WHERE w.token_hash = ${sha256(token)} AND w.expires_at > now() AND s.active = true`;
  if (!subscriber) return res.status(401).json({ error: 'session_expired' });
  req.subscriber = subscriber;
  next();
}

const loginAttempts = new Map();
function loginLimited(req, res, next) {
  const key = req.ip;
  const now = Date.now();
  const item = loginAttempts.get(key) || { count: 0, until: now + 15 * 60_000 };
  if (now > item.until) { item.count = 0; item.until = now + 15 * 60_000; }
  if (item.count >= 10) return res.status(429).json({ error: 'too_many_attempts' });
  item.count++;
  loginAttempts.set(key, item);
  next();
}

app.get('/health', async (_req, res) => {
  await sql`SELECT 1`;
  res.json({ status: 'ok' });
});

app.post('/api/auth/login', loginLimited, async (req, res) => {
  const parsed = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(256) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_credentials' });
  const email = parsed.data.email.toLowerCase();
  const [subscriber] = await sql`SELECT id, email, password_hash FROM subscribers WHERE email = ${email} AND active = true`;
  const valid = subscriber && await verifyPassword(parsed.data.password, subscriber.passwordHash);
  if (!valid) return res.status(401).json({ error: 'invalid_credentials' });
  loginAttempts.delete(req.ip);
  const token = randomToken();
  await sql`INSERT INTO web_sessions (token_hash, subscriber_id, expires_at)
    VALUES (${sha256(token)}, ${subscriber.id}, now() + (${sessionDays} * interval '1 day'))`;
  res.setHeader('Set-Cookie', `tr_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${sessionDays * 86400}${cookieSecure ? '; Secure' : ''}`);
  res.json({ email: subscriber.email });
});

app.post('/api/auth/logout', async (req, res) => {
  const token = cookies(req.headers.cookie).tr_session;
  if (token) await sql`DELETE FROM web_sessions WHERE token_hash = ${sha256(token)}`;
  res.setHeader('Set-Cookie', 'tr_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0' + (cookieSecure ? '; Secure' : ''));
  res.status(204).end();
});

// Keep these paths compatible with the current ESP32 upload/config client.
app.post('/api/measurements', requireDevice, async (req, res) => {
  const parsed = z.array(measurementSchema).min(1).max(32).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_measurements', details: parsed.error.issues });
  if (parsed.data.some((record) => record.device_id !== req.deviceId)) {
    return res.status(403).json({ error: 'device_identity_mismatch' });
  }

  const ackThrough = await sql.begin(async (tx) => {
    let highest = null;
    for (const record of parsed.data) {
      const observedAt = new Date(record.ts * 1000);
      const [inserted] = await tx`INSERT INTO measurements
        (device_id, sequence, observed_at, time_quality, temperature_c, humidity_pct, pressure_pa, battery_mv, flags, alert_level)
        VALUES (${req.deviceId}, ${record.sequence}, ${observedAt}, ${record.quality}, ${record.temp_c ?? null},
          ${record.hum_pct ?? null}, ${record.press_pa ?? null}, ${record.batt_mv ?? null}, ${record.flags}, ${record.alert})
        ON CONFLICT (device_id, sequence, observed_at) DO NOTHING RETURNING id`;
      await tx`UPDATE devices SET last_seen_at = now() WHERE id = ${req.deviceId}`;
      if (record.alert > 0 && inserted) {
        const dedupeKey = createHash('sha256').update(`${req.deviceId}:${record.sequence}:${record.ts}:${record.alert}`).digest('hex');
        const summary = record.alert === 1 ? 'Alerta prioritaria de la estación' : 'Aviso de la estación';
        await tx`INSERT INTO alerts (device_id, measurement_id, dedupe_key, level, message, value, observed_at)
          VALUES (${req.deviceId}, ${inserted.id}, ${dedupeKey}, ${record.alert}, ${summary},
            ${tx.json({ temp_c: record.temp_c ?? null, hum_pct: record.hum_pct ?? null, press_pa: record.press_pa ?? null, batt_mv: record.batt_mv ?? null })}, ${observedAt})
          ON CONFLICT (dedupe_key) DO NOTHING`;
      }
      highest = record.sequence;
    }
    return highest;
  });
  res.json({ ack_through: ackThrough });
});

app.get('/api/config', requireDevice, async (req, res) => {
  // Se sirve el JSON tal cual (como texto) para NO pasar por transform: postgres.camel
  // reescribiria las claves snake_case (pressure_alert_low_pa) a camelCase y el
  // firmware del dispositivo no las reconoceria.
  const [row] = await sql`SELECT config::text AS config FROM device_configs WHERE device_id = ${req.deviceId}`;
  res.type('application/json').send(row?.config ?? '{}');
});

// A server-side provider adapter may push forecast data here; provider keys never reach the browser/device.
app.post('/api/v1/forecasts', async (req, res) => {
  const expected = process.env.FORECAST_INGEST_TOKEN;
  const supplied = req.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{32,})$/)?.[1];
  const suppliedDigest = supplied ? Buffer.from(sha256(supplied), 'hex') : null;
  const expectedDigest = expected ? Buffer.from(sha256(expected), 'hex') : null;
  if (!suppliedDigest || !expectedDigest || !timingSafeEqual(suppliedDigest, expectedDigest)) {
    return res.status(401).json({ error: 'forecast_ingest_auth_required' });
  }
  const forecastSchema = z.object({
    device_id: z.string().min(1).max(80), provider: z.string().min(1).max(80),
    forecasts: z.array(z.object({
      forecast_for: z.string().datetime(),
      temperature_c: z.number().finite().min(-80).max(100).nullable().optional(),
      humidity_pct: z.number().finite().min(0).max(100).nullable().optional(),
      precipitation_mm: z.number().finite().min(0).max(1000).nullable().optional(),
      payload: z.record(z.string(), z.unknown()).optional(),
    }).strict()).min(1).max(240),
  }).strict().safeParse(req.body);
  if (!forecastSchema.success) return res.status(400).json({ error: 'invalid_forecasts', details: forecastSchema.error.issues });
  const { device_id: deviceId, provider, forecasts } = forecastSchema.data;
  const [device] = await sql`SELECT id FROM devices WHERE id = ${deviceId} AND active = true`;
  if (!device) return res.status(404).json({ error: 'device_not_found' });
  await sql.begin(async (tx) => {
    for (const forecast of forecasts) {
      await tx`INSERT INTO external_forecasts
        (device_id, provider, forecast_for, temperature_c, humidity_pct, precipitation_mm, payload)
        VALUES (${deviceId}, ${provider}, ${new Date(forecast.forecast_for)}, ${forecast.temperature_c ?? null},
          ${forecast.humidity_pct ?? null}, ${forecast.precipitation_mm ?? null}, ${tx.json(forecast.payload || {})})
        ON CONFLICT (device_id, provider, forecast_for) DO UPDATE SET
          fetched_at = now(), temperature_c = EXCLUDED.temperature_c, humidity_pct = EXCLUDED.humidity_pct,
          precipitation_mm = EXCLUDED.precipitation_mm, payload = EXCLUDED.payload`;
    }
  });
  res.json({ stored: forecasts.length, source: 'external_provider' });
});

app.get('/api/v1/alerts', requireSubscriber, async (req, res) => {
  const rows = await sql`SELECT a.id, a.device_id, d.name AS device_name, a.level, a.message, a.value,
      a.source, a.observed_at, a.created_at, a.acknowledged_at
    FROM alerts a JOIN devices d ON d.id = a.device_id
    JOIN subscriber_devices sd ON sd.device_id = d.id
    WHERE sd.subscriber_id = ${req.subscriber.id}
    ORDER BY a.created_at DESC LIMIT 200`;
  res.json({ alerts: rows });
});

function haversineKm(aLat, aLon, bLat, bLon) {
  const r = Math.PI / 180;
  const dLat = (bLat - aLat) * r;
  const dLon = (bLon - aLon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

app.get('/api/v1/dashboard', requireSubscriber, async (req, res) => {
  const period = req.query.period || '24h';
  const hours = { '24h': 24, '7d': 168, '30d': 720 }[period];
  if (!hours) return res.status(400).json({ error: 'period_must_be_24h_7d_or_30d' });
  const devices = await sql`SELECT d.id, d.name, d.latitude, d.longitude, d.coverage_km, d.last_seen_at,
      c.config, sd.subscriber_id
    FROM devices d JOIN subscriber_devices sd ON sd.device_id = d.id
    LEFT JOIN device_configs c ON c.device_id = d.id
    WHERE sd.subscriber_id = ${req.subscriber.id} AND d.active = true ORDER BY d.name`;
  const response = [];
  for (const device of devices) {
    const [latest] = await sql`SELECT sequence, observed_at, time_quality, temperature_c, humidity_pct,
        pressure_pa, battery_mv, flags, alert_level
      FROM measurements WHERE device_id = ${device.id} ORDER BY observed_at DESC, received_at DESC LIMIT 1`;
    const history = await sql`SELECT observed_at, temperature_c, humidity_pct, pressure_pa, battery_mv,
        flags, alert_level, time_quality
      FROM measurements WHERE device_id = ${device.id} AND observed_at >= now() - (${hours} * interval '1 hour')
      ORDER BY observed_at ASC`;
    const [summary] = await sql`SELECT count(*)::integer AS count,
        min(temperature_c) AS temp_min, max(temperature_c) AS temp_max, avg(temperature_c) AS temp_avg,
        min(humidity_pct) AS humidity_min, max(humidity_pct) AS humidity_max, avg(humidity_pct) AS humidity_avg,
        min(pressure_pa) AS pressure_min, max(pressure_pa) AS pressure_max, avg(pressure_pa) AS pressure_avg,
        min(battery_mv) AS battery_min, max(battery_mv) AS battery_max, avg(battery_mv) AS battery_avg
      FROM measurements WHERE device_id = ${device.id} AND observed_at >= now() - (${hours} * interval '1 hour')`;
    const forecasts = await sql`SELECT provider, forecast_for, fetched_at, temperature_c, humidity_pct, precipitation_mm
      FROM external_forecasts WHERE device_id = ${device.id} AND forecast_for >= now() - interval '1 hour'
      ORDER BY forecast_for ASC LIMIT 100`;

    let nearby = { stations: [], representative: false, message: 'Ubicación de estación no configurada.' };
    if (device.latitude != null && device.longitude != null) {
      const candidates = await sql`SELECT id, name, latitude, longitude, coverage_km, last_seen_at
        FROM devices WHERE active = true AND id <> ${device.id} AND latitude IS NOT NULL AND longitude IS NOT NULL
          AND last_seen_at >= now() - interval '2 hours'`;
      const stations = candidates.map((candidate) => ({ ...candidate,
        distance_km: haversineKm(device.latitude, device.longitude, candidate.latitude, candidate.longitude),
      })).filter((station) => station.distance_km <= station.coverage_km)
        .sort((a, b) => a.distance_km - b.distance_km).slice(0, 3);
      nearby = { stations, representative: stations.length === 3,
        message: stations.length === 3 ? 'Tres estaciones activas dentro de su cobertura.' : `Solo ${stations.length} de 3 estaciones cercanas disponibles y cubiertas.` };
    }

    const lastSeen = device.lastSeenAt ? new Date(device.lastSeenAt) : null;
    response.push({
      device: { id: device.id, name: device.name },
      status: { connected: !!lastSeen && Date.now() - lastSeen.getTime() <= 2 * Number(device.config?.interval_normal_s || 900) * 1000,
        last_seen_at: device.lastSeenAt || null,
        battery: latest?.battery_mv == null ? 'unknown' : latest.battery_mv <= Number(device.config?.battery_critical_mv || 3200) ? 'critical' : latest.battery_mv <= Number(device.config?.battery_low_mv || 3400) ? 'low' : 'ok',
        sensors: latest ? { temperature: latest.temperatureC != null, humidity: latest.humidityPct != null, pressure: latest.pressurePa != null, battery: latest.batteryMv != null } : null },
      latest: latest || null,
      history,
      summary,
      forecasts,
      forecast_source: forecasts.length ? 'external_provider' : null,
      estimates: [],
      nearby,
    });
  }
  const alerts = await sql`SELECT a.id, a.device_id, d.name AS device_name, a.level, a.message, a.value,
      a.source, a.observed_at, a.created_at
    FROM alerts a JOIN devices d ON d.id = a.device_id
    JOIN subscriber_devices sd ON sd.device_id = d.id
    WHERE sd.subscriber_id = ${req.subscriber.id}
    ORDER BY a.created_at DESC LIMIT 50`;
  res.json({ period, devices: response, alerts });
});

// Filtro comun: rango de fechas + dispositivo, limitado siempre a las estaciones del suscriptor.
function measurementQuery(req) {
  const from = req.query.from ? new Date(String(req.query.from)) : null;
  const to = req.query.to ? new Date(String(req.query.to)) : null;
  if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) return null;
  const deviceId = typeof req.query.device_id === 'string' && req.query.device_id ? req.query.device_id : null;
  const conditions = [sql`m.device_id IN (SELECT sd.device_id FROM subscriber_devices sd WHERE sd.subscriber_id = ${req.subscriber.id})`];
  if (deviceId) conditions.push(sql`m.device_id = ${deviceId}`);
  if (from) conditions.push(sql`m.observed_at >= ${from}`);
  if (to) conditions.push(sql`m.observed_at < ${to}`);
  let where = conditions[0];
  for (let i = 1; i < conditions.length; i++) where = sql`${where} AND ${conditions[i]}`;
  return { where };
}

// Listado de mediciones por rango de fechas y borrado (solo suscriptor y solo sus equipos).
app.get('/api/v1/measurements', requireSubscriber, async (req, res) => {
  const query = measurementQuery(req);
  if (!query) return res.status(400).json({ error: 'invalid_range' });
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit ?? '100', 10) || 100, 1), 500);
  const offset = Math.max(Number.parseInt(req.query.offset ?? '0', 10) || 0, 0);

  const rows = await sql`SELECT m.id::text AS id, m.device_id, d.name AS device_name, m.sequence::text AS sequence,
      m.observed_at, m.time_quality, m.temperature_c, m.humidity_pct, m.pressure_pa, m.battery_mv, m.flags, m.alert_level
    FROM measurements m JOIN devices d ON d.id = m.device_id
    WHERE ${query.where} ORDER BY m.observed_at DESC LIMIT ${limit} OFFSET ${offset}`;
  const [count] = await sql`SELECT count(*)::integer AS total FROM measurements m WHERE ${query.where}`;
  res.json({ measurements: rows, total: count.total, limit, offset });
});

// Exportacion CSV con los mismos filtros que la tabla.
app.get('/api/v1/measurements.csv', requireSubscriber, async (req, res) => {
  const query = measurementQuery(req);
  if (!query) return res.status(400).json({ error: 'invalid_range' });
  const rows = await sql`SELECT m.id::text AS id, m.device_id, d.name AS device_name, m.sequence::text AS sequence,
      m.observed_at, m.time_quality, m.temperature_c, m.humidity_pct, m.pressure_pa, m.battery_mv, m.flags, m.alert_level
    FROM measurements m JOIN devices d ON d.id = m.device_id
    WHERE ${query.where} ORDER BY m.observed_at DESC LIMIT 20000`;

  const alertName = (level) => level === 1 ? 'prioritaria' : level === 2 ? 'aviso' : '';
  const columns = ['estacion', 'dispositivo', 'secuencia', 'fecha_hora_utc', 'calidad_hora',
    'temperatura_c', 'humedad_pct', 'presion_pa', 'bateria_mv', 'flags', 'alerta'];
  const lines = [columns.join(',')];
  for (const row of rows) {
    lines.push([row.deviceName, row.deviceId, row.sequence, row.observedAt.toISOString(), row.timeQuality,
      row.temperatureC, row.humidityPct, row.pressurePa, row.batteryMv, row.flags, alertName(row.alertLevel)]
      .map((value) => {
        const text = value == null ? '' : String(value);
        return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
      }).join(','));
  }
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="tecrural-mediciones.csv"');
  res.send('\uFEFF' + lines.join('\r\n') + '\r\n');
});

app.delete('/api/v1/measurements/:id', requireSubscriber, async (req, res) => {
  // Cabecera obligatoria: un formulario cross-site no puede enviarla (defensa CSRF).
  if (req.get('x-requested-with') !== 'fetch') return res.status(400).json({ error: 'missing_client_header' });
  if (!/^\d{1,18}$/.test(req.params.id)) return res.status(400).json({ error: 'invalid_id' });
  const removed = await sql`DELETE FROM measurements m USING subscriber_devices sd
    WHERE m.id = ${req.params.id}::bigint AND sd.device_id = m.device_id AND sd.subscriber_id = ${req.subscriber.id}
    RETURNING m.id::text AS id`;
  if (!removed.length) return res.status(404).json({ error: 'measurement_not_found' });
  res.status(204).end();
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }));
app.use(express.static(fileURLToPath(new URL('../public/', import.meta.url)), { index: 'index.html', maxAge: '1h' }));
app.get('*path', async (_req, res, next) => {
  try { res.type('html').send(await readFile(new URL('../public/index.html', import.meta.url))); }
  catch (error) { next(error); }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  if (res.headersSent) return;
  if (error instanceof SyntaxError && 'body' in error) return res.status(400).json({ error: 'invalid_json' });
  res.status(500).json({ error: 'internal_error' });
});

app.listen(port, () => console.log(`TECRURAL API listening on ${port}`));
