import crypto from 'node:crypto';
import { rt } from '../runtime.js';

/**
 * Fonepay Dynamic QR, the only way Sadhai takes online payments. Follows Fonepay's third-party QR API as described in
 * blog.baralkushal.com.np/blog/integrate-fonepay and s4nkalp/django-nepali-payments:
 *   POST {base}/merchant/merchantDetailsForThirdParty/thirdPartyDynamicQrDownload   -> { qrMessage, ... }
 *   POST {base}/merchant/merchantDetailsForThirdParty/thirdPartyDynamicQrGetStatus  -> { paymentStatus: 'success' | 'pending' | ..., fonepayTraceId }
 * Every request carries dataValidation = HMAC-SHA512(secret key, comma-joined fields), lower-case hex, plus the API user name and password.
 *   QR:     amount,prn,merchantCode,remarks1,remarks2        Status: prn,merchantCode
 * The amount always comes from our own database, never from a screen.
 */
const WEB = { live: 'https://clientapi.fonepay.com/api/merchantRequest', sandbox: 'https://dev-clientapi.fonepay.com/api/merchantRequest' };
const BASES = { live: 'https://merchantapi.fonepay.com/api', sandbox: 'https://dev-merchantapi.fonepay.com/api' };
const QR_PATH = '/merchant/merchantDetailsForThirdParty/thirdPartyDynamicQrDownload';
const STATUS_PATH = '/merchant/merchantDetailsForThirdParty/thirdPartyDynamicQrGetStatus';

export const mode = () => (rt('fonepay_mode') === 'live' ? 'live' : 'sandbox');
/** The address in use: the owner's override (used by tests), else Fonepay's live or test server. */
export const baseUrl = () => ((rt('fonepay_api_url') || '').trim().replace(/\/$/, '') || BASES[mode()]);
export const merchantCode = () => (rt('fonepay_merchant_code') || '').trim();
const username = () => (rt('fonepay_username') || '').trim();
const password = () => rt('fonepay_password') || '';
const secret = () => (rt('fonepay_secret_key') || '').trim();

/**
 * How we connect. 'web': Fonepay's web payment page (merchantRequest), which needs only the merchant code and secret key; the page shows
 * Fonepay's QR and our server learns the result from Fonepay's signed answer. 'qr': Fonepay's QR service, which also needs the API login.
 */
export const method = () => (rt('fonepay_method') === 'qr' ? 'qr' : 'web');
export const webUrl = () => WEB[mode()];

export function missing() {
  const out = [];
  if (!merchantCode()) out.push('fonepay_merchant_code');
  if (!secret()) out.push('fonepay_secret_key');
  if (method() === 'qr') {
    if (!username()) out.push('fonepay_username');
    if (!password()) out.push('fonepay_password');
  }
  return out;
}

const fmtDate = (d) => `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;

/** Web payment: the signed address to send the customer to. PRN is at most 25 letters and digits. DV = HMAC-SHA512 over PID,MD,PRN,AMT,CRN,DT,R1,R2,RU. */
export function requestUrl({ amount, prn, returnUrl, note }) {
  const clean = (v) => String(v).replace(/[^\w .-]/g, '').slice(0, 50) || 'Sadhai Coffee';
  const p = { PID: merchantCode(), MD: 'P', PRN: prn, AMT: String(Math.round(Number(amount))), CRN: 'NPR', DT: fmtDate(new Date()), R1: clean(note || 'Sadhai Coffee'), R2: 'N/A', RU: returnUrl };
  p.DV = crypto.createHmac('sha512', secret()).update([p.PID, p.MD, p.PRN, p.AMT, p.CRN, p.DT, p.R1, p.R2, p.RU].join(',')).digest('hex');
  return `${webUrl()}?${new URLSearchParams(p)}`;
}

/** Web payment: checks the answer Fonepay sends back (signed over PRN,PID,PS,RC,UID,BC,INI,P_AMT,R_AMT). Throws when it is not genuine. */
export function readCallback(q) {
  const names = ['PRN', 'PID', 'PS', 'RC', 'UID', 'BC', 'INI', 'P_AMT', 'R_AMT'];
  const v = Object.fromEntries(names.map((n) => [n, String(q[n] ?? '')]));
  if (!q.DV) throw new Error('That answer is not signed');
  const want = crypto.createHmac('sha512', secret()).update(names.map((n) => v[n]).join(',')).digest('hex');
  const a = Buffer.from(want), b = Buffer.from(String(q.DV).toLowerCase());
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error('That answer has a wrong signature');
  if (v.PID !== merchantCode()) throw new Error('That answer is for a different merchant');
  const ok = v.PS === 'true' && /^success/i.test(v.RC);
  return { ok, ref: v.UID || null, amount: Math.round(Number(v.P_AMT || 0)), prn: v.PRN, raw: v };
}

const sign = (...fields) => crypto.createHmac('sha512', secret()).update(fields.join(',')).digest('hex');
/** Our payment id without hyphens: 32 letters and digits, unique for every payment (the PRN Fonepay knows it by). */
export const reference = (id) => (method() === 'web' ? String(id).replace(/-/g, '').slice(0, 24).toUpperCase() : String(id).replace(/-/g, ''));

export class FonepayError extends Error {
  constructor(message, { statusCode, http } = {}) { super(message); this.statusCode = statusCode ?? null; this.http = http ?? null; }
}

async function call(path, body) {
  let r, text;
  try {
    r = await fetch(`${baseUrl()}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    text = await r.text();
  } catch (e) { throw new FonepayError(`Fonepay could not be reached (${e.cause?.code || e.name === 'TimeoutError' ? 'timed out' : e.message})`); }
  let j = {};
  try { j = text ? JSON.parse(text) : {}; } catch { /* not JSON */ }
  if (!text) throw new FonepayError(`Fonepay sent an empty answer (HTTP ${r.status}). Check that the mode, Live or Sandbox, matches your login.`, { http: r.status });
  if (!Object.keys(j).length) throw new FonepayError(`Fonepay sent an answer we could not read (HTTP ${r.status})`, { http: r.status });
  return { j, http: r.status };
}

