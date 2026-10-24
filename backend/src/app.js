import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './lib/config.js';
import { rt } from './lib/runtime.js';
import { readFileSync } from 'node:fs';
import { errorHandler } from './lib/http.js';
import { query } from './lib/db.js';
import { auth, me } from './routes/auth.js';
import { pub } from './routes/public.js';
import { customer } from './routes/customer.js';
import { station } from './routes/station.js';
import { admin } from './routes/admin.js';
import { owner } from './routes/owner.js';
import { studio } from './routes/studio.js';
import { hr } from './routes/hr.js';
import { kiosk } from './routes/kiosk.js';
import { central, transfers } from './routes/central.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  // Allowed browsers: the CORS_ORIGINS list, owner's saved URL, and local dev/flutter ports in non-production
  const isDev = process.env.NODE_ENV !== 'production';
  app.use(cors({
    origin: (origin, cb) => cb(null, !origin || config.corsOrigins.includes(origin) || origin === rt('public_web_url') || (isDev && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))),
    credentials: true,
  }));
  app.use('/owner/media', express.json({ limit: '6mb' })); // picture uploads; everything else stays at 200 kb
  app.use(express.json({ limit: '200kb' }));
  // Log the path only: query strings can carry coordinates and SSE access tokens, which must never reach logs.
  morgan.token('path', (req) => req.originalUrl.split('?')[0]);
  if (process.env.NODE_ENV !== 'test') app.use(morgan(':method :path :status :res[content-length] - :response-time ms'));

  app.get('/health', async (_req, res) => {
    await query('SELECT 1');
    res.json({ ok: true, service: 'sadhai-api', time: new Date().toISOString() });
  });
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  app.get('/version', (_req, res) => res.json({
    name: 'sadhai-api', version: pkg.version, min_app_version: rt('min_app_version'),
    store_urls: { android: rt('play_store_url') || null, ios: rt('app_store_url') || null }, terms_url: `${rt('public_web_url')}/terms`, privacy_url: `${rt('public_web_url')}/privacy`,
  }));
  app.use('/auth', auth);
  app.use('/me', me);
  app.use('/', pub);
  app.use('/station', station);
  app.use('/kiosk', kiosk);
  app.use('/central', central);
  app.use('/hr', hr);
  app.use('/transfers', transfers);
  app.use('/admin', admin);
  app.use('/owner', owner);
  app.use('/owner', studio);
  app.use('/', customer); // orders, payments, passes, coupons, referrals, notifications, events
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use(errorHandler);
  return app;
}
