import { rt } from './runtime.js';
import { bad, conflict } from './http.js';
import { enabledPaymentMethods, PAYMENT_METHODS } from './payments.js';

/**
 * How ordering works on each way in. The owner sets this once in the dashboard (Settings, Order flow) and the website, the apps, the kiosk,
 * the kiosk QR and the counter all follow it, because every order passes through assertOrder() and every screen reads effectiveFlow() from /config.
 */
export const CHANNELS = ['app', 'web', 'qr', 'kiosk', 'counter'];
export const CHANNEL_LABEL = { app: 'Mobile app', web: 'Website', qr: 'Kiosk QR (phone)', kiosk: 'Kiosk screen', counter: 'Counter (staff)' };

const BASE = { enabled: true, payments: { cash: true, pass: true, fonepay: true, qr_static: true }, pickup_later: true, notes: true, max_cups: 10, ask_name: false, ask_phone: false };
const OVERRIDE = {
  kiosk: { pickup_later: false, notes: false, ask_name: true, ask_phone: true },
  counter: { pickup_later: false, max_cups: 20 },
};
export const DEFAULT_FLOW = Object.fromEntries(CHANNELS.map((c) => [c, { ...BASE, payments: { ...BASE.payments }, ...(OVERRIDE[c] || {}) }]));

/** The saved rules over the built-in ones, so a missing or half-saved value never breaks ordering. */
export function flow() {
  let saved = {};
  try { saved = JSON.parse(rt('order_flow') || '{}'); } catch { /* use the built-in rules */ }
  return Object.fromEntries(CHANNELS.map((c) => {
    const d = DEFAULT_FLOW[c], s = saved[c] || {};
    return [c, {
      enabled: s.enabled ?? d.enabled,
      payments: Object.fromEntries(PAYMENT_METHODS.map((m) => [m, s.payments?.[m] ?? d.payments[m] ?? true])),
      pickup_later: s.pickup_later ?? d.pickup_later, notes: s.notes ?? d.notes,
      max_cups: Math.min(50, Math.max(1, Number(s.max_cups ?? d.max_cups) || d.max_cups)),
      ask_name: s.ask_name ?? d.ask_name, ask_phone: s.ask_phone ?? d.ask_phone,
    }];
  }));
}

/** Checks an owner's edit and returns the clean JSON to store. */
export function cleanFlow(input) {
  const cur = flow();
  const out = {};
  for (const c of CHANNELS) {
    const s = input?.[c];
    if (!s) { out[c] = cur[c]; continue; }
    const payments = Object.fromEntries(PAYMENT_METHODS.map((m) => [m, !!(s.payments?.[m] ?? cur[c].payments[m])]));
    if (s.enabled !== false && !Object.values(payments).some(Boolean)) throw bad(`${CHANNEL_LABEL[c]} needs at least one way to pay`);
    out[c] = { enabled: s.enabled !== false, payments, pickup_later: !!s.pickup_later, notes: !!s.notes, max_cups: Math.min(50, Math.max(1, Math.round(Number(s.max_cups) || cur[c].max_cups))), ask_name: !!s.ask_name, ask_phone: !!s.ask_phone };
  }
  return JSON.stringify(out);
}

/** What the screens get from /config: each channel's rules, with the payment list already narrowed to what is switched on. */
export function effectiveFlow() {
  const on = new Set(enabledPaymentMethods());
  return Object.fromEntries(Object.entries(flow()).map(([c, r]) => [c, { ...r, payments: undefined, payment_methods: ['cash', 'pass', ...PAYMENT_METHODS.filter((m) => !['cash', 'pass'].includes(m))].filter((m) => r.payments[m] && (m === 'pass' || on.has(m))) }]));
}

/** Every order goes through here, whichever screen it came from. */
export function assertOrder(channel, { payment_method, items, note, scheduled_for }) {
  const r = flow()[channel];
  if (!r) return;
  if (!r.enabled) throw conflict(`${CHANNEL_LABEL[channel]} ordering is switched off right now`, 'channel_off');
  const method = payment_method || 'cash';
  if (!r.payments[method]) throw bad(`${method === 'cash' ? 'Paying at the counter' : method === 'pass' ? 'Paying with a pass' : 'That way of paying'} is not available here`);
  const cups = (items || []).reduce((a, i) => a + (i.qty || 1), 0);
  if (cups > r.max_cups) throw bad(`You can order up to ${r.max_cups} items at a time here`);
  if (note && !r.notes) throw bad('Notes are not taken here');
  if (scheduled_for && !r.pickup_later) throw bad('Pickup later is not available here');
}
