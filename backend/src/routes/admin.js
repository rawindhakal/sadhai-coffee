import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query } from '../lib/db.js';
import { wrap, bad, notFound, normalizePhone, forbidden, conflict } from '../lib/http.js';
import { authenticate, requireRole, scopeStations, assertStationAccess } from '../lib/auth.js';
import { overview } from '../lib/reports.js';
import { audit } from '../lib/notify.js';
import { adjustInventory, inventoryFor } from './station.js';
import { fullOrder, cancelOrder } from '../lib/orders.js';
import { statement, scorecard } from '../lib/partners.js';
import { extras, liveBoard, alerts, customerInsights, customerDetail, search } from '../lib/insights.js';

// Shared by managers (their stations) and owners (all stations).
export const admin = Router();
admin.use(authenticate, requireRole('manager', 'owner'));

async function scoped(req) {
  const all = await scopeStations(req.user);
  if (req.query.station_id) {
    if (!all.includes(req.query.station_id)) throw forbidden('This station is not yours');
    return [req.query.station_id];
  }
  return all;
}

admin.get('/stations', wrap(async (req, res) => {
  const ids = await scopeStations(req.user);
  const { rows } = await query(
    `SELECT s.*, (SELECT count(*)::int FROM orders o WHERE o.station_id=s.id AND o.status IN ('placed','preparing','ready')) AS queue,
            (SELECT count(*)::int FROM users u WHERE u.station_id=s.id AND u.role='station' AND u.active) AS staff,
            COALESCE((SELECT json_agg(json_build_object('id', u.id, 'name', u.name)) FROM station_managers sm JOIN users u ON u.id=sm.user_id WHERE sm.station_id=s.id), '[]') AS managers
       FROM stations s WHERE s.id = ANY($1) ORDER BY s.name`, [ids],
  );
  res.json(rows);
}));

admin.patch('/stations/:id', wrap(async (req, res) => {
  await assertStationAccess(req.user, req.params.id);
  const b = z.object({
    opens: z.string().regex(/^\d\d:\d\d/).optional(), closes: z.string().regex(/^\d\d:\d\d/).optional(),
    breakeven_cups: z.number().int().min(1).optional(), is_open: z.boolean().optional(), accepting_orders: z.boolean().optional(),
    prep_target_seconds: z.number().int().min(30).max(600).optional(),
  }).parse(req.body);
  const { rows } = await query(
    `UPDATE stations SET opens=COALESCE($2,opens), closes=COALESCE($3,closes), breakeven_cups=COALESCE($4,breakeven_cups),
       is_open=COALESCE($5,is_open), accepting_orders=COALESCE($6,accepting_orders), prep_target_seconds=COALESCE($7,prep_target_seconds)
     WHERE id=$1 RETURNING *`, [req.params.id, b.opens, b.closes, b.breakeven_cups, b.is_open, b.accepting_orders, b.prep_target_seconds],
  );
  await audit(req.user.id, 'station.update', 'station', req.params.id, b);
  res.json(rows[0]);
}));

admin.get('/overview', wrap(async (req, res) => {
  const ids = await scoped(req);
  const [o, x] = await Promise.all([overview(ids, req.query.from, req.query.to), extras(ids, req.query.from, req.query.to)]);
  res.json({ ...o, ...x });
}));
admin.get('/live', wrap(async (req, res) => res.json(await liveBoard(await scoped(req)))));
admin.get('/alerts', wrap(async (req, res) => res.json(await alerts(await scoped(req), req.user.role === 'owner'))));
admin.get('/search', wrap(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ orders: [], customers: [], products: [] });
  res.json(await search(await scoped(req), q));
}));
admin.get('/customers/insights', wrap(async (req, res) => res.json(await customerInsights(req.query.from, req.query.to))));
admin.get('/customers/:id', wrap(async (req, res) => {
  const c = await customerDetail(req.params.id);
  if (!c) throw notFound('Customer not found');
  res.json(c);
}));
admin.get('/orders/:id', wrap(async (req, res) => {
  const o = await fullOrder(req.params.id);
  if (!o) throw notFound('Order not found');
  await assertStationAccess(req.user, o.station_id);
  const [timeline, payments] = await Promise.all([
    query(`SELECT a.action, a.created_at, u.name AS actor, a.meta FROM audit_log a LEFT JOIN users u ON u.id=a.actor_id WHERE a.entity='order' AND a.entity_id=$1 ORDER BY a.id`, [o.id]),
    query(`SELECT provider, amount, status, provider_ref, created_at, settled_at FROM payments WHERE order_id=$1 ORDER BY created_at`, [o.id]),
  ]);
  const staff = await query(`SELECT (SELECT name FROM users WHERE id=$1) AS accepted_by, (SELECT name FROM users WHERE id=$2) AS ready_by`, [o.accepted_by, o.ready_by]);
  res.json({ ...o, timeline: timeline.rows, payments: payments.rows, ...staff.rows[0] });
}));

