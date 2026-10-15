import { Router } from 'express';
import { z } from 'zod';
import { query } from '../lib/db.js';
import { wrap, bad, notFound, conflict, normalizePhone, forbidden } from '../lib/http.js';
import { authenticate, requireRole, assertStationAccess } from '../lib/auth.js';
import { createOrder, advanceOrder, fullOrder, stationMenu, buyPass } from '../lib/orders.js';
import { audit, notify } from '../lib/notify.js';
import { publish } from '../lib/hub.js';

export const station = Router();
station.use(authenticate, requireRole('station', 'manager', 'owner'));

// Station staff are pinned to their station; managers/owners pass ?station_id=
export async function sid(req) {
  const id = req.user.role === 'station' ? req.user.station_id : req.query.station_id || req.body?.station_id;
  if (!id) throw bad('station_id is required');
  await assertStationAccess(req.user, id);
  return id;
}

export async function adjustInventory(stationId, ingredientId, { delta, qty, reason }, userId) {
  const cur = (await query('SELECT qty FROM station_inventory WHERE station_id=$1 AND ingredient_id=$2', [stationId, ingredientId])).rows[0];
  if (!cur && qty == null && delta == null) throw notFound('Ingredient not tracked here');
  const next = qty != null ? qty : (cur?.qty ?? 0) + delta;
  if (next < 0) throw bad('Stock cannot go below zero');
  await query(
    `INSERT INTO station_inventory(station_id, ingredient_id, qty) VALUES ($1,$2,$3)
     ON CONFLICT (station_id, ingredient_id) DO UPDATE SET qty=$3, updated_at=now()`, [stationId, ingredientId, next],
  );
  await query(`INSERT INTO inventory_moves(station_id, ingredient_id, delta, reason, created_by) VALUES ($1,$2,$3,$4,$5)`,
    [stationId, ingredientId, next - (cur?.qty ?? 0), reason, userId]);
  publish(`station:${stationId}`, 'stock', { ingredient_id: ingredientId, qty: next });
  return next;
}

export const inventoryFor = async (stationId) =>
  (await query(
    `SELECT i.id, i.name, i.unit, si.qty, si.reorder_level, (si.qty <= si.reorder_level) AS low
       FROM station_inventory si JOIN ingredients i ON i.id=si.ingredient_id WHERE si.station_id=$1 ORDER BY low DESC, i.name`, [stationId],
  )).rows;

station.get('/orders', wrap(async (req, res) => {
  const id = await sid(req);
  const done = req.query.view === 'done';
  const { rows } = await query(
    `SELECT o.id FROM orders o WHERE o.station_id=$1 AND ${done
      ? `o.status IN ('picked_up','cancelled') AND o.created_at >= ((now() AT TIME ZONE 'Asia/Kathmandu')::date::timestamp AT TIME ZONE 'Asia/Kathmandu') ORDER BY o.created_at DESC LIMIT 40`
      : `o.status IN ('placed','preparing','ready') ORDER BY o.created_at`}`, [id],
  );
  const orders = await Promise.all(rows.map((r) => fullOrder(r.id)));
  res.json(orders);
}));

station.get('/orders/lookup', wrap(async (req, res) => {
  const id = await sid(req);
  const { rows } = await query(
    `SELECT o.id FROM orders o WHERE o.station_id=$1 AND upper(o.pickup_code)=upper($2)
      ORDER BY o.created_at DESC LIMIT 1`, [id, String(req.query.code || '')],
  );
  if (!rows[0]) throw notFound('No order with that number today');
  res.json(await fullOrder(rows[0].id));
}));

station.post('/orders/:id/status', wrap(async (req, res) => {
  const { status } = z.object({ status: z.enum(['preparing', 'ready', 'picked_up', 'cancelled']) }).parse(req.body);
  const o = (await query('SELECT station_id FROM orders WHERE id=$1', [req.params.id])).rows[0];
  if (!o) throw notFound('Order not found');
  await assertStationAccess(req.user, o.station_id);
  res.json(await advanceOrder(req.params.id, status, req.user));
}));

