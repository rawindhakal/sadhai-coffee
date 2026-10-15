import { Router } from 'express';
import { z } from 'zod';
import { query } from '../lib/db.js';
import { wrap, bad, notFound, forbidden, HttpError } from '../lib/http.js';
import { authenticate, requireRole, verifyAccess } from '../lib/auth.js';
import { subscribe } from '../lib/hub.js';
import { createOrder, quote, fullOrder, cancelOrder, rateOrder, confirmPayment, buyPass } from '../lib/orders.js';
import { config } from '../lib/config.js';
import { verifyEsewa, lookupKhalti, verifyWebhookSignature, esewaFields } from '../lib/payments.js';
import { pool } from '../lib/db.js';

export const customer = Router();

const itemSchema = z.object({ product_id: z.string().uuid(), qty: z.number().int().min(1).max(10).default(1), option_ids: z.array(z.string().uuid()).default([]) });
const orderSchema = z.object({
  station_id: z.string().uuid(),
  items: z.array(itemSchema).min(1).max(20),
  payment_method: z.enum(['cash', 'esewa', 'khalti', 'fonepay', 'pass']),
  coupon_id: z.string().uuid().optional().nullable(),
  promo_code: z.string().trim().max(30).optional().nullable(),
  note: z.string().max(200).optional(),
  channel: z.enum(['app', 'qr', 'web']).default('app'),
  scheduled_for: z.string().datetime().optional(),
});

// Auto-submitting eSewa form, so native apps can hand the customer to eSewa in a browser.
customer.get('/payments/esewa/start', wrap(async (req, res) => {
  const { rows } = await query(`SELECT * FROM payments WHERE id=$1 AND provider='esewa' AND status='pending'`, [req.query.payment_id]);
  if (!rows[0]) throw notFound('Payment not found');
  const inputs = Object.entries(esewaFields(rows[0])).map(([k, v]) => `<input type="hidden" name="${k}" value="${String(v).replace(/"/g, '&quot;')}">`).join('');
  res.setHeader('Content-Security-Policy', "default-src 'none'; form-action *; script-src 'unsafe-inline'");
  res.send(`<!doctype html><meta name="viewport" content="width=device-width"><body style="font-family:sans-serif;padding:24px">Opening eSewa…<form id="f" method="POST" action="${config.esewa.formUrl}">${inputs}</form><script>document.getElementById('f').submit()</script>`);
}));

// --- Provider callbacks (no bearer token: the provider's browser redirect / signed webhook) ---
customer.get('/payments/esewa/callback', wrap(async (req, res) => {
  try {
    const v = await verifyEsewa(String(req.query.data || ''));
    await confirmPayment(v.paymentId, { ref: v.ref, raw: v.raw });
    const { rows } = await query('SELECT order_id, pass_id FROM payments WHERE id=$1', [v.paymentId]);
    res.redirect(`${config.webUrl}${rows[0]?.order_id ? `/order/${rows[0].order_id}` : '/account'}`);
  } catch { res.redirect(`${config.webUrl}/order?payment=failed`); }
}));
customer.get('/payments/khalti/callback', wrap(async (req, res) => {
  try {
    const { rows } = await query(`SELECT * FROM payments WHERE id=$1 AND provider='khalti' AND provider_ref=$2`, [req.query.payment_id, req.query.pidx]);
    if (!rows[0]) throw bad('Unknown payment');
    const v = await lookupKhalti(String(req.query.pidx));
    if (v.amount !== rows[0].amount) throw bad('Amount mismatch');
    await confirmPayment(rows[0].id, { ref: v.ref, raw: v.raw });
    res.redirect(`${config.webUrl}${rows[0].order_id ? `/order/${rows[0].order_id}` : '/account'}`);
  } catch { res.redirect(`${config.webUrl}/order?payment=failed`); }
}));
customer.post('/payments/webhook/fonepay', wrap(async (req, res) => {
  if (!verifyWebhookSignature(req.body, req.headers['x-signature'])) throw new HttpError(401, 'Bad signature');
  const r = await confirmPayment(req.body.payment_id, { ref: req.body.provider_ref, raw: req.body, outcome: req.body.status === 'success' ? 'paid' : 'failed' });
  res.json({ ok: true, already: !!r.already });
}));

// SSE: EventSource cannot send headers, so accept ?access_token=
customer.get('/events', wrap(async (req, res) => {
  const claims = verifyAccess(String(req.query.access_token || ''));
  const { rows } = await query('SELECT id, role, station_id FROM users WHERE id=$1 AND active', [claims.sub]);
  const u = rows[0];
  if (!u) throw new HttpError(401, 'Sign in again');
  const chans = [`user:${u.id}`];
  if (u.role === 'station' && u.station_id) chans.push(`station:${u.station_id}`);
  if (u.role === 'manager') (await query('SELECT station_id FROM station_managers WHERE user_id=$1', [u.id])).rows.forEach((r) => chans.push(`station:${r.station_id}`));
  if (u.role === 'owner') (await query('SELECT id FROM stations WHERE active')).rows.forEach((r) => chans.push(`station:${r.id}`));
  subscribe(res, chans);
  res.write(`event: hello\ndata: ${JSON.stringify({ ok: true })}\n\n`);
}));

