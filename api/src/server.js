import express from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { sql } from './db.js';
import { randomToken, sha256, verifyPassword } from './security.js';
import { clearLoginAttempts, consumeLoginAttempt, loginRateLimitKeys } from './login-rate-limit.js';
import { measurementSchema, hasAnyValue } from './contracts.js';
import { requireDevice, requireSubscriber, requireRole, csrfGuard, cookies } from './auth.js';
import { evaluateMeasurement, VFLAG } from './validation.js';
import { evaluateMeasurementRules, evaluateSystemRules, releaseDirectives, pendingDirectiveIds, alertAge } from './alert-engine.js';
import { audit } from './audit.js';
import { csvCell } from './csv.js';
import stationsRouter, { statusPayload } from './stations.js';
import configsRouter from './configs.js';
import alertsRouter from './alerts.js';
import { NON_COMMUNICATION_ALERT } from './alert-visibility.js';
import { weatherForDevice } from './weather.js';
import adminRouter from './admin.js';
import accountRouter from './account.js';

const app = express();
const port = Number(process.env.PORT || 8080);
const sessionDays = Math.max(1, Math.min(30, Number(process.env.SESSION_TTL_DAYS || 7)));
const cookieSecure = process.env.COOKIE_SECURE !== 'false';
app.disable('x-powered-by');
if (process.env.TRUST_PROXY === 'true' || process.env.VERCEL) app.set('trust proxy', 1);
app.use(express.json({ limit: '64kb', strict: true }));
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'same-origin');
  res.set('X-Frame-Options', 'DENY');
  res.set('Content-Security-Policy', "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'");
  if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
  next();
});

app.get('/health', async (_req, res) => {
  await sql`SELECT 1`;
  res.json({ status: 'ok' });
});

app.post('/api/auth/login', async (req, res) => {
  const parsed = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(256) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_credentials' });
  const email = parsed.data.email.toLowerCase();
  const rateLimitKeys = loginRateLimitKeys(req.ip || req.socket.remoteAddress, email);
  if (await consumeLoginAttempt(sql, rateLimitKeys)) return res.status(429).json({ error: 'too_many_attempts' });
  const [subscriber] = await sql`SELECT id, email, password_hash, role FROM subscribers WHERE email = ${email} AND active = true`;
  const valid = subscriber && await verifyPassword(parsed.data.password, subscriber.passwordHash);
  if (!valid) return res.status(401).json({ error: 'invalid_credentials' });
  await clearLoginAttempts(sql, rateLimitKeys);
  const token = randomToken();
  await sql`INSERT INTO web_sessions (token_hash, subscriber_id, expires_at)
    VALUES (${sha256(token)}, ${subscriber.id}, now() + (${sessionDays} * interval '1 day'))`;
  res.setHeader('Set-Cookie', `tr_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${sessionDays * 86400}${cookieSecure ? '; Secure' : ''}`);
  res.json({ email: subscriber.email, role: subscriber.role });
});

