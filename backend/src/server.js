import { createApp } from './app.js';
import { config } from './lib/config.js';
import { pool } from './lib/db.js';

const app = createApp();
const server = app.listen(config.port, () => console.log(`Sadhai API listening on :${config.port} (payments: ${config.paymentMode})`));
const stop = () => server.close(() => pool.end().then(() => process.exit(0)));
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
