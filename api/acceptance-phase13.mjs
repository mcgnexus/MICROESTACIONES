// Verificación completa de la Fase 13 sobre un entorno de prueba local.
//
// Levanta un servidor en un puerto libre con la base configurada, recorre los 12
// puntos de la fase y deja evidencias en consola. Todo lo creado lleva el prefijo
// ph13- y se borra al terminar. No despliega nada ni envía comunicaciones reales:
// el proveedor de email es `console` y las pruebas son de sólo lectura sobre los
// cambios efectivos.
//
//   npm run acceptance:phase13

import 'dotenv/config';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import postgres from 'postgres';
import { sha256, randomToken } from './src/security.js';

const PORT = Number(process.env.PHASE13_PORT || 8152);
const BASE = `http://127.0.0.1:${PORT}`;
const PREFIX = 'ph13';
const PUBLIC_DEVICE = `${PREFIX}-publico`;
const STALE_DEVICE = `${PREFIX}-atrasada`;
const PRIVATE_A = `${PREFIX}-privada-a`;
const PRIVATE_B = `${PREFIX}-privada-b`;
const ALERT_DEVICE = `${PREFIX}-aviso`;
const DOMAIN = `${PREFIX}.tecrural.local`;
const VIEWER_A = `${PREFIX}-viewer-a@${DOMAIN}`;
const VIEWER_B = `${PREFIX}-viewer-b@${DOMAIN}`;
const OPERATOR = `${PREFIX}-operator@${DOMAIN}`;
const LEAD_PHONE = '+34600000013';
const DEVICES = [PUBLIC_DEVICE, STALE_DEVICE, PRIVATE_A, PRIVATE_B, ALERT_DEVICE];

const sql = postgres(process.env.DATABASE_URL, {
  max: 5, ssl: 'require', transform: { ...postgres.camel, value: {} },
});

const failures = [];
let checks = 0;
const check = (name, ok, detail = '') => {
  checks += 1;
  if (ok) console.log(`  ok   ${name}`);
  else { failures.push(name); console.log(`  FAIL ${name} ${detail}`); }
};
const section = (title) => console.log(`\n${title}`);