app.post('/api/auth/logout', async (req, res) => {
  const token = cookies(req.headers.cookie).tr_session;
  if (token) await sql`DELETE FROM web_sessions WHERE token_hash = ${sha256(token)}`;
  res.setHeader('Set-Cookie', 'tr_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0' + (cookieSecure ? '; Secure' : ''));
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Ingesta de mediciones (compatible con el cliente ESP32 actual).
// El valor recibido se separa del dato validado: lo fuera de rango se conserva
// en raw_payload y la fila queda marcada como inválida, nunca se borra.
// ---------------------------------------------------------------------------
const batteryLevelFor = (batteryMv, config) => {
  if (batteryMv == null) return null;
  const critical = Number(config?.battery_critical_mv ?? 3200);
  const low = Number(config?.battery_low_mv ?? 3400);
  return batteryMv <= critical ? 'critical' : batteryMv <= low ? 'low' : 'ok';
};

// El equipo declara la versión de configuración que tiene aplicada. Solo entonces
// el cambio pasa de pendiente a aplicado. Una versión que no existe se ignora:
// no se acepta nada que el equipo no pueda haber recibido.
async function confirmConfigVersion(client, deviceId, version) {
  const [row] = await client`SELECT version FROM device_config_versions
    WHERE device_id = ${deviceId} AND version = ${version}`;
  if (!row) return false;
  const [applied] = await client`UPDATE device_config_versions
    SET confirmed_version = ${version}, applied_at = coalesce(applied_at, now()),
        requested_at = coalesce(requested_at, now())
    WHERE device_id = ${deviceId} AND version = ${version} AND confirmed_version IS DISTINCT FROM ${version}
    RETURNING version`;
  await client`UPDATE device_status SET config_version = ${version}, updated_at = now()
    WHERE device_id = ${deviceId}`;
  return !!applied;
}

app.post('/api/measurements', requireDevice, async (req, res) => {
  const parsed = z.array(measurementSchema).min(1).max(32).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_measurements', details: parsed.error.issues });
  if (parsed.data.some((record) => record.device_id !== req.deviceId)) {
    return res.status(403).json({ error: 'device_identity_mismatch' });
  }
  // Un registro sin ningun canal (sensor caido en ese ciclo) no se guarda, pero
  // se confirma: si se rechazara, la estacion reenviaria el mismo lote para
  // siempre y no subiria nada mas.
  const emptyRecords = parsed.data.filter((record) => !hasAnyValue(record)).length;
  if (emptyRecords > 0) {
    console.warn(`[measurements] ${emptyRecords} registros sin valores omitidos (device ${req.deviceId})`);
  }

  // Las directiva urgentes que ya estaban pendientes se liberan al final de este
  // envío; las que se creen ahora son para el siguiente despertar del equipo.
  const ackThrough = await sql.begin(async (tx) => {
    // Las directiva urgentes ya pendientes se liberan al final de este envío;
    // las que se creen ahora son para el siguiente despertar del equipo.
    const pendingDirectives = await pendingDirectiveIds(tx, req.deviceId);
    const [configRow] = await tx`SELECT config FROM device_configs WHERE device_id = ${req.deviceId}`;
    const config = configRow?.config ?? {};
    let highest = null;
    let lastBattery = null;
    let insertedAny = false;
    let appliedConfigVersion = null;

    for (const record of parsed.data) {
      const observedAt = new Date(record.ts * 1000);
      // Registro sin ningún canal: no hay fila que crear, pero su secuencia sí
      // se confirma más abajo para que el equipo la retire de su cola.
      if (hasAnyValue(record)) {
        const evaluated = evaluateMeasurement(record);
        const [inserted] = await tx`INSERT INTO measurements
          (device_id, sequence, observed_at, time_quality, temperature_c, humidity_pct, pressure_pa, battery_mv,
           flags, alert_level, lux, source, is_validated, validation_flags, raw_payload, invalidated_reason)
          VALUES (${req.deviceId}, ${record.sequence}, ${observedAt}, ${record.quality},
            ${evaluated.columns.temperature_c ?? null}, ${evaluated.columns.humidity_pct ?? null},
            ${evaluated.columns.pressure_pa ?? null}, ${evaluated.columns.battery_mv ?? null},
            ${record.flags}, ${record.alert}, ${evaluated.columns.lux ?? null}, ${record.source ?? 'wifi'},
            ${evaluated.is_validated}, ${evaluated.validation_flags},
            ${evaluated.raw_payload ? tx.json(evaluated.raw_payload) : null}, ${evaluated.invalidated_reason})
          ON CONFLICT (device_id, sequence, observed_at) DO NOTHING RETURNING id`;
        if (evaluated.columns.battery_mv != null) lastBattery = evaluated.columns.battery_mv;

        if (inserted) {
          insertedAny = true;
          if (record.alert > 0) {
            const dedupeKey = createHash('sha256')
              .update(`${req.deviceId}:${record.sequence}:${record.ts}:${record.alert}`).digest('hex');
            const summary = record.alert === 1 ? 'Alerta prioritaria de la estación' : 'Aviso de la estación';
            await tx`INSERT INTO alerts (device_id, measurement_id, dedupe_key, level, message, value, observed_at)
              VALUES (${req.deviceId}, ${inserted.id}, ${dedupeKey}, ${record.alert}, ${summary},
                ${tx.json({ temp_c: record.temp_c ?? null, hum_pct: record.hum_pct ?? null, press_pa: record.press_pa ?? null, batt_mv: record.batt_mv ?? null })}, ${observedAt})
              ON CONFLICT (dedupe_key) DO NOTHING`;
          }
          // Motor de avisos: la regla solo dispara si la condición se sostiene
          // (min_duration_s) y se recupera con margen (recovery_margin).
          await evaluateMeasurementRules(tx, {
            deviceId: req.deviceId,
            measurementId: inserted.id,
            values: record,
            at: observedAt,
            config,
          });
        }
      }
      // Confirmación de la configuración: el equipo declara qué versión tiene
      // aplicada. Hasta que lo dice, el cambio remoto sigue pendiente.
      if (record.config_version != null) {
        const confirmed = await confirmConfigVersion(tx, req.deviceId, record.config_version);
        if (confirmed) appliedConfigVersion = record.config_version;
      }
      highest = record.sequence;
    }

    // Estado operativo: último contacto, batería y conectividad.
    const batteryLevel = batteryLevelFor(lastBattery, config) ?? 'unknown';
    await tx`INSERT INTO device_status (device_id, last_contact, connectivity, battery_mv, battery_level, updated_at)
      VALUES (${req.deviceId}, now(), 'online', ${lastBattery}, ${batteryLevel}, now())
      ON CONFLICT (device_id) DO UPDATE SET
        last_contact = now(), connectivity = 'online',
        battery_mv = coalesce(${lastBattery}, device_status.battery_mv),
        battery_level = CASE WHEN ${lastBattery}::integer IS NULL THEN device_status.battery_level ELSE ${batteryLevel} END,
        updated_at = now()`;
    await tx`UPDATE devices SET last_seen_at = now() WHERE id = ${req.deviceId}`;
    // Este envío ya ha dado la oportunidad de subir la medida crítica antes de tiempo.
    await releaseDirectives(tx, req.deviceId, { batteryMv: lastBattery, ids: pendingDirectives });
    if (insertedAny) {
      await tx`UPDATE device_status s SET last_valid_data = (
          SELECT max(m.observed_at) FROM measurements m
          WHERE m.device_id = ${req.deviceId} AND m.is_validated AND m.deleted_at IS NULL)
        WHERE s.device_id = ${req.deviceId}`;
    }
    return { highest, appliedConfigVersion };
  });
  res.json({ ack_through: ackThrough.highest, ...(ackThrough.appliedConfigVersion
    ? { applied_config_version: ackThrough.appliedConfigVersion } : {}) });
});

app.get('/api/config', requireDevice, async (req, res) => {
  // Se sirve el JSON tal cual (como texto) para NO pasar por transform: postgres.camel
  // reescribiria las claves snake_case (pressure_alert_low_pa) a camelCase y el
  // firmware del dispositivo no las reconoceria.
  const [row] = await sql`SELECT config::text AS config FROM device_configs WHERE device_id = ${req.deviceId}`;
  // El equipo que pide la configuración deja constancia de contacto y de versión solicitada.
  await sql`UPDATE devices SET last_seen_at = now() WHERE id = ${req.deviceId}`;
  await sql`INSERT INTO device_status (device_id, last_contact) VALUES (${req.deviceId}, now())
    ON CONFLICT (device_id) DO UPDATE SET last_contact = now(), updated_at = now()`;
  await sql`UPDATE device_config_versions SET requested_version = version, requested_at = now()
    WHERE device_id = ${req.deviceId}
      AND version = (SELECT max(version) FROM device_config_versions WHERE device_id = ${req.deviceId})
      AND requested_version IS DISTINCT FROM version`;
  // Excepción urgente: si hay una directiva pendiente, el equipo debe intentar
  // subir la medida crítica en este mismo despertar. El firmware actual todavía
  // no la aplica; se mide su coste en batería antes de asumir el cambio.
  const [pending] = await sql`SELECT id, reason, issued_at FROM urgent_directives
    WHERE device_id = ${req.deviceId} AND released_at IS NULL ORDER BY issued_at LIMIT 1`;
  if (pending) {
    const config = row?.config ? JSON.parse(row.config) : {};
    res.json({
      ...config,
      _urgent: { id: pending.id, reason: pending.reason, issued_at: pending.issued_at },
    });
    return;
  }
  res.type('application/json').send(row?.config ?? '{}');
});

// Confirmación explícita de la configuración aplicada. Alternativa al campo
// config_version del lote, para un equipo que no pueda modificar su payload:
// una sola línea en el firmware tras aplicar la configuración.
app.post('/api/config/confirm', requireDevice, async (req, res) => {
  const version = Number.parseInt(String(req.query.version ?? req.body?.version ?? ''), 10);
  if (!Number.isInteger(version) || version < 1) return res.status(400).json({ error: 'invalid_version' });
  const confirmed = await sql.begin(async (tx) => confirmConfigVersion(tx, req.deviceId, version));
  if (!confirmed) return res.status(404).json({ error: 'version_not_found' });
  res.json({ version, state: 'aplicado', confirmed: true });
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

// ---------------------------------------------------------------------------
// Panel del suscriptor
// ---------------------------------------------------------------------------
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
      d.owner, d.location_type, d.public_zone, d.aemet_municipality_code, d.aemet_station_id,
      d.aemet_warning_area, d.altitude, d.sensors, d.firmware_version, d.publish_permission,
      c.config, st.last_contact, st.last_valid_data, st.battery_mv, st.battery_level,
      st.firmware_version AS status_firmware_version, st.config_version, st.pending_samples, st.updated_at
    FROM devices d JOIN subscriber_devices sd ON sd.device_id = d.id
    LEFT JOIN device_configs c ON c.device_id = d.id
    LEFT JOIN device_status st ON st.device_id = d.id
    WHERE sd.subscriber_id = ${req.subscriber.id} AND d.active = true ORDER BY d.name`;
  const deviceIds = devices.map((device) => device.id);
  const [latestRows, historyRows, summaryRows, forecastRows, nearbyCandidates] = deviceIds.length
    ? await Promise.all([
      sql`SELECT DISTINCT ON (device_id) device_id, sequence, observed_at, received_at, time_quality,
          temperature_c, humidity_pct, pressure_pa, battery_mv, lux, source, flags, alert_level,
          is_validated, validation_flags, invalidated_reason
        FROM measurements WHERE device_id = ANY(${deviceIds}) AND deleted_at IS NULL
        ORDER BY device_id, observed_at DESC, received_at DESC`,
      // Reduce a maximum de 500 puntos por estación, conservando el periodo y sus extremos.
      sql`WITH ranked AS (
          SELECT device_id, observed_at, received_at, temperature_c, humidity_pct, pressure_pa,
              battery_mv, lux, flags, alert_level, time_quality, source,
              row_number() OVER (PARTITION BY device_id ORDER BY observed_at, received_at) AS sample_no,
              count(*) OVER (PARTITION BY device_id) AS sample_count,
              min(temperature_c) OVER (PARTITION BY device_id) AS min_temp,
              max(temperature_c) OVER (PARTITION BY device_id) AS max_temp,
              min(humidity_pct) OVER (PARTITION BY device_id) AS min_humidity,
              max(humidity_pct) OVER (PARTITION BY device_id) AS max_humidity,
              min(pressure_pa) OVER (PARTITION BY device_id) AS min_pressure,
              max(pressure_pa) OVER (PARTITION BY device_id) AS max_pressure,
              min(battery_mv) OVER (PARTITION BY device_id) AS min_battery,
              max(battery_mv) OVER (PARTITION BY device_id) AS max_battery
            FROM measurements
            WHERE device_id = ANY(${deviceIds}) AND observed_at >= now() - (${hours} * interval '1 hour')
              AND is_validated AND deleted_at IS NULL
        )
        SELECT device_id, observed_at, received_at, temperature_c, humidity_pct, pressure_pa,
            battery_mv, lux, flags, alert_level, time_quality, source
          FROM ranked
          WHERE sample_count <= 500 OR sample_no = 1 OR sample_no = sample_count
            OR mod(sample_no, ceil(sample_count::numeric / 500)::bigint) = 0
            OR (min_temp IS NOT NULL AND temperature_c IN (min_temp, max_temp))
            OR (min_humidity IS NOT NULL AND humidity_pct IN (min_humidity, max_humidity))
            OR (min_pressure IS NOT NULL AND pressure_pa IN (min_pressure, max_pressure))
            OR (min_battery IS NOT NULL AND battery_mv IN (min_battery, max_battery))
          ORDER BY device_id, observed_at, received_at`,
      sql`SELECT device_id, count(*)::integer AS count,
          count(*) FILTER (WHERE is_validated)::integer AS valid_count,
          count(*) FILTER (WHERE NOT is_validated)::integer AS invalid_count,
          count(*) FILTER (WHERE temperature_c IS NOT NULL)::integer AS measured_count,
          min(temperature_c) FILTER (WHERE is_validated) AS temp_min,
          max(temperature_c) FILTER (WHERE is_validated) AS temp_max,
          avg(temperature_c) FILTER (WHERE is_validated) AS temp_avg,
          min(humidity_pct) FILTER (WHERE is_validated) AS humidity_min,
          max(humidity_pct) FILTER (WHERE is_validated) AS humidity_max,
          avg(humidity_pct) FILTER (WHERE is_validated) AS humidity_avg,
          min(pressure_pa) FILTER (WHERE is_validated) AS pressure_min,
          max(pressure_pa) FILTER (WHERE is_validated) AS pressure_max,
          avg(pressure_pa) FILTER (WHERE is_validated) AS pressure_avg,
          min(battery_mv) FILTER (WHERE is_validated) AS battery_min,
          max(battery_mv) FILTER (WHERE is_validated) AS battery_max,
          avg(battery_mv) FILTER (WHERE is_validated) AS battery_avg,
          min(lux) FILTER (WHERE is_validated) AS lux_min,
          max(lux) FILTER (WHERE is_validated) AS lux_max,
          avg(lux) FILTER (WHERE is_validated) AS lux_avg
        FROM measurements WHERE device_id = ANY(${deviceIds})
          AND observed_at >= now() - (${hours} * interval '1 hour') AND deleted_at IS NULL
        GROUP BY device_id`,
      sql`WITH ranked AS (
          SELECT device_id, provider, forecast_for, fetched_at, temperature_c, humidity_pct, precipitation_mm,
              row_number() OVER (PARTITION BY device_id ORDER BY forecast_for) AS row_no
            FROM external_forecasts WHERE device_id = ANY(${deviceIds})
              AND forecast_for >= now() - interval '1 hour'
        )
        SELECT device_id, provider, forecast_for, fetched_at, temperature_c, humidity_pct, precipitation_mm
          FROM ranked WHERE row_no <= 100 ORDER BY device_id, forecast_for`,
      sql`SELECT name, latitude, longitude, coverage_km, last_seen_at
        FROM devices WHERE active = true AND publish_permission = true
          AND latitude IS NOT NULL AND longitude IS NOT NULL
          AND last_seen_at >= now() - interval '2 hours'`,
    ])
    : [[], [], [], [], []];

  const latestByDevice = new Map(latestRows.map((row) => [row.deviceId, row]));
  const weatherByDevice = new Map(await Promise.all(devices.map(async (device) => [device.id, await weatherForDevice(device)])));
  const historyByDevice = new Map();
  for (const row of historyRows) {
    if (!historyByDevice.has(row.deviceId)) historyByDevice.set(row.deviceId, []);
    historyByDevice.get(row.deviceId).push(row);
  }
  const summaryByDevice = new Map(summaryRows.map((row) => [row.deviceId, row]));
  const forecastsByDevice = new Map();
  for (const row of forecastRows) {
    if (!forecastsByDevice.has(row.deviceId)) forecastsByDevice.set(row.deviceId, []);
    forecastsByDevice.get(row.deviceId).push(row);
  }

  const response = devices.map((device) => {
    const config = device.config ?? {};
    const latest = latestByDevice.get(device.id) ?? null;
    const history = historyByDevice.get(device.id) ?? [];
    const summary = summaryByDevice.get(device.id) ?? {
      count: 0, validCount: 0, invalidCount: 0, measuredCount: 0,
      tempMin: null, tempMax: null, tempAvg: null,
      humidityMin: null, humidityMax: null, humidityAvg: null,
      pressureMin: null, pressureMax: null, pressureAvg: null,
      batteryMin: null, batteryMax: null, batteryAvg: null,
      luxMin: null, luxMax: null, luxAvg: null,
    };
    const forecasts = forecastsByDevice.get(device.id) ?? [];

    // Cobertura: cuántos datos faltan frente a lo esperado por el intervalo configurado.
    const intervalSeconds = Number(config.interval_normal_s) || 900;
    const expected = Math.max(1, Math.floor((hours * 3600) / intervalSeconds));
    const coveragePct = Math.min(100, Math.round((summary.validCount / expected) * 1000) / 10);

    let nearby = { stations: [], representative: false, message: 'Ubicación de estación no configurada.' };
    if (device.latitude != null && device.longitude != null) {
      const stations = nearbyCandidates.map((candidate) => ({
        name: candidate.name,
        lastSeenAt: candidate.lastSeenAt,
        distanceKm: haversineKm(device.latitude, device.longitude, candidate.latitude, candidate.longitude),
        coverageKm: candidate.coverageKm,
      })).filter((station) => station.distanceKm <= station.coverageKm)
        .sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 3)
        .map(({ name, lastSeenAt, distanceKm }) => ({ name, lastSeenAt, distanceKm }));
      nearby = { stations, representative: stations.length === 3,
        message: stations.length === 3 ? 'Tres estaciones activas dentro de su cobertura.' : `Solo ${stations.length} de 3 estaciones cercanas disponibles y cubiertas.` };
    }

    return {
      device: {
        id: device.id, name: device.name, owner: device.owner, locationType: device.locationType,
        publicZone: device.publicZone, altitude: device.altitude, sensors: device.sensors,
        firmwareVersion: device.firmwareVersion, publishPermission: device.publishPermission,
      },
      status: statusPayload(device, config),
      latest: latest || null,
      history,
      // El row llega camelizado por el transform de columna: el resumen se expone en snake_case.
      summary: {
        ...Object.fromEntries(Object.entries(summary).filter(([key]) => key !== 'deviceId')
          .map(([key, value]) => [key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`), value])),
        expected,
        coverage_pct: summary.validCount ? coveragePct : 0,
      },
      forecasts,
      forecast_source: forecasts.length ? 'external_provider' : null,
      estimates: [],
      nearby,
      weather: weatherByDevice.get(device.id),
    };
  });
  const alerts = await sql`SELECT a.id::text AS id, a.device_id, d.name AS device_name, a.level, a.message,
      a.value, a.source, a.observed_at, a.created_at, a.recipient, a.channel, a.delivery_status,
      a.closed_at, a.acknowledged_at, a.rule_snapshot, a.auto_resolved
    FROM alerts a JOIN devices d ON d.id = a.device_id
    JOIN subscriber_devices sd ON sd.device_id = d.id
    WHERE sd.subscriber_id = ${req.subscriber.id}
      ${req.subscriber.role === 'admin' ? sql`` : sql`AND ${NON_COMMUNICATION_ALERT}`}
    ORDER BY a.created_at DESC LIMIT 50`;
  // Cada aviso declara la antigüedad de la medida que lo originó y cuánto tardó
  // en llegar: con lotes de 30 min, no es lo mismo un aviso de ahora que de hace media hora.
  res.json({ period, devices: response, alerts: alerts.map((alert) => ({ ...alert, ...alertAge(alert) })) });
});

