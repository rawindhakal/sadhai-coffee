import { rt, rtBool } from './runtime.js';
import { bad } from './http.js';
import { query } from './db.js';
import * as fonepay from './gateways/fonepay.js';

/**
 * Ways to pay. Cash is paid at the counter when the order is collected, a 10-cup pass pays with cups, and Fonepay is a dynamic QR that is paid
 * online before the order goes to the barista. Coupons and promo codes only reduce the price.
 */
export const GATEWAYS = ['fonepay'];
/** The shop's own printed QR. The customer pays any amount to it; the barista, or the owner centrally, checks the money arrived. */
export const STATIC_QR = 'qr_static';
export const LABEL = { cash: 'Pay at counter', qr_static: 'Shop QR', fonepay: 'Fonepay QR', esewa: 'eSewa (old)', nepalpay: 'NepalPay (old)', khalti: 'Khalti (old)' };
export const PAYMENT_METHODS = ['cash', 'pass', ...GATEWAYS, STATIC_QR];
const mods = { fonepay };
export const gateway = (p) => mods[p];
export const isGateway = (p) => GATEWAYS.includes(p);

/** A customer sees Fonepay only when the owner switched it on and every Fonepay field is saved. */
const apiBase = () => (rt('public_api_url') || '').replace(/\/$/, '');
export const webBase = () => (rt('public_web_url') || '').replace(/\/$/, '');
/** The address the QR holds in web mode: our page that sends the phone on to Fonepay with a signed request. */
export const payUrl = (paymentId) => `${apiBase()}/payments/${paymentId}/pay`;
export const returnUrl = () => `${apiBase()}/payments/fonepay/return`;

export const offered = (provider) => isGateway(provider) && rtBool(`${provider}_enabled`) && mods[provider].missing().length === 0;
export const staticQrOffered = () => rtBool('static_qr_enabled') && !!(rt('static_qr_text') || rt('static_qr_image'));
export const enabledPaymentMethods = () => ['cash', ...GATEWAYS.filter(offered), ...(staticQrOffered() ? [STATIC_QR] : [])];
/** What the screens need to show the shop QR. */
export function staticQrInfo() {
  if (!staticQrOffered()) return null;
  const img = rt('static_qr_image');
  return { title: rt('static_qr_title') || 'Sadhai Coffee', text: rt('static_qr_text') || null, image_url: img || null };
}

/** What the owner screen and the apps show about the gateway. No secrets. */
export function gatewayStatus() {
  const g = fonepay;
  return { fonepay: { enabled: rtBool('fonepay_enabled'), mode: g.mode(), method: g.method(), address: g.method() === 'web' ? g.webUrl() : g.baseUrl(), missing: g.missing(), ready: g.missing().length === 0, offered: offered('fonepay') } };
}

/** Details to hand to the client after a payment row has been made. */
export function initiate(provider, payment, { test = false } = {}) {
  if (!isGateway(provider)) throw bad('Choose a payment method');
  if (!test && !rtBool(`${provider}_enabled`)) throw bad('Fonepay is not switched on right now. Pay with cash instead.');
  return { payment_id: payment.id, provider, amount: payment.amount, mode: fonepay.mode(), reference: fonepay.reference(payment.id) };
}

/**
 * The QR to show for a pending payment: asked from Fonepay once and kept, so every screen shows the same QR. If Fonepay refuses, the error carries
 * its own wording and the next look tries again.
 */
export async function qrFor(payment) {
  if (payment.raw?.qr) return payment.raw.qr;
  const ref = payment.provider_ref || fonepay.reference(payment.id);
  if (fonepay.method() === 'web') {
    const qr = { kind: 'link', value: payUrl(payment.id), open: true };
    await query(`UPDATE payments SET provider_ref=$2, raw = COALESCE(raw,'{}'::jsonb) || $3::jsonb WHERE id=$1`, [payment.id, ref, JSON.stringify({ qr })]);
    return qr;
  }
  const q = await fonepay.createQr({ amount: payment.amount, prn: ref, remarks1: 'Sadhai Coffee' });
  const qr = { kind: 'bank', value: q.qr };
  await query(`UPDATE payments SET provider_ref=$2, raw = COALESCE(raw,'{}'::jsonb) || $3::jsonb WHERE id=$1`, [payment.id, ref, JSON.stringify({ qr, socket: q.websocket })]);
  return qr;
}
