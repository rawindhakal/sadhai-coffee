import crypto from 'node:crypto';
import { query } from './db.js';
import { config } from './config.js';

/**
 * Settings and keys the owner can change from the dashboard, with no redeploy.
 * Order of precedence: value saved in the database, then the environment variable, then the default.
 * Secrets are stored encrypted (AES-256-GCM, key from SETTINGS_ENCRYPTION_KEY or JWT_SECRET) and never sent back to the browser.
 */
export const DEFS = {
  // online payments: eSewa ePay and Fonepay. Both start switched off; the owner turns each on when its merchant account is ready.
  esewa_enabled: { group: 'payments', label: 'Accept eSewa', type: 'bool', env: 'ESEWA_ENABLED', def: '0', help: 'Customers can pay with eSewa (ePay v2) on the website, kiosk, counter and app.' },
  esewa_mode: { group: 'payments', label: 'eSewa mode', type: 'enum', options: ['sandbox', 'live'], env: 'ESEWA_MODE', def: 'sandbox', help: 'Sandbox uses eSewa’s test server, so no real money moves. Switch to Live when eSewa has approved your merchant account.' },
  esewa_merchant_code: { group: 'payments', label: 'eSewa merchant (product) code', env: 'ESEWA_MERCHANT_CODE', def: 'EPAYTEST', help: 'In Sandbox the public test code EPAYTEST works. For Live, use the code eSewa gave you.' },
  esewa_secret_key: { group: 'payments', label: 'eSewa secret key', secret: true, env: 'ESEWA_SECRET_KEY', def: '8gBm/:&EnhH.1/q', help: 'Signs every payment. In Sandbox eSewa’s public test key is used until you save your own.' },
  fonepay_enabled: { group: 'payments', label: 'Accept Fonepay', type: 'bool', env: 'FONEPAY_ENABLED', def: '0', help: 'Customers can pay with Fonepay (any bank or wallet app) on the website, kiosk, counter and app.' },
  fonepay_mode: { group: 'payments', label: 'Fonepay mode', type: 'enum', options: ['sandbox', 'live'], env: 'FONEPAY_MODE', def: 'sandbox', help: 'Sandbox uses Fonepay’s test server with the test merchant code Fonepay gave you. Live uses the real server.' },
  fonepay_merchant_code: { group: 'payments', label: 'Fonepay merchant code (PID)', env: 'FONEPAY_MERCHANT_CODE', def: '', help: 'Given by Fonepay when your merchant account is approved.' },
  fonepay_secret_key: { group: 'payments', label: 'Fonepay shared secret key', secret: true, env: 'FONEPAY_SECRET_KEY', def: '', help: 'Signs every request to Fonepay and every answer from it.' },
  fonepay_qr_username: { group: 'payments', label: 'Fonepay QR API user name', env: 'FONEPAY_QR_USERNAME', def: '', help: 'For the real Fonepay QR. Given by Fonepay with the merchant account.' },
  fonepay_qr_password: { group: 'payments', label: 'Fonepay QR API password', secret: true, env: 'FONEPAY_QR_PASSWORD', def: '', help: 'Goes with the user name above.' },
  nepalpay_enabled: { group: 'payments', label: 'Accept NepalPay QR', type: 'bool', env: 'NEPALPAY_ENABLED', def: '0', help: 'Customers scan a NepalPay QR with any bank or wallet app.' },
  nepalpay_mode: { group: 'payments', label: 'NepalPay mode', type: 'enum', options: ['sandbox', 'live'], env: 'NEPALPAY_MODE', def: 'sandbox', help: 'Sandbox is for testing with your bank’s test QR. Live takes real money.' },
  nepalpay_merchant_id: { group: 'payments', label: 'NepalPay terminal / merchant ID', env: 'NEPALPAY_MERCHANT_ID', def: '', help: 'The terminal ID your bank gave you for NepalPay QR.' },
  nepalpay_qr_template: { group: 'payments', label: 'Your NepalPay merchant QR text', secret: false, env: 'NEPALPAY_QR_TEMPLATE', def: '', help: 'The text inside the static QR your bank gave you (starts with 000201). We add the amount and a reference to it for every order.' },
  nepalpay_ws_url: { group: 'payments', label: 'NCHL WebSocket address', type: 'url', env: 'NEPALPAY_WS_URL', def: '', help: 'The wss:// address NCHL gave you for the NepalPay QR WebSocket channel.' },
  nepalpay_username: { group: 'payments', label: 'NCHL user name', env: 'NEPALPAY_USERNAME', def: '', help: 'Given by NCHL.' },
  nepalpay_api_token: { group: 'payments', label: 'NCHL API token', secret: true, env: 'NEPALPAY_API_TOKEN', def: '', help: 'Given by NCHL. It is encrypted with NCHL’s public key before it is sent.' },
  nepalpay_public_key: { group: 'payments', label: 'NCHL public key', secret: true, env: 'NEPALPAY_PUBLIC_KEY', def: '', help: 'NCHL’s public key (PEM text), used to encrypt the token.' },
  order_flow: { group: 'flow', label: 'Order flow', env: 'ORDER_FLOW', def: '', help: 'How ordering works on each way in. Edited in Settings, Order flow.' },
  // app and web addresses
  public_web_url: { group: 'app', label: 'Website address', type: 'url', env: 'PUBLIC_WEB_URL', def: 'http://localhost:3000', help: 'Where customers open the web app. Used in links.' },
  public_api_url: { group: 'app', label: 'API address', type: 'url', env: 'PUBLIC_API_URL', def: '', help: 'The public address of this server, used for uploaded images.' },
  min_app_version: { group: 'app', label: 'Oldest app version allowed', env: 'MIN_APP_VERSION', def: '1.0.0', help: 'Apps older than this show an update screen.' },
  play_store_url: { group: 'app', label: 'Google Play link', type: 'url', env: 'PLAY_STORE_URL', def: '' },
  app_store_url: { group: 'app', label: 'App Store link', type: 'url', env: 'APP_STORE_URL', def: '' },
  ignore_station_hours: { group: 'app', label: 'Accept orders outside opening hours (testing only)', type: 'bool', env: 'IGNORE_STATION_HOURS', def: '0', help: 'Leave off in production.' },
  // company
  company_name: { group: 'company', label: 'Company name', env: 'NEXT_PUBLIC_COMPANY_NAME', def: 'Sadhai Coffee', help: 'Shown in the privacy policy and terms.' },
  company_address: { group: 'company', label: 'Company address', env: 'NEXT_PUBLIC_COMPANY_ADDRESS', def: 'Kathmandu, Nepal' },
  support_email: { group: 'company', label: 'Support email', env: 'NEXT_PUBLIC_SUPPORT_EMAIL', def: 'support@sadhaicoffee.com' },
  privacy_email: { group: 'company', label: 'Privacy email', env: 'NEXT_PUBLIC_PRIVACY_EMAIL', def: 'privacy@sadhaicoffee.com' },
};

