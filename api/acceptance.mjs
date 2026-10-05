// Pruebas de aceptación de la primera fase.
//
//  1. Un lote repetido no duplica datos.
//  2. Una pérdida de Wi-Fi recupera las muestras con su hora original.
//  3. Un cambio remoto permanece pendiente hasta que la ESP32-C3 lo confirma.
//  4. Un usuario no puede consultar ni borrar datos de otra estación.
//  5. Un registro sin canales no bloquea el lote.
//  6. El panel no filtra la ubicación exacta de estaciones vecinas.
//
// Requieren la base de datos real y un servidor en un puerto libre. Todo lo que
// se crea lleva el prefijo acp- y se borra al terminar.
//
//   npm run acceptance

import 'dotenv/config';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import postgres from 'postgres';
import { sha256, randomToken } from './src/security.js';

const PORT = Number(process.env.ACCEPTANCE_PORT || 8151);
const BASE = `http://127.0.0.1:${PORT}`;
const PREFIX = 'acp';
const DEVICE_A = `${PREFIX}-device-a`;
const DEVICE_B = `${PREFIX}-device-b`;

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
  env: { ...process.env, PORT: String(PORT), SYSTEM_EVAL_INTERVAL_S: '3600', SYSTEM_EVAL_DISABLED: 'true' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (chunk) => { serverLog += chunk; });
server.stderr.on('data', (chunk) => { serverLog += chunk; });

const sessions = {};
const deviceTokens = {};

async function waitForHealth() {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`${BASE}/health`)).ok) return; } catch { /* esperando */ }
    await sleep(250);
  }
  throw new Error(`El servidor no arrancó:\n${serverLog}`);
}

