import crypto from 'node:crypto';
import { rt, rtBool, sourceOf } from './runtime.js';
import { bad } from './http.js';

/**
 * Online payment gateways:
 *  - Fonepay: Dynamic QR API (thirdPartyDynamicQrDownload / GetStatus) + Web/Flutter PG (fonepay_flutter merchantRequest)
 *  - eSewa: ePay v2 (developer.esewa.com.np) signed form POST + Transaction Status Check API + QR
 *  - Khalti: ePayment KPG-2 (docs.khalti.com) /epayment/initiate/ + /epayment/lookup/ + QR
 */

export const ONLINE_PROVIDERS = ['fonepay', 'esewa', 'khalti'];
export const ALL_PAYMENT_METHODS = ['cash', 'fonepay', 'esewa', 'khalti', 'pass'];

export function isProviderEnabled(provider) {
  if (provider === 'pass') return true;
  if (provider === 'cash') return rtBool('cash_enabled');
  if (provider === 'fonepay') return rtBool('fonepay_enabled');
  if (provider === 'esewa') return rtBool('esewa_enabled');
  if (provider === 'khalti') return rtBool('khalti_enabled');
  return false;
}

export function enabledPaymentMethods() {
  return ['cash', 'fonepay', 'esewa', 'khalti'].filter((m) => isProviderEnabled(m));
}

export function providerMode(provider) {
  const key = `${provider}_mode`;
  if (sourceOf(key) !== 'default') {
    const m = rt(key);
    if (m === 'live' || m === 'sandbox') return m;
  }
  return rt('payment_mode') === 'live' ? 'live' : 'sandbox';
}

const signFonepay = (message) =>
  crypto.createHmac('sha512', rt('fonepay_secret_key') || 'fonepay_sandbox_secret').update(message).digest('hex').toLowerCase();

const signEsewa = (message) =>
  crypto.createHmac('sha256', rt('esewa_secret_key') || '8gBm/:&EnhH.1/q').update(message).digest('base64');

const fixed = (n) => Number(n).toFixed(2);

/** Compact 24-character alphanumeric PRN safe for Fonepay, eSewa, and Khalti (UUIDs with hyphens exceed Fonepay's 25-char limit). */
export const cleanPrn = (id) => String(id).replace(/[^a-zA-Z0-9]/g, '').slice(0, 24).toUpperCase();

export const FONEPAY_LIVE_FIELDS = ['fonepay_merchant_code', 'fonepay_secret_key'];
export const FONEPAY_QR_LIVE_FIELDS = ['fonepay_merchant_code', 'fonepay_username', 'fonepay_password', 'fonepay_secret_key'];
export const ESEWA_LIVE_FIELDS = ['esewa_merchant_code', 'esewa_secret_key'];
export const KHALTI_LIVE_FIELDS = ['khalti_secret_key'];

export function fonepayMissing() {
  return FONEPAY_LIVE_FIELDS.filter((k) => !rt(k));
}
export function fonepayQrMissing() {
  return FONEPAY_QR_LIVE_FIELDS.filter((k) => !rt(k));
}
export function esewaMissing() {
  return ESEWA_LIVE_FIELDS.filter((k) => !rt(k));
}
export function khaltiMissing() {
  return KHALTI_LIVE_FIELDS.filter((k) => !rt(k));
}

export function gatewayStatus() {
  return {
    cash: { enabled: isProviderEnabled('cash') },
    fonepay: {
      enabled: isProviderEnabled('fonepay'),
      mode: providerMode('fonepay'),
      configured: fonepayMissing().length === 0,
      qr_configured: fonepayQrMissing().length === 0,
      missing: fonepayMissing(),
    },
    esewa: {
      enabled: isProviderEnabled('esewa'),
      mode: providerMode('esewa'),
      configured: esewaMissing().length === 0,
      missing: esewaMissing(),
    },
    khalti: {
      enabled: isProviderEnabled('khalti'),
      mode: providerMode('khalti'),
      configured: khaltiMissing().length === 0,
      missing: khaltiMissing(),
    },
  };
}

export function testQrMessage(payment, tag = 'FONEPAY') {
  return `SADHAI-${tag}-TEST|${cleanPrn(payment.id)}|NPR:${fixed(payment.amount)}`;
}

