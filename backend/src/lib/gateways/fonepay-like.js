import crypto from 'node:crypto';
import { rt } from '../runtime.js';
import { dynamicQr, fonepayQr } from './emvqr.js';

/**
 * Fonepay and NepalPay QR are the same kind of merchant account, so one implementation serves both; `prefix` picks which saved settings it reads.
 *
 * Web payment: the phone is sent to the gateway's page with a request signed by HMAC-SHA512 over "PID,MD,PRN,AMT,CRN,DT,R1,R2,RU"; the answer
 * comes back signed over "PRN,PID,PS,RC,UID,BC,INI,P_AMT,R_AMT".
 * Dynamic QR (needs the QR API user name and password the gateway gives): download signed over "amount,prn,merchantCode,remarks1,remarks2",
 * status signed over "prn,merchantCode".
 * Own QR text: the merchant's printed QR is turned into a QR for the exact amount. It cannot be checked by the gateway, so staff confirm it.
 */
const WEB = { sandbox: 'https://dev-clientapi.fonepay.com/api/merchantRequest', live: 'https://clientapi.fonepay.com/api/merchantRequest' };
const API = {
  sandbox: 'https://dev-merchantapi.fonepay.com/api/merchant/merchantDetailsForThirdParty',
  live: 'https://merchantapi.fonepay.com/api/merchant/merchantDetailsForThirdParty',
};

export function make(prefix) {
  const get = (k) => rt(`${prefix}_${k}`);
  const mode = () => (get('mode') === 'live' ? 'live' : 'sandbox');
  const merchantCode = () => (get('merchant_code') || '').trim();
  const secret = () => get('secret_key');
  const sign = (m) => crypto.createHmac('sha512', secret()).update(m).digest('hex');
  const fmtDate = (d) => `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
  const clean = (n) => (n || 'Sadhai Coffee').replace(/[^\w .-]/g, '').slice(0, 50) || 'Sadhai Coffee';

  const missing = () => [...(merchantCode() ? [] : [`${prefix}_merchant_code`]), ...(secret() ? [] : [`${prefix}_secret_key`])];
  const qrApiReady = () => missing().length === 0 && !!get('qr_username') && !!get('qr_password');
  const qrTemplate = () => (get('qr_template') || '').trim();
  const generatedReady = () => !!merchantCode() && (!!(get('terminal_id') || '').trim() || !!(get('tag26_id') || '').trim());
  /** 'api' (the gateway's own QR, paid status known), 'generated' (built here from the merchant and terminal ids), 'own' (from the printed QR text) or 'link' (payment page). */
  const qrMode = () => (qrApiReady() ? 'api' : generatedReady() ? 'generated' : qrTemplate() ? 'own' : 'link');

  const reference = (id) => String(id).replace(/[^a-zA-Z0-9]/g, '').slice(0, 24).toUpperCase();

  function requestUrl({ amount, prn, returnUrl, note }) {
    const p = { PID: merchantCode(), MD: 'P', PRN: prn, AMT: String(Math.round(Number(amount))), CRN: 'NPR', DT: fmtDate(new Date()), R1: clean(note), R2: 'N/A', RU: returnUrl };
    p.DV = sign([p.PID, p.MD, p.PRN, p.AMT, p.CRN, p.DT, p.R1, p.R2, p.RU].join(','));
    return `${WEB[mode()]}?${new URLSearchParams(p)}`;
  }

  function readCallback(q) {
    const names = ['PRN', 'PID', 'PS', 'RC', 'UID', 'BC', 'INI', 'P_AMT', 'R_AMT'];
    const v = Object.fromEntries(names.map((n) => [n, String(q[n] ?? '')]));
    if (!q.DV) throw new Error('That answer is not signed');
    const a = Buffer.from(sign(names.map((n) => v[n]).join(','))), b = Buffer.from(String(q.DV).toLowerCase());
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error('That answer has a wrong signature');
    if (v.PID !== merchantCode()) throw new Error('That answer is for a different merchant');
    const ok = v.PS === 'true' && /^success/i.test(v.RC);
    return { ok, failed: !ok, ref: v.UID || null, amount: Math.round(Number(v.P_AMT || 0)), prn: v.PRN, raw: v };
  }

  async function post(path, body) {
    const r = await fetch(`${API[mode()]}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    return r.json().catch(() => ({}));
  }

  async function createQr({ amount, prn, note }) {
    // Same request the earlier, working version sent: amount with two decimals, remarks2 'SadhaiCoffee', user name trimmed.
    const remarks1 = clean(note);
    const b = { amount: Number(amount).toFixed(2), remarks1, remarks2: 'SadhaiCoffee', prn, merchantCode: merchantCode(), username: (get('qr_username') || '').trim(), password: get('qr_password') };
    b.dataValidation = sign([b.amount, prn, b.merchantCode, remarks1, b.remarks2].join(','));
    const j = await post('thirdPartyDynamicQrDownload', b);
    const qr = j.qrMessage || j.data?.qrMessage;
    if (!qr) throw new Error(j.message || 'The QR service did not give a QR code');
    return { qr };
  }

  async function qrStatus({ prn }) {
    const b = { prn, merchantCode: merchantCode(), username: (get('qr_username') || '').trim(), password: get('qr_password') };
    b.dataValidation = sign([prn, b.merchantCode].join(','));
    const j = await post('thirdPartyDynamicQrGetStatus', b);
    const st = String(j.paymentStatus || j.status || '').toLowerCase();
    if (st === 'success') return { state: 'paid', ref: j.fonepayTraceId || null, raw: j };
    if (st === 'failed') return { state: 'failed', raw: j };
    return { state: 'pending', raw: j };
  }

  const ownQr = ({ amount, ref }) => (generatedReady()
    ? fonepayQr({
      amount, fonepayId: merchantCode(), terminalId: (get('terminal_id') || '').trim() || merchantCode(), tag26Id: (get('tag26_id') || '').trim() || undefined,
      mcc: (get('mcc') || '5814').trim(), name: (get('merchant_name') || 'Sadhai Coffee').trim().slice(0, 25), city: (get('merchant_city') || 'Kathmandu').trim().slice(0, 15),
      txnId: ref.slice(0, 20), remarks: 'Sadhai Coffee',
    })
    : dynamicQr({ template: qrTemplate(), amount, ref }));

  return { mode, merchantCode, missing, reference, requestUrl, readCallback, qrApiReady, qrReady: qrApiReady, qrMode, qrTemplate, createQr, qrStatus, ownQr };
}