const KEY = crypto.createHmac('sha256', 'sadhai-app-secrets-v1').update(process.env.SETTINGS_ENCRYPTION_KEY || config.jwtSecret).digest();
const LEGACY_KEY = crypto.createHash('sha256').update(process.env.SETTINGS_ENCRYPTION_KEY || config.jwtSecret).digest();

export const encrypt = (plain) => {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return `enc:v2:${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${enc.toString('base64')}`;
};
export const decrypt = (s) => {
  const [, ver, iv, tag, data] = s.split(':');
  const k = ver === 'v2' ? KEY : LEGACY_KEY;
  const d = crypto.createDecipheriv('aes-256-gcm', k, Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8');
};

let cache = {};
let listeners = [];
export const onRuntimeChange = (fn) => listeners.push(fn);

export async function loadRuntime() {
  const { rows } = await query('SELECT key, value, secret FROM app_secrets');
  const next = {};
  for (const r of rows) { try { next[r.key] = r.secret ? decrypt(r.value) : r.value; } catch { console.error(`Setting ${r.key} could not be decrypted; falling back to the environment`); } }
  cache = next;
  listeners.forEach((f) => f());
}

/** Sync read of the live value: database, then environment, then default. */
export function rt(key) {
  const d = DEFS[key];
  if (key in cache) return cache[key];
  if (d?.env && process.env[d.env] !== undefined && process.env[d.env] !== '') return process.env[d.env];
  if (key === 'public_api_url') return process.env.PUBLIC_API_URL || `http://localhost:${config.port}`;
  return d?.def ?? '';
}
export const rtBool = (key) => ['1', 'true', 'yes', 'on'].includes(String(rt(key)).toLowerCase());
export const sourceOf = (key) => (key in cache ? 'dashboard' : DEFS[key]?.env && process.env[DEFS[key].env] ? 'server environment' : 'default');

const PRIVATE_HOST_RE = /^(localhost|0\.0\.0\.0|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|169\.254\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+|\[?::1\]?|\[?fe80:.*\]?|\[?fc00:.*\]?|\[?fd00:.*\]?)$/i;

export function assertSafeOutboundUrl(rawUrl, label = 'Address') {
  let u;
  try { u = new URL(rawUrl); } catch { throw new Error(`${label} is not a valid URL`); }
  if (u.protocol !== 'https:' && (process.env.NODE_ENV === 'production' || u.protocol !== 'http:')) {
    throw new Error(`${label} must use https://`);
  }
  const host = u.hostname.toLowerCase();
  if (PRIVATE_HOST_RE.test(host) || host.endsWith('.internal') || host.endsWith('.local')) {
    throw new Error(`${label} cannot point to a private, loopback, or internal network address`);
  }
  return u.toString();
}

function validate(key, v) {
  const d = DEFS[key];
  if (v === '' || v == null) return '';
  const s = String(v).trim();
  if (d.type === 'enum' && !d.options.includes(s)) throw new Error(`${d.label} must be one of: ${d.options.join(', ')}`);
  if (d.type === 'url') {
    if (!/^(https?|wss?):\/\/[^\s]+$/.test(s)) throw new Error(`${d.label} must be a web address starting with http:// or https://`);
  }
  if (d.type === 'bool') return ['1', 'true', 'yes', 'on', true].includes(v) ? '1' : '0';
  if (d.type === 'json') {
    let j; try { j = JSON.parse(s.startsWith('{') ? s : Buffer.from(s, 'base64').toString('utf8')); } catch { throw new Error(`${d.label} is not valid JSON`); }
    if (!j.client_email || !j.private_key || !j.project_id) throw new Error('That file is missing client_email, private_key or project_id. Paste the whole service account file.');
    if (!/^[a-z0-9-]+$/i.test(String(j.project_id))) throw new Error('Invalid Firebase project_id in service account JSON.');
    return JSON.stringify(j);
  }
  if (key === 'min_app_version' && !/^\d+\.\d+\.\d+$/.test(s)) throw new Error('Use a version like 1.2.0');
  return s.slice(0, 20000);
}

export async function setRuntime(key, value, userId) {
  if (!DEFS[key]) throw new Error('Unknown setting');
  const clean = validate(key, value);
  if (clean === '') await query('DELETE FROM app_secrets WHERE key=$1', [key]);
  else await query(
    `INSERT INTO app_secrets(key, value, secret, updated_by) VALUES ($1,$2,$3,$4) ON CONFLICT (key) DO UPDATE SET value=$2, secret=$3, updated_by=$4, updated_at=now()`,
    [key, DEFS[key].secret ? encrypt(clean) : clean, !!DEFS[key].secret, userId],
  );
  await loadRuntime();
}

const mask = (v) => (v.length <= 8 ? '••••••••' : `••••••••${v.slice(-4)}`);

/** What the dashboard may see: secrets are masked, never returned. */
export async function describeRuntime() {
  const { rows } = await query('SELECT key, updated_at, u.name AS by FROM app_secrets s LEFT JOIN users u ON u.id=s.updated_by');
  const meta = new Map(rows.map((r) => [r.key, r]));
  return Object.entries(DEFS).map(([key, d]) => {
    const v = String(rt(key) ?? '');
    return {
      key, group: d.group, label: d.label, help: d.help || null, secret: !!d.secret, type: d.type || 'text', options: d.options || null,
      is_set: v !== '', source: sourceOf(key), value: d.secret ? null : v, masked: d.secret && v ? mask(v) : null,
      updated_at: meta.get(key)?.updated_at || null, updated_by: meta.get(key)?.by || null,
    };
  });
}
