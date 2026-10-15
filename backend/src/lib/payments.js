import crypto from 'node:crypto';
import { rt } from './runtime.js';
import { bad } from './http.js';

const hmac = (secret, msg) => crypto.createHmac('sha256', secret).update(msg).digest('base64');

export function esewaFields(payment) {
  const fields = {
    amount: String(payment.amount), tax_amount: '0', total_amount: String(payment.amount), transaction_uuid: payment.id,
    product_code: rt('esewa_product_code'), product_service_charge: '0', product_delivery_charge: '0',
    success_url: `${rt('public_api_url')}/payments/esewa/callback?payment_id=${payment.id}`,
    failure_url: `${rt('public_web_url')}/order?payment=failed`,
    signed_field_names: 'total_amount,transaction_uuid,product_code',
  };
  fields.signature = hmac(rt('esewa_secret'), `total_amount=${fields.total_amount},transaction_uuid=${fields.transaction_uuid},product_code=${fields.product_code}`);
  return fields;
}

/**
 * Starts a digital payment. Returns what the client must do next:
 *  - { mode:'sandbox' }                      development: client calls POST /payments/:id/confirm
 *  - { mode:'redirect', method, url, fields } live eSewa/Khalti hosted checkout
 *  - { mode:'qr', ref }                      Fonepay dynamic QR, confirmed by signed webhook
 */
export async function initiate(provider, payment, { orderLabel } = {}) {
  const base = { payment_id: payment.id, provider, amount: payment.amount };
  if (rt('payment_mode') === 'sandbox') return { ...base, mode: 'sandbox' };

  const callback = (p) => `${rt('public_api_url')}/payments/${p}/callback?payment_id=${payment.id}`;
  if (provider === 'esewa') {
    return {
      ...base, mode: 'redirect', method: 'POST', url: rt('esewa_form_url'), fields: esewaFields(payment),
      start_url: `${rt('public_api_url')}/payments/esewa/start?payment_id=${payment.id}`, // opens the signed form in a browser (mobile apps)
    };
  }
  if (provider === 'khalti') {
    if (!rt('khalti_secret')) throw bad('Khalti is not configured');
    const r = await fetch(`${rt('khalti_base_url')}/epayment/initiate/`, {
      method: 'POST',
      headers: { Authorization: `Key ${rt('khalti_secret')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        return_url: callback('khalti'),
        website_url: rt('public_web_url'),
        amount: payment.amount * 100,
        purchase_order_id: payment.id,
        purchase_order_name: orderLabel || 'Sadhai Coffee',
      }),
    });
    const j = await r.json();
    if (!r.ok || !j.payment_url) throw bad('Khalti could not start the payment');
    return { ...base, mode: 'redirect', method: 'GET', url: j.payment_url, provider_ref: j.pidx };
  }
  if (provider === 'fonepay') return { ...base, mode: 'qr', ref: payment.id };
  throw bad('Unknown payment provider');
}

// Verifies the eSewa success redirect (base64 JSON with HMAC signature) and the transaction status.
export async function verifyEsewa(dataB64) {
  const data = JSON.parse(Buffer.from(dataB64, 'base64').toString('utf8'));
  const msg = data.signed_field_names.split(',').map((f) => `${f}=${data[f]}`).join(',');
  if (hmac(rt('esewa_secret'), msg) !== data.signature) throw bad('Bad eSewa signature');
  if (data.status !== 'COMPLETE') throw bad('Payment not complete');
  const url = `${rt('esewa_status_url')}?product_code=${data.product_code}&total_amount=${data.total_amount}&transaction_uuid=${data.transaction_uuid}`;
  const j = await (await fetch(url)).json();
  if (j.status !== 'COMPLETE') throw bad('eSewa did not confirm the payment');
  return { paymentId: data.transaction_uuid, ref: data.transaction_code, amount: Number(String(data.total_amount).replace(/,/g, '')), raw: data };
}

export async function lookupKhalti(pidx) {
  const r = await fetch(`${rt('khalti_base_url')}/epayment/lookup/`, {
    method: 'POST',
    headers: { Authorization: `Key ${rt('khalti_secret')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ pidx }),
  });
  const j = await r.json();
  if (j.status !== 'Completed') throw bad('Khalti did not confirm the payment');
  return { ref: j.transaction_id || pidx, amount: Math.round(j.total_amount / 100), raw: j };
}

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
