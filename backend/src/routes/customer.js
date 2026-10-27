import express, { Router } from 'express';
import { z } from 'zod';
import { query, pool } from '../lib/db.js';
import { wrap, bad, notFound, forbidden, HttpError } from '../lib/http.js';
import { authenticate, requireRole, verifyAccess } from '../lib/auth.js';
import { subscribe } from '../lib/hub.js';
import { createOrder, quote, fullOrder, rateOrder, cancelOrder, confirmPayment, refreshPayment, buyPass } from '../lib/orders.js';
import { PAYMENT_METHODS, GATEWAYS, payUrl, simulatorAllowed, qrFor } from '../lib/payments.js';
import { startPayment, simulate, esewaReturn, esewaFailed, fonepayReturn, nepalpayReturn } from '../lib/payment-flow.js';
import { getSettings } from '../lib/settings.js';
import { rt } from '../lib/runtime.js';

export const customer = Router();

const itemSchema = z.object({ product_id: z.string().uuid(), qty: z.number().int().min(1).max(10).default(1), option_ids: z.array(z.string().uuid()).default([]) });
const orderSchema = z.object({
  station_id: z.string().uuid(),
  items: z.array(itemSchema).min(1).max(20),
  payment_method: z.enum(PAYMENT_METHODS).default('cash'),
  coupon_id: z.string().uuid().optional().nullable(),
  promo_code: z.string().trim().max(30).optional().nullable(),
  note: z.string().max(200).optional(),
  channel: z.enum(['app', 'qr', 'web']).default('app'),
  scheduled_for: z.string().datetime().optional(),
});

// Validate a promo code from the Offers tab (the discount itself is applied at checkout).
customer.post('/promos/check', wrap(async (req, res) => {
  const b = z.object({ code: z.string().trim().min(1).max(30), station_id: z.string().uuid().optional().nullable() }).parse(req.body);
  const { rows } = await query('SELECT * FROM promo_codes WHERE upper(code)=upper($1)', [b.code]);
  const p = rows[0];
  if (!p || !p.active) throw bad('That promo code is not valid');
  if (p.valid_until && new Date(p.valid_until) < new Date()) throw bad('That promo code has expired');
  if (p.max_uses != null && p.used >= p.max_uses) throw bad('That promo code has been fully used');
  if (p.station_id && b.station_id && p.station_id !== b.station_id) throw bad('That promo code is not valid at this station');
  res.json({ code: p.code, title: p.title, pct: p.pct, min_total: p.min_total, max_discount: p.max_discount, drinks_only: p.drinks_only, valid_until: p.valid_until });
}));

// SSE: EventSource cannot send headers, so accept ?access_token=
customer.get('/events', wrap(async (req, res) => {
  const claims = verifyAccess(String(req.query.access_token || ''));
  const { rows } = await query('SELECT id, role, station_id FROM users WHERE id=$1 AND active', [claims.sub]);
  const u = rows[0];
  if (!u) throw new HttpError(401, 'Sign in again');
  const chans = [`user:${u.id}`, 'all'];
  if (u.role === 'station' && u.station_id) chans.push(`station:${u.station_id}`);
  if (u.role === 'manager' || u.role === 'partner') (await query('SELECT station_id FROM station_managers WHERE user_id=$1', [u.id])).rows.forEach((r) => chans.push(`station:${r.station_id}`));
  if (u.role === 'owner') (await query('SELECT id FROM stations WHERE active')).rows.forEach((r) => chans.push(`station:${r.id}`));
  subscribe(res, chans);
  res.write(`event: hello\ndata: ${JSON.stringify({ ok: true })}\n\n`);
}));

// --- Payment pages. These are opened in the customer's browser by the gateway, so they carry no sign-in. ---
const send = (res, r) => {
  if (r.redirect) return res.redirect(r.redirect);
  if (r.csp) res.setHeader('Content-Security-Policy', r.csp);
  res.status(r.status || 200).type('html').send(r.html);
};
customer.get('/payments/:id/pay', wrap(async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) throw notFound('Payment not found');
  send(res, await startPayment(req.params.id));
}));
customer.post('/payments/:id/simulate', express.urlencoded({ extended: false }), wrap(async (req, res) => {
  send(res, await simulate(req.params.id, req.body?.outcome === 'paid' ? 'paid' : 'failed'));
}));
customer.get('/payments/esewa/return', wrap(async (req, res) => send(res, await esewaReturn(String(req.query.data || '')))));
customer.get('/payments/esewa/failed/:id', wrap(async (req, res) => send(res, await esewaFailed(req.params.id))));
customer.get('/payments/fonepay/return', wrap(async (req, res) => send(res, await fonepayReturn(req.query))));
customer.get('/payments/nepalpay/return', wrap(async (req, res) => send(res, await nepalpayReturn(req.query))));

