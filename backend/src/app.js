import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './lib/config.js';
import { readFileSync } from 'node:fs';
import { errorHandler } from './lib/http.js';
import { query } from './lib/db.js';
import { auth, me } from './routes/auth.js';
import { pub } from './routes/public.js';
import { customer } from './routes/customer.js';
import { station } from './routes/station.js';
import { admin } from './routes/admin.js';
import { owner } from './routes/owner.js';
import { kiosk } from './routes/kiosk.js';
import { central, transfers } from './routes/central.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
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
    name: 'sadhai-api', version: pkg.version, min_app_version: config.minAppVersion,
    store_urls: { android: config.playUrl || null, ios: config.appStoreUrl || null }, terms_url: `${config.webUrl}/terms`, privacy_url: `${config.webUrl}/privacy`,
  }));
  app.use('/auth', auth);
  app.use('/me', me);
  app.use('/', pub);
  app.use('/station', station);
  app.use('/kiosk', kiosk);
  app.use('/central', central);
  app.use('/transfers', transfers);
  app.use('/admin', admin);
  app.use('/owner', owner);
  app.use('/', customer); // orders, payments, passes, coupons, referrals, notifications, events
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use(errorHandler);
  return app;
}
