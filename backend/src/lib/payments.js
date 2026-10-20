import crypto from 'node:crypto';
import { rt } from './runtime.js';
import { bad } from './http.js';

/**
 * Online payment gateways: Fonepay Dynamic QR, eSewa Dynamic QR / ePay, and Khalti Dynamic QR / KPG-2.
 * All three follow the same unified flow:
 *  1. initiate(provider, payment) -> returns { payment_id, provider, amount, mode: 'sandbox'|'qr', qr_message, pay_url, provider_ref, raw }
 *  2. Customer scans the QR on screen (or taps Open in eSewa/Khalti on mobile/web)
 *  3. checkPaymentStatus(payment) polls the provider's live status endpoint (or webhook/callback confirms immediately)
 *  4. In sandbox mode, no external network call is required and test buttons allow full end-to-end verification.
 */

export const ONLINE_PROVIDERS = ['fonepay', 'esewa', 'khalti'];
export const ALL_PAYMENT_METHODS = ['cash', 'fonepay', 'esewa', 'khalti', 'pass'];

const signFonepay = (message) =>
  crypto.createHmac('sha512', rt('fonepay_secret_key')).update(message).digest('hex').toLowerCase();

const signEsewa = (message) =>
  crypto.createHmac('sha256', rt('esewa_secret_key')).update(message).digest('base64');

const fixed = (n) => Number(n).toFixed(2);

/** Compact 24-character alphanumeric PRN safe for Fonepay, eSewa, and Khalti (UUIDs with hyphens exceed Fonepay's 25-char limit). */
export const cleanPrn = (id) => String(id).replace(/[^a-zA-Z0-9]/g, '').slice(0, 24).toUpperCase();

export const FONEPAY_LIVE_FIELDS = ['fonepay_merchant_code', 'fonepay_username', 'fonepay_password', 'fonepay_secret_key'];
export const ESEWA_LIVE_FIELDS = ['esewa_merchant_code', 'esewa_secret_key'];
export const KHALTI_LIVE_FIELDS = ['khalti_secret_key'];

export function fonepayMissing() {
  return FONEPAY_LIVE_FIELDS.filter((k) => !rt(k));
}
export function esewaMissing() {
  return ESEWA_LIVE_FIELDS.filter((k) => !rt(k));
}
export function khaltiMissing() {
  return KHALTI_LIVE_FIELDS.filter((k) => !rt(k));
}

export function testQrMessage(payment, tag = 'FONEPAY') {
  return `SADHAI-${tag}-TEST|${cleanPrn(payment.id)}|NPR:${fixed(payment.amount)}`;
}

export function esewaFields(payment, prn = cleanPrn(payment.id)) {
  const total = String(payment.amount);
  const code = rt('esewa_merchant_code') || 'EPAYTEST';
  const apiUrl = rt('public_api_url').replace(/\/$/, '');
  const webUrl = rt('public_web_url').replace(/\/$/, '');
  const fields = {
    amount: total,
    tax_amount: '0',
    total_amount: total,
    transaction_uuid: prn,
    product_code: code,
    product_service_charge: '0',
    product_delivery_charge: '0',
    success_url: `${apiUrl}/payments/esewa/callback?payment_id=${payment.id}`,
    failure_url: `${webUrl}/order?payment=failed`,
    signed_field_names: 'total_amount,transaction_uuid,product_code',
  };
  fields.signature = signEsewa(
    `total_amount=${fields.total_amount},transaction_uuid=${fields.transaction_uuid},product_code=${fields.product_code}`,
  );
  return fields;
}