// Filtro común: rango de fechas + dispositivo, limitado siempre a las estaciones del suscriptor.
function measurementQuery(req) {
  const from = req.query.from ? new Date(String(req.query.from)) : null;
  const to = req.query.to ? new Date(String(req.query.to)) : null;
  if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) return null;
  const deviceId = typeof req.query.device_id === 'string' && req.query.device_id ? req.query.device_id : null;
  const role = req.subscriber.role;
  const includeDeleted = req.query.include_deleted === 'true' && role !== 'viewer';

  const conditions = [];
  if (role !== 'admin') {
    conditions.push(sql`m.device_id IN (SELECT sd.device_id FROM subscriber_devices sd WHERE sd.subscriber_id = ${req.subscriber.id})`);
  }
  if (deviceId) conditions.push(sql`m.device_id = ${deviceId}`);
  if (from) conditions.push(sql`m.observed_at >= ${from}`);
  if (to) conditions.push(sql`m.observed_at < ${to}`);
  if (!includeDeleted) conditions.push(sql`m.deleted_at IS NULL`);
  if (req.query.validated === 'valid') conditions.push(sql`m.is_validated`);
  if (req.query.validated === 'invalid') conditions.push(sql`NOT m.is_validated`);
  if (!conditions.length) return { where: sql`TRUE` };
  let where = conditions[0];
  for (let i = 1; i < conditions.length; i++) where = sql`${where} AND ${conditions[i]}`;
  return { where };
}