/**
 * Builds Fonepay Web / Flutter PG fields compatible with iamnabink/fonepay_flutter:
 * PID, MD="P", PRN, AMT, CRN="NPR", DT="MM/dd/yyyy", R1, R2, RU, DV=HMAC-SHA512(PID,MD,PRN,AMT,CRN,DT,R1,R2,RU)
 */
export function fonepayPgFields(payment, prn = cleanPrn(payment.id), orderLabel = 'Sadhai Coffee') {
  const mode = providerMode('fonepay');
  const pid = (rt('fonepay_merchant_code') || (mode === 'sandbox' ? 'NBQM' : '')).trim();
  const amt = fixed(payment.amount);
  const crn = 'NPR';
  const md = 'P';
  const now = new Date(Date.now() + 345 * 60 * 1000); // Nepal Time (UTC+5:45)
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const yyyy = now.getUTCFullYear();
  const dt = `${mm}/${dd}/${yyyy}`;
  const r1 = String(orderLabel || 'Sadhai Coffee').replace(/[^a-zA-Z0-9 .-]/g, '').trim().slice(0, 50) || 'Sadhai Coffee';
  const r2 = 'SadhaiCoffee';
  const apiUrl = rt('public_api_url').replace(/\/$/, '');
  const ru = `${apiUrl}/payments/fonepay/callback?payment_id=${payment.id}`;
  const dv = signFonepay([pid, md, prn, amt, crn, dt, r1, r2, ru].join(','));
  const pgUrl = mode === 'live'
    ? (rt('fonepay_pg_url').includes('dev-') ? 'https://clientapi.fonepay.com/api/merchantRequest' : rt('fonepay_pg_url'))
    : (rt('fonepay_pg_url') || 'https://dev-clientapi.fonepay.com/api/merchantRequest');
  return { PID: pid, MD: md, PRN: prn, AMT: amt, CRN: crn, DT: dt, R1: r1, R2: r2, RU: ru, DV: dv, pg_url: pgUrl };
}