/** Starts an online payment for fonepay, esewa, or khalti. */
export async function initiate(provider, payment, { orderLabel } = {}) {
  if (!ONLINE_PROVIDERS.includes(provider)) {
    throw bad('Choose a valid online payment method (Fonepay, eSewa or Khalti)');
  }
  const prn = payment.provider_ref || cleanPrn(payment.id);
  const base = { payment_id: payment.id, provider, amount: payment.amount };

  if (rt('payment_mode') === 'sandbox') {
    const qr = testQrMessage(payment, provider.toUpperCase());
    return {
      ...base,
      mode: 'sandbox',
      qr_message: qr,
      provider_ref: prn,
      raw: { qr_message: qr, prn, provider, sandbox: true },
    };
  }

  const cleanLabel = String(orderLabel || 'Sadhai Coffee').replace(/[^a-zA-Z0-9 .-]/g, '').trim().slice(0, 25) || 'Sadhai Coffee';

  if (provider === 'fonepay') {
    const missing = fonepayMissing();
    if (missing.length) throw bad('Fonepay is not set up yet. Please choose another payment method or pay with cash.');
    const body = {
      amount: fixed(payment.amount),
      remarks1: cleanLabel,
      remarks2: 'SadhaiCoffee',
      prn,
      merchantCode: rt('fonepay_merchant_code').trim(),
      username: rt('fonepay_username').trim(),
      password: rt('fonepay_password'),
    };
    body.dataValidation = signFonepay([body.amount, body.prn, body.merchantCode, body.remarks1, body.remarks2].join(','));
    let j;
    try {
      const r = await fetch(rt('fonepay_qr_url'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
      j = await r.json();
    } catch {
      throw bad('Fonepay could not be reached right now. Please try again or choose another payment method.');
    }
    const qrMessage = j?.qrMessage || j?.data?.qrMessage || j?.qrCode;
    if (!qrMessage) {
      const errDetail = j?.message || j?.errorMessage || j?.response_message || 'Fonepay could not generate a QR code';
      throw bad(`${errDetail}. Please try again or pay at the counter.`);
    }
    return {
      ...base,
      mode: 'qr',
      qr_message: qrMessage,
      provider_ref: prn,
      raw: { qr_message: qrMessage, prn, socket: j.thirdpartyQrWebSocketUrl || null },
    };
  }

  if (provider === 'esewa') {
    const missing = esewaMissing();
    if (missing.length) throw bad('eSewa is not set up yet. Please choose another payment method or pay with cash.');
    const apiUrl = rt('public_api_url').replace(/\/$/, '');
    const startUrl = `${apiUrl}/payments/esewa/start?payment_id=${payment.id}`;
    const fields = esewaFields(payment, prn);
    const qrUrl = rt('esewa_qr_url');

    // If merchant configured a direct JSON dynamic QR endpoint with username & password, request EMVCo QR directly
    if (rt('esewa_username') && rt('esewa_password') && !qrUrl.includes('/epay/main/')) {
      try {
        const body = {
          amount: fixed(payment.amount),
          remarks1: cleanLabel,
          remarks2: 'SadhaiCoffee',
          prn,
          merchantCode: rt('esewa_merchant_code').trim(),
          username: rt('esewa_username').trim(),
          password: rt('esewa_password'),
        };
        body.dataValidation = crypto
          .createHmac('sha512', rt('esewa_secret_key'))
          .update([body.amount, body.prn, body.merchantCode, body.remarks1, body.remarks2].join(','))
          .digest('hex')
          .toLowerCase();
        const r = await fetch(qrUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15000),
        });
        const j = await r.json();
        const qrMessage = j?.qrMessage || j?.data?.qrMessage || j?.qr_code;
        if (qrMessage) {
          return {
            ...base,
            mode: 'qr',
            qr_message: qrMessage,
            pay_url: startUrl,
            provider_ref: prn,
            raw: { qr_message: qrMessage, pay_url: startUrl, prn, fields },
          };
        }
      } catch {
        // Fall through to signed ePay QR URL
      }
    }

    return {
      ...base,
      mode: 'qr',
      qr_message: startUrl,
      pay_url: startUrl,
      provider_ref: prn,
      raw: { qr_message: startUrl, pay_url: startUrl, prn, fields },
    };
  }

  if (provider === 'khalti') {
    const missing = khaltiMissing();
    if (missing.length) throw bad('Khalti is not set up yet. Please choose another payment method or pay with cash.');
    const apiUrl = rt('public_api_url').replace(/\/$/, '');
    const webUrl = rt('public_web_url').replace(/\/$/, '');
    const baseUrl = rt('khalti_base_url').replace(/\/$/, '');
    let j;
    let ok = false;
    try {
      const r = await fetch(`${baseUrl}/epayment/initiate/`, {
        method: 'POST',
        headers: {
          Authorization: `Key ${rt('khalti_secret_key').trim()}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          return_url: `${apiUrl}/payments/khalti/callback?payment_id=${payment.id}`,
          website_url: webUrl,
          amount: Math.round(Number(payment.amount) * 100),
          purchase_order_id: prn,
          purchase_order_name: cleanLabel,
        }),
        signal: AbortSignal.timeout(15000),
      });
      ok = r.ok;
      j = await r.json();
    } catch {
      throw bad('Khalti could not be reached right now. Please try again or choose another payment method.');
    }
    const qrMessage = j?.qr_code || j?.dynamic_qr || j?.payment_url;
    if (!ok || !qrMessage) {
      throw bad(j?.detail || 'Khalti could not start the payment. Please try again or pay with cash.');
    }
    return {
      ...base,
      mode: 'qr',
      qr_message: qrMessage,
      pay_url: j.payment_url || null,
      provider_ref: j.pidx || prn,
      raw: { qr_message: qrMessage, pay_url: j.payment_url || null, pidx: j.pidx || null, prn },
    };
  }

  throw bad('Unsupported payment provider');
}

/** Polls Fonepay status for a pending dynamic QR payment. */
export async function checkFonepay(payment) {
  const prn = payment.raw?.prn || payment.provider_ref || cleanPrn(payment.id);
  const merchantCode = rt('fonepay_merchant_code').trim();
  const body = {
    prn,
    merchantCode,
    username: rt('fonepay_username').trim(),
    password: rt('fonepay_password'),
  };
  body.dataValidation = signFonepay([body.prn, body.merchantCode].join(','));
  const r = await fetch(rt('fonepay_status_url'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const j = await r.json();
  const state = String(j.paymentStatus || j.status || j.response_code || '').toLowerCase();
  if (['success', 'paid', 'completed', 'successful'].includes(state)) {
    const reportedAmt = j.amount ?? j.totalAmount;
    if (reportedAmt != null && Math.abs(Math.round(Number(reportedAmt)) - Number(payment.amount)) > 1) {
      throw bad('Fonepay amount does not match this order');
    }
    return { paid: true, ref: String(j.fonepayTraceId || j.traceId || prn), raw: j };
  }
  if (['failed', 'cancelled', 'canceled', 'expired', 'failed_transaction'].includes(state)) {
    return { paid: false, failed: true, raw: j };
  }
  return { paid: false, raw: j };
}

/** Polls eSewa transaction status for a pending QR / ePay payment. */
export async function checkEsewa(payment) {
  const prn = payment.raw?.prn || payment.provider_ref || cleanPrn(payment.id);
  const code = rt('esewa_merchant_code') || 'EPAYTEST';
  const statusBase = rt('esewa_status_url');
  const sep = statusBase.includes('?') ? '&' : '?';
  const url = `${statusBase}${sep}product_code=${encodeURIComponent(code)}&total_amount=${encodeURIComponent(fixed(payment.amount))}&transaction_uuid=${encodeURIComponent(prn)}`;
  const r = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  const j = await r.json();
  const status = String(j?.status || '').toUpperCase();
  if (status === 'COMPLETE') {
    const total = Number(String(j.total_amount ?? payment.amount).replace(/,/g, ''));
    if (Math.abs(Math.round(total) - Number(payment.amount)) > 1) {
      throw bad('eSewa amount does not match this order');
    }
    return { paid: true, ref: String(j.ref_id || j.transaction_code || prn), raw: j };
  }
  if (['CANCELED', 'CANCELLED', 'FULL_REFUND', 'AMBIGUOUS'].includes(status)) {
    return { paid: false, failed: true, raw: j };
  }
  return { paid: false, raw: j };
}

/** Verifies the signed base64 callback payload from eSewa ePay v2 and double-checks status with eSewa's server. */
export async function verifyEsewa(dataB64) {
  let data;
  try {
    data = JSON.parse(Buffer.from(String(dataB64), 'base64').toString('utf8'));
  } catch {
    throw bad('Invalid eSewa response payload');
  }
  const signedNames = String(data.signed_field_names || '').split(',').filter(Boolean);
  if (!signedNames.length) throw bad('Missing signed fields in eSewa response');
  const msg = signedNames.map((f) => `${f}=${data[f]}`).join(',');
  const expected = signEsewa(msg);
  if (expected !== data.signature) throw bad('Bad eSewa signature');
  if (String(data.status).toUpperCase() !== 'COMPLETE') throw bad('eSewa payment is not complete');

  const statusBase = rt('esewa_status_url');
  const sep = statusBase.includes('?') ? '&' : '?';
  const url = `${statusBase}${sep}product_code=${encodeURIComponent(data.product_code)}&total_amount=${encodeURIComponent(data.total_amount)}&transaction_uuid=${encodeURIComponent(data.transaction_uuid)}`;
  const j = await (await fetch(url, { signal: AbortSignal.timeout(15000) })).json();
  if (String(j.status).toUpperCase() !== 'COMPLETE') throw bad('eSewa did not confirm the payment');

  return {
    prn: String(data.transaction_uuid),
    ref: String(j.ref_id || data.transaction_code || data.transaction_uuid),
    amount: Math.round(Number(String(data.total_amount).replace(/,/g, ''))),
    raw: { callback: data, status: j },
  };
}

/** Polls Khalti lookup API for a pending QR / KPG-2 payment. */
export async function checkKhalti(payment) {
  const pidx = payment.raw?.pidx || payment.provider_ref;
  if (!pidx) return { paid: false };
  const baseUrl = rt('khalti_base_url').replace(/\/$/, '');
  const r = await fetch(`${baseUrl}/epayment/lookup/`, {
    method: 'POST',
    headers: {
      Authorization: `Key ${rt('khalti_secret_key').trim()}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ pidx }),
    signal: AbortSignal.timeout(15000),
  });
  const j = await r.json();
  const status = String(j?.status || '');
  if (status === 'Completed') {
    const rsAmount = Math.round(Number(j.total_amount || 0) / 100);
    if (rsAmount > 0 && Math.abs(rsAmount - Number(payment.amount)) > 1) {
      throw bad('Khalti amount does not match this order');
    }
    return { paid: true, ref: String(j.transaction_id || pidx), raw: j };
  }
  if (['Expired', 'User canceled', 'Refunded'].includes(status)) {
    return { paid: false, failed: true, raw: j };
  }
  return { paid: false, raw: j };
}

/** Unified status check across Fonepay, eSewa, and Khalti. */
export async function checkPaymentStatus(payment) {
  if (payment.provider === 'fonepay') return checkFonepay(payment);
  if (payment.provider === 'esewa') return checkEsewa(payment);
  if (payment.provider === 'khalti') return checkKhalti(payment);
  return { paid: false };
}

/** Signed webhook verification for Fonepay, eSewa, or Khalti: HMAC-SHA256 hex over "payment_id|provider_ref|status". */
export function verifyWebhookSignature(body, signature, provider = 'fonepay') {
  const secretKey = `${provider}_webhook_secret`;
  const secret = rt(secretKey) || rt('fonepay_webhook_secret');
  if (!secret || !signature) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${body.payment_id}|${body.provider_ref}|${body.status}`)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature)));
  } catch {
    return false;
  }
}
