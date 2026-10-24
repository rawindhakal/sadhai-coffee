import crypto from 'node:crypto';
import { rt } from '../runtime.js';

/**
 * eSewa ePay v2 (https://developer.esewa.com.np/pages/Epay).
 * The shop posts a signed form to eSewa. After the customer pays, eSewa redirects the browser to success_url with ?data=<base64 JSON>
 * signed the same way. We check that signature and then ask eSewa's status API, and only then treat the payment as paid.
 */
const SANDBOX = { form: 'https://rc-epay.esewa.com.np/api/epay/main/v2/form', status: 'https://rc.esewa.com.np/api/epay/transaction/status/' };
const LIVE = { form: 'https://epay.esewa.com.np/api/epay/main/v2/form', status: 'https://epay.esewa.com.np/api/epay/transaction/status/' };

export const mode = () => (rt('esewa_mode') === 'live' ? 'live' : 'sandbox');
export const urls = () => (mode() === 'live' ? LIVE : SANDBOX);
export const productCode = () => (rt('esewa_merchant_code') || '').trim();
const secret = () => rt('esewa_secret_key');

/** What is still missing before this gateway can take real money. Sandbox always works with eSewa's public test values. */
export function missing() {
  if (mode() === 'sandbox') return [];
  const out = [];
  if (!productCode() || productCode() === 'EPAYTEST') out.push('esewa_merchant_code');
  if (!secret() || secret() === '8gBm/:&EnhH.1/q') out.push('esewa_secret_key');
  return out;
}

const sign = (message) => crypto.createHmac('sha256', secret()).update(message).digest('base64');
const signedMessage = (obj, names) => names.split(',').map((n) => `${n}=${obj[n]}`).join(',');

/** Fields for the form posted to eSewa. `uuid` is our payment reference, `successUrl`/`failureUrl` come back to our server. */
export function formFields({ amount, uuid, successUrl, failureUrl }) {
  const total = String(Math.round(Number(amount)));
  const f = {
    amount: total, tax_amount: '0', total_amount: total, transaction_uuid: uuid, product_code: productCode(),
    product_service_charge: '0', product_delivery_charge: '0', success_url: successUrl, failure_url: failureUrl,
    signed_field_names: 'total_amount,transaction_uuid,product_code',
  };
  f.signature = sign(signedMessage(f, f.signed_field_names));
  return { action: urls().form, fields: f };
}

/** Reads and checks the ?data= value eSewa sends back. Returns the decoded body, or throws if it is not genuine. */
export function readCallback(dataB64) {
  let d;
  try { d = JSON.parse(Buffer.from(String(dataB64 || ''), 'base64').toString('utf8')); } catch { throw new Error('That eSewa answer could not be read'); }
  if (!d || !d.signed_field_names || !d.signature) throw new Error('That eSewa answer is not signed');
  const expected = sign(signedMessage(d, d.signed_field_names));
  const a = Buffer.from(expected), b = Buffer.from(String(d.signature));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error('That eSewa answer has a wrong signature');
  return d;
}

/** Asks eSewa directly what happened to a payment. Returns { state: 'COMPLETE'|'PENDING'|'CANCELED'|..., ref, raw } or null if eSewa cannot be reached. */
export async function checkStatus({ uuid, amount }) {
  // Automated tests run offline: with this variable set (never on a real server) the status call is skipped in Sandbox.
  if (process.env.ESEWA_SKIP_STATUS_CHECK === '1' && mode() === 'sandbox') return null;
  const q = new URLSearchParams({ product_code: productCode(), total_amount: String(Math.round(Number(amount))), transaction_uuid: uuid });
  try {
    const r = await fetch(`${urls().status}?${q}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
    const j = await r.json();
    return { state: String(j.status || '').toUpperCase(), ref: j.ref_id || null, raw: j };
  } catch {
    return null;
  }
}
