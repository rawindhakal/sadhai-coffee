import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query, tx } from '../lib/db.js';
import { wrap, bad, notFound, normalizePhone } from '../lib/http.js';
import { authenticate, requireRole } from '../lib/auth.js';
import { audit, notify } from '../lib/notify.js';
import { DEFAULT_SETTINGS, getSettings } from '../lib/settings.js';
import { reconciliation, range } from '../lib/reports.js';
import { statement } from '../lib/partners.js';
import { recomputeProductCosts } from '../lib/costing.js';

export const owner = Router();
owner.use(authenticate, requireRole('owner'));

/* ---- stations ---- */
const stationSchema = z.object({
  code: z.string().min(2).max(12).regex(/^[A-Z0-9-]+$/), name: z.string().min(2), name_ne: z.string().optional(), address: z.string().optional(), district: z.string().optional(),
  lat: z.number().optional(), lng: z.number().optional(), opens: z.string().default('07:00'), closes: z.string().default('20:00'),
  order_letter: z.string().length(1).default('A'), breakeven_cups: z.number().int().min(1).default(220),
  operator_type: z.enum(['company', 'partner']).default('company'), partner_name: z.string().optional(), partner_phone: z.string().optional(), revenue_share_pct: z.number().int().min(0).max(100).default(0), manager_ids: z.array(z.string().uuid()).default([]),
});
owner.post('/stations', wrap(async (req, res) => {
  const b = stationSchema.parse(req.body);
  const st = await tx(async (db) => {
    const { rows } = await db.query(
      `INSERT INTO stations(code,name,name_ne,address,district,lat,lng,opens,closes,order_letter,breakeven_cups,operator_type,partner_name,partner_phone,revenue_share_pct) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [b.code, b.name, b.name_ne, b.address, b.district, b.lat, b.lng, b.opens, b.closes, b.order_letter.toUpperCase(), b.breakeven_cups, b.operator_type, b.partner_name, b.partner_phone, b.revenue_share_pct],
    );
    await db.query(`INSERT INTO station_inventory(station_id, ingredient_id, qty, reorder_level) SELECT $1, id, 0, 0 FROM ingredients`, [rows[0].id]);
    for (const m of b.manager_ids) await db.query(`INSERT INTO station_managers(station_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [rows[0].id, m]);
    await audit(req.user.id, 'station.create', 'station', rows[0].id, { code: b.code }, db);
    return rows[0];
  });
  res.status(201).json(st);
}));
owner.patch('/stations/:id', wrap(async (req, res) => {
  const b = stationSchema.partial().extend({ active: z.boolean().optional() }).parse(req.body);
  const cols = ['code', 'name', 'name_ne', 'address', 'district', 'lat', 'lng', 'opens', 'closes', 'order_letter', 'breakeven_cups', 'active', 'operator_type', 'partner_name', 'partner_phone', 'revenue_share_pct'];
  const sets = [], vals = [req.params.id];
  for (const c of cols) if (b[c] !== undefined) { vals.push(b[c]); sets.push(`${c}=$${vals.length}`); }
  if (sets.length) await query(`UPDATE stations SET ${sets.join(',')} WHERE id=$1`, vals);
  if (b.manager_ids) {
    await query('DELETE FROM station_managers WHERE station_id=$1', [req.params.id]);
    for (const m of b.manager_ids) await query(`INSERT INTO station_managers(station_id,user_id) VALUES ($1,$2)`, [req.params.id, m]);
  }
  await audit(req.user.id, 'station.update', 'station', req.params.id, b);
  res.json((await query('SELECT * FROM stations WHERE id=$1', [req.params.id])).rows[0]);
}));

/* ---- users ---- */
owner.get('/users', wrap(async (req, res) => {
  const role = req.query.role || null;
  const { rows } = await query(
    `SELECT u.id, u.name, u.phone, u.role, u.active, u.station_id, u.last_login_at, u.created_at, s.name AS station_name,
            COALESCE((SELECT json_agg(sm.station_id) FROM station_managers sm WHERE sm.user_id=u.id), '[]') AS managed_stations
       FROM users u LEFT JOIN stations s ON s.id=u.station_id WHERE ($1::text IS NULL OR u.role=$1) AND u.role <> 'customer' ORDER BY u.role, u.name`, [role],
  );
  res.json(rows);
}));
owner.post('/users', wrap(async (req, res) => {
  const b = z.object({
    name: z.string().min(2), phone: z.string(), password: z.string().min(6), role: z.enum(['manager', 'owner', 'station']),
    station_id: z.string().uuid().optional(), managed_station_ids: z.array(z.string().uuid()).default([]),
  }).parse(req.body);
  if (b.role === 'station' && !b.station_id) throw bad('Station staff need a station');
  const u = await tx(async (db) => {
    const { rows } = await db.query(
      `INSERT INTO users(name, phone, password_hash, role, station_id) VALUES ($1,$2,$3,$4,$5) RETURNING id, name, phone, role, station_id, active`,
      [b.name, normalizePhone(b.phone), await bcrypt.hash(b.password, 10), b.role, b.role === 'station' ? b.station_id : null],
    );
    if (b.role === 'manager') for (const s of b.managed_station_ids) await db.query('INSERT INTO station_managers(station_id,user_id) VALUES ($1,$2)', [s, rows[0].id]);
    await audit(req.user.id, 'user.create', 'user', rows[0].id, { role: b.role }, db);
    return rows[0];
  });
  res.status(201).json(u);
}));
owner.patch('/users/:id', wrap(async (req, res) => {
  const b = z.object({ active: z.boolean().optional(), password: z.string().min(6).optional(), managed_station_ids: z.array(z.string().uuid()).optional() }).parse(req.body);
  if (req.params.id === req.user.id && b.active === false) throw bad('You cannot deactivate yourself');
  await query(`UPDATE users SET active=COALESCE($2,active), password_hash=COALESCE($3,password_hash) WHERE id=$1`, [req.params.id, b.active, b.password ? await bcrypt.hash(b.password, 10) : null]);
  if (b.managed_station_ids) {
    await query('DELETE FROM station_managers WHERE user_id=$1', [req.params.id]);
    for (const s of b.managed_station_ids) await query('INSERT INTO station_managers(station_id,user_id) VALUES ($1,$2)', [s, req.params.id]);
  }
  if (b.password || b.active === false) await query('UPDATE refresh_tokens SET revoked=true WHERE user_id=$1', [req.params.id]);
  await audit(req.user.id, 'user.update', 'user', req.params.id, { active: b.active });
  res.json({ ok: true });
}));

/* ---- menu ---- */
owner.get('/menu', wrap(async (_req, res) => {
  const { rows } = await query(
    `SELECT p.*, c.name AS category,
            COALESCE((SELECT json_agg(json_build_object('id', g.id, 'name', g.name, 'name_ne', g.name_ne, 'required', g.required, 'multi', g.multi,
              'options', COALESCE((SELECT json_agg(json_build_object('id', o.id, 'name', o.name, 'name_ne', o.name_ne, 'price_delta', o.price_delta, 'is_default', o.is_default) ORDER BY o.sort) FROM options o WHERE o.group_id=g.id), '[]')) ORDER BY g.sort)
              FROM option_groups g WHERE g.product_id=p.id), '[]') AS option_groups,
            COALESCE((SELECT json_agg(json_build_object('ingredient_id', r.ingredient_id, 'name', i.name, 'unit', i.unit, 'qty', r.qty)) FROM recipes r JOIN ingredients i ON i.id=r.ingredient_id WHERE r.product_id=p.id), '[]') AS recipe
       FROM products p LEFT JOIN categories c ON c.id=p.category_id ORDER BY c.sort, p.sort, p.name`,
  );
  const cats = (await query('SELECT * FROM categories ORDER BY sort')).rows;
  res.json({ categories: cats, products: rows });
}));
owner.post('/categories', wrap(async (req, res) => {
  const b = z.object({ name: z.string().min(2), name_ne: z.string().optional(), sort: z.number().int().default(0) }).parse(req.body);
  res.status(201).json((await query('INSERT INTO categories(name,name_ne,sort) VALUES ($1,$2,$3) RETURNING *', [b.name, b.name_ne, b.sort])).rows[0]);
}));
const productSchema = z.object({
  category_id: z.string().uuid().optional(), sku: z.string().min(2).max(20), name: z.string().min(2), name_ne: z.string().optional(),
  description: z.string().optional(), description_ne: z.string().optional(), price: z.number().int().min(0), cost: z.number().int().min(0).default(0),
  prep_seconds: z.number().int().min(10).max(600).default(90), is_signature: z.boolean().default(false), is_seasonal: z.boolean().default(false),
  pass_eligible: z.boolean().default(true), origin: z.string().optional(), image_url: z.string().url().optional(), active: z.boolean().default(true), sort: z.number().int().default(0),
});
owner.post('/products', wrap(async (req, res) => {
  const b = productSchema.parse(req.body);
  const cols = Object.keys(b);
  const { rows } = await query(`INSERT INTO products(${cols.join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`, cols.map((c) => b[c]));
  await audit(req.user.id, 'product.create', 'product', rows[0].id, { sku: b.sku });
  res.status(201).json(rows[0]);
}));
owner.patch('/products/:id', wrap(async (req, res) => {
  const b = productSchema.partial().parse(req.body);
  const cols = Object.keys(b);
  if (!cols.length) throw bad('Nothing to update');
  const { rows } = await query(`UPDATE products SET ${cols.map((c, i) => `${c}=$${i + 2}`).join(',')} WHERE id=$1 RETURNING *`, [req.params.id, ...cols.map((c) => b[c])]);
  if (!rows[0]) throw notFound('Product not found');
  await audit(req.user.id, 'product.update', 'product', req.params.id, b);
  res.json(rows[0]);
}));
owner.put('/products/:id/options', wrap(async (req, res) => {
  const groups = z.array(z.object({
    name: z.string(), name_ne: z.string().optional(), required: z.boolean().default(false), multi: z.boolean().default(false),
    options: z.array(z.object({ name: z.string(), name_ne: z.string().optional(), price_delta: z.number().int().default(0), is_default: z.boolean().default(false) })).min(1),
  })).parse(req.body);
  await tx(async (db) => {
    await db.query('DELETE FROM option_groups WHERE product_id=$1', [req.params.id]);
    for (const [gi, g] of groups.entries()) {
      const gid = (await db.query('INSERT INTO option_groups(product_id,name,name_ne,required,multi,sort) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [req.params.id, g.name, g.name_ne, g.required, g.multi, gi])).rows[0].id;
      for (const [oi, o] of g.options.entries()) await db.query('INSERT INTO options(group_id,name,name_ne,price_delta,is_default,sort) VALUES ($1,$2,$3,$4,$5,$6)', [gid, o.name, o.name_ne, o.price_delta, o.is_default, oi]);
    }
  });
  res.json({ ok: true });
}));
owner.put('/products/:id/recipe', wrap(async (req, res) => {
  const items = z.array(z.object({ ingredient_id: z.string().uuid(), qty: z.number().positive() })).parse(req.body);
  await tx(async (db) => {
    await db.query('DELETE FROM recipes WHERE product_id=$1', [req.params.id]);
    for (const r of items) await db.query('INSERT INTO recipes(product_id,ingredient_id,qty) VALUES ($1,$2,$3)', [req.params.id, r.ingredient_id, r.qty]);
  });
  res.json({ ok: true });
}));
owner.post('/ingredients', wrap(async (req, res) => {
  const b = z.object({ name: z.string().min(2), unit: z.string().min(1), unit_cost: z.number().min(0).default(0) }).parse(req.body);
  const ing = await tx(async (db) => {
    const r = (await db.query('INSERT INTO ingredients(name,unit,unit_cost) VALUES ($1,$2,$3) RETURNING *', [b.name, b.unit, b.unit_cost])).rows[0];
    await db.query('INSERT INTO station_inventory(station_id, ingredient_id, qty, reorder_level) SELECT id, $1, 0, 0 FROM stations', [r.id]);
    return r;
  });
  res.status(201).json(ing);
}));

/* ---- drops ---- */
owner.post('/drops', wrap(async (req, res) => {
  const b = z.object({
    name: z.string().min(2), name_ne: z.string().optional(), partner: z.string().optional(), product_id: z.string().uuid(),
    price: z.number().int().min(0), cap: z.number().int().min(1), starts_at: z.string().datetime(), ends_at: z.string().datetime(),
  }).parse(req.body);
  const { rows } = await query(
    `INSERT INTO drops(name,name_ne,partner,product_id,price,cap,starts_at,ends_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [b.name, b.name_ne, b.partner, b.product_id, b.price, b.cap, b.starts_at, b.ends_at],
  );
  await audit(req.user.id, 'drop.create', 'drop', rows[0].id, b);
  res.status(201).json(rows[0]);
}));
owner.patch('/drops/:id', wrap(async (req, res) => {
  const b = z.object({ active: z.boolean().optional(), cap: z.number().int().min(1).optional(), ends_at: z.string().datetime().optional() }).parse(req.body);
  await query(`UPDATE drops SET active=COALESCE($2,active), cap=COALESCE($3,cap), ends_at=COALESCE($4,ends_at) WHERE id=$1`, [req.params.id, b.active, b.cap, b.ends_at]);
  res.json({ ok: true });
}));

/* ---- settings ---- */
owner.get('/settings', wrap(async (_req, res) => res.json(await getSettings())));
owner.put('/settings', wrap(async (req, res) => {
  const entries = Object.entries(z.record(z.number()).parse(req.body)).filter(([k]) => k in DEFAULT_SETTINGS);
  for (const [k, v] of entries) {
    await query(`INSERT INTO settings(key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=now()`, [k, JSON.stringify(v)]);
  }
  await audit(req.user.id, 'settings.update', 'settings', null, Object.fromEntries(entries));
  res.json(await getSettings());
}));

/* ---- audit, reconciliation, passes ---- */
owner.get('/audit', wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT a.*, u.name AS actor FROM audit_log a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT $1`, [Math.min(Number(req.query.limit) || 100, 500)],
  );
  res.json(rows);
}));
owner.get('/reconciliation', wrap(async (req, res) => res.json(await reconciliation(req.query.from, req.query.to))));
owner.post('/settlements', wrap(async (req, res) => {
  const b = z.object({ provider: z.enum(['esewa', 'khalti', 'fonepay']), day: z.string().regex(/^\d{4}-\d\d-\d\d$/), amount: z.number().int().min(0), note: z.string().optional() }).parse(req.body);
  const { rows } = await query(
    `INSERT INTO settlements(provider, day, amount, note, entered_by) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (provider, day) DO UPDATE SET amount=$3, note=$4, entered_by=$5 RETURNING *`, [b.provider, b.day, b.amount, b.note, req.user.id],
  );
  await audit(req.user.id, 'settlement.enter', 'settlement', rows[0].id, b);
  res.status(201).json(rows[0]);
}));
owner.get('/passes', wrap(async (_req, res) => {
  const { rows } = await query(
    `SELECT p.id, p.status, p.total_cups, p.used_cups, p.price_paid, p.purchased_at, p.expires_at, p.related_party, u.name, u.phone
       FROM passes p JOIN users u ON u.id=p.user_id WHERE p.status <> 'pending' ORDER BY p.purchased_at DESC LIMIT 100`,
  );
  res.json(rows);
}));
owner.patch('/passes/:id', wrap(async (req, res) => {
  const { related_party } = z.object({ related_party: z.boolean() }).parse(req.body);
  await query('UPDATE passes SET related_party=$2 WHERE id=$1', [req.params.id, related_party]);
  await audit(req.user.id, 'pass.flag_related', 'pass', req.params.id, { related_party });
  res.json({ ok: true });
}));

/* ---- broadcast (one push a day at most) ---- */
owner.post('/broadcast', wrap(async (req, res) => {
  const b = z.object({ title: z.string().min(3).max(80), body: z.string().max(200).optional(), segment: z.enum(['all', 'inactive_14d']).default('all') }).parse(req.body);
  const cap = (await getSettings()).promo_push_daily_cap;
  const { rows } = await query(
    `SELECT u.id FROM users u WHERE u.role='customer' AND u.active
       AND (SELECT count(*) FROM notifications n WHERE n.user_id=u.id AND n.kind='promo' AND n.created_at > now() - interval '24 hours') < $1
       AND ($2='all' OR NOT EXISTS (SELECT 1 FROM orders o WHERE o.user_id=u.id AND o.created_at > now() - interval '14 days'))`, [cap, b.segment],
  );
  for (const r of rows) await notify(r.id, { kind: 'promo', title: b.title, body: b.body });
  await audit(req.user.id, 'broadcast', 'notification', null, { ...b, sent: rows.length });
  res.json({ sent: rows.length });
}));

/* ---- export ---- */
owner.get('/export/orders.csv', wrap(async (req, res) => {
  const { start, end } = range(req.query.from, req.query.to);
  const { rows } = await query(
    `SELECT o.created_at, s.code AS station, o.pickup_code, o.channel, o.status, o.subtotal, o.discount, o.total, o.payment_method, o.payment_status, COALESCE(u.phone,'') AS phone
       FROM orders o JOIN stations s ON s.id=o.station_id LEFT JOIN users u ON u.id=o.user_id WHERE o.created_at >= $1 AND o.created_at < $2 ORDER BY o.created_at`, [start, end],
  );
  const head = 'created_at,station,pickup_code,channel,status,subtotal,discount,total,payment_method,payment_status,phone';
  const csv = [head, ...rows.map((r) => [r.created_at.toISOString(), r.station, r.pickup_code, r.channel, r.status, r.subtotal, r.discount, r.total, r.payment_method, r.payment_status, r.phone].join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="sadhai-orders.csv"');
  res.send(csv);
}));

/* ---- partner cafes ---- */
owner.patch('/stations/:id/partner', wrap(async (req, res) => {
  const b = z.object({ operator_type: z.enum(['company', 'partner']), partner_name: z.string().max(80).optional(), partner_phone: z.string().max(20).optional(), revenue_share_pct: z.number().int().min(0).max(100) }).parse(req.body);
  await query('UPDATE stations SET operator_type=$2, partner_name=$3, partner_phone=$4, revenue_share_pct=$5 WHERE id=$1', [req.params.id, b.operator_type, b.partner_name, b.partner_phone, b.revenue_share_pct]);
  await audit(req.user.id, 'station.partner', 'station', req.params.id, b);
  res.json({ ok: true });
}));
owner.get('/partners', wrap(async (req, res) => {
  const { rows } = await query(`SELECT id FROM stations WHERE active AND operator_type='partner' ORDER BY name`);
  res.json(await Promise.all(rows.map((r) => statement(r.id, req.query.from, req.query.to))));
}));
owner.post('/partners/:stationId/settle', wrap(async (req, res) => {
  const b = z.object({ from: z.string(), to: z.string(), reference: z.string().min(2).max(80) }).parse(req.body);
  const s = await statement(req.params.stationId, b.from, b.to);
  const { rows } = await query(
    `INSERT INTO partner_settlements(station_id, period_from, period_to, net_sales, partner_share, cash_held, net_due, reference, settled_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (station_id, period_from, period_to) DO NOTHING RETURNING *`,
    [req.params.stationId, b.from, b.to, s.net_sales, s.partner_share, s.cash_held, s.net_due, b.reference, req.user.id],
  );
  if (!rows[0]) throw bad('This period is already settled');
  await audit(req.user.id, 'partner.settle', 'station', req.params.stationId, { ...b, net_due: s.net_due });
  res.status(201).json(rows[0]);
}));

/* ---- recipe editor: base recipe, option adjustments and method; recosts the item ---- */
owner.put('/recipes/:productId', wrap(async (req, res) => {
  const b = z.object({
    method: z.string().max(2000).optional(),
    lines: z.array(z.object({ ingredient_id: z.string().uuid(), qty: z.number().positive() })),
    options: z.array(z.object({ option_id: z.string().uuid(), lines: z.array(z.object({ ingredient_id: z.string().uuid(), qty: z.number().finite().refine((n) => n !== 0, 'Use a non-zero amount') })) })).default([]),
  }).parse(req.body);
  if (new Set(b.lines.map((l) => l.ingredient_id)).size !== b.lines.length) throw bad('Each ingredient can appear once in a recipe');
  const moved = await tx(async (db) => {
    await db.query('DELETE FROM recipes WHERE product_id=$1', [req.params.productId]);
    for (const l of b.lines) await db.query('INSERT INTO recipes(product_id, ingredient_id, qty) VALUES ($1,$2,$3)', [req.params.productId, l.ingredient_id, l.qty]);
    for (const o of b.options) {
      await db.query('DELETE FROM option_recipes WHERE option_id=$1', [o.option_id]);
      for (const l of o.lines) await db.query('INSERT INTO option_recipes(option_id, ingredient_id, qty) VALUES ($1,$2,$3)', [o.option_id, l.ingredient_id, l.qty]);
    }
    if (b.method !== undefined) await db.query('UPDATE products SET recipe_method=$2 WHERE id=$1', [req.params.productId, b.method || null]);
    await audit(req.user.id, 'recipe.update', 'product', req.params.productId, { lines: b.lines.length }, db);
    return recomputeProductCosts(db, { productId: req.params.productId });
  });
  res.json({ ok: true, recosted: moved });
}));
