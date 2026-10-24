import crypto from 'node:crypto';
import { rt, rtBool, sourceOf, assertSafeOutboundUrl } from './runtime.js';
import { bad } from './http.js';

/**
 * Payment configuration: Cash at counter, 10-cup pass, and eSewa ePay v2.
 * Official eSewa ePay v2 documentation: https://developer.esewa.com.np/pages/Epay
 */
export const ONLINE_PROVIDERS = ['esewa'];
export const ALL_PAYMENT_METHODS = ['cash', 'esewa', 'pass'];

export function isProviderEnabled(provider) {
  const p = String(provider || '').toLowerCase();
  if (p === 'pass') return true;
  if (p === 'cash') return rtBool('cash_enabled');
  if (p === 'esewa') return rtBool('esewa_enabled') && rt('esewa_mode') !== 'off';
  return false;
}

export function enabledPaymentMethods() {
  return ['cash', 'esewa'].filter((m) => isProviderEnabled(m));
}

export function providerMode(provider = 'esewa') {
  const key = `${provider}_mode`;
  if (sourceOf(key) !== 'default') {
    const m = rt(key);
    if (m === 'live' || m === 'sandbox') return m;
  }
  // Auto mode: if merchant code is not EPAYTEST and secret is not the test default, use live
  const code = rt('esewa_merchant_code');
  const secret = rt('esewa_secret_key');
  if (code && code !== 'EPAYTEST' && secret && secret !== '8gBm/:&EnhH.1/q') {
    return 'live';
  }
  return 'sandbox';
}

export const cleanPrn = (id) => String(id).replace(/[^a-zA-Z0-9]/g, '').slice(0, 24).toUpperCase();

export const ESEWA_LIVE_FIELDS = ['esewa_merchant_code', 'esewa_secret_key'];

export function esewaMissing() {
  return ESEWA_LIVE_FIELDS.filter((k) => !rt(k));
}

export function gatewayStatus() {
  return {
    cash: { enabled: isProviderEnabled('cash') },
    esewa: {
      enabled: isProviderEnabled('esewa'),
      mode: providerMode('esewa'),
      configured: esewaMissing().length === 0,
      missing: esewaMissing(),
    },
  };
}

/**
 * Generates HMAC-SHA256 Base64 signature for eSewa ePay v2.
 */
export function signEsewa(message) {
  const secret = rt('esewa_secret_key') || '8gBm/:&EnhH.1/q';
  return crypto.createHmac('sha256', secret).update(message).digest('base64');
}

/**
 * Resolves the eSewa ePay v2 Form submission URL.
 * Sandbox: https://rc-epay.esewa.com.np/api/epay/main/v2/form
 * Live: https://epay.esewa.com.np/api/epay/main/v2/form
 */
export function esewaFormUrl() {
  const mode = providerMode('esewa');
  const configured = rt('esewa_epay_url');
  if (mode === 'live') {
    if (!configured || configured.includes('rc-epay.esewa.com.np')) {
      return 'https://epay.esewa.com.np/api/epay/main/v2/form';
    }
    return configured;
  }
  return configured || 'https://rc-epay.esewa.com.np/api/epay/main/v2/form';
}

/**
 * Resolves the eSewa Transaction Status Check URL.
 * Sandbox: https://rc-epay.esewa.com.np/api/epay/transaction/status/
 * Live: https://epay.esewa.com.np/api/epay/transaction/status/
 */
export function esewaStatusUrl() {
  const mode = providerMode('esewa');
  const configured = rt('esewa_status_url');
  if (mode === 'live') {
    if (!configured || configured.includes('rc')) {
      return 'https://epay.esewa.com.np/api/epay/transaction/status/';
    }
    return configured;
  }
  return configured || 'https://rc-epay.esewa.com.np/api/epay/transaction/status/';
}

/**
 * Builds eSewa ePay v2 form fields according to official specifications:
 * - amount, tax_amount=0, total_amount, transaction_uuid, product_code,
 *   product_service_charge=0, product_delivery_charge=0, success_url, failure_url,
 *   signed_field_names="total_amount,transaction_uuid,product_code", signature
 */
export function esewaFields(payment, prn = cleanPrn(payment.id)) {
  const mode = providerMode('esewa');
  const total = String(Math.round(Number(payment.amount)));
  const code = (mode === 'sandbox' ? (rt('esewa_merchant_code') || 'EPAYTEST') : rt('esewa_merchant_code')).trim() || 'EPAYTEST';
  const apiUrl = rt('public_api_url').replace(/\/$/, '');
  const fields = {
    amount: total,
    tax_amount: '0',
    total_amount: total,
    transaction_uuid: prn,
    product_code: code,
    product_service_charge: '0',
    product_delivery_charge: '0',
    success_url: `${apiUrl}/payments/esewa/callback?payment_id=${payment.id}`,
    failure_url: `${apiUrl}/payments/esewa/callback?payment_id=${payment.id}&outcome=failed`,
    signed_field_names: 'total_amount,transaction_uuid,product_code',
  };
  fields.signature = signEsewa(
    `total_amount=${fields.total_amount},transaction_uuid=${fields.transaction_uuid},product_code=${fields.product_code}`,
  );
  return fields;
}