admin.get('/orders', wrap(async (req, res) => {
  const ids = await scoped(req);
  const status = req.query.status ? String(req.query.status).split(',') : null;
  const { rows } = await query(
    `SELECT o.id, o.pickup_code, o.status, o.total, o.discount, o.payment_method, o.payment_status, o.channel, o.created_at, o.rating,
            s.name AS station_name, u.name AS customer,
            (SELECT string_agg(i.qty || '× ' || i.name, ', ') FROM order_items i WHERE i.order_id=o.id) AS summary
       FROM orders o JOIN stations s ON s.id=o.station_id LEFT JOIN users u ON u.id=o.user_id
      WHERE o.station_id = ANY($1) AND ($2::text[] IS NULL OR o.status = ANY($2))
      ORDER BY o.created_at DESC LIMIT $3 OFFSET $4`, [ids, status, Math.min(Number(req.query.limit) || 50, 200), Number(req.query.offset) || 0],
  );
  res.json(rows);
}));

admin.post('/orders/:id/refund', wrap(async (req, res) => {
  const { reason } = z.object({ reason: z.string().min(3).max(200) }).parse(req.body);
  const o = await fullOrder(req.params.id);
  if (!o) throw notFound('Order not found');
  await assertStationAccess(req.user, o.station_id);
  if (o.status === 'picked_up') {
    if (o.payment_status !== 'paid' || o.total === 0) throw conflict('Nothing to refund on this order');
    await query(`UPDATE payments SET status='refunded', raw = COALESCE(raw,'{}'::jsonb) || '{"refund_pending_manual": true}'::jsonb WHERE order_id=$1 AND status='paid'`, [o.id]);
    await query(`UPDATE orders SET payment_status='refunded', cancel_reason=$2 WHERE id=$1`, [o.id, reason]);
    await audit(req.user.id, 'order.refund', 'order', o.id, { reason, total: o.total });
    return res.json(await fullOrder(o.id));
  }
  res.json(await cancelOrder(o.id, req.user, reason));
}));

admin.get('/customers', wrap(async (req, res) => {
  const q = `%${String(req.query.q || '').trim()}%`;
  const { rows } = await query(
    `SELECT u.id, u.name, u.phone, u.beans, u.created_at, u.active,
            count(o.id) FILTER (WHERE o.status='picked_up')::int AS orders, COALESCE(sum(o.total) FILTER (WHERE o.status='picked_up'),0)::int AS spent,
            max(o.created_at) AS last_order
       FROM users u LEFT JOIN orders o ON o.user_id=u.id
      WHERE u.role='customer' AND (u.name ILIKE $1 OR u.phone ILIKE $1) GROUP BY u.id ORDER BY max(o.created_at) DESC NULLS LAST LIMIT 100`, [q],
  );
  res.json(rows);
}));

