import crypto from 'node:crypto';
import { query } from './db.js';
import { config } from './config.js';

/**
 * Settings and keys the owner can change from the dashboard, with no redeploy.
 * Order of precedence: value saved in the database, then the environment variable, then the default.
 * Secrets are stored encrypted (AES-256-GCM, key from SETTINGS_ENCRYPTION_KEY or JWT_SECRET) and never sent back to the browser.
 */
export const DEFS = {
  // payments
  payment_mode: { group: 'payments', label: 'Payment mode', type: 'enum', options: ['sandbox', 'live'], env: 'PAYMENT_MODE', def: 'sandbox', help: 'Sandbox shows a test QR that the apps can mark as paid. Live asks Fonepay for a real QR and trusts only Fonepay.' },
  fonepay_merchant_code: { group: 'payments', label: 'Fonepay merchant code', env: 'FONEPAY_MERCHANT_CODE', def: '', help: 'Given by Fonepay when your merchant account is approved.' },
  fonepay_username: { group: 'payments', label: 'Fonepay username', env: 'FONEPAY_USERNAME', def: '' },
  fonepay_password: { group: 'payments', label: 'Fonepay password', secret: true, env: 'FONEPAY_PASSWORD', def: '' },
  fonepay_secret_key: { group: 'payments', label: 'Fonepay shared secret key', secret: true, env: 'FONEPAY_SECRET_KEY', def: '', help: 'Signs every request to Fonepay.' },
  fonepay_qr_url: { group: 'payments', label: 'Fonepay QR address', type: 'url', env: 'FONEPAY_QR_URL', def: 'https://dev-merchantapi.fonepay.com/api/merchant/merchantDetailsForThirdParty/thirdPartyDynamicQrDownload', help: 'Use the live address from Fonepay when you go live.' },
  fonepay_status_url: { group: 'payments', label: 'Fonepay status address', type: 'url', env: 'FONEPAY_STATUS_URL', def: 'https://dev-merchantapi.fonepay.com/api/merchant/merchantDetailsForThirdParty/thirdPartyDynamicQrGetStatus' },
  fonepay_webhook_secret: { group: 'payments', label: 'Fonepay notification secret', secret: true, env: 'FONEPAY_WEBHOOK_SECRET', def: '', help: 'Signs the payment notifications Fonepay sends us.' },
  // push
  push_mode: { group: 'push', label: 'Push notifications', type: 'enum', options: ['auto', 'off'], env: 'PUSH_MODE', def: 'auto', help: 'Auto sends for real when keys are set and logs a test delivery when they are not. Off stops all push.' },
  fcm_service_account_json: { group: 'push', label: 'Firebase service account (JSON)', secret: true, type: 'json', env: 'FCM_SERVICE_ACCOUNT_JSON', def: '', help: 'Firebase, Project settings, Service accounts, Generate new private key. Paste the whole file.' },
  vapid_public_key: { group: 'push', label: 'Browser push public key', env: 'VAPID_PUBLIC_KEY', def: '', help: 'Use “Generate keys” if you do not have a pair.' },
  vapid_private_key: { group: 'push', label: 'Browser push private key', secret: true, env: 'VAPID_PRIVATE_KEY', def: '' },
  vapid_subject: { group: 'push', label: 'Browser push contact', env: 'VAPID_SUBJECT', def: 'mailto:support@sadhai.example', help: 'An email as mailto:you@yourdomain.' },
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
  support_email: { group: 'company', label: 'Support email', env: 'NEXT_PUBLIC_SUPPORT_EMAIL', def: 'support@sadhai.example' },
  privacy_email: { group: 'company', label: 'Privacy email', env: 'NEXT_PUBLIC_PRIVACY_EMAIL', def: 'privacy@sadhai.example' },
};

const KEY = crypto.createHash('sha256').update(process.env.SETTINGS_ENCRYPTION_KEY || config.jwtSecret).digest();
export const encrypt = (plain) => {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return `enc:v1:${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${enc.toString('base64')}`;
};
export const decrypt = (s) => {
  const [, , iv, tag, data] = s.split(':');
  const d = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(iv, 'base64'));
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

function validate(key, v) {
  const d = DEFS[key];
  if (v === '' || v == null) return '';
  const s = String(v).trim();
  if (d.type === 'enum' && !d.options.includes(s)) throw new Error(`${d.label} must be one of: ${d.options.join(', ')}`);
  if (d.type === 'url' && !/^https?:\/\/[^\s]+$/.test(s)) throw new Error(`${d.label} must be a web address starting with http:// or https://`);
  if (d.type === 'bool') return ['1', 'true', 'yes', 'on', true].includes(v) ? '1' : '0';
  if (d.type === 'json') {
    let j; try { j = JSON.parse(s.startsWith('{') ? s : Buffer.from(s, 'base64').toString('utf8')); } catch { throw new Error(`${d.label} is not valid JSON`); }
    if (!j.client_email || !j.private_key || !j.project_id) throw new Error('That file is missing client_email, private_key or project_id. Paste the whole service account file.');
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