/**
 * Initiates an eSewa ePay transaction.
 */
export async function initiate(provider, payment, { orderLabel, customer } = {}) {
  if (provider !== 'esewa') {
    throw bad('Unsupported payment provider');
  }
  if (!isProviderEnabled('esewa')) {
    throw bad('eSewa is currently turned off. Please choose another payment method or pay with cash.');
  }

  const mode = providerMode('esewa');
  const prn = payment.provider_ref || cleanPrn(payment.id);
  const apiUrl = rt('public_api_url').replace(/\/$/, '');
  const startUrl = `${apiUrl}/payments/esewa/start?payment_id=${payment.id}`;
  const fields = esewaFields(payment, prn);
  const formAction = esewaFormUrl();

  return {
    payment_id: payment.id,
    provider: 'esewa',
    amount: payment.amount,
    mode: mode === 'sandbox' ? 'sandbox' : 'epay',
    pay_url: startUrl,
    provider_ref: prn,
    raw: {
      pay_url: startUrl,
      prn,
      provider: 'esewa',
      sandbox: mode === 'sandbox',
      epay_form: fields,
      epay_action: formAction,
    },
  };
}

/**
 * Verifies an eSewa response either from the success callback (?data=...) or via status polling.
 */
export async function verifyEsewa(arg1, arg2) {
  const payment = arg1 && typeof arg1 === 'object' ? arg1 : null;
  const dataB64 = typeof arg1 === 'string' ? arg1 : arg2;

  if (!dataB64 && payment) {
    return checkEsewa(payment);
  }

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

  const cbStatus = String(data.status || '').toUpperCase();
  if (cbStatus !== 'COMPLETE') {
    return { paid: false, failed: true, raw: { callback: data } };
  }

  // Server-to-server transaction status check
  const statusBase = esewaStatusUrl();
  assertSafeOutboundUrl(statusBase, 'eSewa Status Check URL');
  const sep = statusBase.includes('?') ? '&' : '?';
  const cleanTotal = String(data.total_amount).replace(/,/g, '');
  const url = `${statusBase}${sep}product_code=${encodeURIComponent(data.product_code)}&total_amount=${encodeURIComponent(cleanTotal)}&transaction_uuid=${encodeURIComponent(data.transaction_uuid)}`;

  let j = null;
  try {
    const resp = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    j = await resp.json();
  } catch (e) {
    j = { fetch_error: e.message };
  }

  if (j && j.status && String(j.status).toUpperCase() !== 'COMPLETE') {
    return { paid: false, failed: false, raw: { callback: data, status: j } };
  }

  const verifiedAmount = Math.round(Number(cleanTotal));
  if (payment && Math.abs(verifiedAmount - Number(payment.amount)) > 1) {
    throw bad('eSewa paid amount does not match order total');
  }

  const ref = String(data.transaction_code || j?.ref_id || data.transaction_uuid);
  return { paid: true, ref, raw: { callback: data, status: j } };
}

/**
 * Checks transaction status directly with eSewa servers.
 */
export async function checkEsewa(payment) {
  const prn = payment.provider_ref || cleanPrn(payment.id);
  const mode = providerMode('esewa');
  const code = (mode === 'sandbox' ? (rt('esewa_merchant_code') || 'EPAYTEST') : rt('esewa_merchant_code')).trim() || 'EPAYTEST';
  const total = String(Math.round(Number(payment.amount)));
  const statusBase = esewaStatusUrl();
  assertSafeOutboundUrl(statusBase, 'eSewa Status Check URL');
  const sep = statusBase.includes('?') ? '&' : '?';
  const url = `${statusBase}${sep}product_code=${encodeURIComponent(code)}&total_amount=${encodeURIComponent(total)}&transaction_uuid=${encodeURIComponent(prn)}`;

  const resp = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  const j = await resp.json();
  if (String(j.status).toUpperCase() === 'COMPLETE') {
    return { paid: true, ref: String(j.ref_id || prn), raw: { status: j } };
  }
  if (String(j.status).toUpperCase() === 'CANCELED' || String(j.status).toUpperCase() === 'FULL_REFUND') {
    return { paid: false, failed: true, raw: { status: j } };
  }
  return { paid: false, raw: { status: j } };
}

export async function checkPaymentStatus(payment) {
  if (payment.provider === 'esewa') return checkEsewa(payment);
  return { paid: false };
}
