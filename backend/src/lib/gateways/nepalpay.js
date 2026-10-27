import crypto from 'node:crypto';
import { rt } from '../runtime.js';

/**
 * NepalPay QR (NCHL). The shop shows a dynamic NepalQR (EMVCo merchant-presented QR) that any bank or wallet app can scan. The amount and our
 * payment reference are put into the QR, and NCHL's WebSocket channel tells us when the payment is done (see doc.connectips.com, NepalPay QR WebSocket).
 *
 * The bank that gave you NepalPay QR hands over a static merchant QR string. We turn it into a dynamic one by setting tag 01 to 12, adding the
 * amount (tag 54) and our reference (tag 62), and writing a fresh CRC (tag 63).
 */
export const mode = () => (rt('nepalpay_mode') === 'live' ? 'live' : 'sandbox');
export const merchantId = () => (rt('nepalpay_merchant_id') || '').trim();
export const template = () => (rt('nepalpay_qr_template') || '').trim();

export function missing() {
  const out = [];
  if (!template()) out.push('nepalpay_qr_template');
  if (!merchantId()) out.push('nepalpay_merchant_id');
  if (!rt('nepalpay_ws_url')) out.push('nepalpay_ws_url');
  if (!rt('nepalpay_username')) out.push('nepalpay_username');
  if (!rt('nepalpay_api_token')) out.push('nepalpay_api_token');
  if (!rt('nepalpay_public_key')) out.push('nepalpay_public_key');
  return out;
}

/** 24 letters and digits, unique for every attempt; this is the transaction id (request_id) in NCHL's WebSocket messages. */
export const reference = (id) => String(id).replace(/[^a-zA-Z0-9]/g, '').slice(0, 24).toUpperCase();

/* ---------------- EMVCo QR ---------------- */
export function parseTlv(s) {
  const out = [];
  let i = 0;
  while (i < s.length) {
    const tag = s.slice(i, i + 2), len = Number(s.slice(i + 2, i + 4));
    if (!/^\d{2}$/.test(tag) || !Number.isInteger(len) || i + 4 + len > s.length) throw new Error('That is not a valid NepalQR string');
    out.push([tag, s.slice(i + 4, i + 4 + len)]);
    i += 4 + len;
  }
  return out;
}
const tlv = (tag, value) => `${tag}${String(value.length).padStart(2, '0')}${value}`;

export function crc16(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** A dynamic NepalQR for one payment. */
export function dynamicQr({ amount, ref, tpl = template() }) {
  const fields = parseTlv(tpl).filter(([t]) => !['01', '54', '62', '63'].includes(t));
  fields.push(['01', '12']);
  fields.push(['54', Number(amount).toFixed(2)]);
  // Additional data: 01 bill number, 05 reference label, 07 terminal label. The reference goes in the bill number and the reference label.
  fields.push(['62', tlv('01', ref) + tlv('05', ref) + tlv('07', merchantId().slice(0, 25) || 'SADHAI')]);
  fields.sort((a, b) => Number(a[0]) - Number(b[0]));
  const body = fields.map(([t, v]) => tlv(t, v)).join('') + '6304';
  return body + crc16(body);
}

/* ---------------- NCHL WebSocket ---------------- */
/** The API token is encrypted with NCHL's public key, RSA/ECB/PKCS1Padding. */
export function encryptToken() {
  let pem = rt('nepalpay_public_key').trim();
  if (!pem.includes('BEGIN')) pem = `-----BEGIN PUBLIC KEY-----\n${pem.replace(/\s+/g, '').match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----`;
  return crypto.publicEncrypt({ key: pem, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(rt('nepalpay_api_token'))).toString('base64');
}

export function wsUrl() {
  const u = (rt('nepalpay_ws_url') || '').trim().replace(/\/$/, '');
  return /\/nqrws$/.test(u) ? u : `${u}/nqrws`;
}

/** NCHL's message tells us if the payment went through: the debit must be 000 and the credit 000, 999 or DEFER. */
export function readMessage(m) {
  const status = String(m.status || '').toUpperCase();
  if (status === 'COMPLETED') {
    const ok = String(m.debit_status) === '000' && ['000', '999', 'DEFER'].includes(String(m.credit_status).toUpperCase());
    return { done: true, ok };
  }
  if (status === 'FAILED') return { done: true, ok: false };
  return { done: false, ok: false };
}