const MEASUREMENT_COLUMNS = sql`m.id::text AS id, m.device_id, d.name AS device_name, m.sequence::text AS sequence,
  m.observed_at, m.received_at, m.time_quality, m.temperature_c, m.humidity_pct, m.pressure_pa, m.battery_mv,
  m.lux, m.source, m.flags, m.alert_level, m.is_validated, m.validation_flags, m.validated_at,
  m.invalidated_reason, m.deleted_at`;

// Listado de mediciones por rango de fechas (solo suscriptor y solo sus equipos).
app.get('/api/v1/measurements', requireSubscriber, async (req, res) => {
  const query = measurementQuery(req);
  if (!query) return res.status(400).json({ error: 'invalid_range' });
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit ?? '100', 10) || 100, 1), 500);
  const offset = Math.max(Number.parseInt(req.query.offset ?? '0', 10) || 0, 0);

  const rows = await sql`SELECT ${MEASUREMENT_COLUMNS}
    FROM measurements m JOIN devices d ON d.id = m.device_id
    WHERE ${query.where} ORDER BY m.observed_at DESC, m.received_at DESC LIMIT ${limit} OFFSET ${offset}`;
  const [counts] = await sql`SELECT count(*)::integer AS total,
      count(*) FILTER (WHERE m.is_validated)::integer AS valid,
      count(*) FILTER (WHERE NOT m.is_validated)::integer AS invalid
    FROM measurements m WHERE ${query.where}`;
  res.json({
    measurements: rows,
    total: counts.total,
    valid: counts.valid,
    invalid: counts.invalid,
    limit,
    offset,
  });
});