customer.use(authenticate);

// Where a payment stands. For eSewa this also asks eSewa again, so a customer whose browser never came back still gets their order.
customer.get('/payments/:id', wrap(async (req, res) => {
  const first = (await query('SELECT * FROM payments WHERE id=$1', [req.params.id])).rows[0];
  const mine = first && (first.user_id === req.user.id || req.user.role !== 'customer');
  if (!mine) throw notFound('Payment not found');
  const p = first.status === 'pending' ? await refreshPayment(first.id).catch(() => first) : first;
  const qr = p.status === 'pending' ? await qrFor(p) : null;
  res.json({ id: p.id, status: p.status, provider: p.provider, amount: p.amount, pay_url: p.status === 'pending' ? payUrl(p.id) : null, qr, expires_at: new Date(new Date(p.created_at).getTime() + 15 * 60_000).toISOString(), order: p.order_id ? await fullOrder(p.order_id, undefined, { reveal: p.user_id === req.user.id }) : null });
}));

// Test sites only: mark a payment paid or failed without a gateway.
customer.post('/payments/:id/confirm', wrap(async (req, res) => {
  const p = (await query('SELECT * FROM payments WHERE id=$1', [req.params.id])).rows[0];
  if (!p || (p.user_id !== req.user.id && req.user.role === 'customer')) throw notFound('Payment not found');
  if (!simulatorAllowed(p)) throw forbidden('Payments are confirmed by the gateway on a live site');
  const failed = req.body?.outcome === 'fail' || req.body?.outcome === 'failed';
  res.json(await confirmPayment(p.id, failed ? { outcome: 'failed', raw: { simulated: true } } : { ref: `TEST-${Date.now()}`, raw: { simulated: true } }));
}));

// A customer can stop an order that is still waiting for its online payment.
customer.post('/orders/:id/cancel', wrap(async (req, res) => {
  res.json(await cancelOrder(req.params.id, req.user, 'Cancelled before paying'));
}));

// Buy a 10-cup pass online. (Counters also sell them for cash.)
customer.post('/passes', requireRole('customer'), wrap(async (req, res) => {
  const b = z.object({ payment_method: z.enum(GATEWAYS) }).parse(req.body);
  res.status(201).json(await buyPass(req.user, b.payment_method));
}));

customer.post('/orders/quote', wrap(async (req, res) => {
  const b = orderSchema.parse(req.body);
  const q = await quote(pool, req.user, b);
  res.json({
    lines: q.lines.map((l) => ({ product_id: l.product_id, name: l.name, qty: l.qty, unit_price: l.unit_price, line_total: l.line_total, options: l.options })),
    subtotal: q.subtotal, discount: q.discount, discount_label: q.discount_label, total: q.total,
  });
}));

customer.post('/orders', wrap(async (req, res) => {
  const b = orderSchema.parse(req.body);
  const out = await createOrder(req.user, b);
  res.status(201).json(out);
}));

customer.get('/orders', wrap(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 30, 100);
  const { rows } = await query(
    `SELECT o.id, o.pickup_code, o.handover_code, o.status, o.total, o.discount, o.payment_method, o.payment_status, o.created_at, o.rating, s.name AS station_name,
            (SELECT string_agg(i.qty || '× ' || i.name, ', ') FROM order_items i WHERE i.order_id=o.id) AS summary
       FROM orders o JOIN stations s ON s.id=o.station_id WHERE o.user_id=$1 ORDER BY o.created_at DESC LIMIT $2`, [req.user.id, limit],
  );
  res.json(rows);
}));

customer.get('/orders/:id', wrap(async (req, res) => {
  const o = await fullOrder(req.params.id, undefined, { reveal: true });
  if (!o || (o.user_id !== req.user.id && req.user.role === 'customer')) throw notFound('Order not found');
  if (o.user_id !== req.user.id) delete o.handover_code;
  const ahead = ['placed', 'preparing'].includes(o.status) && !(o.scheduled_for && !o.released_at)
    ? (await query(`SELECT count(*)::int AS n FROM orders WHERE station_id=$1 AND status IN ('placed','preparing') AND (scheduled_for IS NULL OR released_at IS NOT NULL) AND created_at < $2`, [o.station_id, o.created_at])).rows[0].n
    : 0;
  const pay_url = o.status === 'awaiting_payment' && o.payment_id ? payUrl(o.payment_id) : null;
  res.json({ ...o, ahead, eta_seconds: (ahead + 1) * 90, pay_url });
}));


