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

// La estación debe pertenecer al suscriptor (admin ve todas). 404 para no filtrar existencia.
export async function requireStationAccess(req, res, next) {
  const stationId = req.params.id;
  if (!stationId) return res.status(400).json({ error: 'missing_station_id' });
  if (req.subscriber.role === 'admin') {
    req.stationId = stationId;
    return next();
  }
  const [row] = await sql`SELECT 1 AS ok FROM subscriber_devices
    WHERE subscriber_id = ${req.subscriber.id} AND device_id = ${stationId}`;
  if (!row) return res.status(404).json({ error: 'station_not_found' });
  req.stationId = stationId;
  next();
}
