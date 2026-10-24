import 'dotenv/config';

const required = (k, d) => {
  const v = process.env[k] ?? d;
  if (v === undefined) throw new Error(`Missing env ${k}`);
  return v;
};

const WEAK_SECRETS = new Set([
  'dev-secret-change-me',
  'change-me-in-production',
  'change-me-to-a-long-random-string',
  'ci-secret',
]);

function resolveJwtSecret() {
  const raw = required('JWT_SECRET', process.env.NODE_ENV === 'production' ? undefined : 'dev-secret-change-me');
  if (process.env.NODE_ENV === 'production') {
    if (raw.length < 32 || WEAK_SECRETS.has(raw)) {
      throw new Error('JWT_SECRET must be at least 32 characters and not a default placeholder in production');
    }
  }
  return raw;
}

export const config = {
  port: Number(process.env.PORT || 4747),
  databaseUrl: required('DATABASE_URL', 'postgres://localhost:5432/sadhai_coffee'),
  jwtSecret: resolveJwtSecret(),
  accessTtl: process.env.JWT_ACCESS_TTL || '15m',
  refreshDays: Number(process.env.REFRESH_TTL_DAYS || 30),
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(',').map((s) => s.trim()),
  ignoreHours: process.env.IGNORE_STATION_HOURS === '1',
  minAppVersion: process.env.MIN_APP_VERSION || '1.0.0',
  playUrl: process.env.PLAY_STORE_URL || '',
  appStoreUrl: process.env.APP_STORE_URL || '',
  apiUrl: process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT || 4747}`,
  webUrl: process.env.PUBLIC_WEB_URL || 'http://localhost:3000',
};