/** A QR for one payment. Throws FonepayError with Fonepay's own wording when it refuses. */
export async function createQr({ amount, prn, remarks1 = 'Sadhai Coffee', remarks2 = 'checkout' }) {
  const clean = (v) => String(v).replace(/[^\w .-]/g, '').slice(0, 25) || 'Sadhai';
  const body = {
    amount: String(Math.round(Number(amount))), remarks1: clean(remarks1), remarks2: clean(remarks2), prn, merchantCode: merchantCode(),
    username: username(), password: password(), taxAmount: '0', taxRefund: '0',
  };
  body.dataValidation = sign(body.amount, prn, body.merchantCode, body.remarks1, body.remarks2);
  const { j, http } = await call(QR_PATH, body);
  const qr = j.qrMessage || j.data?.qrMessage;
  if (!qr) throw new FonepayError(`${j.message || 'Fonepay did not give a QR code'}${j.statusCode ? ` (${j.statusCode})` : ''}`, { statusCode: j.statusCode, http });
  return { qr, websocket: j.thirdpartyQrWebSocketUrl || null };
}

/** { state: 'paid' | 'failed' | 'pending', ref, raw }. A network or login problem throws, so the caller keeps waiting instead of failing the payment. */
export async function qrStatus({ prn }) {
  const body = { prn, merchantCode: merchantCode(), username: username(), password: password() };
  body.dataValidation = sign(prn, body.merchantCode);
  const { j } = await call(STATUS_PATH, body);
  const st = String(j.paymentStatus || '').toLowerCase();
  if (st === 'success') return { state: 'paid', ref: j.fonepayTraceId != null ? String(j.fonepayTraceId) : null, raw: j };
  if (['failed', 'failure', 'cancelled', 'canceled'].includes(st)) return { state: 'failed', raw: j };
  if (st === 'pending' || j.success === true || j.isSuccess === true) return { state: 'pending', raw: j };
  throw new FonepayError(j.message || 'Fonepay gave no payment status');
}

/** For the owner's "Check connection": asks Fonepay for a Rs 10 QR and says exactly what came back. Nothing is charged. */
export async function diagnose() {
  const out = { environment: mode(), address: method() === 'web' ? webUrl() : baseUrl(), missing: missing(), method: method() };
  if (out.missing.length) return { ...out, ok: false, message: 'Save every Fonepay field first.' };
  if (method() === 'web') {
    // Web payment has no login to test. Ask Fonepay's page for a signed Rs 10 request and report how it answers.
    try {
      const r = await fetch(requestUrl({ amount: 10, prn: reference(crypto.randomUUID()), returnUrl: 'https://sadhaicoffee.com/api/payments/fonepay/return', note: 'Connection check' }), { redirect: 'manual', signal: AbortSignal.timeout(15000) });
      const text = (await r.text()).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
      const bad = /invalid|error|not found|unauthor|failed/i.test(text);
      return { ...out, ok: r.status < 400 && !bad, http: r.status, message: bad || r.status >= 400 ? `Fonepay answered: ${text || `HTTP ${r.status}`}` : 'Fonepay accepted the signed request and opened its payment page.' };
    } catch (e) { return { ...out, ok: false, message: `Fonepay could not be reached (${e.message})` }; }
  }
  try {
    const q = await createQr({ amount: 10, prn: reference(crypto.randomUUID()), remarks1: 'Connection check' });
    return { ...out, ok: true, message: 'Fonepay accepted the login and gave a QR code.', qr_length: q.qr.length };
  } catch (e) { return { ...out, ok: false, message: e.message, status_code: e.statusCode, http: e.http }; }
}