// Detalle de una medición, incluido el valor bruto recibido.
app.get('/api/v1/measurements/:id', requireSubscriber, async (req, res) => {
  if (!/^\d{1,18}$/.test(req.params.id)) return res.status(400).json({ error: 'invalid_id' });
  const scope = req.subscriber.role === 'admin'
    ? sql`TRUE`
    : sql`m.device_id IN (SELECT sd.device_id FROM subscriber_devices sd WHERE sd.subscriber_id = ${req.subscriber.id})`;
  const rows = await sql`SELECT ${MEASUREMENT_COLUMNS}, m.raw_payload, s.email AS validated_by_email
    FROM measurements m JOIN devices d ON d.id = m.device_id
    LEFT JOIN subscribers s ON s.id = m.validated_by
    WHERE m.id = ${req.params.id}::bigint AND ${scope}`;
  if (!rows.length) return res.status(404).json({ error: 'measurement_not_found' });
  res.json({ measurement: rows[0] });
});

// Revisión manual: un operador puede marcar/desmarcar una lectura sin borrarla.
app.patch('/api/v1/measurements/:id/validate', requireSubscriber, requireRole('operator'), csrfGuard, async (req, res) => {
  if (!/^\d{1,18}$/.test(req.params.id)) return res.status(400).json({ error: 'invalid_id' });
  const parsed = z.object({
    is_validated: z.boolean(),
    reason: z.string().max(300).optional(),
  }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.issues });
  const { is_validated: isValidated, reason } = parsed.data;

  const scope = req.subscriber.role === 'admin'
    ? sql`TRUE`
    : sql`m.device_id IN (SELECT sd.device_id FROM subscriber_devices sd WHERE sd.subscriber_id = ${req.subscriber.id})`;
  const rows = await sql`SELECT m.id::text AS id, m.device_id, m.is_validated, m.validation_flags, m.invalidated_reason,
      m.observed_at, m.sequence
    FROM measurements m WHERE m.id = ${req.params.id}::bigint AND ${scope}`;
  if (!rows.length) return res.status(404).json({ error: 'measurement_not_found' });
  const before = rows[0];

  const [updated] = await sql`UPDATE measurements m SET
      is_validated = ${isValidated},
      validation_flags = m.validation_flags | ${VFLAG.MANUAL},
      invalidated_reason = ${isValidated ? null : (reason?.trim() || 'revisión manual')},
      validated_by = ${req.subscriber.id},
      validated_at = now()
    WHERE m.id = ${before.id}::bigint
    RETURNING m.id::text AS id, m.is_validated, m.validation_flags, m.invalidated_reason, m.validated_at`;
  await sql`UPDATE device_status s SET last_valid_data = (
      SELECT max(m.observed_at) FROM measurements m
      WHERE m.device_id = ${before.deviceId} AND m.is_validated AND m.deleted_at IS NULL)
    WHERE s.device_id = ${before.deviceId}`;
  await audit(sql, req, 'measurement.validate', 'measurement', before.id, before, updated);
  res.json({ measurement: updated });
});

