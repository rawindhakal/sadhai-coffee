import crypto from 'node:crypto';
import { rt } from './runtime.js';
import { bad } from './http.js';

/**
 * Fonepay is the only online payment method. Customers pay by scanning a Fonepay dynamic QR with any
 * mobile-banking or wallet app. Cash (at the counter or at pickup) and passes are not online payments.
 *
 * Live mode follows Fonepay's merchant "third party dynamic QR" API: we ask Fonepay for a QR for a payment reference (PRN),
 * show the returned QR message, and confirm either from Fonepay's signed notification or by asking Fonepay for the status.
 * Every request is signed with the shared key: dataValidation = HMAC-SHA512(key, fields joined by commas), hex.
 * Field names and endpoints are settings, so they can be matched to the merchant agreement without a deploy.
 *
 * Sandbox mode (the default) makes no network call: the QR is a test code and POST /payments/:id/confirm completes it.
 */
const sign = (message) => crypto.createHmac('sha512', rt('fonepay_secret_key')).update(message).digest('hex');
const fixed = (n) => Number(n).toFixed(2);

export const FONEPAY_LIVE_FIELDS = ['fonepay_merchant_code', 'fonepay_username', 'fonepay_password', 'fonepay_secret_key'];

export function fonepayMissing() {
  return FONEPAY_LIVE_FIELDS.filter((k) => !rt(k));
}

export function testQrMessage(payment) {
  return `SADHAI-TEST|${payment.id}|${fixed(payment.amount)}`;
}

/** Starts an online payment. Returns { mode:'sandbox'|'qr', qr_message, ... } for the client to display. */
export async function initiate(provider, payment, { orderLabel } = {}) {
  if (provider !== 'fonepay') throw bad('Fonepay is the only online payment method');
  const base = { payment_id: payment.id, provider, amount: payment.amount };
  if (rt('payment_mode') === 'sandbox') return { ...base, mode: 'sandbox', qr_message: testQrMessage(payment), raw: { qr_message: testQrMessage(payment), sandbox: true } };

  const missing = fonepayMissing();
  if (missing.length) throw bad('Fonepay is not set up yet. Please pay with cash or a pass.');
  const body = {
    amount: fixed(payment.amount), remarks1: (orderLabel || 'Sadhai Coffee').slice(0, 25), remarks2: 'sadhai',
    prn: payment.id, merchantCode: rt('fonepay_merchant_code'), username: rt('fonepay_username'), password: rt('fonepay_password'),
  };
  body.dataValidation = sign([body.amount, body.prn, body.merchantCode, body.remarks1, body.remarks2].join(','));
  let j;
  try {
    const r = await fetch(rt('fonepay_qr_url'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    j = await r.json();
  } catch { throw bad('Fonepay could not be reached. Please try again, or pay with cash.'); }
  if (!j?.qrMessage) throw bad('Fonepay could not make a QR code. Please try again, or pay with cash.');
  return { ...base, mode: 'qr', qr_message: j.qrMessage, raw: { qr_message: j.qrMessage, socket: j.thirdpartyQrWebSocketUrl || null }, provider_ref: payment.id };
}

/** Asks Fonepay whether a payment reference has been paid. Used while the customer or kiosk is waiting. */
export async function checkFonepay(payment) {
  const body = { prn: payment.id, merchantCode: rt('fonepay_merchant_code'), username: rt('fonepay_username'), password: rt('fonepay_password') };
  body.dataValidation = sign([body.prn, body.merchantCode].join(','));
  const r = await fetch(rt('fonepay_status_url'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  const j = await r.json();
  const state = String(j.paymentStatus || j.status || '').toLowerCase();
  if (['success', 'paid', 'completed'].includes(state) || j.fonepayTraceId) {
    if (j.amount != null && Math.round(Number(j.amount)) !== Number(payment.amount)) throw bad('Fonepay amount does not match this order');
    return { paid: true, ref: String(j.fonepayTraceId || j.traceId || payment.id), raw: j };
  }
  if (['failed', 'cancelled', 'expired'].includes(state)) return { paid: false, failed: true, raw: j };
  return { paid: false, raw: j };
}

/** Signed notification from Fonepay (or our own gateway adapter): HMAC-SHA256 hex over "payment_id|provider_ref|status". */
export function verifyWebhookSignature(body, signature) {
  const secret = rt('fonepay_webhook_secret');
  if (!secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${body.payment_id}|${body.provider_ref}|${body.status}`).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature)));
  } catch {
    return false;
  }
}