customer.post('/orders/:id/rate', wrap(async (req, res) => {
  const b = z.object({ rating: z.number().int().min(1).max(5), note: z.string().max(300).optional() }).parse(req.body);
  await rateOrder(req.params.id, req.user, b.rating, b.note);
  res.json({ ok: true });
}));

// Every pass has its own code. Passes are used one after another: started ones first, then the oldest waiting one.
customer.get('/passes', wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT id, code, total_cups, used_cups, total_cups - used_cups AS remaining, price_paid, status, purchased_at, expires_at, activated_at
       FROM passes WHERE user_id=$1 AND status <> 'pending' ORDER BY purchased_at DESC`, [req.user.id],
  );
  const now = new Date();
  const list = rows.map((p) => ({ ...p, status: p.status === 'active' && new Date(p.expires_at) < now ? 'expired' : p.status }));
  const queue = list.filter((p) => p.status === 'active' && p.remaining > 0)
    .sort((a, b) => (!a.activated_at - !b.activated_at) || (new Date(a.expires_at) - new Date(b.expires_at)) || (new Date(a.purchased_at) - new Date(b.purchased_at)));
  queue.forEach((p, i) => { p.queue_position = i + 1; p.state = i === 0 ? 'using' : 'next'; });
  for (const p of list) { if (!p.state) p.state = p.status === 'used' ? 'used' : p.status; p.starts_on_first_use = !p.activated_at && p.status === 'active'; }
  res.json(list.map((p) => ({ ...p, total_remaining: queue.reduce((a, q) => a + q.remaining, 0) })));
}));

customer.get('/coupons', wrap(async (req, res) => {
  await query(`UPDATE coupons SET status='expired' WHERE user_id=$1 AND status='active' AND expires_at < now()`, [req.user.id]);
  const { rows } = await query(
    `SELECT id, kind, title, pct, free_max, min_spend, max_discount, single_cup, status, expires_at, created_at FROM coupons WHERE user_id=$1
      ORDER BY (status='active') DESC, expires_at`, [req.user.id],
  );
  res.json(rows);
}));

customer.get('/referrals', wrap(async (req, res) => {
  const [uRes, rowsRes, monthRes, lifeRes, s] = await Promise.all([
    query('SELECT referral_code FROM users WHERE id=$1', [req.user.id]),
    query(`SELECT r.status, r.created_at, r.rewarded_at, r.qualifying_amount, u.name FROM referrals r JOIN users u ON u.id=r.referee_id WHERE r.referrer_id=$1 ORDER BY r.created_at DESC`, [req.user.id]),
    query(`SELECT count(*)::int AS n FROM referrals WHERE referrer_id=$1 AND status='rewarded' AND rewarded_at >= date_trunc('month', now())`, [req.user.id]),
    query(`SELECT count(*)::int AS n FROM referrals WHERE referrer_id=$1 AND status='rewarded'`, [req.user.id]),
    getSettings(),
  ]);
  const u = uRes.rows[0];
  res.json({
    code: u?.referral_code || '',
    friends: rowsRes.rows,
    rewarded_this_month: monthRes.rows[0].n,
    rewarded_lifetime: lifeRes.rows[0].n,
    cap: Number(s.referral_cap_month) || 5,
    lifetime_cap: Number(s.referral_lifetime_cap) || 25,
    enabled: !!Number(s.referral_enabled),
    min_spend: Number(s.referral_min_spend) || 180,
    cup_max: Number(s.referral_cup_max) || 180,
    reward_pct: Number(s.referral_reward_pct) || 50,
  });
}));

customer.get('/notifications', wrap(async (req, res) => {
  const { rows } = await query('SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50', [req.user.id]);
  res.json({ items: rows, unread: rows.filter((n) => !n.read).length });
}));
customer.post('/notifications/read', wrap(async (req, res) => {
  await query('UPDATE notifications SET read=true WHERE user_id=$1', [req.user.id]);
  res.json({ ok: true });
}));