// Exportacion CSV con los mismos filtros que la tabla.
app.get('/api/v1/measurements.csv', requireSubscriber, async (req, res) => {
  const query = measurementQuery(req);
  if (!query) return res.status(400).json({ error: 'invalid_range' });
  const rows = await sql`SELECT ${MEASUREMENT_COLUMNS}
    FROM measurements m JOIN devices d ON d.id = m.device_id
    WHERE ${query.where} ORDER BY m.observed_at DESC LIMIT 20000`;

  const alertName = (level) => level === 1 ? 'prioritaria' : level === 2 ? 'aviso' : '';
  const columns = ['estacion', 'dispositivo', 'secuencia', 'fecha_hora_utc', 'recibido_utc', 'calidad_hora',
    'temperatura_c', 'humedad_pct', 'presion_pa', 'bateria_mv', 'lux', 'origen', 'validado',
    'flags_validacion', 'motivo_invalido', 'flags', 'alerta'];
  const lines = [columns.join(',')];
  for (const row of rows) {
    lines.push([row.deviceName, row.deviceId, row.sequence, row.observedAt?.toISOString?.() ?? row.observed_at,
      row.receivedAt?.toISOString?.() ?? row.received_at, row.timeQuality,
      row.temperatureC, row.humidityPct, row.pressurePa, row.batteryMv, row.lux, row.source,
      row.isValidated ? 'si' : 'no', row.validationFlags, row.invalidatedReason, row.flags,
      alertName(row.alertLevel)]
       .map(csvCell).join(','));
  }
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="tecrural-mediciones.csv"');
  res.send('\uFEFF' + lines.join('\r\n') + '\r\n');
});