// Walk-in / counter order. Optional customer phone links offers, pass and beans.
station.post('/orders', wrap(async (req, res) => {
  const stationId = await sid(req);
  const b = z.object({
    items: z.array(z.object({ product_id: z.string().uuid(), qty: z.number().int().min(1).max(10).default(1), option_ids: z.array(z.string().uuid()).default([]) })).min(1),
    payment_method: z.enum(['cash', 'esewa', 'khalti', 'fonepay', 'pass']).default('cash'),
    customer_phone: z.string().optional(), customer_name: z.string().max(40).optional(),
    coupon_id: z.string().uuid().optional(), promo_code: z.string().optional(), note: z.string().max(200).optional(),
  }).parse(req.body);
  let customer = null;
  if (b.customer_phone) {
    customer = (await query('SELECT id, name, phone FROM users WHERE phone=$1 AND role=$2 AND active', [normalizePhone(b.customer_phone), 'customer'])).rows[0];
    if (!customer) throw notFound('No Sadhai account with that number');
  }
  const out = await createOrder(customer, { ...b, station_id: stationId, channel: 'counter', paid_now: true, customer_name: b.customer_name || customer?.name });
  res.status(201).json(out);
}));

station.post('/orders/:id/pay', wrap(async (req, res) => {
  const o = (await query('SELECT station_id, payment_status, total, status FROM orders WHERE id=$1', [req.params.id])).rows[0];
  if (!o) throw notFound('Order not found');
  await assertStationAccess(req.user, o.station_id);
  if (o.status === 'cancelled') throw conflict('This order is cancelled');
  await query(`UPDATE orders SET payment_status='paid' WHERE id=$1 AND payment_status='unpaid'`, [req.params.id]);
  await query(`UPDATE payments SET status='paid', settled_at=now() WHERE order_id=$1 AND status='pending'`, [req.params.id]);
  await audit(req.user.id, 'order.cash_collected', 'order', req.params.id);
  res.json(await fullOrder(req.params.id));
}));

station.get('/customers/lookup', wrap(async (req, res) => {
  await sid(req);
  const phone = normalizePhone(req.query.phone);
  const u = (await query(`SELECT id, name, phone, beans FROM users WHERE phone=$1 AND role='customer' AND active`, [phone])).rows[0];
  if (!u) throw notFound('No Sadhai account with that number');
  const pass = (await query(`SELECT id, total_cups - used_cups AS remaining, expires_at FROM passes WHERE user_id=$1 AND status='active' AND expires_at > now() AND used_cups < total_cups ORDER BY expires_at LIMIT 1`, [u.id])).rows[0] || null;
  const coupons = (await query(`SELECT id, kind, title, pct, free_max, expires_at FROM coupons WHERE user_id=$1 AND status='active' AND expires_at > now() ORDER BY expires_at`, [u.id])).rows;
  res.json({ ...u, pass, coupons });
}));

station.post('/passes', wrap(async (req, res) => {
  const stationId = await sid(req);
  const { phone } = z.object({ phone: z.string() }).parse(req.body);
  const u = (await query(`SELECT * FROM users WHERE phone=$1 AND role='customer' AND active`, [normalizePhone(phone)])).rows[0];
  if (!u) throw notFound('No Sadhai account with that number');
  const out = await buyPass(u, 'cash', { stationId, soldBy: req.user.id });
  res.status(201).json(out.pass);
}));

station.get('/summary', wrap(async (req, res) => {
  const id = await sid(req);
  const today = `o.created_at >= ((now() AT TIME ZONE 'Asia/Kathmandu')::date::timestamp AT TIME ZONE 'Asia/Kathmandu')`;
  const [t, q, c, st] = await Promise.all([
    query(`SELECT count(*)::int AS orders, COALESCE(sum(o.total),0)::int AS revenue,
                  COALESCE(sum((SELECT sum(i.qty) FROM order_items i JOIN products pk ON pk.id=i.product_id WHERE i.order_id=o.id AND pk.kind='drink')),0)::int AS cups,
                  COALESCE(avg(extract(epoch FROM (o.ready_at - COALESCE(o.accepted_at,o.created_at)))),0)::int AS avg_make_seconds
             FROM orders o WHERE o.station_id=$1 AND ${today} AND o.status NOT IN ('cancelled','awaiting_payment')`, [id]),
    query(`SELECT count(*) FILTER (WHERE status='placed')::int AS waiting, count(*) FILTER (WHERE status='preparing')::int AS making,
                  count(*) FILTER (WHERE status='ready')::int AS ready FROM orders WHERE station_id=$1 AND status IN ('placed','preparing','ready')`, [id]),
    query(`SELECT COALESCE(sum(p.amount),0)::int AS cash FROM payments p WHERE p.station_id=$1 AND p.provider='cash' AND p.status='paid'
             AND p.settled_at >= ((now() AT TIME ZONE 'Asia/Kathmandu')::date::timestamp AT TIME ZONE 'Asia/Kathmandu')`, [id]),
    query(`SELECT id, name, code, is_open, accepting_orders, breakeven_cups, prep_target_seconds FROM stations WHERE id=$1`, [id]),
  ]);
  const closed = (await query(`SELECT * FROM cash_closes WHERE station_id=$1 AND business_date=(now() AT TIME ZONE 'Asia/Kathmandu')::date`, [id])).rows[0] || null;
  res.json({ station: st.rows[0], today: t.rows[0], queue: q.rows[0], expected_cash: c.rows[0].cash, cash_close: closed });
}));