/* ---- staff ---- */
admin.get('/staff', wrap(async (req, res) => {
  const ids = await scoped(req);
  const { rows } = await query(
    `SELECT u.id, u.name, u.phone, u.role, u.active, u.last_login_at, s.name AS station_name, u.station_id
       FROM users u JOIN stations s ON s.id=u.station_id WHERE u.role='station' AND u.station_id = ANY($1) ORDER BY s.name, u.name`, [ids],
  );
  res.json(rows);
}));
admin.post('/staff', wrap(async (req, res) => {
  const b = z.object({ name: z.string().min(2), phone: z.string(), password: z.string().min(6), station_id: z.string().uuid() }).parse(req.body);
  await assertStationAccess(req.user, b.station_id);
  const { rows } = await query(
    `INSERT INTO users(name, phone, password_hash, role, station_id) VALUES ($1,$2,$3,'station',$4) RETURNING id, name, phone, role, station_id, active`,
    [b.name, normalizePhone(b.phone), await bcrypt.hash(b.password, 10), b.station_id],
  );
  await audit(req.user.id, 'staff.create', 'user', rows[0].id);
  res.status(201).json(rows[0]);
}));
admin.patch('/staff/:id', wrap(async (req, res) => {
  const b = z.object({ active: z.boolean().optional(), password: z.string().min(6).optional(), station_id: z.string().uuid().optional() }).parse(req.body);
  const u = (await query(`SELECT * FROM users WHERE id=$1 AND role='station'`, [req.params.id])).rows[0];
  if (!u) throw notFound('Staff member not found');
  await assertStationAccess(req.user, u.station_id);
  if (b.station_id) await assertStationAccess(req.user, b.station_id);
  await query(
    `UPDATE users SET active=COALESCE($2,active), password_hash=COALESCE($3,password_hash), station_id=COALESCE($4,station_id) WHERE id=$1`,
    [u.id, b.active, b.password ? await bcrypt.hash(b.password, 10) : null, b.station_id],
  );
  if (b.password || b.active === false) await query('UPDATE refresh_tokens SET revoked=true WHERE user_id=$1', [u.id]);
  await audit(req.user.id, 'staff.update', 'user', u.id, { active: b.active });
  res.json({ ok: true });
}));