// Borrado suave: la fila se conserva con deleted_at para no perder rastro.
app.delete('/api/v1/measurements/:id', requireSubscriber, requireRole('operator'), csrfGuard, async (req, res) => {
  if (!/^\d{1,18}$/.test(req.params.id)) return res.status(400).json({ error: 'invalid_id' });
  const scope = req.subscriber.role === 'admin'
    ? sql`TRUE`
    : sql`m.device_id IN (SELECT sd.device_id FROM subscriber_devices sd WHERE sd.subscriber_id = ${req.subscriber.id})`;
  const removed = await sql`UPDATE measurements m SET deleted_at = now(), deleted_by = ${req.subscriber.id}
    WHERE m.id = ${req.params.id}::bigint AND m.deleted_at IS NULL AND ${scope}
    RETURNING m.id::text AS id, m.device_id, m.sequence::text AS sequence, m.observed_at`;
  if (!removed.length) return res.status(404).json({ error: 'measurement_not_found' });
  await audit(sql, req, 'measurement.delete', 'measurement', removed[0].id, removed[0], { deleted: true });
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Routers de estaciones, configuración, avisos, cuenta y administración
// ---------------------------------------------------------------------------
app.use('/api/v1/stations', stationsRouter);
app.use('/api/v1/stations', configsRouter);
app.use('/api/v1/alerts', alertsRouter);
app.use('/api/v1/admin', adminRouter);
app.use('/api/v1', accountRouter);

// ---------------------------------------------------------------------------
// Detectores de sistema (sin comunicación, batería baja)
// ---------------------------------------------------------------------------
// En un proceso largo se evalúan con un temporizador. En Vercel el código solo
// vive durante una petición, así que la pasada se dispara desde las peticiones
// reales, con anti-reintentos para no repetirla en cada llamada. Sin ninguna de
// las dos, una estación que deja de enviar nunca generaría aviso.
const SYSTEM_EVAL_MS = Math.max(30, Number(process.env.SYSTEM_EVAL_INTERVAL_S || 60)) * 1000;
let systemPass = null;
let lastSystemPass = 0;

async function runSystemPass() {
  if (systemPass) return systemPass;
  systemPass = evaluateSystemRules()
    .then((outcomes) => {
      lastSystemPass = Date.now();
      if (outcomes.length) console.log(`detectores: ${outcomes.map((o) => `${o.deviceId}/${o.change}`).join(', ')}`);
      return outcomes;
    })
    .catch((error) => { console.error('pasada de detectores:', error.message); return []; })
    .finally(() => { systemPass = null; });
  return systemPass;
}

const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

if (process.env.SYSTEM_EVAL_DISABLED !== 'true') {
  if (!isServerless) {
    const systemTimer = setInterval(runSystemPass, SYSTEM_EVAL_MS);
    systemTimer.unref();
    const systemKick = setTimeout(runSystemPass, 5000);
    systemKick.unref();
  } else {
    app.use((req, res, next) => {
      // Solo con tráfico real del panel, y como mucho una vez por intervalo.
      if (!req.path.startsWith('/api/v1/')) return next();
      if (Date.now() - lastSystemPass < SYSTEM_EVAL_MS) return next();
      runSystemPass().catch(() => {});
      next();
    });
  }
}

app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }));
app.use(express.static(fileURLToPath(new URL('../public/', import.meta.url)), { index: 'index.html', maxAge: 0 }));
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

export { app };
// Vercel toma src/server.js como entrada de una de las funciones: además del
// export con nombre hace falta el por defecto, o la función arranca con error.
export default app;

// En local el proceso escucha; en Vercel la función recibe (req, res).
if (!isServerless) {
  app.listen(port, () => console.log(`TECRURAL API listening on ${port}`));
}
