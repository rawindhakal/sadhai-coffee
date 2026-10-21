import crypto from 'node:crypto';
import { query } from './db.js';
import { rt, rtBool } from './runtime.js';
import { bad, normalizePhone } from './http.js';

export const NESTSMS_LIVE_FIELDS = ['nestsms_api_key', 'nestsms_sender_id', 'nestsms_api_url'];

export function nestsmsMissing() {
  return NESTSMS_LIVE_FIELDS.filter((k) => !rt(k));
}

export function smsStatus() {
  const enabled = rtBool('sms_enabled');
  const rawMode = rt('sms_mode') || 'auto';
  const mode = !enabled ? 'off' : rawMode;
  const configured = nestsmsMissing().length === 0;
  const dry_run = mode === 'sandbox' || (mode === 'auto' && !configured);
  return {
    enabled,
    mode,
    configured,
    dry_run,
    otp_enabled: enabled && mode !== 'off' && rtBool('sms_otp_enabled'),
    order_ready_enabled: enabled && mode !== 'off' && rtBool('sms_order_ready'),
    welcome_enabled: enabled && mode !== 'off' && rtBool('sms_welcome_enabled'),
  };
}

const hashOtp = (phone, code) =>
  crypto.createHash('sha256').update(`${phone}:${String(code).trim()}`).digest('hex');

/**
 * Sends an SMS through NestSMS (nestsms.com).
 * Accepts either (rawPhone, message, opts) or ({ phone, message, kind, purpose, userId, force }).
 */
export async function sendSms(arg1, arg2, arg3 = {}) {
  let rawPhone, message, kind, userId, force;
  if (arg1 && typeof arg1 === 'object') {
    rawPhone = arg1.phone || arg1.to;
    message = arg1.message || arg1.text;
    kind = arg1.kind || arg1.purpose || 'transactional';
    userId = arg1.userId || null;
    force = !!arg1.force;
  } else {
    rawPhone = arg1;
    message = arg2;
    kind = arg3.kind || arg3.purpose || 'transactional';
    userId = arg3.userId || null;
    force = !!arg3.force;
  }

  const phone = normalizePhone(rawPhone);
  const st = smsStatus();
  if (!force && (!st.enabled || st.mode === 'off')) {
    return { ok: false, sent: false, dry_run: false, skipped: true, error: 'SMS gateway is turned off' };
  }

  const text = String(message || '').trim().slice(0, 480);
  if (!text) throw bad('SMS message cannot be empty');

  if (st.dry_run) {
    await query(
      `INSERT INTO sms_log(user_id, phone, kind, message, status, provider_response)
       VALUES ($1, $2, $3, $4, 'sandbox', $5)`,
      [userId, phone, kind, text, JSON.stringify({ sandbox: true, provider: 'nestsms' })],
    );
    return { ok: true, sent: false, dry_run: true, sandbox: true, phone };
  }

  const key = rt('nestsms_api_key');
  const sender = rt('nestsms_sender_id') || 'Sadhai';
  const url = rt('nestsms_api_url') || 'https://api.nestsms.com/api/v1/sms/send';

  const payload = {
    token: key,
    api_key: key,
    sender_id: sender,
    from: sender,
    to: phone,
    mobile: phone,
    recipient: phone,
    message: text,
    text,
  };

  let respJson = null;
  let ok = false;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${key}`,
        'X-API-Key': key,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
    const rawText = await r.text();
    try { respJson = JSON.parse(rawText); } catch { respJson = { raw: rawText }; }
    ok = r.ok && respJson?.status !== 'error' && respJson?.success !== false && respJson?.error == null;
  } catch (e) {
    respJson = { error: e.message };
    ok = false;
  }

  await query(
    `INSERT INTO sms_log(user_id, phone, kind, message, status, provider_response)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, phone, kind, text, ok ? 'sent' : 'failed', JSON.stringify(respJson || {})],
  );

  if (!ok) {
    const msg = respJson?.message || respJson?.error || 'NestSMS could not deliver the SMS';
    return { ok: false, sent: false, dry_run: false, sandbox: false, phone, error: String(msg), response: respJson };
  }
  return { ok: true, sent: true, dry_run: false, sandbox: false, phone, response: respJson };
}

/** Sends a 6-digit OTP via NestSMS with strict rate limiting (max 4 per 15 mins). */
export async function sendPhoneOtp(rawPhone, userId = null) {
  const st = smsStatus();
  if (!st.enabled || st.mode === 'off' || !st.otp_enabled) {
    throw bad('SMS phone verification is currently turned off by the administrator.');
  }
  const phone = normalizePhone(rawPhone);
  const { rows } = await query('SELECT * FROM phone_verifications WHERE phone=$1', [phone]);
  const cur = rows[0];
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;

  let sentCount = 1;
  let windowStart = new Date();
  if (cur) {
    const elapsed = now - new Date(cur.window_started_at).getTime();
    if (elapsed < windowMs) {
      if (cur.sent_count >= 4) {
        throw bad('Too many verification codes requested. Please wait 15 minutes and try again.');
      }
      sentCount = cur.sent_count + 1;
      windowStart = cur.window_started_at;
    }
  }

  const code = String(crypto.randomInt(100000, 1000000));
  const codeHash = hashOtp(phone, code);
  const expiresAt = new Date(now + 10 * 60 * 1000);

  await query(
    `INSERT INTO phone_verifications(phone, code_hash, attempts, sent_count, window_started_at, expires_at, verified_at)
     VALUES ($1, $2, 0, $3, $4, $5, NULL)
     ON CONFLICT (phone) DO UPDATE
       SET code_hash = $2, attempts = 0, sent_count = $3, window_started_at = $4, expires_at = $5, verified_at = NULL`,
    [phone, codeHash, sentCount, windowStart, expiresAt],
  );

  const res = await sendSms(
    phone,
    `Your Sadhai Coffee verification code is ${code}. Valid for 10 minutes.`,
    { kind: 'otp', userId },
  );
  if (!res.ok) throw bad(res.error || 'Could not send verification SMS');

  return {
    ok: true,
    phone,
    sandbox: !!res.sandbox,
    ...(res.sandbox ? { dev_code: code } : {}),
  };
}

/** Verifies a 6-digit OTP and marks the user's phone as verified. */
export async function verifyPhoneOtp(rawPhone, code, userId = null) {
  const phone = normalizePhone(rawPhone);
  const { rows } = await query('SELECT * FROM phone_verifications WHERE phone=$1', [phone]);
  const v = rows[0];
  if (!v) throw bad('Request a verification code first');
  if (v.attempts >= 5) throw bad('Too many wrong attempts. Request a new code.');
  if (new Date(v.expires_at).getTime() < Date.now()) throw bad('That verification code has expired. Request a new one.');

  const expected = hashOtp(phone, code);
  const match =
    expected.length === v.code_hash.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v.code_hash));

  if (!match) {
    await query('UPDATE phone_verifications SET attempts = attempts + 1 WHERE phone=$1', [phone]);
    throw bad('Verification code is not correct');
  }

  await query('UPDATE phone_verifications SET verified_at = now() WHERE phone=$1', [phone]);
  if (userId) {
    await query('UPDATE users SET phone_verified = true, phone_verified_at = now() WHERE id=$1', [userId]);
  } else {
    await query('UPDATE users SET phone_verified = true, phone_verified_at = now() WHERE phone=$1', [phone]);
  }
  return { ok: true, phone_verified: true };
}
