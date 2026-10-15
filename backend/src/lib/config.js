import 'dotenv/config';

const required = (k, d) => {
  const v = process.env[k] ?? d;
  if (v === undefined) throw new Error(`Missing env ${k}`);
  return v;
};

export const config = {
  port: Number(process.env.PORT || 4747),
  databaseUrl: required('DATABASE_URL', 'postgres://localhost:5432/sadhai_coffee'),
  jwtSecret: required('JWT_SECRET', process.env.NODE_ENV === 'production' ? undefined : 'dev-secret-change-me'),
  accessTtl: process.env.JWT_ACCESS_TTL || '15m',
  refreshDays: Number(process.env.REFRESH_TTL_DAYS || 30),
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(',').map((s) => s.trim()),
  ignoreHours: process.env.IGNORE_STATION_HOURS === '1',
  minAppVersion: process.env.MIN_APP_VERSION || '1.0.0',
  playUrl: process.env.PLAY_STORE_URL || '',
  appStoreUrl: process.env.APP_STORE_URL || '',
  paymentMode: process.env.PAYMENT_MODE || 'sandbox',
  apiUrl: process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT || 4747}`,
  webUrl: process.env.PUBLIC_WEB_URL || 'http://localhost:3000',
  fonepaySecret: process.env.FONEPAY_WEBHOOK_SECRET || '',
};

export const push = {
  mode: process.env.PUSH_MODE || 'auto', // auto | off
  fcmJson: process.env.FCM_SERVICE_ACCOUNT_JSON || '',
  vapidPublic: process.env.VAPID_PUBLIC_KEY || '',
  vapidPrivate: process.env.VAPID_PRIVATE_KEY || '',
  vapidSubject: process.env.VAPID_SUBJECT || 'mailto:support@sadhai.example',
};