station.get('/menu', wrap(async (req, res) => res.json(await stationMenu(await sid(req)))));

station.post('/products/:productId/availability', wrap(async (req, res) => {
  const id = await sid(req);
  const { available } = z.object({ available: z.boolean() }).parse(req.body);
  await query(
    `INSERT INTO station_products(station_id, product_id, available) VALUES ($1,$2,$3)
     ON CONFLICT (station_id, product_id) DO UPDATE SET available=$3`, [id, req.params.productId, available],
  );
  await audit(req.user.id, available ? 'menu.available' : 'menu.sold_out', 'product', req.params.productId, { station_id: id });
  res.json({ ok: true });
}));

station.get('/inventory', wrap(async (req, res) => res.json(await inventoryFor(await sid(req)))));
station.post('/inventory/:ingredientId', wrap(async (req, res) => {
  const id = await sid(req);
  const b = z.object({ delta: z.number().optional(), qty: z.number().min(0).optional(), reason: z.enum(['restock', 'waste', 'adjust']) }).parse(req.body);
  if (b.delta == null && b.qty == null) throw bad('Provide delta or qty');
  if (req.user.role === 'station' && b.reason === 'adjust') throw forbidden('Only a manager can set a stock count');
  res.json({ qty: await adjustInventory(id, req.params.ingredientId, b, req.user.id) });
}));

station.patch('/', wrap(async (req, res) => {
  const id = await sid(req);
  const b = z.object({ is_open: z.boolean().optional(), accepting_orders: z.boolean().optional() }).parse(req.body);
  const { rows } = await query(
    `UPDATE stations SET is_open=COALESCE($2,is_open), accepting_orders=COALESCE($3,accepting_orders) WHERE id=$1 RETURNING id, is_open, accepting_orders`,
    [id, b.is_open, b.accepting_orders],
  );
  await audit(req.user.id, 'station.toggle', 'station', id, b);
  publish(`station:${id}`, 'station', rows[0]);
  res.json(rows[0]);
}));

station.post('/cash-close', wrap(async (req, res) => {
  const id = await sid(req);
  const b = z.object({ counted_cash: z.number().int().min(0), note: z.string().max(200).optional() }).parse(req.body);
  const expected = (await query(
    `SELECT COALESCE(sum(amount),0)::int AS n FROM payments WHERE station_id=$1 AND provider='cash' AND status='paid'
        AND settled_at >= ((now() AT TIME ZONE 'Asia/Kathmandu')::date::timestamp AT TIME ZONE 'Asia/Kathmandu')`, [id])).rows[0].n;
  const { rows } = await query(
    `INSERT INTO cash_closes(station_id, business_date, expected_cash, counted_cash, diff, note, closed_by)
     VALUES ($1,(now() AT TIME ZONE 'Asia/Kathmandu')::date,$2,$3,$4,$5,$6)
     ON CONFLICT (station_id, business_date) DO UPDATE SET counted_cash=$3, diff=$4, note=$5, expected_cash=$2, closed_by=$6 RETURNING *`,
    [id, expected, b.counted_cash, b.counted_cash - expected, b.note || null, req.user.id],
  );
  await audit(req.user.id, 'cash.close', 'station', id, { diff: rows[0].diff });
  if (Math.abs(rows[0].diff) >= 50) {
    const m = await query('SELECT user_id FROM station_managers WHERE station_id=$1', [id]);
    for (const r of m.rows) await notify(r.user_id, { kind: 'system', title: 'Cash difference at close', body: `Counted ${b.counted_cash}, expected ${expected} (difference ${rows[0].diff}).`, data: { station_id: id } });
  }
  res.json(rows[0]);
}));
