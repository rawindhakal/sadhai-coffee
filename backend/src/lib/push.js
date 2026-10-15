import jwt from 'jsonwebtoken';
import webpush from 'web-push';
import { rt } from './runtime.js';
import { query } from './db.js';

/**
 * Push delivery. Providers:
 *  - FCM HTTP v1 for Android and iOS (needs FCM_SERVICE_ACCOUNT_JSON)
 *  - Web Push with VAPID for browsers (needs VAPID_* keys)
 * With no credentials the service runs in dry-run mode: every delivery is recorded as 'dry_run', so the whole
 * pipeline (tokens, audiences, caps, campaigns, automations) can be exercised before Firebase is set up.
 */

// Providers are rebuilt whenever the owner changes the keys in the dashboard.
let sig = '';
let fcm = null;
let webReady = false;
function providers() {
  const next = JSON.stringify([rt('fcm_service_account_json'), rt('vapid_public_key'), rt('vapid_private_key'), rt('vapid_subject')]);
  if (next === sig) return;
  sig = next;
  fcm = null; fcmToken = { value: null, exp: 0 };
  try { const raw = rt('fcm_service_account_json'); if (raw) fcm = JSON.parse(raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8')); } catch (e) { console.error('Firebase key is not valid JSON:', e.message); }
  webReady = !!(rt('vapid_public_key') && rt('vapid_private_key'));
  if (webReady) { try { webpush.setVapidDetails(rt('vapid_subject') || 'mailto:support@sadhai.example', rt('vapid_public_key'), rt('vapid_private_key')); } catch (e) { webReady = false; console.error('Web push keys rejected:', e.message); } }
}
export const pushStatus = () => { providers(); const mode = rt('push_mode'); return { mode, fcm: !!fcm, web: webReady, dry_run: mode !== 'off' && !(fcm || webReady) }; };
export const vapidPublicKey = () => rt('vapid_public_key') || null;
export async function testFcm() { providers(); if (!fcm) throw new Error('No Firebase key is saved yet'); fcmToken = { value: null, exp: 0 }; await fcmAccessToken(); return { project_id: fcm.project_id, client_email: fcm.client_email }; }

let fcmToken = { value: null, exp: 0 };
async function fcmAccessToken() {
  if (fcmToken.value && Date.now() < fcmToken.exp) return fcmToken.value;
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign({ iss: fcm.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: fcm.token_uri || 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }, fcm.private_key, { algorithm: 'RS256' });
  const r = await fetch(fcm.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`FCM auth failed: ${j.error_description || j.error}`);
  fcmToken = { value: j.access_token, exp: Date.now() + (j.expires_in - 120) * 1000 };
  return fcmToken.value;
}

async function sendFcm(token, { title, body, data }) {
  const r = await fetch(`https://fcm.googleapis.com/v1/projects/${fcm.project_id}/messages:send`, {
    method: 'POST', headers: { Authorization: `Bearer ${await fcmAccessToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: {
      token, notification: { title, body }, data: Object.fromEntries(Object.entries(data || {}).map(([k, v]) => [k, String(v)])),
      android: { priority: 'HIGH', notification: { channel_id: 'orders', sound: 'default' } },
      apns: { headers: { 'apns-priority': '10' }, payload: { aps: { sound: 'default' } } },
    } }),
  });
  if (r.ok) return { ok: true };
  const j = await r.json().catch(() => ({}));
  const code = j?.error?.details?.find?.((d) => d.errorCode)?.errorCode || j?.error?.status;
  return { ok: false, invalid: ['UNREGISTERED', 'NOT_FOUND'].includes(code) || r.status === 404, error: `${r.status} ${code || j?.error?.message || ''}` };
}

async function sendWeb(subscriptionJson, { title, body, data }) {
  try {
    await webpush.sendNotification(JSON.parse(subscriptionJson), JSON.stringify({ title, body, data, url: data?.url || '/' }), { TTL: 3600, urgency: 'high' });
    return { ok: true };
  } catch (e) {
    return { ok: false, invalid: e.statusCode === 404 || e.statusCode === 410, error: `${e.statusCode || ''} ${e.body || e.message}`.slice(0, 200) };
  }
}

const log = (row) => query(
  `INSERT INTO push_deliveries(campaign_id, user_id, token_id, platform, kind, title, status, error) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
  [row.campaign_id || null, row.user_id, row.token_id || null, row.platform || null, row.kind, row.title, row.status, row.error || null],
).catch(() => {});

/** Send one notification to every active device of a user. Marketing kinds respect the user's opt-out. */
export async function sendToUser(userId, { kind = 'order', title, body, data = {} }) {
  providers();
  if (rt('push_mode') === 'off' || !userId) return { sent: 0, failed: 0, dry: 0 };
  const campaign_id = data.campaign_id || null;
  if (kind === 'promo') {
    const u = (await query('SELECT notif_offers FROM users WHERE id=$1', [userId])).rows[0];
    if (!u || !u.notif_offers) { await log({ campaign_id, user_id: userId, kind, title, status: 'skipped', error: 'opted out of offers' }); return { sent: 0, failed: 0, dry: 0 }; }
  }
  const { rows: tokens } = await query('SELECT id, platform, token FROM push_tokens WHERE user_id=$1 AND active', [userId]);
  const out = { sent: 0, failed: 0, dry: 0 };
  for (const t of tokens) {
    const msg = { title, body: body || '', data: { ...data, kind } };
    let res;
    if (t.platform === 'web' && webReady) res = await sendWeb(t.token, msg);
    else if (t.platform !== 'web' && fcm) res = await sendFcm(t.token, msg).catch((e) => ({ ok: false, error: e.message }));
    else res = { dry: true };
    if (res.dry) { out.dry++; await log({ campaign_id, user_id: userId, token_id: t.id, platform: t.platform, kind, title, status: 'dry_run' }); }
    else if (res.ok) { out.sent++; await log({ campaign_id, user_id: userId, token_id: t.id, platform: t.platform, kind, title, status: 'sent' }); }
    else {
      out.failed++;
      if (res.invalid) await query('UPDATE push_tokens SET active=false WHERE id=$1', [t.id]);
      await log({ campaign_id, user_id: userId, token_id: t.id, platform: t.platform, kind, title, status: res.invalid ? 'invalid_token' : 'failed', error: res.error });
    }
  }
  return out;
}
