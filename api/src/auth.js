import { sql } from './db.js';
import { sha256 } from './security.js';

export function cookies(header = '') {
  return Object.fromEntries(header.split(';').map((part) => {
    const i = part.indexOf('=');
    return i < 0 ? ['', ''] : [part.slice(0, i).trim(), decodeURIComponent(part.slice(i + 1).trim())];
  }).filter(([key]) => key));
}

export async function requireDevice(req, res, next) {
  const token = req.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{32,})$/)?.[1];
  if (!token) return res.status(401).json({ error: 'device_auth_required' });
  const [credential] = await sql`SELECT d.id FROM device_credentials c
    JOIN devices d ON d.id = c.device_id
    WHERE c.token_hash = ${sha256(token)} AND c.revoked_at IS NULL AND d.active = true`;
  if (!credential) return res.status(401).json({ error: 'invalid_device_token' });
  req.deviceId = credential.id;
  next();
}

export async function requireSubscriber(req, res, next) {
  const token = cookies(req.headers.cookie).tr_session;
  if (!token) return res.status(401).json({ error: 'authentication_required' });
  const [subscriber] = await sql`SELECT s.id, s.email, s.role, s.plan FROM web_sessions w
    JOIN subscribers s ON s.id = w.subscriber_id
    WHERE w.token_hash = ${sha256(token)} AND w.expires_at > now() AND s.active = true`;
  if (!subscriber) return res.status(401).json({ error: 'session_expired' });
  req.subscriber = subscriber;
  next();
}

// admin siempre supera el filtro; si no, el rol debe estar en la lista.
export function requireRole(...roles) {
  return (req, res, next) => {
    const role = req.subscriber?.role;
    if (role === 'admin' || roles.includes(role)) return next();
    return res.status(403).json({ error: 'forbidden' });
  };
}

// Cabecera obligatoria: un formulario cross-site no puede enviarla (defensa CSRF).
export function csrfGuard(req, res, next) {
  if (req.get('x-requested-with') !== 'fetch') return res.status(400).json({ error: 'missing_client_header' });
  next();
}

// Conjunto de estaciones a las que un suscriptor puede acceder, como subconsulta.
// - admin: null (todas).
// - viewer (registro público): sus estaciones concedidas MÁS las autorizadas para
//   la demostración (`publish_permission`). Nunca todas las privadas.
// - operator: solo las concedidas explícitamente.
export function accessibleDeviceIds(subscriber) {
  if (subscriber?.role === 'admin') return null;
  if (subscriber?.role === 'viewer') {
    return sql`(SELECT sd.device_id FROM subscriber_devices sd WHERE sd.subscriber_id = ${subscriber.id}
      UNION
      SELECT d.id FROM devices d WHERE d.publish_permission = true AND d.active = true)`;
  }
  return sql`(SELECT sd.device_id FROM subscriber_devices sd WHERE sd.subscriber_id = ${subscriber.id})`;
}

// La estación debe estar dentro del ámbito del suscriptor. 404 para no filtrar
// la existencia de recursos privados ajenos.
export async function requireStationAccess(req, res, next) {
  const stationId = req.params.id;
  if (!stationId) return res.status(400).json({ error: 'missing_station_id' });
  const scope = accessibleDeviceIds(req.subscriber);
  const rows = scope
    ? await sql`SELECT 1 AS ok FROM devices d WHERE d.id = ${stationId} AND d.active = true AND d.id IN ${scope}`
    : await sql`SELECT 1 AS ok FROM devices WHERE id = ${stationId}`;
  if (!rows.length) return res.status(404).json({ error: 'station_not_found' });
  req.stationId = stationId;
  next();
}

// Ámbito de los AVISOS, distinto al de los datos.
//
// Ver la estación de la demostración no suscribe a nadie a sus avisos: el
// registro público (`viewer`) solo recibe los avisos de las estaciones que se le
// han concedido explícitamente. Nunca los de la estación urbana que únicamente
// tiene `publish_permission`. Tampoco se le da de alta en la cola de envíos
// (`recipientsForDevice` solo mira `subscriber_devices` y `farm_devices`).
// - admin: null (todas, para depurar).
// - el resto: solo estaciones concedidas.
export function alertableDeviceIds(subscriber) {
  if (subscriber?.role === 'admin') return null;
  return sql`(SELECT sd.device_id FROM subscriber_devices sd WHERE sd.subscriber_id = ${subscriber.id})`;
}