/**
 * Builds eSewa ePay v2 form fields (developer.esewa.com.np):
 * signature = Base64(HMAC-SHA256("total_amount=...,transaction_uuid=...,product_code=...", secretKey))
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

export function esewaFormUrl() {
  const mode = providerMode('esewa');
  const configuredUrl = rt('esewa_qr_url') || 'https://rc-epay.esewa.com.np/api/epay/main/v2/form';
  if (mode === 'live' && configuredUrl.includes('rc-epay.esewa.com.np')) {
    return 'https://epay.esewa.com.np/api/epay/main/v2/form';
  }
  if (mode === 'sandbox' && !configuredUrl.includes('rc-epay')) {
    return 'https://rc-epay.esewa.com.np/api/epay/main/v2/form';
  }
  return configuredUrl;
}

export function esewaStatusUrl() {
  const mode = providerMode('esewa');
  const configuredUrl = rt('esewa_status_url') || 'https://rc.esewa.com.np/api/epay/transaction/status/';
  if (mode === 'live' && configuredUrl.includes('rc.esewa.com.np')) {
    return 'https://epay.esewa.com.np/api/epay/transaction/status/';
  }
  return configuredUrl;
}

/** Starts an online payment for fonepay, esewa, or khalti. */
export async function initiate(provider, payment, { orderLabel, customer } = {}) {
  if (!ONLINE_PROVIDERS.includes(provider)) {
    throw bad('Choose a valid online payment method (Fonepay, eSewa or Khalti)');
  }
  if (!isProviderEnabled(provider)) {
    throw bad(`${provider[0].toUpperCase() + provider.slice(1)} is currently turned off. Please choose another payment method.`);
  }

  const mode = providerMode(provider);
  const prn = payment.provider_ref || cleanPrn(payment.id);
  const apiUrl = rt('public_api_url').replace(/\/$/, '');
  const webUrl = rt('public_web_url').replace(/\/$/, '');
  const cleanLabel = String(orderLabel || 'Sadhai Coffee').replace(/[^a-zA-Z0-9 .-]/g, '').trim().slice(0, 25) || 'Sadhai Coffee';
  const base = { payment_id: payment.id, provider, amount: payment.amount };

  /* -------------------- FONEPAY -------------------- */
  if (provider === 'fonepay') {
    const startUrl = `${apiUrl}/payments/fonepay/start?payment_id=${payment.id}`;
    const pgFields = fonepayPgFields(payment, prn, cleanLabel);

    if (mode === 'sandbox') {
      const qr = testQrMessage(payment, 'FONEPAY');
      return {
        ...base,
        mode: 'sandbox',
        qr_message: qr,
        pay_url: startUrl,
        provider_ref: prn,
        fonepay_config: pgFields,
        raw: { qr_message: qr, pay_url: startUrl, prn, provider, sandbox: true, fonepay_config: pgFields },
      };
    }

    const missing = fonepayMissing();
    if (missing.length) throw bad('Fonepay is not set up yet. Please choose another payment method or pay with cash.');

    // If Dynamic QR API credentials (username & password) are set, request EMVCo Dynamic QR from Fonepay
    if (rt('fonepay_username') && rt('fonepay_password')) {
      const qrUrl = rt('fonepay_qr_url').includes('dev-merchantapi') && mode === 'live'
        ? 'https://merchantapi.fonepay.com/api/merchant/merchantDetailsForThirdParty/thirdPartyDynamicQrDownload'
        : rt('fonepay_qr_url');
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
        const r = await fetch(qrUrl, {
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
        pay_url: startUrl,
        provider_ref: prn,
        fonepay_config: pgFields,
        raw: { qr_message: qrMessage, pay_url: startUrl, prn, fonepay_config: pgFields, socket: j.thirdpartyQrWebSocketUrl || null },
      };
    }

    // Fallback to Fonepay Web/Flutter PG URL if only PID + Secret Key are configured
    return {
      ...base,
      mode: 'qr',
      qr_message: startUrl,
      pay_url: startUrl,
      provider_ref: prn,
      fonepay_config: pgFields,
      raw: { qr_message: startUrl, pay_url: startUrl, prn, fonepay_config: pgFields },
    };
  }

  /* -------------------- ESEWA (ePay v2) -------------------- */
  if (provider === 'esewa') {
    const startUrl = `${apiUrl}/payments/esewa/start?payment_id=${payment.id}`;
    const fields = esewaFields(payment, prn);
    const formAction = esewaFormUrl();

    if (mode === 'sandbox') {
      return {
        ...base,
        mode: 'sandbox',
        qr_message: startUrl,
        pay_url: startUrl,
        provider_ref: prn,
        raw: {
          qr_message: startUrl,
          pay_url: startUrl,
          prn,
          provider,
          sandbox: true,
          fields,
          epay_form: fields,
          epay_action: formAction,
        },
      };
    }

    const missing = esewaMissing();
    if (missing.length) throw bad('eSewa is not set up yet. Please choose another payment method or pay with cash.');

    // If merchant configured a direct JSON dynamic QR endpoint with username & password, request EMVCo QR directly
    if (rt('esewa_username') && rt('esewa_password') && !formAction.includes('/epay/main/')) {
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
        const r = await fetch(formAction, {
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
            raw: { qr_message: qrMessage, pay_url: startUrl, prn, fields, epay_form: fields, epay_action: 'https://epay.esewa.com.np/api/epay/main/v2/form' },
          };
        }
      } catch {
        // Fall through to standard ePay v2 checkout
      }
    }

    return {
      ...base,
      mode: 'qr',
      qr_message: startUrl,
      pay_url: startUrl,
      provider_ref: prn,
      raw: { qr_message: startUrl, pay_url: startUrl, prn, fields, epay_form: fields, epay_action: formAction },
    };
  }

  /* -------------------- KHALTI (KPG-2 ePayment) -------------------- */
  if (provider === 'khalti') {
    const hasSecret = !khaltiMissing().length;
    const rawBaseUrl = rt('khalti_base_url') || (mode === 'live' ? 'https://khalti.com/api/v2' : 'https://dev.khalti.com/api/v2');
    const baseUrl = (mode === 'live' && rawBaseUrl.includes('dev.khalti.com') ? 'https://khalti.com/api/v2' : rawBaseUrl).replace(/\/$/, '');

    // In sandbox mode without a Khalti key configured yet, provide instant sandbox checkout & QR
    if (mode === 'sandbox' && !hasSecret) {
      const startUrl = `${apiUrl}/payments/khalti/start?payment_id=${payment.id}`;
      const qr = testQrMessage(payment, 'KHALTI');
      return {
        ...base,
        mode: 'sandbox',
        qr_message: qr,
        pay_url: startUrl,
        provider_ref: prn,
        raw: { qr_message: qr, pay_url: startUrl, prn, provider, sandbox: true },
      };
    }

    if (!hasSecret) throw bad('Khalti is not set up yet. Please choose another payment method or pay with cash.');

    let j;
    let ok = false;
    try {
      const payload = {
        return_url: `${apiUrl}/payments/khalti/callback?payment_id=${payment.id}`,
        website_url: webUrl || 'https://sadhaicoffee.com',
        amount: Math.round(Number(payment.amount) * 100), // Khalti KPG-2 requires amount in paisa (Rs * 100)
        purchase_order_id: prn,
        purchase_order_name: cleanLabel,
      };
      if (customer?.name || customer?.phone || customer?.email) {
        payload.customer_info = {
          name: customer.name || 'Sadhai Customer',
          phone: customer.phone || '9800000000',
          ...(customer.email ? { email: customer.email } : {}),
        };
      }
      const r = await fetch(`${baseUrl}/epayment/initiate/`, {
        method: 'POST',
        headers: {
          Authorization: `Key ${rt('khalti_secret_key').trim()}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });
      ok = r.ok;
      j = await r.json();
    } catch {
      if (mode === 'sandbox') {
        const startUrl = `${apiUrl}/payments/khalti/start?payment_id=${payment.id}`;
        const qr = testQrMessage(payment, 'KHALTI');
        return {
          ...base,
          mode: 'sandbox',
          qr_message: qr,
          pay_url: startUrl,
          provider_ref: prn,
          raw: { qr_message: qr, pay_url: startUrl, prn, provider, sandbox: true },
        };
      }
      throw bad('Khalti could not be reached right now. Please try again or choose another payment method.');
    }

    const payUrl = j?.payment_url;
    const qrMessage = j?.qr_code || j?.dynamic_qr || payUrl;
    if (!ok || !qrMessage) {
      const detail = j?.detail || j?.error_key || (Array.isArray(j?.amount) ? j.amount[0] : null) || 'Khalti could not start the payment';
      throw bad(`${detail}. Please try again or pay with cash.`);
    }
    return {
      ...base,
      mode: mode === 'sandbox' ? 'sandbox' : 'qr',
      qr_message: qrMessage,
      pay_url: payUrl || null,
      provider_ref: j.pidx || prn,
      raw: {
        qr_message: qrMessage,
        pay_url: payUrl || null,
        pidx: j.pidx || null,
        expires_at: j.expires_at || null,
        prn,
        sandbox: mode === 'sandbox',
      },
    };
  }

  throw bad('Unsupported payment provider');
}

/** Verifies Fonepay Web/Flutter PG return parameters (PRN, PID, PS, RC, UID, BC, INI, P_AMT, R_AMT, DV). */
export function verifyFonepayCallback(q, expectedAmount) {
  const { PRN, PID, PS, RC, UID, BC, INI, P_AMT, R_AMT, DV } = q || {};
  if (!PRN || !PID || !DV) return { paid: false, failed: true, reason: 'Missing Fonepay return parameters' };
  const msg = [PRN, PID, PS, RC, UID, BC, INI, P_AMT, R_AMT].map((x) => String(x ?? '')).join(',');
  const expectedDv = signFonepay(msg);
  if (expectedDv !== String(DV).toLowerCase() && providerMode('fonepay') === 'live') {
    throw bad('Invalid Fonepay return signature');
  }
  const success = String(PS).toLowerCase() === 'true' && String(RC).toLowerCase() === 'successful';
  if (!success) {
    return { paid: false, failed: true, raw: q };
  }
  const paidAmt = Number(P_AMT ?? R_AMT ?? expectedAmount);
  if (expectedAmount != null && Math.abs(Math.round(paidAmt) - Number(expectedAmount)) > 1) {
    throw bad('Fonepay paid amount does not match order total');
  }
  return { paid: true, ref: String(UID || PRN), raw: q };
}

/** Polls Fonepay status for a pending dynamic QR payment. */
export async function checkFonepay(payment) {
  if (!rt('fonepay_username') || !rt('fonepay_password') || !rt('fonepay_merchant_code')) {
    return { paid: false };
  }
  const mode = providerMode('fonepay');
  const prn = payment.raw?.prn || payment.provider_ref || cleanPrn(payment.id);
  const merchantCode = rt('fonepay_merchant_code').trim();
  const body = {
    prn,
    merchantCode,
    username: rt('fonepay_username').trim(),
    password: rt('fonepay_password'),
  };
  body.dataValidation = signFonepay([body.prn, body.merchantCode].join(','));
  const statusUrl = rt('fonepay_status_url').includes('dev-merchantapi') && mode === 'live'
    ? 'https://merchantapi.fonepay.com/api/merchant/merchantDetailsForThirdParty/thirdPartyDynamicQrGetStatus'
    : rt('fonepay_status_url');
  const r = await fetch(statusUrl, {
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

/** Polls eSewa transaction status API (developer.esewa.com.np) for a pending payment. */
export async function checkEsewa(payment) {
  const prn = payment.raw?.prn || payment.provider_ref || cleanPrn(payment.id);
  const code = payment.raw?.fields?.product_code || rt('esewa_merchant_code') || 'EPAYTEST';
  const statusBase = esewaStatusUrl();
  const sep = statusBase.includes('?') ? '&' : '?';
  const totalAmount = payment.raw?.fields?.total_amount || String(Math.round(Number(payment.amount)));
  const url = `${statusBase}${sep}product_code=${encodeURIComponent(code)}&total_amount=${encodeURIComponent(totalAmount)}&transaction_uuid=${encodeURIComponent(prn)}`;
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
  if (['CANCELED', 'CANCELLED', 'FULL_REFUND', 'AMBIGUOUS', 'NOT_FOUND'].includes(status)) {
    return { paid: false, failed: status !== 'NOT_FOUND', raw: j };
  }
  return { paid: false, raw: j };
}

/**
 * Verifies the signed base64 callback payload from eSewa ePay v2 and double-checks status with eSewa's server.
 * Accepts either (payment, dataB64) or (dataB64).
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

  const statusBase = esewaStatusUrl();
  const sep = statusBase.includes('?') ? '&' : '?';
  const cleanTotal = String(data.total_amount).replace(/,/g, '');
  const url = `${statusBase}${sep}product_code=${encodeURIComponent(data.product_code)}&total_amount=${encodeURIComponent(cleanTotal)}&transaction_uuid=${encodeURIComponent(data.transaction_uuid)}`;
  const j = await (await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) })).json();
  if (String(j.status).toUpperCase() !== 'COMPLETE') {
    return { paid: false, failed: false, raw: { callback: data, status: j } };
  }

  const verifiedAmount = Math.round(Number(cleanTotal));
  if (payment && Math.abs(verifiedAmount - Number(payment.amount)) > 1) {
    throw bad('eSewa paid amount does not match order total');
  }

  return {
    paid: true,
    prn: String(data.transaction_uuid),
    ref: String(j.ref_id || data.transaction_code || data.transaction_uuid),
    amount: verifiedAmount,
    raw: { callback: data, status: j },
  };
}

/** Polls Khalti KPG-2 lookup API (/epayment/lookup/) for a pending payment. */
export async function checkKhalti(payment, overridePidx = null) {
  const pidx = overridePidx || payment.raw?.pidx || (payment.provider_ref !== cleanPrn(payment.id) ? payment.provider_ref : null);
  if (!pidx || !rt('khalti_secret_key')) return { paid: false };
  const mode = providerMode('khalti');
  const rawBaseUrl = rt('khalti_base_url') || (mode === 'live' ? 'https://khalti.com/api/v2' : 'https://dev.khalti.com/api/v2');
  const baseUrl = (mode === 'live' && rawBaseUrl.includes('dev.khalti.com') ? 'https://khalti.com/api/v2' : rawBaseUrl).replace(/\/$/, '');
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
    return { paid: true, ref: String(j.transaction_id || j.tidx || pidx), raw: j };
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