customer.use(authenticate);

customer.post('/payments/:id/confirm', wrap(async (req, res) => {
  if (config.paymentMode !== 'sandbox') throw forbidden('Payments are confirmed by the provider');
  const { rows } = await query('SELECT * FROM payments WHERE id=$1', [req.params.id]);
  const p = rows[0];
  if (!p || (p.user_id !== req.user.id && req.user.role === 'customer')) throw notFound('Payment not found');
  const outcome = req.body?.outcome === 'fail' ? 'failed' : 'paid';
  const r = await confirmPayment(p.id, { ref: `SANDBOX-${Date.now()}`, raw: { sandbox: true }, outcome });
  res.json({ ok: true, status: r.failed ? 'failed' : 'paid', order: p.order_id ? await fullOrder(p.order_id) : null });
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
    `SELECT o.id, o.pickup_code, o.status, o.total, o.discount, o.payment_method, o.payment_status, o.created_at, o.rating, s.name AS station_name,
            (SELECT string_agg(i.qty || '× ' || i.name, ', ') FROM order_items i WHERE i.order_id=o.id) AS summary
       FROM orders o JOIN stations s ON s.id=o.station_id WHERE o.user_id=$1 ORDER BY o.created_at DESC LIMIT $2`, [req.user.id, limit],
  );
  res.json(rows);
}));

customer.get('/orders/:id', wrap(async (req, res) => {
  const o = await fullOrder(req.params.id);
  if (!o || (o.user_id !== req.user.id && req.user.role === 'customer')) throw notFound('Order not found');
  const ahead = ['placed', 'preparing'].includes(o.status)
    ? (await query(`SELECT count(*)::int AS n FROM orders WHERE station_id=$1 AND status IN ('placed','preparing') AND created_at < $2`, [o.station_id, o.created_at])).rows[0].n
    : 0;
  res.json({ ...o, ahead, eta_seconds: (ahead + 1) * 90 });
}));

customer.post('/orders/:id/cancel', wrap(async (req, res) => {
  res.json(await cancelOrder(req.params.id, req.user, req.body?.reason || 'Cancelled by customer'));
}));

customer.post('/orders/:id/rate', wrap(async (req, res) => {
  const b = z.object({ rating: z.number().int().min(1).max(5), note: z.string().max(300).optional() }).parse(req.body);
  await rateOrder(req.params.id, req.user, b.rating, b.note);
  res.json({ ok: true });
}));

customer.get('/passes', wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT id, total_cups, used_cups, total_cups - used_cups AS remaining, price_paid, status, purchased_at, expires_at
       FROM passes WHERE user_id=$1 AND status <> 'pending' ORDER BY purchased_at DESC`, [req.user.id],
  );
  const now = new Date();
  res.json(rows.map((p) => ({ ...p, status: p.status === 'active' && new Date(p.expires_at) < now ? 'expired' : p.status })));
}));

customer.post('/passes', requireRole('customer'), wrap(async (req, res) => {
  const b = z.object({ payment_method: z.enum(['esewa', 'khalti', 'fonepay', 'cash']) }).parse(req.body);
  res.status(201).json(await buyPass(req.user, b.payment_method));
}));

customer.get('/coupons', wrap(async (req, res) => {
  await query(`UPDATE coupons SET status='expired' WHERE user_id=$1 AND status='active' AND expires_at < now()`, [req.user.id]);
  const { rows } = await query(
    `SELECT id, kind, title, pct, free_max, status, expires_at, created_at FROM coupons WHERE user_id=$1
      ORDER BY (status='active') DESC, expires_at`, [req.user.id],
  );
  res.json(rows);
}));

customer.get('/referrals', wrap(async (req, res) => {
  const u = (await query('SELECT referral_code FROM users WHERE id=$1', [req.user.id])).rows[0];
  const { rows } = await query(
    `SELECT r.status, r.created_at, u.name FROM referrals r JOIN users u ON u.id=r.referee_id WHERE r.referrer_id=$1 ORDER BY r.created_at DESC`, [req.user.id],
  );
  const month = (await query(`SELECT count(*)::int AS n FROM referrals WHERE referrer_id=$1 AND status='rewarded' AND rewarded_at >= date_trunc('month', now())`, [req.user.id])).rows[0].n;
  res.json({ code: u.referral_code, friends: rows, rewarded_this_month: month, cap: 3 });
}));

customer.get('/notifications', wrap(async (req, res) => {
  const { rows } = await query('SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50', [req.user.id]);
  res.json({ items: rows, unread: rows.filter((n) => !n.read).length });
}));
customer.post('/notifications/read', wrap(async (req, res) => {
  await query('UPDATE notifications SET read=true WHERE user_id=$1', [req.user.id]);
  res.json({ ok: true });
}));
