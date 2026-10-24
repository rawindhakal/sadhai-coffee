import crypto from 'node:crypto';
import { query } from './db.js';
import { config } from './config.js';

/**
 * Settings and keys the owner can change from the dashboard, with no redeploy.
 * Order of precedence: value saved in the database, then the environment variable, then the default.
 * Secrets are stored encrypted (AES-256-GCM, key from SETTINGS_ENCRYPTION_KEY or JWT_SECRET) and never sent back to the browser.
 */
export const DEFS = {
  // sms (NestSMS)
  sms_enabled: { group: 'sms', label: 'Enable SMS gateway (NestSMS)', type: 'bool', env: 'SMS_ENABLED', def: '1', help: 'Master switch to turn all SMS features on or off across the platform.' },
  sms_mode: { group: 'sms', label: 'SMS mode (NestSMS)', type: 'enum', options: ['auto', 'live', 'sandbox', 'off'], env: 'SMS_MODE', def: 'auto', help: 'Auto sends via NestSMS when your API key is saved, and logs a test SMS in sandbox mode when not. Off disables all SMS.' },
  nestsms_api_url: { group: 'sms', label: 'NestSMS API address', type: 'url', env: 'NESTSMS_API_URL', def: 'https://api.nestsms.com/api/v1/sms/send', help: 'Endpoint from your NestSMS developer portal (nestsms.com).' },
  nestsms_api_key: { group: 'sms', label: 'NestSMS API key / token', secret: true, env: 'NESTSMS_API_KEY', def: '', help: 'Bearer token or API key from your NestSMS dashboard.' },
  nestsms_sender_id: { group: 'sms', label: 'NestSMS sender ID', env: 'NESTSMS_SENDER_ID', def: 'Sadhai', help: 'Approved sender mask / ID registered with NestSMS.' },
  sms_otp_enabled: { group: 'sms', label: 'Enable SMS OTP phone verification', type: 'bool', env: 'SMS_OTP_ENABLED', def: '1', help: 'Allow customers to verify their phone number via 6-digit SMS code.' },
  sms_order_ready: { group: 'sms', label: 'Send SMS when order is ready for pickup', type: 'bool', env: 'SMS_ORDER_READY', def: '0', help: 'Texts the customer’s mobile number when their coffee is marked Ready.' },
  sms_welcome_enabled: { group: 'sms', label: 'Send SMS when welcome or referral coupon unlocks', type: 'bool', env: 'SMS_WELCOME_ENABLED', def: '0', help: 'Texts the customer when a welcome or referral reward is added to their account.' },
  // push
  push_mode: { group: 'push', label: 'Push notifications', type: 'enum', options: ['auto', 'off'], env: 'PUSH_MODE', def: 'auto', help: 'Auto sends for real when keys are set and logs a test delivery when they are not. Off stops all push.' },
  fcm_service_account_json: { group: 'push', label: 'Firebase service account (JSON)', secret: true, type: 'json', env: 'FCM_SERVICE_ACCOUNT_JSON', def: '', help: 'Firebase, Project settings, Service accounts, Generate new private key. Paste the whole file.' },
  vapid_public_key: { group: 'push', label: 'Browser push public key', env: 'VAPID_PUBLIC_KEY', def: '', help: 'Use “Generate keys” if you do not have a pair.' },
  vapid_private_key: { group: 'push', label: 'Browser push private key', secret: true, env: 'VAPID_PRIVATE_KEY', def: '' },
  vapid_subject: { group: 'push', label: 'Browser push contact', env: 'VAPID_SUBJECT', def: 'mailto:support@sadhaicoffee.com', help: 'An email as mailto:you@yourdomain.' },
  // app and web addresses
  public_web_url: { group: 'app', label: 'Website address', type: 'url', env: 'PUBLIC_WEB_URL', def: 'http://localhost:3000', help: 'Where customers open the web app. Used in links and for payment returns.' },
  public_api_url: { group: 'app', label: 'API address', type: 'url', env: 'PUBLIC_API_URL', def: '', help: 'The public address of this server, used for payment callbacks and uploaded images.' },
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
    if (!/^https?:\/\/[^\s]+$/.test(s)) throw new Error(`${d.label} must be a web address starting with http:// or https://`);
    if (key === 'nestsms_api_url') assertSafeOutboundUrl(s, d.label);
  }
  if (d.type === 'bool') return ['1', 'true', 'yes', 'on', true].includes(v) ? '1' : '0';
  if (d.type === 'json') {
    let j; try { j = JSON.parse(s.startsWith('{') ? s : Buffer.from(s, 'base64').toString('utf8')); } catch { throw new Error(`${d.label} is not valid JSON`); }
    if (!j.client_email || !j.private_key || !j.project_id) throw new Error('That file is missing client_email, private_key or project_id. Paste the whole service account file.');
    if (!/^[a-z0-9-]+$/i.test(String(j.project_id))) throw new Error('Invalid Firebase project_id in service account JSON.');
    return JSON.stringify(j);
  }
  if (key === 'min_app_version' && !/^\d+\.\d+\.\d+$/.test(s)) throw new Error('Use a version like 1.2.0');
  if (key === 'vapid_subject' && !/^(mailto:|https:\/\/)/.test(s)) throw new Error('Start with mailto: or https://');
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