const server = spawn(process.execPath, ['src/server.js'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(PORT),
    COOKIE_SECURE: 'false',
    EMAIL_PROVIDER: 'console',
    OTP_DEBUG: 'true',
    ALERT_ENGINE_VERIFIED: 'true',
    SYSTEM_EVAL_DISABLED: 'true',
    SYSTEM_EVAL_INTERVAL_S: '3600',
    OUTBOX_EVAL_INTERVAL_S: '3600',
    HTTP_TIMEOUT_MS: '1500',
    HTTP_MAX_MS: '2500',
    ANALYTICS_CAMPAIGNS: `${PREFIX}test`,
    PUBLIC_SITE_URL: BASE,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (chunk) => { serverLog += chunk; });
server.stderr.on('data', (chunk) => { serverLog += chunk; });

async function waitForHealth() {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${BASE}/health`)).ok) return; } catch { /* esperando */ }
    await sleep(250);
  }
  throw new Error(`El servidor no arrancó:\n${serverLog.slice(-2000)}`);
}

async function waitForToken(offset, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const match = serverLog.slice(offset).match(/token=([A-Za-z0-9_-]{16,})/);
    if (match) return match[1];
    await sleep(100);
  }
  return null;
}

async function call(path, { method = 'GET', body, as, device, cookie, raw = false } = {}) {
  const headers = { 'X-Requested-With': 'fetch' };
  if (as) headers.Cookie = `tr_session=${sessions[as]}`;
  if (cookie) headers.Cookie = cookie;
  if (device) headers.Authorization = `Bearer ${deviceTokens[device]}`;
  if (body) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${BASE}${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = response.headers.get('set-cookie') || '';
  if (raw) return { status: response.status, text: await response.text(), setCookie };
  const text = await response.text();
  let parsed = null;
  if (text) { try { parsed = JSON.parse(text); } catch { parsed = text; } }
  return { status: response.status, body: parsed, setCookie };
}

async function sessionCookieFor(email) {
  const [row] = await sql`SELECT id FROM subscribers WHERE email_normalized = ${email.toLowerCase()}`;
  const token = randomToken();
  await sql`INSERT INTO web_sessions (token_hash, subscriber_id, expires_at)
    VALUES (${sha256(token)}, ${row.id}, now() + interval '1 hour')`;
  return { subscriberId: row.id, cookie: `tr_session=${token}` };
}

async function cleanup() {
  // Entorno de prueba: se reinician los limitadores para que la ejecución sea
  // repetible desde la misma IP sin arrastrar intentos de la pasada anterior.
  await sql`DELETE FROM login_rate_limits`;
  await sql`DELETE FROM notification_outbox WHERE subscriber_id IN
      (SELECT id FROM subscribers WHERE email LIKE ${`${PREFIX}%`})
    OR lead_id IN (SELECT id FROM farm_leads WHERE phone = ${LEAD_PHONE})
    OR alert_id IN (SELECT id FROM alerts WHERE device_id = ANY(${DEVICES}))`;
  await sql`DELETE FROM alerts WHERE device_id = ANY(${DEVICES})`;
  await sql`DELETE FROM urgent_directives WHERE device_id = ANY(${DEVICES})`;
  await sql`DELETE FROM alert_rules WHERE device_id = ANY(${DEVICES})`;
  await sql`DELETE FROM measurements WHERE device_id = ANY(${DEVICES})`;
  await sql`DELETE FROM external_forecasts WHERE device_id = ANY(${DEVICES})`;
  await sql`DELETE FROM contact_verifications WHERE contact_id IN
    (SELECT id FROM subscriber_contacts WHERE subscriber_id IN
      (SELECT id FROM subscribers WHERE email LIKE ${`${PREFIX}%`}))`;
  await sql`DELETE FROM subscriber_contacts WHERE subscriber_id IN
    (SELECT id FROM subscribers WHERE email LIKE ${`${PREFIX}%`})`;
  await sql`DELETE FROM consent_records WHERE subscriber_id IN
      (SELECT id FROM subscribers WHERE email LIKE ${`${PREFIX}%`})
    OR lead_id IN (SELECT id FROM farm_leads WHERE phone = ${LEAD_PHONE})`;
  await sql`DELETE FROM metric_milestones WHERE subscriber_id IN
      (SELECT id FROM subscribers WHERE email LIKE ${`${PREFIX}%`})
    OR lead_id IN (SELECT id FROM farm_leads WHERE phone = ${LEAD_PHONE})`;
  await sql`DELETE FROM prospect_tracking WHERE subscriber_id IN
      (SELECT id FROM subscribers WHERE email LIKE ${`${PREFIX}%`})
    OR lead_id IN (SELECT id FROM farm_leads WHERE phone = ${LEAD_PHONE})`;
  await sql`DELETE FROM farm_leads WHERE phone = ${LEAD_PHONE}`;
  await sql`DELETE FROM magic_links WHERE email LIKE ${`${PREFIX}%`}`;
  await sql`DELETE FROM subscriber_profiles WHERE subscriber_id IN
    (SELECT id FROM subscribers WHERE email LIKE ${`${PREFIX}%`})`;
  await sql`DELETE FROM subscriber_devices WHERE device_id = ANY(${DEVICES})
    OR subscriber_id IN (SELECT id FROM subscribers WHERE email LIKE ${`${PREFIX}%`})`;
  await sql`DELETE FROM web_sessions WHERE subscriber_id IN
    (SELECT id FROM subscribers WHERE email LIKE ${`${PREFIX}%`})`;
  await sql`DELETE FROM audit_logs WHERE actor_id IN
      (SELECT id FROM subscribers WHERE email LIKE ${`${PREFIX}%`})
    OR target_id = ANY(${DEVICES}) OR target_id = ${LEAD_PHONE}`;
  await sql`DELETE FROM subscribers WHERE email LIKE ${`${PREFIX}%`}`;
  await sql`DELETE FROM devices WHERE id = ANY(${DEVICES})`;
  await sql`DELETE FROM metric_daily WHERE bucket LIKE ${`%${PREFIX}test%`}`;
}

const reading = (deviceId, sequence, ts, extra = {}) => ({
  device_id: deviceId, sequence, ts, quality: 2,
  temp_c: 21.5, hum_pct: 55, press_pa: 100800, batt_mv: 3900, flags: 31, alert: 0, ...extra,
});

const sessions = {};
const deviceTokens = {};

try {
  await waitForHealth();
  await cleanup();

  // --- Preparación -----------------------------------------------------------
  const passwordHash = '$argon2id$v=19$m=65536,t=3,p=1$placeholder$placeholderplaceholderplaceholder';
  const [operator] = await sql`INSERT INTO subscribers (email, password_hash, role)
    VALUES (${OPERATOR}, ${passwordHash}, 'operator') RETURNING id`;
  const [admin] = await sql`SELECT id FROM subscribers WHERE role = 'admin' AND active ORDER BY id LIMIT 1`;

  sessions.operator = randomToken();
  sessions.admin = randomToken();
  await sql`INSERT INTO web_sessions (token_hash, subscriber_id, expires_at) VALUES
    (${sha256(sessions.operator)}, ${operator.id}, now() + interval '1 hour'),
    (${sha256(sessions.admin)}, ${admin.id}, now() + interval '1 hour')`;

  for (const id of DEVICES) {
    const created = await call('/api/v1/stations', {
      method: 'POST', as: 'admin', body: { id, name: `Estación ${id}` },
    });
    check(`estación creada ${id}`, created.status === 201, JSON.stringify(created.body));
  }
  for (const [name, deviceId] of [['publico', PUBLIC_DEVICE], ['aviso', ALERT_DEVICE]]) {
    deviceTokens[name] = randomToken();
    await sql`INSERT INTO device_credentials (token_hash, device_id)
      VALUES (${sha256(deviceTokens[name])}, ${deviceId})`;
  }
  await sql`INSERT INTO subscriber_devices (subscriber_id, device_id) VALUES
    (${operator.id}, ${ALERT_DEVICE})`.catch(() => {});

  const now = Math.floor(Date.now() / 1000);

  // ==========================================================================
  section('1. Visitante consulta lecturas sin registro');
  await call('/api/measurements', {
    method: 'POST', device: 'publico',
    body: [reading(PUBLIC_DEVICE, 1, now - 300, { temp_c: 18.4, hum_pct: 61 })],
  });
  await sql`UPDATE devices SET location_type = 'urbano', public_zone = 'Casco', publish_permission = true,
      latitude = 40.1, longitude = -3.2 WHERE id = ${PUBLIC_DEVICE}`;
  const publicStations = await call('/api/v1/public/stations');
  const publico = publicStations.body?.stations?.find((s) => s.name === `Estación ${PUBLIC_DEVICE}`);
  check('las lecturas públicas se sirven sin sesión',
    publicStations.status === 200 && !!publico && publico.temperatureC != null,
    JSON.stringify(publico));
  check('la lectura pública se marca como reciente',
    publico?.temperatureFreshness === 'fresh', JSON.stringify(publico?.temperatureFreshness));
  const home = await call('/');
  check('la portada responde sin sesión', home.status === 200, String(home.status));
  const dashAnon = await call('/api/v1/dashboard');
  check('el panel privado no es anónimo', dashAnon.status === 401, String(dashAnon.status));

  // ==========================================================================
  section('2. Intenta abrir histórico y recibe invitación a registrarse');
  const histAnon = await call(`/api/v1/measurements?device_id=${PUBLIC_DEVICE}&limit=10`);
  check('el histórico sin sesión exige acceso', histAnon.status === 401, String(histAnon.status));
  const stationAnon = await call(`/api/v1/stations/${PUBLIC_DEVICE}`);
  check('la ficha de estación sin sesión exige acceso', stationAnon.status === 401, String(stationAnon.status));
  const lockedMetric = await call('/api/v1/metrics/events', {
    method: 'POST', body: { event: 'locked_tool_open', consent: true },
  });
  check('la apertura bloqueada se registra sólo como métrica agregada',
    lockedMetric.status === 204, JSON.stringify(lockedMetric.body));

  // ==========================================================================
  section('3. Verifica email y vuelve al histórico');
  const beforeLog = serverLog.length;
  const magicRequest = await call('/api/auth/magic/request', {
    method: 'POST', body: { email: VIEWER_A, next: 'estaciones', commercial_consent: false, acquisition: { source: 'google', medium: 'cpc', campaign: `${PREFIX}test` } },
  });
  check('la solicitud de enlace responde de forma genérica', magicRequest.status === 202,
    JSON.stringify(magicRequest.body));
  const tokenA = await waitForToken(beforeLog);
  check('el enlace de un solo uso se emite', !!tokenA, serverLog.slice(beforeLog).slice(0, 200));
  const verify = await call('/api/auth/magic/verify', {
    method: 'POST', body: { token: tokenA || '' },
  });
  const cookieA = (verify.setCookie.match(/tr_session=([^;]+)/) || [])[1];
  check('el enlace verifica la cuenta y abre sesión',
    verify.status === 200 && !!cookieA && verify.body?.next === '#/estaciones',
    JSON.stringify({ status: verify.status, next: verify.body?.next }));
  const histA = await call(`/api/v1/measurements?device_id=${PUBLIC_DEVICE}&limit=10`, { cookie: `tr_session=${cookieA}` });
  check('tras verificar, el histórico queda disponible', histA.status === 200,
    JSON.stringify({ status: histA.status, total: histA.body?.total }));

  // ==========================================================================
  section('4. Accede sin aceptar publicidad');
  const consentsA = await call('/api/v1/account/consents', { cookie: `tr_session=${cookieA}` });
  const commercialA = consentsA.body?.consents?.commercial || {};
  check('el acceso no exige publicidad',
    Object.keys(commercialA).length === 0 || Object.values(commercialA).every((entry) => !entry.granted),
    JSON.stringify(commercialA));

  // ==========================================================================
  section('5. Otro usuario acepta comunicaciones y completa perfil');
  const markerB = serverLog.length;
  await call('/api/auth/magic/request', {
    method: 'POST', body: { email: VIEWER_B, next: 'panel', commercial_consent: true },
  });
  const tokenB = await waitForToken(markerB);
  const verifyB = await call('/api/auth/magic/verify', { method: 'POST', body: { token: tokenB || '' } });
  const cookieB = (verifyB.setCookie.match(/tr_session=([^;]+)/) || [])[1];
  check('la segunda cuenta entra con enlace', verifyB.status === 200 && !!cookieB, String(verifyB.status));
  const consented = await call('/api/v1/account/consents', { cookie: `tr_session=${cookieB}` });
  check('acepta comunicaciones por correo',
    consented.body?.consents?.commercial?.email?.granted === true,
    JSON.stringify(consented.body?.consents?.commercial));
  const profile = await call('/api/v1/account/profile', {
    method: 'PUT', cookie: `tr_session=${cookieB}`,
    body: { municipality: 'Huéscar', activity: 'agricultura', crop_or_livestock: 'Olivo', interest: 'heladas' },
  });
  const meB = await call('/api/v1/me', { cookie: `tr_session=${cookieB}` });
  check('completa su perfil agrícola',
    profile.status === 200 && meB.body?.profile?.activity === 'agricultura'
    && meB.body?.profile?.municipality === 'Huéscar',
    JSON.stringify(meB.body?.profile));

  // ==========================================================================
  section('6. Ambos permanecen aislados de estaciones privadas');
  const viewerA = await sessionCookieFor(VIEWER_A);
  const viewerB = await sessionCookieFor(VIEWER_B);
  await sql`INSERT INTO subscriber_devices (subscriber_id, device_id) VALUES
    (${viewerA.subscriberId}, ${PRIVATE_A}), (${viewerB.subscriberId}, ${PRIVATE_B})`;

  const listA = await call('/api/v1/stations', { cookie: viewerA.cookie });
  const idsA = (listA.body?.stations || []).map((s) => s.id);
  check('A ve su estación privada y no la de B',
    idsA.includes(PRIVATE_A) && !idsA.includes(PRIVATE_B), JSON.stringify(idsA));
  const listB = await call('/api/v1/stations', { cookie: viewerB.cookie });
  const idsB = (listB.body?.stations || []).map((s) => s.id);
  check('B ve su estación privada y no la de A',
    idsB.includes(PRIVATE_B) && !idsB.includes(PRIVATE_A), JSON.stringify(idsB));
  const crossRead = await call(`/api/v1/stations/${PRIVATE_B}`, { cookie: viewerA.cookie });
  check('A no puede abrir la estación privada de B', crossRead.status === 404, String(crossRead.status));
  const crossList = await call(`/api/v1/measurements?device_id=${PRIVATE_B}&limit=10`, { cookie: viewerA.cookie });
  check('A no puede listar mediciones de B', crossList.body?.total === 0,
    JSON.stringify(crossList.body?.total));

  // ==========================================================================
  section('7. Revoca autorización y queda excluido de futuras campañas');
  await sql`INSERT INTO notification_outbox (kind, subscriber_id, channel, address, subject, body)
    VALUES ('commercial', ${viewerB.subscriberId}, 'email', ${VIEWER_B}, 'Oferta', 'Pendiente de enviar')`;
  const revoke = await call('/api/v1/account/consents', {
    method: 'POST', cookie: viewerB.cookie,
    body: { purpose: 'commercial', channel: 'email', action: 'revoked' },
  });
  check('la revocación se registra', revoke.status === 200 && revoke.body?.current?.granted === false,
    JSON.stringify(revoke.body));
  const cancelled = await sql`SELECT status FROM notification_outbox WHERE kind = 'commercial'
    AND subscriber_id = ${viewerB.subscriberId} ORDER BY id DESC LIMIT 1`;
  check('los envíos comerciales pendientes quedan cancelados',
    cancelled[0]?.status === 'cancelled', JSON.stringify(cancelled[0]));
  const consentsAfter = await call('/api/v1/account/consents', { cookie: viewerB.cookie });
  check('la publicidad ya no está vigente',
    consentsAfter.body?.consents?.commercial?.email?.granted === false,
    JSON.stringify(consentsAfter.body?.consents?.commercial));

  // ==========================================================================
  section('8. Un doble clic no duplica registros');
  const lead = {
    name: 'Finca Doble Clic', phone: LEAD_PHONE, activity: 'agricultura',
    interest: 'futura_instalacion', consent: true, commercial_consent: true, zone: 'Huéscar',
  };
  const lead1 = await call('/api/v1/leads', { method: 'POST', body: lead });
  const lead2 = await call('/api/v1/leads', { method: 'POST', body: lead });
  const leadRows = await sql`SELECT id FROM farm_leads WHERE phone = ${LEAD_PHONE}`;
  check('la solicitud repetida se confirma sin duplicar',
    lead1.status === 201 && lead2.status === 201 && leadRows.length === 1,
    `filas=${leadRows.length}`);
  const repeated = [
    reading(PUBLIC_DEVICE, 40, now - 120, { temp_c: 17.9 }),
    reading(PUBLIC_DEVICE, 41, now - 60, { temp_c: 18.2 }),
  ];
  await call('/api/measurements', { method: 'POST', device: 'publico', body: repeated });
  await call('/api/measurements', { method: 'POST', device: 'publico', body: repeated });
  const batchCount = await sql`SELECT count(*)::int AS total FROM measurements
    WHERE device_id = ${PUBLIC_DEVICE} AND sequence IN (40, 41)`;
  check('el lote reenviado no se duplica', batchCount[0].total === 2, JSON.stringify(batchCount[0]));

  // ==========================================================================
  section('9. AEMET caído y estación atrasada se muestran correctamente');
  await sql`UPDATE devices SET location_type = 'urbano', public_zone = 'Vega', publish_permission = true,
      latitude = 40.11, longitude = -3.21, aemet_municipality_code = '18901',
      aemet_station_id = '1234X', aemet_warning_area = 'GR' WHERE id = ${STALE_DEVICE}`;
  await sql`INSERT INTO device_status (device_id, last_contact, last_valid_data, connectivity, updated_at)
    VALUES (${STALE_DEVICE}, now() - interval '2 days', now() - interval '2 days', 'offline', now())
    ON CONFLICT (device_id) DO UPDATE SET last_contact = now() - interval '2 days',
      last_valid_data = now() - interval '2 days', connectivity = 'offline'`;
  await sql`INSERT INTO measurements (device_id, sequence, observed_at, time_quality, temperature_c,
      humidity_pct, is_validated)
    VALUES (${STALE_DEVICE}, 900, now() - interval '2 days', 1, 12.0, 70, true)
    ON CONFLICT (device_id, sequence, observed_at) DO NOTHING`;
  const publicAgain = await call('/api/v1/public/stations');
  const atrasada = publicAgain.body?.stations?.find((s) => s.name === `Estación ${STALE_DEVICE}`);
  check('la estación atrasada se declara sin datos recientes',
    atrasada?.dataFreshness === 'stale' && atrasada?.temperatureFreshness === 'stale',
    JSON.stringify({ data: atrasada?.dataFreshness, temp: atrasada?.temperatureFreshness }));
  check('la estación atrasada se declara sin conexión', atrasada?.connectivity === 'offline',
    JSON.stringify(atrasada?.connectivity));
  check('la estación atrasada no presenta una lectura actual',
    atrasada?.temperatureFreshness !== 'fresh', JSON.stringify(atrasada?.temperatureC));
  check('una AEMET no disponible no se presenta como ausencia de avisos',
    !!atrasada?.aemet && atrasada.aemet.observationStatus !== 'ok' && atrasada.aemet.warningsStatus !== 'ok',
    JSON.stringify({ observation: atrasada?.aemet?.observationStatus, warnings: atrasada?.aemet?.warningsStatus }));

  // ==========================================================================
  section('10. Una lectura inválida no genera alerta');
  const rule = await call('/api/v1/alerts/rules', {
    method: 'POST', as: 'operator',
    body: { device_id: ALERT_DEVICE, metric: 'temperature', comparator: 'lt', threshold: 0,
      level: 1, message: 'Helada de prueba', channel: 'in_app', category: 'frost' },
  });
  check('se crea una regla de helada', rule.status === 201, JSON.stringify(rule.body));
  const invalid = reading(ALERT_DEVICE, 1, now - 200, { temp_c: -200, flags: 31 });
  await call('/api/measurements', { method: 'POST', device: 'aviso', body: [invalid] });
  const afterInvalid = await sql`SELECT count(*)::int AS total FROM alerts WHERE device_id = ${ALERT_DEVICE}`;
  check('la lectura inválida no crea alerta', afterInvalid[0].total === 0, JSON.stringify(afterInvalid[0]));
  const valid = reading(ALERT_DEVICE, 2, now - 60, { temp_c: -1.5, flags: 31 });
  await call('/api/measurements', { method: 'POST', device: 'aviso', body: [valid] });
  const afterValid = await sql`SELECT message, value FROM alerts WHERE device_id = ${ALERT_DEVICE}`;
  check('una lectura válida bajo el umbral sí abre la alerta',
    afterValid.length === 1 && afterValid[0].message === 'Helada de prueba', JSON.stringify(afterValid));

  // ==========================================================================
  section('11. Un lote repetido no duplica datos');
  const batch = [
    reading(STALE_DEVICE, 1, now - 180, { temp_c: 15.1 }),
    reading(STALE_DEVICE, 2, now - 120, { temp_c: 15.4 }),
  ];
  const tokenStale = randomToken();
  await sql`INSERT INTO device_credentials (token_hash, device_id) VALUES (${sha256(tokenStale)}, ${STALE_DEVICE})`;
  deviceTokens.stale = tokenStale;
  const first = await call('/api/measurements', { method: 'POST', device: 'stale', body: batch });
  const second = await call('/api/measurements', { method: 'POST', device: 'stale', body: batch });
  const stored = await sql`SELECT count(*)::int AS total FROM measurements
    WHERE device_id = ${STALE_DEVICE} AND sequence IN (1, 2)`;
  check('el primer y el segundo envío coinciden en el ack',
    first.body?.ack_through === 2 && second.body?.ack_through === 2,
    JSON.stringify({ first: first.body, second: second.body }));
  check('sólo quedan dos filas tras el reenvío', stored[0].total === 2, JSON.stringify(stored[0]));

  // ==========================================================================
  section('12. El móvil y la PWA muestran carga, error y desconexión');
  const [serviceWorker, appSource] = await Promise.all([
    readFile(new URL('./public/service-worker.js', import.meta.url), 'utf8'),
    readFile(new URL('./public/app.js', import.meta.url), 'utf8'),
  ]);
  check('la PWA no cachea endpoints privados',
    serviceWorker.includes("url.pathname.startsWith('/api/')"), 'service-worker.js');
  check('la PWA excluye credenciales de la caché',
    serviceWorker.includes("request.headers?.has('Authorization')"), 'service-worker.js');
  check('la interfaz avisa de que no hay conexión y muestra la hora del último dato',
    appSource.includes('Sin conexión con datos actualizados') && appSource.includes('Último dato visible'),
    'app.js');
  check('la interfaz informa de errores de carga o de service worker',
    appSource.includes('updatefound') && appSource.includes('No se pudo preparar o actualizar la aplicación'),
    'app.js');
} catch (error) {
  failures.push(`excepción: ${error.message}`);
  console.error('\n', error);
} finally {
  await cleanup().catch((error) => console.error('limpieza:', error.message));
  await sql.end();
  server.kill();
}

console.log(`\n${checks - failures.length}/${checks} comprobaciones superadas`);
if (failures.length) {
  console.error(`\n${failures.length} comprobaciones fallidas:`);
  for (const name of failures) console.error(` - ${name}`);
  if (serverLog) console.error(`\n--- log del servidor ---\n${serverLog.slice(-2500)}`);
  process.exit(1);
}
console.log('Verificación completa de la Fase 13 OK');
process.exit(0);
