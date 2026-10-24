import crypto from 'node:crypto';
import { rt } from '../runtime.js';

/**
 * Fonepay web payment (merchantRequest). The customer is sent to Fonepay's page with a signed request, pays from any bank or wallet app
 * (including by scanning the QR Fonepay shows), and Fonepay redirects the browser back to our RU address with the result, signed with the
 * shared secret. Request DV = HMAC-SHA512(secret, "PID,MD,PRN,AMT,CRN,DT,R1,R2,RU"); answer DV = HMAC-SHA512(secret, "PRN,PID,PS,RC,UID,BC,INI,P_AMT,R_AMT").
 */
const SANDBOX = 'https://dev-clientapi.fonepay.com/api/merchantRequest';
const LIVE = 'https://clientapi.fonepay.com/api/merchantRequest';

export const mode = () => (rt('fonepay_mode') === 'live' ? 'live' : 'sandbox');
export const url = () => (mode() === 'live' ? LIVE : SANDBOX);
export const merchantCode = () => (rt('fonepay_merchant_code') || '').trim();
const secret = () => rt('fonepay_secret_key');

export function missing() {
  const out = [];
  if (!merchantCode()) out.push('fonepay_merchant_code');
  if (!secret()) out.push('fonepay_secret_key');
  return out;
}

const sign = (message) => crypto.createHmac('sha512', secret()).update(message).digest('hex');

/** Fonepay wants a reference of at most 25 letters and digits that is unique for every attempt. */
export const reference = (id) => String(id).replace(/[^a-zA-Z0-9]/g, '').slice(0, 24).toUpperCase();

const fmtDate = (d) => `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;

/** The address to send the customer to. `returnUrl` is where Fonepay sends them back. */
export function requestUrl({ amount, prn, returnUrl, note }) {
  const p = {
    PID: merchantCode(), MD: 'P', PRN: prn, AMT: String(Math.round(Number(amount))), CRN: 'NPR', DT: fmtDate(new Date()),
    R1: (note || 'Sadhai Coffee').replace(/[^\w .-]/g, '').slice(0, 50) || 'Sadhai Coffee', R2: 'N/A', RU: returnUrl,
  };
  p.DV = sign([p.PID, p.MD, p.PRN, p.AMT, p.CRN, p.DT, p.R1, p.R2, p.RU].join(','));
  return `${url()}?${new URLSearchParams(p)}`;
}

/** Checks the answer Fonepay sends back. Returns { ok, failed, ref, amount } or throws when the answer is not genuine. */
export function readCallback(q) {
  const names = ['PRN', 'PID', 'PS', 'RC', 'UID', 'BC', 'INI', 'P_AMT', 'R_AMT'];
  const v = Object.fromEntries(names.map((n) => [n, String(q[n] ?? '')]));
  if (!q.DV) throw new Error('That Fonepay answer is not signed');
  const expected = sign(names.map((n) => v[n]).join(','));
  const a = Buffer.from(expected), b = Buffer.from(String(q.DV).toLowerCase());
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error('That Fonepay answer has a wrong signature');
  if (v.PID !== merchantCode()) throw new Error('That Fonepay answer is for a different merchant');
  const ok = v.PS === 'true' && /^success/i.test(v.RC);
  return { ok, failed: !ok, ref: v.UID || null, amount: Math.round(Number(v.P_AMT || 0)), prn: v.PRN, raw: v };
}
