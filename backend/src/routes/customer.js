import { Router } from 'express';
import { z } from 'zod';
import { query } from '../lib/db.js';
import { wrap, bad, notFound, forbidden, HttpError } from '../lib/http.js';
import { authenticate, requireRole, verifyAccess } from '../lib/auth.js';
import { subscribe } from '../lib/hub.js';
import { createOrder, quote, fullOrder, cancelOrder, rateOrder, confirmPayment, buyPass } from '../lib/orders.js';
import { getSettings } from '../lib/settings.js';
import { rt } from '../lib/runtime.js';
import { verifyWebhookSignature, checkPaymentStatus, verifyEsewa, checkKhalti, verifyFonepayCallback, esewaFields, esewaFormUrl, fonepayPgFields, providerMode, ONLINE_PROVIDERS } from '../lib/payments.js';
import { pool } from '../lib/db.js';

export const customer = Router();

const itemSchema = z.object({ product_id: z.string().uuid(), qty: z.number().int().min(1).max(10).default(1), option_ids: z.array(z.string().uuid()).default([]) });
const orderSchema = z.object({
  station_id: z.string().uuid(),
  items: z.array(itemSchema).min(1).max(20),
  payment_method: z.enum(['cash', 'fonepay', 'esewa', 'khalti', 'pass']),
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

// --- Signed webhooks for Fonepay, eSewa, and Khalti (no bearer token) ---
customer.post('/payments/webhook/:provider', wrap(async (req, res) => {
  const provider = req.params.provider;
  if (!ONLINE_PROVIDERS.includes(provider)) throw bad('Unknown payment provider');
  if (!verifyWebhookSignature(req.body, req.headers['x-signature'], provider)) throw new HttpError(401, 'Bad signature');
  const paymentId = req.body.payment_id || req.body.transaction_uuid || req.body.purchase_order_id;
  if (!paymentId) throw bad('Missing payment_id');
  const statusStr = String(req.body.status || '').toLowerCase();
  const outcome = ['success', 'paid', 'complete', 'completed'].includes(statusStr) ? 'paid' : 'failed';
  const ref = req.body.provider_ref || req.body.transaction_code || req.body.pidx || `${provider.toUpperCase()}-WH`;
  const r = await confirmPayment(paymentId, { ref, raw: req.body, outcome });
  res.json({ ok: true, already: !!r.already });
}));

// Auto-submitting HTML form for eSewa ePay v2 (developer.esewa.com.np) when opened on a customer's phone or browser
customer.get('/payments/esewa/start', wrap(async (req, res) => {
  const pid = String(req.query.payment_id || '');
  const { rows } = await query('SELECT * FROM payments WHERE id=$1 AND provider=$2', [pid, 'esewa']);
  const p = rows[0];
  if (!p) throw notFound('eSewa payment not found');
  const form = p.raw?.epay_form || p.raw?.fields || esewaFields(p);
  const action = p.raw?.epay_action || esewaFormUrl();
  const inputs = Object.entries(form)
    .map(([k, v]) => `<input type="hidden" name="${k.replace(/"/g, '&quot;')}" value="${String(v ?? '').replace(/"/g, '&quot;')}" />`)
    .join('\n');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Redirecting to eSewa…</title></head>
    <body style="font-family:system-ui,sans-serif;background:#1A1410;color:#FAF6F0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
      <div style="text-align:center;padding:24px;max-width:360px">
        <div style="display:inline-block;background:#41A124;color:#fff;font-weight:700;padding:6px 16px;border-radius:99px;margin-bottom:14px">eSewa ePay v2</div>
        <p style="font-size:18px;font-weight:700;margin:0 0 6px">Connecting to eSewa…</p>
        <p style="font-size:14px;opacity:0.75;margin:0 0 18px">NPR ${p.amount} · Sadhai Coffee</p>
        <form id="esewaForm" method="POST" action="${action}">
          ${inputs}
          <noscript><button type="submit" style="background:#41A124;color:#fff;border:0;padding:12px 24px;border-radius:8px;font-weight:700">Continue to eSewa</button></noscript>
        </form>
      </div>
      <script>document.getElementById('esewaForm').submit();</script>
    </body></html>`);
}));

// eSewa callback after customer completes or cancels payment in browser/app
customer.get('/payments/esewa/callback', wrap(async (req, res) => {
  // Note: eSewa sometimes appends ?data=... using a second '?' if success_url already has query params
  let pid = String(req.query.payment_id || '');
  let dataB64 = String(req.query.data || '');
  if (pid.includes('?data=')) {
    const parts = pid.split('?data=');
    pid = parts[0];
    dataB64 = dataB64 || parts[1];
  }
  const outcomeParam = String(req.query.outcome || '').split('?')[0];
  const { rows } = await query('SELECT * FROM payments WHERE id=$1', [pid]);
  const p = rows[0];
  const baseUrl = (rt('public_web_url') || 'https://sadhaicoffee.com').replace(/\/$/, '');
  if (!p) return res.redirect(`${baseUrl}/orders`);
  if (outcomeParam === 'failed') {
    if (p.status === 'pending') await confirmPayment(p.id, { raw: { ...(p.raw || {}), callback: 'failed' }, outcome: 'failed' });
  } else if (p.status === 'pending') {
    try {
      const c = await verifyEsewa(p, dataB64 || undefined);
      if (c.paid) await confirmPayment(p.id, { ref: c.ref, raw: { ...(p.raw || {}), ...c.raw }, outcome: 'paid' });
      else if (c.failed) await confirmPayment(p.id, { raw: { ...(p.raw || {}), ...c.raw }, outcome: 'failed' });
    } catch { /* poll will retry */ }
  }
  return res.redirect(p.order_id ? `${baseUrl}/order/${p.order_id}` : `${baseUrl}/account`);
}));

// Khalti start redirect (redirects to Khalti payment_url or shows sandbox simulator if in sandbox without key)
customer.get('/payments/khalti/start', wrap(async (req, res) => {
  const pid = String(req.query.payment_id || '');
  const { rows } = await query('SELECT * FROM payments WHERE id=$1 AND provider=$2', [pid, 'khalti']);
  const p = rows[0];
  if (!p) throw notFound('Khalti payment not found');
  if (p.raw?.pay_url && !String(p.raw.pay_url).includes('/payments/khalti/start')) {
    return res.redirect(p.raw.pay_url);
  }
  const apiUrl = rt('public_api_url').replace(/\/$/, '');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Khalti Sandbox Checkout</title></head>
    <body style="font-family:system-ui,sans-serif;background:#1A1410;color:#FAF6F0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
      <div style="text-align:center;padding:28px;max-width:380px;background:#261E18;border-radius:16px;border:1px solid rgba(255,255,255,0.12)">
        <div style="display:inline-block;background:#5C2D91;color:#fff;font-weight:700;padding:6px 16px;border-radius:99px;margin-bottom:12px">Khalti KPG-2 Sandbox</div>
        <h2 style="margin:0 0 8px">NPR ${p.amount}</h2>
        <p style="font-size:14px;opacity:0.75;margin:0 0 20px">Sadhai Coffee · Ref ${p.provider_ref || p.id.slice(0, 8)}</p>
        <div style="display:flex;gap:10px;justify-content:center">
          <a href="${apiUrl}/payments/khalti/callback?payment_id=${p.id}&status=Completed&transaction_id=KHLTEST${Date.now()}" style="background:#5C2D91;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:700">Simulate Paid</a>
          <a href="${apiUrl}/payments/khalti/callback?payment_id=${p.id}&status=User+canceled" style="background:transparent;color:#FAF6F0;border:1px solid rgba(255,255,255,0.25);text-decoration:none;padding:12px 20px;border-radius:10px">Cancel</a>
        </div>
      </div>
    </body></html>`);
}));

// Khalti callback after customer completes or cancels payment in browser/app
customer.get('/payments/khalti/callback', wrap(async (req, res) => {
  const pid = String(req.query.payment_id || req.query.purchase_order_id || '');
  const pidx = String(req.query.pidx || '');
  const qStatus = String(req.query.status || '');
  const { rows } = await query('SELECT * FROM payments WHERE id=$1 OR provider_ref=$2', [pid || null, pid || pidx || null]);
  const p = rows[0];
  const baseUrl = (rt('public_web_url') || 'https://sadhaicoffee.com').replace(/\/$/, '');
  if (!p) return res.redirect(`${baseUrl}/orders`);
  if (p.status === 'pending') {
    if (p.raw?.sandbox && !rt('khalti_secret_key')) {
      if (qStatus === 'Completed') {
        await confirmPayment(p.id, { ref: String(req.query.transaction_id || `KHL-SBX-${Date.now()}`), raw: { ...(p.raw || {}), callback: req.query }, outcome: 'paid' });
      } else if (['User canceled', 'Expired'].includes(qStatus)) {
        await confirmPayment(p.id, { raw: { ...(p.raw || {}), callback: req.query }, outcome: 'failed' });
      }
    } else {
      try {
        const c = await checkKhalti(p, pidx || undefined);
        if (c.paid) await confirmPayment(p.id, { ref: c.ref, raw: { ...(p.raw || {}), ...c.raw }, outcome: 'paid' });
        else if (c.failed) await confirmPayment(p.id, { raw: { ...(p.raw || {}), ...c.raw }, outcome: 'failed' });
      } catch { /* poll will retry */ }
    }
  }
  return res.redirect(p.order_id ? `${baseUrl}/order/${p.order_id}` : `${baseUrl}/account`);
}));

// Fonepay Web / Flutter PG start redirect (compatible with iamnabink/fonepay_flutter)
customer.get('/payments/fonepay/start', wrap(async (req, res) => {
  const pid = String(req.query.payment_id || '');
  const { rows } = await query('SELECT * FROM payments WHERE id=$1 AND provider=$2', [pid, 'fonepay']);
  const p = rows[0];
  if (!p) throw notFound('Fonepay payment not found');
  const cfg = p.raw?.fonepay_config || fonepayPgFields(p);
  const { pg_url, ...params } = cfg;
  const qs = new URLSearchParams(params).toString();
  return res.redirect(`${pg_url || 'https://dev-clientapi.fonepay.com/api/merchantRequest'}?${qs}`);
}));

// Fonepay Web / Flutter PG callback
customer.get('/payments/fonepay/callback', wrap(async (req, res) => {
  const pid = String(req.query.payment_id || '');
  const prn = String(req.query.PRN || '');
  const { rows } = await query('SELECT * FROM payments WHERE id=$1 OR provider_ref=$2', [pid || null, prn || null]);
  const p = rows[0];
  const baseUrl = (rt('public_web_url') || 'https://sadhaicoffee.com').replace(/\/$/, '');
  if (!p) return res.redirect(`${baseUrl}/orders`);
  if (p.status === 'pending') {
    try {
      const c = verifyFonepayCallback(req.query, p.amount);
      if (c.paid) await confirmPayment(p.id, { ref: c.ref, raw: { ...(p.raw || {}), callback: c.raw }, outcome: 'paid' });
      else if (c.failed) await confirmPayment(p.id, { raw: { ...(p.raw || {}), callback: c.raw }, outcome: 'failed' });
    } catch { /* poll will retry */ }
  }
  return res.redirect(p.order_id ? `${baseUrl}/order/${p.order_id}` : `${baseUrl}/account`);
}));

// SSE: EventSource cannot send headers, so accept ?access_token=
customer.get('/events', wrap(async (req, res) => {
  const claims = verifyAccess(String(req.query.access_token || ''));
  const { rows } = await query('SELECT id, role, station_id FROM users WHERE id=$1 AND active', [claims.sub]);
  const u = rows[0];
  if (!u) throw new HttpError(401, 'Sign in again');
  const chans = [`user:${u.id}`];
  if (u.role === 'station' && u.station_id) chans.push(`station:${u.station_id}`);
  if (u.role === 'manager' || u.role === 'partner') (await query('SELECT station_id FROM station_managers WHERE user_id=$1', [u.id])).rows.forEach((r) => chans.push(`station:${r.station_id}`));
  if (u.role === 'owner') (await query('SELECT id FROM stations WHERE active')).rows.forEach((r) => chans.push(`station:${r.id}`));
  subscribe(res, chans);
  res.write(`event: hello\ndata: ${JSON.stringify({ ok: true })}\n\n`);
}));

customer.use(authenticate);

// Status of a payment. While it is pending, this polls Fonepay, eSewa, or Khalti and confirms the order if paid.
customer.get('/payments/:id', wrap(async (req, res) => {
  const { rows } = await query('SELECT * FROM payments WHERE id=$1', [req.params.id]);
  let p = rows[0];
  const mine = p && (p.user_id === req.user.id || req.user.role !== 'customer');
  if (!mine) throw notFound('Payment not found');
  const pMode = providerMode(p.provider);
  const canPoll = pMode === 'live' || p.provider === 'esewa' || (p.provider === 'khalti' && !!p.raw?.pidx);
  if (p.status === 'pending' && ONLINE_PROVIDERS.includes(p.provider) && canPoll) {
    try {
      const c = await checkPaymentStatus(p);
      if (c.paid) await confirmPayment(p.id, { ref: c.ref, raw: { ...(p.raw || {}), ...c.raw } });
      else if (c.failed) await confirmPayment(p.id, { raw: { ...(p.raw || {}), ...c.raw }, outcome: 'failed' });
    } catch { /* still waiting; the customer can try again */ }
    p = (await query('SELECT * FROM payments WHERE id=$1', [p.id])).rows[0];
  }
  res.json({
    id: p.id,
    payment_id: p.id,
    status: p.status,
    amount: p.amount,
    provider: p.provider,
    mode: p.raw?.sandbox || pMode === 'sandbox' ? 'sandbox' : 'qr',
    qr_message: p.raw?.qr_message || null,
    pay_url: p.raw?.pay_url || null,
    payment_url: p.raw?.pay_url || null,
    fonepay_config: p.raw?.fonepay_config || null,
    order: p.order_id ? await fullOrder(p.order_id) : null,
  });
}));

customer.post('/payments/:id/confirm', wrap(async (req, res) => {
  const { rows } = await query('SELECT * FROM payments WHERE id=$1', [req.params.id]);
  const p = rows[0];
  if (!p || (p.user_id !== req.user.id && req.user.role === 'customer')) throw notFound('Payment not found');
  if (providerMode(p.provider) !== 'sandbox' && !p.raw?.sandbox) {
    throw forbidden('Payments in live mode are confirmed only by the payment gateway');
  }
  const outcome = req.body?.outcome === 'fail' ? 'failed' : 'paid';
  const r = await confirmPayment(p.id, { ref: `SANDBOX-${Date.now()}`, raw: { ...(p.raw || {}), sandbox: true }, outcome });
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

customer.post('/passes', requireRole('customer'), wrap(async (req, res) => {
  const b = z.object({ payment_method: z.enum(['fonepay', 'esewa', 'khalti', 'cash']).default('fonepay') }).parse(req.body);
  res.status(201).json(await buyPass(req.user, b.payment_method));
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
    query('SELECT referral_code, phone_verified FROM users WHERE id=$1', [req.user.id]),
    query(`SELECT r.status, r.created_at, r.rewarded_at, r.qualifying_amount, u.name FROM referrals r JOIN users u ON u.id=r.referee_id WHERE r.referrer_id=$1 ORDER BY r.created_at DESC`, [req.user.id]),
    query(`SELECT count(*)::int AS n FROM referrals WHERE referrer_id=$1 AND status='rewarded' AND rewarded_at >= date_trunc('month', now())`, [req.user.id]),
    query(`SELECT count(*)::int AS n FROM referrals WHERE referrer_id=$1 AND status='rewarded'`, [req.user.id]),
    getSettings(),
  ]);
  const u = uRes.rows[0];
  res.json({
    code: u?.referral_code || '',
    phone_verified: !!u?.phone_verified,
    friends: rowsRes.rows,
    rewarded_this_month: monthRes.rows[0].n,
    rewarded_lifetime: lifeRes.rows[0].n,
    cap: Number(s.referral_cap_month) || 5,
    lifetime_cap: Number(s.referral_lifetime_cap) || 25,
    enabled: !!Number(s.referral_enabled),
    min_spend: Number(s.referral_min_spend) || 180,
    cup_max: Number(s.referral_cup_max) || 180,
    reward_pct: Number(s.referral_reward_pct) || 50,
    require_verified_phone: !!Number(s.offer_require_verified_phone),
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