// Llamada de panel (cookie de sesión) o de equipo (token bearer).
async function call(path, { method = 'GET', body, as, device, raw = false } = {}) {
  const headers = { 'X-Requested-With': 'fetch' };
  if (as) headers.Cookie = `tr_session=${sessions[as]}`;
  if (device) headers.Authorization = `Bearer ${deviceTokens[device]}`;
  if (body) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${BASE}${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  if (raw) return { status: response.status, text: await response.text() };
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function cleanup() {
  await sql`DELETE FROM alerts WHERE device_id IN (${DEVICE_A}, ${DEVICE_B})`;
  await sql`DELETE FROM urgent_directives WHERE device_id IN (${DEVICE_A}, ${DEVICE_B})`;
  await sql`DELETE FROM alert_rules WHERE device_id IN (${DEVICE_A}, ${DEVICE_B})`;
  await sql`DELETE FROM measurements WHERE device_id IN (${DEVICE_A}, ${DEVICE_B})`;
  await sql`DELETE FROM subscriber_devices WHERE device_id IN (${DEVICE_A}, ${DEVICE_B})`;
  await sql`DELETE FROM devices WHERE id IN (${DEVICE_A}, ${DEVICE_B})`;
  await sql`DELETE FROM audit_logs WHERE target_id IN (${DEVICE_A}, ${DEVICE_B})
    OR actor_id IN (SELECT id FROM subscribers WHERE email LIKE ${`${PREFIX}-%`})`;
  // La auditoría referencia a su autor: se borra antes de los suscriptores.
  await sql`DELETE FROM web_sessions WHERE subscriber_id IN (
    SELECT id FROM subscribers WHERE email LIKE ${`${PREFIX}-%`})`;
  await sql`DELETE FROM subscribers WHERE email LIKE ${`${PREFIX}-%`}`;
}

const reading = (deviceId, sequence, ts, extra = {}) => ({
  device_id: deviceId, sequence, ts, quality: 2,
  temp_c: 21.5, hum_pct: 55, press_pa: 100800, batt_mv: 3900, flags: 31, alert: 0, ...extra,
});

try {
  await waitForHealth();
  await cleanup();

  // --- Preparación: un operador con dos estaciones, otra estación ajena y token ---
  const passwordHash = '$argon2id$v=19$m=65536,t=3,p=1$placeholder$placeholderplaceholderplaceholder';
  const [owner] = await sql`INSERT INTO subscribers (email, password_hash, role)
    VALUES (${`${PREFIX}-owner@tecrural.local`}, ${passwordHash}, 'operator') RETURNING id`;
  const [stranger] = await sql`INSERT INTO subscribers (email, password_hash, role)
    VALUES (${`${PREFIX}-stranger@tecrural.local`}, ${passwordHash}, 'operator') RETURNING id`;
  const [admin] = await sql`SELECT id FROM subscribers WHERE role = 'admin' ORDER BY id LIMIT 1`;

  for (const [name, subscriberId] of [['owner', owner.id], ['stranger', stranger.id], ['admin', admin.id]]) {
    sessions[name] = randomToken();
    await sql`INSERT INTO web_sessions (token_hash, subscriber_id, expires_at)
      VALUES (${sha256(sessions[name])}, ${subscriberId}, now() + interval '1 hour')`;
  }
  // Primero las estaciones (crean su configuración y sus reglas de sistema),
  // después el token bearer de cada una.
  for (const id of [DEVICE_A, DEVICE_B]) {
    const created = await call('/api/v1/stations', { method: 'POST', as: 'admin', body: { id, name: `Estación ${id}` } });
    check(`estación creada ${id}`, created.status === 201, JSON.stringify(created.body));
  }
  for (const [name, deviceId] of [['a', DEVICE_A], ['b', DEVICE_B]]) {
    deviceTokens[name] = randomToken();
    await sql`INSERT INTO device_credentials (token_hash, device_id)
      VALUES (${sha256(deviceTokens[name])}, ${deviceId})`;
  }
  // El propietario solo tiene acceso a la estación A.
  await sql`INSERT INTO subscriber_devices (subscriber_id, device_id) VALUES (${owner.id}, ${DEVICE_A})`;

  // ==========================================================================
  section('1. Un lote repetido no duplica datos');

  const now = Math.floor(Date.now() / 1000);
  const batch = [
    reading(DEVICE_A, 1, now - 1200, { temp_c: 20.1 }),
    reading(DEVICE_A, 2, now - 1140, { temp_c: 20.4 }),
    reading(DEVICE_A, 3, now - 1080, { temp_c: 20.9 }),
  ];

  const firstSend = await call('/api/measurements', { method: 'POST', device: 'a', body: batch });
  check('el primer envío se acepta', firstSend.status === 200 && firstSend.body.ack_through === 3,
    JSON.stringify(firstSend.body));

  const afterFirst = await sql`SELECT id::text, observed_at, received_at FROM measurements
    WHERE device_id = ${DEVICE_A} ORDER BY sequence`;
  check('guarda las tres lecturas', afterFirst.length === 3, String(afterFirst.length));

  // Reenvío completo del mismo lote: es lo que hace el equipo si no recibe el ack.
  const secondSend = await call('/api/measurements', { method: 'POST', device: 'a', body: batch });
  check('el reenvío responde con el mismo ack', secondSend.status === 200 && secondSend.body.ack_through === 3,
    JSON.stringify(secondSend.body));

  const afterSecond = await sql`SELECT id::text, observed_at, received_at FROM measurements
    WHERE device_id = ${DEVICE_A} ORDER BY sequence`;
  check('no se duplica ninguna fila', afterSecond.length === 3,
    `ahora hay ${afterSecond.length} filas`);
  check('no cambian las horas originales ni las de recepción',
    afterSecond.every((row, index) => row.id === afterFirst[index].id
      && row.observedAt.getTime() === afterFirst[index].observedAt.getTime()
      && row.receivedAt.getTime() === afterFirst[index].receivedAt.getTime()),
    JSON.stringify(afterSecond.map((row) => row.receivedAt)));

  // Lote parcialmente repetido con una lectura nueva (ventana de pérdida de ack).
  const mixed = [...batch, reading(DEVICE_A, 4, now - 1020, { temp_c: 21.2 })];
  await call('/api/measurements', { method: 'POST', device: 'a', body: mixed });
  const afterMixed = await sql`SELECT count(*)::int AS total, max(sequence)::int AS last
    FROM measurements WHERE device_id = ${DEVICE_A}`;
  check('un lote mixto solo añade lo nuevo', afterMixed[0].total === 4 && afterMixed[0].last === 4,
    JSON.stringify(afterMixed[0]));

  const listed = await call(`/api/v1/measurements?device_id=${DEVICE_A}&limit=100`, { as: 'owner' });
  check('el listado tampoco duplica', listed.body.total === 4, JSON.stringify(listed.body.total));

  const gaps = await call(`/api/v1/stations/${DEVICE_A}/measurements/gaps`, { as: 'owner' });
  check('no aparecen huecos por el reenvío', gaps.body.gaps.length === 0,
    JSON.stringify(gaps.body.gaps));

  // ==========================================================================
  section('2. Una pérdida de Wi-Fi recupera las muestras con su hora original');

  // El equipo mide cada 6 min durante media hora sin conexión y sube el lote
  // entero de golpe al recuperar la red.
  const buffered = [];
  const bufferedStart = now - 3600;
  for (let index = 0; index < 5; index++) {
    buffered.push(reading(DEVICE_B, 100 + index, bufferedStart + index * 360, {
      temp_c: 18 + index * 0.2, batt_mv: 3900 - index,
    }));
  }
  const sentAt = Math.floor(Date.now() / 1000);
  const bufferedSend = await call('/api/measurements', { method: 'POST', device: 'b', body: buffered });
  check('el lote almacenado se acepta', bufferedSend.status === 200 && bufferedSend.body.ack_through === 104,
    JSON.stringify(bufferedSend.body));

  const recovered = await sql`SELECT sequence, observed_at, received_at FROM measurements
    WHERE device_id = ${DEVICE_B} ORDER BY sequence`;
  check('llegan las cinco muestras', recovered.length === 5, String(recovered.length));
  check('cada muestra conserva su hora de medida',
    recovered.every((row, index) => row.observedAt.getTime() === (bufferedStart + index * 360) * 1000),
    JSON.stringify(recovered.map((row) => [row.sequence, row.observedAt.toISOString()])));
  check('la hora de recepción es la del envío, no la de la medida',
    // El reloj del servidor de datos y el de esta máquina no coinciden al
    // segundo: se comprueba que la recepción es reciente, no una igualdad exacta.
    recovered.every((row) => Math.abs(Date.now() - row.receivedAt.getTime()) < 10 * 60 * 1000
      && row.receivedAt.getTime() !== row.observedAt.getTime()),
    JSON.stringify(recovered.map((row) => row.receivedAt.toISOString())));
  check('el desfase entre medida y recepción es de unos 30 min o más',
    recovered.every((row) => (row.receivedAt.getTime() - row.observedAt.getTime()) / 1000 >= 1800),
    JSON.stringify(recovered.map((row) => Math.round((row.receivedAt - row.observedAt) / 1000))));

  const gapsB = await call(`/api/v1/stations/${DEVICE_B}/measurements/gaps`, { as: 'admin' });
  check('no seerea hueco por el tiempo sin conexión', gapsB.body.gaps.length === 0 && gapsB.body.missing === 0,
    JSON.stringify({ gaps: gapsB.body.gaps, missing: gapsB.body.missing }));

  const windowStart = new Date(bufferedStart * 1000).toISOString();
  const windowEnd = new Date((bufferedStart + 3600) * 1000).toISOString();
  const byObserved = await call(
    `/api/v1/measurements?device_id=${DEVICE_B}&from=${encodeURIComponent(windowStart)}&to=${encodeURIComponent(windowEnd)}`,
    { as: 'admin' });
  check('el listado las devuelve en la ventana de sus horas de medida',
    byObserved.body.total === 5, JSON.stringify(byObserved.body.total));

  const csv = await call(
    `/api/v1/measurements.csv?device_id=${DEVICE_B}&from=${encodeURIComponent(windowStart)}&to=${encodeURIComponent(windowEnd)}`,
    { as: 'admin', raw: true });
  check('el CSV distingue la hora de medida de la de recepción',
    csv.text.includes('fecha_hora_utc') && csv.text.includes('recibido_utc')
    && csv.text.trim().split('\r\n').length === 6, `${csv.text.trim().split('\r\n').length} líneas`);

  const statsB = await call(
    `/api/v1/stations/${DEVICE_B}/statistics?from=${windowStart}&to=${windowEnd}`, { as: 'admin' });
  check('las estadísticas las cuentan en su periodo original',
    statsB.body.samples === 5, JSON.stringify(statsB.body.samples));

  // ==========================================================================
  section('3. Un cambio remoto permanece pendiente hasta que la ESP32-C3 lo confirma');

  const initial = await call(`/api/v1/stations/${DEVICE_A}/config`, { as: 'owner' });
  check('la estación nace con una versión de configuración', initial.body.version >= 1,
    JSON.stringify(initial.body.version));

  const pendingVersion = initial.body.version + 1;
  const put = await call(`/api/v1/stations/${DEVICE_A}/config`, {
    method: 'PUT', as: 'owner', body: { config: { interval_normal_s: 900 }, reason: 'prueba de aceptación' },
  });
  check('el cambio se guarda como pendiente', put.status === 201 && put.body.version === pendingVersion
    && put.body.state === 'solicitado', JSON.stringify(put.body));

  let state = await call(`/api/v1/stations/${DEVICE_A}/config`, { as: 'owner' });
  check('sigue pendiente si el equipo no ha conectado', state.body.state === 'solicitado',
    state.body.state);

  // El equipo pide la configuración: pasa a recibido, no a aplicado.
  await call('/api/config', { device: 'a' });
  state = await call(`/api/v1/stations/${DEVICE_A}/config`, { as: 'owner' });
  check('al pedirla pasa a recibido', state.body.state === 'recibido'
    && state.body.timeline.recibido.done === true, JSON.stringify(state.body.state));
  check('recibido no es aplicado', state.body.timeline.aplicado.done === false,
    JSON.stringify(state.body.timeline.aplicado));

  // Sigue enviando medidas, pero sin declarar versión: el cambio sigue pendiente.
  await call('/api/measurements', {
    method: 'POST', device: 'a', body: [reading(DEVICE_A, 5, now - 900, { temp_c: 20.7 })],
  });
  state = await call(`/api/v1/stations/${DEVICE_A}/config`, { as: 'owner' });
  check('enviar datos no convierte el cambio en aplicado', state.body.state === 'recibido',
    state.body.state);
  check('los datos posteriores solo se marcan como indicio',
    state.body.appliedHint === true && state.body.timeline.aplicado.done === false,
    JSON.stringify({ hint: state.body.appliedHint, aplicado: state.body.timeline.aplicado.done }));

  // La ESP32-C3 confirma la versión que tiene aplicada, dentro del propio lote.
  const confirmInBatch = await call('/api/measurements', {
    method: 'POST', device: 'a',
    body: [reading(DEVICE_A, 6, now - 840, { temp_c: 20.8, config_version: pendingVersion })],
  });
  check('el equipo confirma la versión aplicada', confirmInBatch.status === 200
    && confirmInBatch.body.applied_config_version === pendingVersion,
    JSON.stringify(confirmInBatch.body));

  state = await call(`/api/v1/stations/${DEVICE_A}/config`, { as: 'owner' });
  check('ahora sí está aplicada', state.body.state === 'aplicado'
    && state.body.timeline.aplicado.done === true && state.body.confirmedVersion === pendingVersion,
    JSON.stringify({ state: state.body.state, confirmed: state.body.confirmedVersion }));
  const status = await sql`SELECT config_version FROM device_status WHERE device_id = ${DEVICE_A}`;
  check('el equipo queda registrado con esa versión',
    Number(status[0].configVersion) === pendingVersion, JSON.stringify(status[0].configVersion));

  // Un equipo antiguo, sin el campo, no cambia nada.
  const old = await call(`/api/v1/stations/${DEVICE_A}/config`, { as: 'owner' });
  const nextVersion = old.body.version + 1;
  await call(`/api/v1/stations/${DEVICE_A}/config`, {
    method: 'PUT', as: 'owner', body: { config: { interval_normal_s: 600 } },
  });
  await call('/api/config', { device: 'a' });
  await call('/api/measurements', {
    method: 'POST', device: 'a', body: [reading(DEVICE_A, 7, now - 780, { temp_c: 20.9 })],
  });
  const stillPending = await call(`/api/v1/stations/${DEVICE_A}/config`, { as: 'owner' });
  check('sin confirmación explícita, el segundo cambio sigue pendiente',
    stillPending.body.state === 'recibido' && stillPending.body.version === nextVersion,
    JSON.stringify({ state: stillPending.body.state, version: stillPending.body.version }));

  // Alternativa por endpoint, para un firmware que no pueda añadir el campo.
  const viaEndpoint = await call(`/api/config/confirm?version=${nextVersion}`, { method: 'POST', device: 'a' });
  check('la confirmación alternativa funciona', viaEndpoint.status === 200
    && viaEndpoint.body.confirmed === true, JSON.stringify(viaEndpoint.body));
  const confirmedNow = await call(`/api/v1/stations/${DEVICE_A}/config`, { as: 'owner' });
  check('queda aplicada tras la confirmación alternativa', confirmedNow.body.state === 'aplicado',
    confirmedNow.body.state);

  const fake = await call('/api/config/confirm?version=9999', { method: 'POST', device: 'a' });
  check('no se confirma una versión inexistente', fake.status === 404, JSON.stringify(fake.body));

  // ==========================================================================
  section('4. Un usuario no puede consultar ni borrar datos de otra estación');

  // El propietario tiene acceso solo a la estación A; la B es de otro usuario.
  await sql`INSERT INTO subscriber_devices (subscriber_id, device_id)
    VALUES (${stranger.id}, ${DEVICE_B}) ON CONFLICT DO NOTHING`;
  const [victim] = await sql`SELECT id::text FROM measurements WHERE device_id = ${DEVICE_B}
    ORDER BY sequence LIMIT 1`;
  const victimId = victim.id;

  const own = await call(`/api/v1/stations/${DEVICE_A}`, { as: 'owner' });
  check('sí puede consultar su estación', own.status === 200, String(own.status));

  const other = await call(`/api/v1/stations/${DEVICE_B}`, { as: 'owner' });
  check('no puede consultar otra estación', other.status === 404, String(other.status));

  const otherConfig = await call(`/api/v1/stations/${DEVICE_B}/config`, { as: 'owner' });
  check('no puede leer su configuración', otherConfig.status === 404, String(otherConfig.status));

  const otherWrite = await call(`/api/v1/stations/${DEVICE_B}/config`, {
    method: 'PUT', as: 'owner', body: { config: { interval_normal_s: 300 } },
  });
  check('no puede cambiar su configuración', otherWrite.status === 404, String(otherWrite.status));

  const otherGaps = await call(`/api/v1/stations/${DEVICE_B}/measurements/gaps`, { as: 'owner' });
  check('no puede ver sus huecos', otherGaps.status === 404, String(otherGaps.status));

  const otherStats = await call(`/api/v1/stations/${DEVICE_B}/statistics`, { as: 'owner' });
  check('no puede ver sus estadísticas', otherStats.status === 404, String(otherStats.status));

  const otherImpact = await call(`/api/v1/stations/${DEVICE_B}/urgent-impact`, { as: 'owner' });
  check('no puede ver su informe de alertas urgentes', otherImpact.status === 404, String(otherImpact.status));

  const otherRules = await call(`/api/v1/alerts/rules?device_id=${DEVICE_B}`, { as: 'owner' });
  check('no puede ver sus reglas', otherRules.status === 404, String(otherRules.status));

  const otherAlerts = await call(`/api/v1/alerts?device_id=${DEVICE_B}&status=all`, { as: 'owner' });
  check('no puede ver sus avisos', otherAlerts.status === 404, String(otherAlerts.status));

  const filtered = await call(`/api/v1/measurements?device_id=${DEVICE_B}&limit=50`, { as: 'owner' });
  check('no puede listar sus mediciones', filtered.status === 200 && filtered.body.total === 0,
    JSON.stringify(filtered.body.total));

  const detail = await call(`/api/v1/measurements/${victimId}`, { as: 'owner' });
  check('no puede abrir una medición ajena', detail.status === 404, String(detail.status));

  const del = await call(`/api/v1/measurements/${victimId}`, { method: 'DELETE', as: 'owner' });
  check('no puede borrar una medición ajena', del.status === 404, String(del.status));

  const review = await call(`/api/v1/measurements/${victimId}/validate`, {
    method: 'PATCH', as: 'owner', body: { is_validated: false, reason: 'intento' },
  });
  check('no puede revisar una medición ajena', review.status === 404, String(review.status));

  const stillThere = await sql`SELECT deleted_at, is_validated FROM measurements WHERE id = ${victimId}::bigint`;
  check('la medición ajena sigue intacta tras los intentos',
    stillThere[0].deletedAt == null && stillThere[0].isValidated === true,
    JSON.stringify(stillThere[0]));

  const csvOther = await call(`/api/v1/measurements.csv?device_id=${DEVICE_B}&limit=50`, { as: 'owner', raw: true });
  check('el CSV tampoco incluye datos ajenos',
    csvOther.text.trim().split('\r\n').length === 1, `${csvOther.text.trim().split('\r\n').length} líneas`);

  const stationList = await call('/api/v1/stations', { as: 'owner' });
  check('el listado solo muestra sus estaciones',
    stationList.body.stations.some((item) => item.id === DEVICE_A)
    && !stationList.body.stations.some((item) => item.id === DEVICE_B),
    JSON.stringify(stationList.body.stations.map((item) => item.id)));

  const dashboard = await call('/api/v1/dashboard?period=24h', { as: 'owner' });
  check('el panel tampoco incluye la estación ajena',
    !dashboard.body.devices.some((item) => item.device.id === DEVICE_B),
    JSON.stringify(dashboard.body.devices.map((item) => item.device.id)));

  const viewerWrite = await call(`/api/v1/stations/${DEVICE_A}/config`, {
    method: 'PUT', as: 'stranger', body: { config: { interval_normal_s: 300 } },
  });
  check('otro suscriptor tampoco toca una estación ajena', viewerWrite.status === 404,
    String(viewerWrite.status));

  // ==========================================================================
  section('5. Un registro sin canales no bloquea el lote');

  // Un ciclo con el sensor caído no deja ningún canal válido: el equipo lo
  // encola igual. Un lote con ese registro se confirma igualmente; si se
  // rechazara, la estación reenviaría el mismo cuerpo para siempre.
  const noChannels = { temp_c: undefined, hum_pct: undefined, press_pa: undefined, batt_mv: undefined };
  const emptyFirst = [
    reading(DEVICE_B, 200, now - 120, noChannels),
    reading(DEVICE_B, 201, now - 60, { temp_c: 19.8 }),
  ];
  const emptyFirstSend = await call('/api/measurements', { method: 'POST', device: 'b', body: emptyFirst });
  check('un lote con un registro sin canales se acepta',
    emptyFirstSend.status === 200 && emptyFirstSend.body.ack_through === 201,
    JSON.stringify(emptyFirstSend.body));

  const storedEmpty = await sql`SELECT sequence FROM measurements
    WHERE device_id = ${DEVICE_B} AND sequence = 200`;
  check('el registro sin canales no crea fila', storedEmpty.length === 0, JSON.stringify(storedEmpty));

  const storedFull = await sql`SELECT sequence FROM measurements
    WHERE device_id = ${DEVICE_B} AND sequence = 201`;
  check('la lectura válida del mismo lote sí se guarda', storedFull.length === 1, String(storedFull.length));

  const onlyEmpty = [reading(DEVICE_B, 202, now - 30, noChannels)];
  const onlyEmptySend = await call('/api/measurements', { method: 'POST', device: 'b', body: onlyEmpty });
  check('un lote formado solo por registros vacíos se confirma igualmente',
    onlyEmptySend.status === 200 && onlyEmptySend.body.ack_through === 202,
    JSON.stringify(onlyEmptySend.body));
  const counted = await sql`SELECT count(*)::int AS total FROM measurements
    WHERE device_id = ${DEVICE_B} AND sequence >= 200`;
  check('sin ningún canal no se guarda nada', counted[0].total === 1, JSON.stringify(counted[0]));

  // ==========================================================================
  section('6. El panel respeta el permiso de datos públicos de estaciones vecinas');

  await sql`UPDATE devices SET latitude = 40, longitude = -3, coverage_km = 25, last_seen_at = now()
    WHERE id = ${DEVICE_A}`;
  await sql`UPDATE devices SET latitude = 40.001, longitude = -3.001, coverage_km = 25,
      last_seen_at = now(), publish_permission = false
    WHERE id = ${DEVICE_B}`;
  const privateNearby = await call('/api/v1/dashboard?period=24h', { as: 'owner' });
  const privateNames = privateNearby.body.devices[0].nearby.stations.map((item) => item.name);
  check('oculta estaciones vecinas sin permiso de publicación',
    !privateNames.includes(`Estación ${DEVICE_B}`), JSON.stringify(privateNames));

  await sql`UPDATE devices SET publish_permission = true WHERE id = ${DEVICE_B}`;
  const publicNearby = await call('/api/v1/dashboard?period=24h', { as: 'owner' });
  const publicStations = publicNearby.body.devices[0].nearby.stations;
  const publishedStation = publicStations.find((item) => item.name === `Estación ${DEVICE_B}`);
  check('incluye la estación cercana cuando permite datos públicos', !!publishedStation,
    JSON.stringify(publicStations));
  check('la respuesta pública solo incluye nombre, fecha y distancia aproximada',
    !!publishedStation && Object.keys(publishedStation).sort().join(',') === 'distanceKm,lastSeenAt,name',
    JSON.stringify(publishedStation));
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
console.log('Aceptación de la primera fase OK');
process.exit(0);
