import { rt, rtBool } from './runtime.js';
import { bad } from './http.js';
import * as esewa from './gateways/esewa.js';
import * as fonepay from './gateways/fonepay.js';
import * as nepalpay from './gateways/nepalpay.js';
import { query } from './db.js';

/**
 * Ways to pay. Cash is paid at the counter when the order is collected, a 10-cup pass pays with cups, and eSewa and Fonepay are paid online
 * before the order goes to the barista. Coupons and promo codes only reduce the price.
 */
export const GATEWAYS = ['esewa', 'fonepay', 'nepalpay'];
export const LABEL = { esewa: 'eSewa', fonepay: 'Fonepay', nepalpay: 'NepalPay QR' };
export const PAYMENT_METHODS = ['cash', 'pass', ...GATEWAYS];
const mods = { esewa, fonepay, nepalpay };
export const gateway = (p) => mods[p];
export const isGateway = (p) => GATEWAYS.includes(p);

const apiBase = () => (rt('public_api_url') || '').replace(/\/$/, '');
const isLocalWeb = () => /^https?:\/\/(localhost|127\.|0\.0\.0\.0|[^/]*\.(local|test|localhost))/i.test(rt('public_web_url') || '');

/**
 * Sandbox is for trying things out. On a real website anybody could pay for coffee with eSewa's public test account, so customers are only
 * offered a gateway in Sandbox when the site itself is a local or test site. The owner checks a gateway with the Rs 10 test button instead.
 */
export function offered(provider) {
  if (!isGateway(provider) || !rtBool(`${provider}_enabled`)) return false;
  const g = mods[provider];
  if (provider === 'nepalpay') return g.missing().length === 0;
  if (g.mode() === 'live') return g.missing().length === 0;
  return isLocalWeb();
}
export const enabledPaymentMethods = () => ['cash', ...GATEWAYS.filter(offered)];

/** What the owner screen and the apps show about each gateway. No secrets. */
export function gatewayStatus() {
  const one = (p) => {
    const g = mods[p];
    return { enabled: rtBool(`${p}_enabled`), mode: g.mode(), missing: g.missing(), ready: g.missing().length === 0 || (g.mode() === 'sandbox' && p === 'esewa'), offered: offered(p), real_qr: p === 'fonepay' ? fonepay.qrReady() : p === 'nepalpay' };
  };
  return { esewa: one('esewa'), fonepay: one('fonepay'), nepalpay: one('nepalpay') };
}

/** Where the customer starts paying. The page behind it sends them on to eSewa or Fonepay. */
export const payUrl = (paymentId) => `${apiBase()}/payments/${paymentId}/pay`;
// Return addresses carry no query string of their own: eSewa and Fonepay add theirs, and each answer says which payment it is about.
export const returnUrls = (provider, paymentId) => (provider === 'esewa'
  ? { success: `${apiBase()}/payments/esewa/return`, failure: `${apiBase()}/payments/esewa/failed/${paymentId}` }
  : { success: `${apiBase()}/payments/fonepay/return` });
export const webUrl = () => (rt('public_web_url') || '').replace(/\/$/, '');

/** The built-in test page may only be used on a test site, or for the owner's own Rs 10 check. */
export const simulatorAllowed = (payment) => payment.purpose === 'test' || isLocalWeb();

/** Details to hand to the client after a payment row has been made. */
export function initiate(provider, payment, { test = false } = {}) {
  if (!isGateway(provider)) throw bad('Choose a payment method');
  if (!test && !rtBool(`${provider}_enabled`)) throw bad(`${LABEL[provider]} is not switched on right now. Pay with cash instead.`);
  const g = mods[provider];
  const reference = provider === 'fonepay' ? fonepay.reference(payment.id) : provider === 'nepalpay' ? nepalpay.reference(payment.id) : payment.id;
  return { payment_id: payment.id, provider, amount: payment.amount, mode: g.mode(), pay_url: payUrl(payment.id), reference };
}

/** What the start page should do for a payment: post a form (eSewa), redirect (Fonepay), or show the built-in test page. */
export function startPlan(payment, label) {
  const g = mods[payment.provider];
  if (!g) throw bad('Unknown payment');
  if (g.mode() === 'live' && g.missing().length) throw bad('This payment method is not set up yet');
  if (payment.provider === 'nepalpay') return { type: 'scan' };
  if (payment.provider === 'esewa') {
    const u = returnUrls('esewa', payment.id);
    const f = esewa.formFields({ amount: payment.amount, uuid: payment.provider_ref || payment.id, successUrl: u.success, failureUrl: u.failure });
    return { type: 'form', ...f };
  }
  if (fonepay.missing().length) {
    // Sandbox without Fonepay's test merchant details: a built-in test page, never available in Live.
    return { type: 'simulator' };
  }
  return { type: 'redirect', url: fonepay.requestUrl({ amount: payment.amount, prn: payment.provider_ref || fonepay.reference(payment.id), returnUrl: returnUrls('fonepay', payment.id).success, note: label }) };
}

/**
 * The QR to show for a pending payment, made once and kept. Fonepay and NepalPay give a real bank-scannable QR; eSewa (and Fonepay before its
 * QR service is set up) shows a QR of our payment page, which opens the gateway on the customer's phone. `kind` says which.
 */
export async function qrFor(payment) {
  const saved = payment.raw?.qr;
  if (saved) return saved;
  let qr = null;
  const ref = payment.provider_ref || (payment.provider === 'nepalpay' ? nepalpay.reference(payment.id) : fonepay.reference(payment.id));
  try {
    if (payment.provider === 'nepalpay') qr = { kind: 'bank', value: nepalpay.dynamicQr({ amount: payment.amount, ref }) };
    else if (payment.provider === 'fonepay' && fonepay.qrReady()) qr = { kind: 'bank', value: (await fonepay.createQr({ amount: payment.amount, prn: ref, note: 'Sadhai Coffee' })).qr };
  } catch (e) { console.error('qr', payment.provider, e.message); if (payment.provider === 'nepalpay') throw bad('The NepalPay QR could not be made. Check the merchant QR text in Settings, Payments.'); }
  if (!qr) {
    if (payment.provider === 'nepalpay') throw bad('NepalPay QR is not set up yet');
    qr = { kind: 'link', value: payUrl(payment.id) };
  }
  await query(`UPDATE payments SET raw = COALESCE(raw,'{}'::jsonb) || $2::jsonb WHERE id=$1`, [payment.id, JSON.stringify({ qr })]);
  return qr;
}
