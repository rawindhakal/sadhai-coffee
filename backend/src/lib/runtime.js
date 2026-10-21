import crypto from 'node:crypto';
import { query } from './db.js';
import { config } from './config.js';

/**
 * Settings and keys the owner can change from the dashboard, with no redeploy.
 * Order of precedence: value saved in the database, then the environment variable, then the default.
 * Secrets are stored encrypted (AES-256-GCM, key from SETTINGS_ENCRYPTION_KEY or JWT_SECRET) and never sent back to the browser.
 */
export const DEFS = {
  // master payment switches
  payment_mode: { group: 'payments', label: 'Default payment mode', type: 'enum', options: ['sandbox', 'live'], env: 'PAYMENT_MODE', def: 'sandbox', help: 'Default environment for payment gateways unless overridden on a specific gateway.' },
  cash_enabled: { group: 'payments', label: 'Accept Cash at counter', type: 'bool', env: 'CASH_ENABLED', def: '1', help: 'Allow customers to pay with cash when picking up at the counter.' },

  // fonepay
  fonepay_enabled: { group: 'fonepay', label: 'Enable Fonepay gateway', type: 'bool', env: 'FONEPAY_ENABLED', def: '1', help: 'Show Fonepay at checkout across Web, Android, Kiosk, and Station POS.' },
  fonepay_mode: { group: 'fonepay', label: 'Fonepay environment', type: 'enum', options: ['sandbox', 'live'], env: 'FONEPAY_MODE', def: 'sandbox', help: 'Sandbox shows a test QR / dev checkout. Live connects to Fonepay production servers.' },
  fonepay_merchant_code: { group: 'fonepay', label: 'Fonepay merchant code (PID)', env: 'FONEPAY_MERCHANT_CODE', def: '', help: 'Merchant code / PID issued by Fonepay.' },
  fonepay_username: { group: 'fonepay', label: 'Fonepay API username', env: 'FONEPAY_USERNAME', def: '', help: 'Used for Fonepay Dynamic QR API.' },
  fonepay_password: { group: 'fonepay', label: 'Fonepay API password', secret: true, env: 'FONEPAY_PASSWORD', def: '' },
  fonepay_secret_key: { group: 'fonepay', label: 'Fonepay shared secret key', secret: true, env: 'FONEPAY_SECRET_KEY', def: '', help: 'Signs every request to Fonepay (HMAC-SHA512).' },
  fonepay_qr_url: { group: 'fonepay', label: 'Fonepay Dynamic QR API URL', type: 'url', env: 'FONEPAY_QR_URL', def: 'https://dev-merchantapi.fonepay.com/api/merchant/merchantDetailsForThirdParty/thirdPartyDynamicQrDownload', help: 'Live: https://merchantapi.fonepay.com/api/merchant/merchantDetailsForThirdParty/thirdPartyDynamicQrDownload' },
  fonepay_status_url: { group: 'fonepay', label: 'Fonepay QR Status API URL', type: 'url', env: 'FONEPAY_STATUS_URL', def: 'https://dev-merchantapi.fonepay.com/api/merchant/merchantDetailsForThirdParty/thirdPartyDynamicQrGetStatus', help: 'Live: https://merchantapi.fonepay.com/api/merchant/merchantDetailsForThirdParty/thirdPartyDynamicQrGetStatus' },
  fonepay_pg_url: { group: 'fonepay', label: 'Fonepay Web / Flutter PG URL', type: 'url', env: 'FONEPAY_PG_URL', def: 'https://dev-clientapi.fonepay.com/api/merchantRequest', help: 'Live: https://clientapi.fonepay.com/api/merchantRequest (used by fonepay_flutter and web redirect).' },
  fonepay_webhook_secret: { group: 'fonepay', label: 'Fonepay webhook secret (optional)', secret: true, env: 'FONEPAY_WEBHOOK_SECRET', def: '', help: 'Signs webhook notifications Fonepay sends us.' },

  // esewa (ePay v2 - developer.esewa.com.np)
  esewa_enabled: { group: 'esewa', label: 'Enable eSewa gateway', type: 'bool', env: 'ESEWA_ENABLED', def: '1', help: 'Show eSewa at checkout across Web, Android, Kiosk, and Station POS.' },
  esewa_mode: { group: 'esewa', label: 'eSewa environment', type: 'enum', options: ['sandbox', 'live'], env: 'ESEWA_MODE', def: 'sandbox', help: 'Sandbox uses EPAYTEST / rc-epay.esewa.com.np. Live uses epay.esewa.com.np.' },
  esewa_merchant_code: { group: 'esewa', label: 'eSewa product / merchant code (SCD)', env: 'ESEWA_PRODUCT_CODE', def: 'EPAYTEST', help: 'From your eSewa merchant account (use EPAYTEST for sandbox testing).' },
  esewa_secret_key: { group: 'esewa', label: 'eSewa HMAC-SHA256 secret key', secret: true, env: 'ESEWA_SECRET', def: '8gBm/:&EnhH.1/q', help: 'Signs eSewa ePay v2 form requests (sandbox key: 8gBm/:&EnhH.1/q).' },
  esewa_username: { group: 'esewa', label: 'eSewa QR API username (optional)', env: 'ESEWA_USERNAME', def: '', help: 'Optional: only required if using eSewa direct Dynamic QR merchant endpoint.' },
  esewa_password: { group: 'esewa', label: 'eSewa QR API password (optional)', secret: true, env: 'ESEWA_PASSWORD', def: '' },
  esewa_qr_url: { group: 'esewa', label: 'eSewa ePay v2 Form URL', type: 'url', env: 'ESEWA_FORM_URL', def: 'https://rc-epay.esewa.com.np/api/epay/main/v2/form', help: 'Sandbox: https://rc-epay.esewa.com.np/api/epay/main/v2/form · Live: https://epay.esewa.com.np/api/epay/main/v2/form' },
  esewa_status_url: { group: 'esewa', label: 'eSewa Transaction Status URL', type: 'url', env: 'ESEWA_STATUS_URL', def: 'https://rc.esewa.com.np/api/epay/transaction/status/', help: 'Sandbox: https://rc.esewa.com.np/api/epay/transaction/status/ · Live: https://epay.esewa.com.np/api/epay/transaction/status/' },
  esewa_webhook_secret: { group: 'esewa', label: 'eSewa webhook secret (optional)', secret: true, env: 'ESEWA_WEBHOOK_SECRET', def: '' },

  // khalti (KPG-2 ePayment - docs.khalti.com)
  khalti_enabled: { group: 'khalti', label: 'Enable Khalti gateway', type: 'bool', env: 'KHALTI_ENABLED', def: '1', help: 'Show Khalti at checkout across Web, Android, Kiosk, and Station POS.' },
  khalti_mode: { group: 'khalti', label: 'Khalti environment', type: 'enum', options: ['sandbox', 'live'], env: 'KHALTI_MODE', def: 'sandbox', help: 'Sandbox uses dev.khalti.com/api/v2. Live uses khalti.com/api/v2.' },
  khalti_secret_key: { group: 'khalti', label: 'Khalti live/test secret key', secret: true, env: 'KHALTI_SECRET', def: '', help: 'Sent as Authorization: Key <secret_key> to Khalti KPG-2 /epayment/initiate/ and /epayment/lookup/.' },
  khalti_merchant_code: { group: 'khalti', label: 'Khalti public key / merchant ID (optional)', env: 'KHALTI_MERCHANT_CODE', def: '' },
  khalti_base_url: { group: 'khalti', label: 'Khalti KPG-2 API base URL', type: 'url', env: 'KHALTI_BASE_URL', def: 'https://dev.khalti.com/api/v2', help: 'Sandbox: https://dev.khalti.com/api/v2 · Live: https://khalti.com/api/v2' },
  khalti_webhook_secret: { group: 'khalti', label: 'Khalti webhook secret (optional)', secret: true, env: 'KHALTI_WEBHOOK_SECRET', def: '' },

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
