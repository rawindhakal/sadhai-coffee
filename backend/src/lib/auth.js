import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { config } from './config.js';
import { query } from './db.js';
import { HttpError, forbidden } from './http.js';

export const signAccess = (u) =>
  jwt.sign({ sub: u.id, role: u.role, sid: u.station_id || null }, config.jwtSecret, { expiresIn: config.accessTtl });

export const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

export async function issueRefresh(userId) {
  const token = crypto.randomBytes(48).toString('base64url');
  await query(
    `INSERT INTO refresh_tokens(user_id, token_hash, expires_at) VALUES ($1,$2, now() + ($3 || ' days')::interval)`,
    [userId, hashToken(token), String(config.refreshDays)],
  );
  return token;
}

export function verifyAccess(token) {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch {
    throw new HttpError(401, 'Please sign in again', 'token_expired');
  }
}

// Loads the user so role/station changes and deactivation apply immediately.
export async function authenticate(req, _res, next) {
  try {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : req.query.access_token;
    if (!token) throw new HttpError(401, 'Sign in required', 'no_token');
    const claims = verifyAccess(token);
    const { rows } = await query(
      'SELECT id, phone, name, role, station_id, lang, active, warehouse FROM users WHERE id=$1',
      [claims.sub],
    );
    const u = rows[0];
    if (!u || !u.active) throw new HttpError(401, 'Account unavailable', 'inactive');
    req.user = u;
    next();
  } catch (e) {
    next(e);
  }
}

export const optionalAuth = (req, res, next) =>
  req.headers.authorization ? authenticate(req, res, next) : next();

export const requireRole = (...roles) => (req, _res, next) =>
  roles.includes(req.user?.role) ? next() : next(forbidden('Your role cannot do this'));

// Stations the caller may operate on.
export async function scopeStations(user) {
  if (user.role === 'owner') {
    const { rows } = await query('SELECT id FROM stations WHERE active ORDER BY name');
    return rows.map((r) => r.id);
  }
  if (user.role === 'manager') {
    const { rows } = await query('SELECT station_id FROM station_managers WHERE user_id=$1', [user.id]);
    return rows.map((r) => r.station_id);
  }
  if (user.role === 'station' && user.station_id) return [user.station_id];
  return [];
}

export async function assertStationAccess(user, stationId) {
  const ids = await scopeStations(user);
  if (!ids.includes(stationId)) throw forbidden('This station is not yours');
}
