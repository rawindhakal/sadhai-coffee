import { rt, rtBool } from './runtime.js';
import { bad } from './http.js';
import { query } from './db.js';
import * as fonepay from './gateways/fonepay.js';

/**
 * Ways to pay. Cash is paid at the counter when the order is collected, a 10-cup pass pays with cups, and Fonepay is a dynamic QR that is paid
 * online before the order goes to the barista. Coupons and promo codes only reduce the price.
 */
export const GATEWAYS = ['fonepay'];
export const LABEL = { fonepay: 'Fonepay QR', esewa: 'eSewa (old)', nepalpay: 'NepalPay (old)', khalti: 'Khalti (old)' };
export const PAYMENT_METHODS = ['cash', 'pass', ...GATEWAYS];
const mods = { fonepay };
export const gateway = (p) => mods[p];
export const isGateway = (p) => GATEWAYS.includes(p);

/** A customer sees Fonepay only when the owner switched it on and every Fonepay field is saved. */
export const offered = (provider) => isGateway(provider) && rtBool(`${provider}_enabled`) && mods[provider].missing().length === 0;
export const enabledPaymentMethods = () => ['cash', ...GATEWAYS.filter(offered)];

/** What the owner screen and the apps show about the gateway. No secrets. */
export function gatewayStatus() {
  const g = fonepay;
  return { fonepay: { enabled: rtBool('fonepay_enabled'), mode: g.mode(), address: g.baseUrl(), missing: g.missing(), ready: g.missing().length === 0, offered: offered('fonepay') } };
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
  const q = await fonepay.createQr({ amount: payment.amount, prn: ref, remarks1: 'Sadhai Coffee' });
  const qr = { kind: 'bank', value: q.qr };
  await query(`UPDATE payments SET provider_ref=$2, raw = COALESCE(raw,'{}'::jsonb) || $3::jsonb WHERE id=$1`, [payment.id, ref, JSON.stringify({ qr, socket: q.websocket })]);
  return qr;
}