/* ---- promo codes ---- */
admin.get('/promos', wrap(async (req, res) => {
  const ids = await scopeStations(req.user);
  const { rows } = await query(
    `SELECT p.*, s.name AS station_name FROM promo_codes p LEFT JOIN stations s ON s.id=p.station_id
      WHERE p.station_id IS NULL OR p.station_id = ANY($1) ORDER BY p.created_at DESC`, [ids],
  );
  res.json(rows);
}));
admin.post('/promos', wrap(async (req, res) => {
  const b = z.object({
    code: z.string().trim().min(3).max(20).regex(/^[A-Za-z0-9]+$/), title: z.string().min(3).max(60), pct: z.number().int().min(1).max(60),
    min_total: z.number().int().min(0).default(0), max_uses: z.number().int().min(1).optional(), per_user_limit: z.number().int().min(1).default(1),
    valid_until: z.string().datetime().optional(), station_id: z.string().uuid().optional(),
  }).parse(req.body);
  if (req.user.role === 'manager') {
    if (!b.station_id) throw forbidden('Managers create promos for one of their stations');
    await assertStationAccess(req.user, b.station_id);
  }
  const { rows } = await query(
    `INSERT INTO promo_codes(code, title, pct, min_total, max_uses, per_user_limit, valid_until, station_id, created_by) VALUES (upper($1),$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [b.code, b.title, b.pct, b.min_total, b.max_uses || null, b.per_user_limit, b.valid_until || null, b.station_id || null, req.user.id],
  );
  await audit(req.user.id, 'promo.create', 'promo', rows[0].id, { code: b.code });
  res.status(201).json(rows[0]);
}));
admin.patch('/promos/:id', wrap(async (req, res) => {
  const { active } = z.object({ active: z.boolean() }).parse(req.body);
  const p = (await query('SELECT * FROM promo_codes WHERE id=$1', [req.params.id])).rows[0];
  if (!p) throw notFound('Promo not found');
  if (req.user.role === 'manager') { if (!p.station_id) throw forbidden(); await assertStationAccess(req.user, p.station_id); }
  await query('UPDATE promo_codes SET active=$2 WHERE id=$1', [p.id, active]);
  res.json({ ok: true });
}));

/* ---- menu availability / station price ---- */
admin.get('/stations/:id/products', wrap(async (req, res) => {
  await assertStationAccess(req.user, req.params.id);
  const { rows } = await query(
    `SELECT p.id, p.name, p.price, p.active, c.name AS category, COALESCE(sp.available, true) AS available, sp.price_override
       FROM products p LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN station_products sp ON sp.product_id=p.id AND sp.station_id=$1
      WHERE p.active ORDER BY c.sort, p.sort, p.name`, [req.params.id],
  );
  res.json(rows);
}));
admin.put('/stations/:sid/products/:pid', wrap(async (req, res) => {
  await assertStationAccess(req.user, req.params.sid);
  const b = z.object({ available: z.boolean().optional(), price_override: z.number().int().min(0).nullable().optional() }).parse(req.body);
  if (b.price_override !== undefined && req.user.role !== 'owner') throw forbidden('Only the owner changes prices');
  await query(
    `INSERT INTO station_products(station_id, product_id, available, price_override) VALUES ($1,$2,COALESCE($3,true),$4)
     ON CONFLICT (station_id, product_id) DO UPDATE SET available=COALESCE($3, station_products.available),
       price_override = CASE WHEN $5 THEN $4 ELSE station_products.price_override END`,
    [req.params.sid, req.params.pid, b.available, b.price_override ?? null, b.price_override !== undefined],
  );
  await audit(req.user.id, 'menu.station_update', 'product', req.params.pid, { station_id: req.params.sid, ...b });
  res.json({ ok: true });
}));

/* ---- inventory ---- */
admin.get('/inventory', wrap(async (req, res) => {
  const ids = await scoped(req);
  res.json(await Promise.all(ids.map(async (id) => ({ station_id: id, name: (await query('SELECT name FROM stations WHERE id=$1', [id])).rows[0].name, items: await inventoryFor(id) }))));
}));
admin.post('/inventory/:stationId/:ingredientId', wrap(async (req, res) => {
  await assertStationAccess(req.user, req.params.stationId);
  const b = z.object({ delta: z.number().optional(), qty: z.number().min(0).optional(), reason: z.enum(['restock', 'waste', 'adjust']) }).parse(req.body);
  if (b.delta == null && b.qty == null) throw bad('Provide delta or qty');
  res.json({ qty: await adjustInventory(req.params.stationId, req.params.ingredientId, b, req.user.id) });
}));
admin.patch('/inventory/:stationId/:ingredientId', wrap(async (req, res) => {
  await assertStationAccess(req.user, req.params.stationId);
  const { reorder_level } = z.object({ reorder_level: z.number().min(0) }).parse(req.body);
  await query('UPDATE station_inventory SET reorder_level=$3 WHERE station_id=$1 AND ingredient_id=$2', [req.params.stationId, req.params.ingredientId, reorder_level]);
  res.json({ ok: true });
}));

admin.get('/cash-closes', wrap(async (req, res) => {
  const ids = await scoped(req);
  const { rows } = await query(
    `SELECT c.*, s.name AS station_name, u.name AS closed_by_name FROM cash_closes c JOIN stations s ON s.id=c.station_id LEFT JOIN users u ON u.id=c.closed_by
      WHERE c.station_id = ANY($1) ORDER BY c.business_date DESC LIMIT 60`, [ids],
  );
  res.json(rows);
}));

admin.get('/reviews', wrap(async (req, res) => {
  const ids = await scoped(req);
  const { rows } = await query(
    `SELECT o.id, o.pickup_code, o.rating, o.rating_note, o.created_at, s.name AS station_name, u.name AS customer
       FROM orders o JOIN stations s ON s.id=o.station_id LEFT JOIN users u ON u.id=o.user_id
      WHERE o.station_id = ANY($1) AND o.rating IS NOT NULL ORDER BY o.created_at DESC LIMIT 60`, [ids],
  );
  res.json(rows);
}));

admin.get('/ingredients', wrap(async (_req, res) => res.json((await query('SELECT * FROM ingredients ORDER BY name')).rows)));
admin.get('/drops', wrap(async (_req, res) => res.json((await query(`SELECT d.*, p.name AS product_name FROM drops d JOIN products p ON p.id=d.product_id ORDER BY d.starts_at DESC`)).rows)));

/* ---- offers of the day ---- */
const offerSchema = z.object({
  title: z.string().trim().min(3).max(60), title_ne: z.string().max(80).optional(), blurb: z.string().max(140).optional(),
  scope: z.enum(['product', 'category', 'all_drinks']), product_id: z.string().uuid().optional(), category_id: z.string().uuid().optional(),
  pct: z.number().int().min(1).max(60).optional(), offer_price: z.number().int().min(0).optional(),
  station_id: z.string().uuid().optional(), hours: z.number().min(1).max(24 * 31).default(24), max_uses: z.number().int().min(1).optional(),
});
admin.get('/offers', wrap(async (req, res) => {
  const ids = await scopeStations(req.user);
  const { rows } = await query(
    `SELECT d.*, p.name AS product_name, c.name AS category_name, s.name AS station_name, (d.ends_at >= now() AND d.active) AS live
       FROM daily_offers d LEFT JOIN products p ON p.id=d.product_id LEFT JOIN categories c ON c.id=d.category_id LEFT JOIN stations s ON s.id=d.station_id
      WHERE d.station_id IS NULL OR d.station_id = ANY($1) ORDER BY d.ends_at DESC LIMIT 60`, [ids],
  );
  res.json(rows);
}));
admin.post('/offers', wrap(async (req, res) => {
  const b = offerSchema.parse(req.body);
  if (b.scope === 'product' && !b.product_id) throw bad('Choose the item for this offer');
  if (b.scope === 'category' && !b.category_id) throw bad('Choose the category for this offer');
  if (b.pct == null && b.offer_price == null) throw bad('Set a percent off or a fixed price');
  if (b.offer_price != null && b.scope !== 'product') throw bad('A fixed price works for one item only');
  if (req.user.role === 'manager') {
    if (!b.station_id) throw forbidden('Managers set offers for one of their stations');
    await assertStationAccess(req.user, b.station_id);
    if (b.pct > 40) throw forbidden('Managers can offer up to 40% off. Ask the owner for more.');
  }
  if (b.scope === 'product') {
    const p = (await query('SELECT price, cost, name FROM products WHERE id=$1', [b.product_id])).rows[0];
    if (!p) throw notFound('Item not found');
    const price = b.offer_price ?? Math.floor((p.price * (100 - b.pct)) / 100);
    if (price < p.cost && req.user.role !== 'owner') throw bad(`That price is below the food cost of ${p.name} (Rs ${p.cost}).`);
  }
  const { rows } = await query(
    `INSERT INTO daily_offers(title,title_ne,blurb,scope,product_id,category_id,pct,offer_price,station_id,ends_at,max_uses,created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now() + ($10 || ' hours')::interval,$11,$12) RETURNING *`,
    [b.title, b.title_ne, b.blurb, b.scope, b.product_id, b.category_id, b.pct, b.offer_price, b.station_id, String(b.hours), b.max_uses, req.user.id],
  );
  await audit(req.user.id, 'offer.create', 'offer', rows[0].id, { title: b.title, pct: b.pct, price: b.offer_price, station: b.station_id });
  res.status(201).json(rows[0]);
}));
admin.patch('/offers/:id', wrap(async (req, res) => {
  const { active } = z.object({ active: z.boolean() }).parse(req.body);
  const o = (await query('SELECT * FROM daily_offers WHERE id=$1', [req.params.id])).rows[0];
  if (!o) throw notFound('Offer not found');
  if (req.user.role === 'manager') { if (!o.station_id) throw forbidden('Only the owner changes all-station offers'); await assertStationAccess(req.user, o.station_id); }
  await query('UPDATE daily_offers SET active=$2 WHERE id=$1', [o.id, active]);
  await audit(req.user.id, active ? 'offer.resume' : 'offer.stop', 'offer', o.id);
  res.json({ ok: true });
}));

/* ---- accountability: partner statements and scorecards ---- */
admin.get('/partner-statement', wrap(async (req, res) => {
  const ids = await scoped(req);
  const out = [];
  for (const id of ids) out.push(await statement(id, req.query.from, req.query.to));
  res.json(out.filter((s) => s.station.operator_type === 'partner' || ids.length === 1));
}));
admin.get('/scorecard', wrap(async (req, res) => res.json(await scorecard(await scoped(req), req.query.from, req.query.to))));
