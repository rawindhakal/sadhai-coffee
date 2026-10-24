import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query, tx } from '../lib/db.js';
import { wrap, bad, notFound, normalizePhone } from '../lib/http.js';
import { authenticate, requireRole } from '../lib/auth.js';
import { audit, notify } from '../lib/notify.js';
import { DEFAULT_SETTINGS, getSettings, validateSettingValue } from '../lib/settings.js';
import { reconciliation, range } from '../lib/reports.js';
import { statement } from '../lib/partners.js';
import { recomputeProductCosts } from '../lib/costing.js';

export const owner = Router();
owner.use(authenticate, requireRole('owner'));

/* ---- stations ---- */
const stationSchema = z.object({
  code: z.string().min(2).max(12).regex(/^[A-Z0-9-]+$/), name: z.string().min(2), name_ne: z.string().nullish(), address: z.string().nullish(), district: z.string().nullish(),
  lat: z.number().nullish(), lng: z.number().nullish(), opens: z.string().regex(/^\d\d:\d\d(:\d\d)?$/, 'Use a time like 07:00').default('07:00'), closes: z.string().regex(/^\d\d:\d\d(:\d\d)?$/, 'Use a time like 20:00').default('20:00'),
  order_letter: z.string().length(1).default('A'), breakeven_cups: z.number().int().min(1).default(220),
  operator_type: z.enum(['company', 'partner']).default('company'), partner_name: z.string().nullish(), partner_phone: z.string().nullish(), revenue_share_pct: z.number().int().min(0).max(100).default(0), manager_ids: z.array(z.string().uuid()).default([]),
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

/* ---- users & managers CRUD ---- */
owner.get('/users', wrap(async (req, res) => {
  const role = req.query.role || null;
  const stationId = req.query.station_id || null;
  const includeCustomers = req.query.include_customers === 'true' || role === 'customer' || role === 'all';
  const q = req.query.q ? `%${req.query.q.trim()}%` : null;

  const { rows } = await query(
    `SELECT u.id, u.name, u.phone, u.email, u.role, u.active, u.station_id, u.beans, u.last_login_at, u.created_at,
            s.name AS station_name,
            COALESCE((SELECT json_agg(sm.station_id) FROM station_managers sm WHERE sm.user_id=u.id), '[]') AS managed_stations,
            (SELECT count(*)::int FROM orders o WHERE o.user_id=u.id) AS orders_count
       FROM users u
       LEFT JOIN stations s ON s.id=u.station_id
      WHERE ($1::text IS NULL OR $1 = 'all' OR u.role = $1)
        AND ($2::boolean IS TRUE OR u.role <> 'customer')
        AND ($3::uuid IS NULL OR u.station_id = $3 OR EXISTS (SELECT 1 FROM station_managers sm WHERE sm.user_id=u.id AND sm.station_id=$3))
        AND ($4::text IS NULL OR u.name ILIKE $4 OR u.phone ILIKE $4 OR COALESCE(u.email,'') ILIKE $4)
      ORDER BY CASE u.role WHEN 'owner' THEN 1 WHEN 'manager' THEN 2 WHEN 'partner' THEN 3 WHEN 'station' THEN 4 ELSE 5 END, u.name`,
    [role, includeCustomers, stationId, q],
  );
  res.json(rows);
}));

owner.post('/users', wrap(async (req, res) => {
  const b = z.object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    phone: z.string().min(8, 'Valid phone number required'),
    email: z.string().email('Invalid email').optional().nullable(),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    role: z.enum(['manager', 'owner', 'station', 'partner', 'customer']),
    station_id: z.string().uuid().optional().nullable(),
    managed_station_ids: z.array(z.string().uuid()).default([]),
    active: z.boolean().default(true),
  }).parse(req.body);

  const normPhone = normalizePhone(b.phone);
  const { rows: existing } = await query('SELECT id FROM users WHERE phone=$1', [normPhone]);
  if (existing.length) throw bad('A user with this mobile number already exists');

  if (b.role === 'station' && !b.station_id) throw bad('Station staff need an assigned station');
  if (b.role === 'partner' && !b.managed_station_ids.length) throw bad('Partner cafe owner must manage at least one station');

  const u = await tx(async (db) => {
    const { rows } = await db.query(
      `INSERT INTO users(name, phone, email, password_hash, role, station_id, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, phone, email, role, station_id, active, created_at`,
      [
        b.name.trim(),
        normPhone,
        b.email ? b.email.trim().toLowerCase() : null,
        await bcrypt.hash(b.password, 10),
        b.role,
        b.role === 'station' ? b.station_id : null,
        b.active ?? true,
      ],
    );
    const userId = rows[0].id;
    if (b.role === 'manager' || b.role === 'partner') {
      for (const s of b.managed_station_ids) {
        await db.query('INSERT INTO station_managers(station_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [s, userId]);
      }
    }
    await audit(req.user.id, 'user.create', 'user', userId, { role: b.role, name: b.name, phone: normPhone }, db);
    return rows[0];
  });
  res.status(201).json(u);
}));

owner.patch('/users/:id', wrap(async (req, res) => {
  const b = z.object({
    name: z.string().min(2).optional(),
    phone: z.string().min(8).optional(),
    email: z.string().email().optional().nullable(),
    password: z.string().min(6).optional(),
    role: z.enum(['manager', 'owner', 'station', 'partner', 'customer']).optional(),
    station_id: z.string().uuid().optional().nullable(),
    managed_station_ids: z.array(z.string().uuid()).optional(),
    active: z.boolean().optional(),
  }).parse(req.body);

  if (req.params.id === req.user.id && b.active === false) throw bad('You cannot deactivate your own account');
  if (req.params.id === req.user.id && b.role && b.role !== 'owner') throw bad('You cannot revoke your own owner role');

  if (b.phone) {
    const normPhone = normalizePhone(b.phone);
    const { rows: phoneDup } = await query('SELECT id FROM users WHERE phone=$1 AND id<>$2', [normPhone, req.params.id]);
    if (phoneDup.length) throw bad('This mobile number is already in use by another user');
  }

  if (b.role === 'station' && !b.station_id) {
    const { rows: current } = await query('SELECT station_id FROM users WHERE id=$1', [req.params.id]);
    if (!current[0]?.station_id) throw bad('Station staff need an assigned station');
  }

  await tx(async (db) => {
    const normPhone = b.phone ? normalizePhone(b.phone) : undefined;
    const pwHash = b.password ? await bcrypt.hash(b.password, 10) : undefined;

    await db.query(
      `UPDATE users
          SET name = COALESCE($2, name),
              phone = COALESCE($3, phone),
              email = CASE WHEN $4::boolean IS TRUE THEN $5::text ELSE email END,
              password_hash = COALESCE($6, password_hash),
              role = COALESCE($7, role),
              station_id = CASE
                WHEN $8::boolean IS TRUE THEN $9::uuid
                WHEN $7::text IS NOT NULL AND $7 <> 'station' THEN NULL
                ELSE station_id
              END,
              active = COALESCE($10, active)
        WHERE id = $1`,
      [
        req.params.id,
        b.name ? b.name.trim() : null,
        normPhone,
        b.email !== undefined,
        b.email ? b.email.trim().toLowerCase() : null,
        pwHash,
        b.role || null,
        b.station_id !== undefined,
        b.station_id || null,
        b.active,
      ],
    );

    if (b.managed_station_ids !== undefined || (b.role && b.role !== 'manager' && b.role !== 'partner')) {
      await db.query('DELETE FROM station_managers WHERE user_id=$1', [req.params.id]);
      if (b.managed_station_ids && (b.role === 'manager' || b.role === 'partner' || (!b.role))) {
        for (const s of b.managed_station_ids) {
          await db.query('INSERT INTO station_managers(station_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [s, req.params.id]);
        }
      }
    }

    if (b.password || b.active === false) {
      await db.query('UPDATE refresh_tokens SET revoked=true WHERE user_id=$1', [req.params.id]);
    }

    await audit(req.user.id, 'user.update', 'user', req.params.id, b, db);
  });

  const { rows: updated } = await query(
    `SELECT u.id, u.name, u.phone, u.email, u.role, u.active, u.station_id, u.beans, u.last_login_at, u.created_at,
            s.name AS station_name,
            COALESCE((SELECT json_agg(sm.station_id) FROM station_managers sm WHERE sm.user_id=u.id), '[]') AS managed_stations
       FROM users u LEFT JOIN stations s ON s.id=u.station_id WHERE u.id=$1`,
    [req.params.id],
  );
  res.json(updated[0] || { ok: true });
}));

owner.delete('/users/:id', wrap(async (req, res) => {
  if (req.params.id === req.user.id) throw bad('You cannot delete your own account');

  const { rows: target } = await query('SELECT id, name, phone, role FROM users WHERE id=$1', [req.params.id]);
  if (!target.length) throw notFound('User not found');

  const { rows: oRows } = await query('SELECT count(*)::int AS count FROM orders WHERE user_id=$1', [req.params.id]);
  if (oRows[0]?.count > 0) {
    throw bad(`This user has ${oRows[0].count} historical order(s). Due to financial audit regulations, deactivate the user instead of deleting.`);
  }

  await tx(async (db) => {
    await db.query('DELETE FROM station_managers WHERE user_id=$1', [req.params.id]);
    await db.query('DELETE FROM refresh_tokens WHERE user_id=$1', [req.params.id]);
    await db.query('DELETE FROM staff_profiles WHERE user_id=$1', [req.params.id]);
    await db.query('DELETE FROM time_off WHERE user_id=$1', [req.params.id]);
    await db.query('DELETE FROM coupons WHERE user_id=$1', [req.params.id]);
    await db.query('DELETE FROM passes WHERE user_id=$1', [req.params.id]);
    await db.query('DELETE FROM referrals WHERE referrer_id=$1 OR referee_id=$1', [req.params.id]);
    await db.query('UPDATE shifts SET user_id=NULL WHERE user_id=$1', [req.params.id]);
    await db.query('UPDATE shift_tasks SET done_by=NULL WHERE done_by=$1', [req.params.id]);
    await db.query('UPDATE audit_log SET actor_id=NULL WHERE actor_id=$1', [req.params.id]);
    await db.query('UPDATE cash_closes SET closed_by=NULL WHERE closed_by=$1', [req.params.id]);
    await db.query('UPDATE stock_counts SET counted_by=NULL WHERE counted_by=$1', [req.params.id]);
    await db.query('UPDATE stock_transfers SET requested_by=NULL WHERE requested_by=$1', [req.params.id]);
    await db.query('UPDATE stock_transfers SET dispatched_by=NULL WHERE dispatched_by=$1', [req.params.id]);
    await db.query('UPDATE stock_transfers SET received_by=NULL WHERE received_by=$1', [req.params.id]);
    await db.query('UPDATE purchase_orders SET created_by=NULL WHERE created_by=$1', [req.params.id]);
    await db.query('UPDATE purchase_orders SET received_by=NULL WHERE received_by=$1', [req.params.id]);
    await db.query('UPDATE settlements SET entered_by=NULL WHERE entered_by=$1', [req.params.id]);
    await db.query('UPDATE enquiries SET handled_by=NULL WHERE handled_by=$1', [req.params.id]);
    await db.query('UPDATE orders SET accepted_by=NULL WHERE accepted_by=$1', [req.params.id]);
    await db.query('UPDATE orders SET ready_by=NULL WHERE ready_by=$1', [req.params.id]);
    await db.query('UPDATE orders SET picked_up_by=NULL WHERE picked_up_by=$1', [req.params.id]);
    await db.query('UPDATE users SET referred_by=NULL WHERE referred_by=$1', [req.params.id]);

    await db.query('DELETE FROM users WHERE id=$1', [req.params.id]);
    await audit(req.user.id, 'user.delete', 'user', req.params.id, target[0], db);
  });

  res.json({ ok: true, deleted: target[0] });
}));

/* ---- menu ---- */
owner.get('/menu', wrap(async (_req, res) => {
  const { rows } = await query(
    `SELECT p.*, c.name AS category,
            COALESCE((SELECT json_agg(json_build_object('id', g.id, 'name', g.name, 'name_ne', g.name_ne, 'required', g.required, 'multi', g.multi,
              'options', COALESCE((SELECT json_agg(json_build_object('id', o.id, 'name', o.name, 'name_ne', o.name_ne, 'price_delta', o.price_delta, 'is_default', o.is_default) ORDER BY o.sort) FROM options o WHERE o.group_id=g.id), '[]')) ORDER BY g.sort)
              FROM option_groups g WHERE g.product_id=p.id), '[]') AS option_groups,
            COALESCE((SELECT json_agg(json_build_object('ingredient_id', r.ingredient_id, 'name', i.name, 'unit', i.unit, 'qty', r.qty)) FROM recipes r JOIN ingredients i ON i.id=r.ingredient_id WHERE r.product_id=p.id), '[]') AS recipe,
            (SELECT count(*)::int FROM order_items oi WHERE oi.product_id=p.id) AS sold_count,
            -- one row per live station: its price, whether it is switched on, and how many cups its current stock can still make
            COALESCE((SELECT json_agg(json_build_object(
                'station_id', s.id, 'station_name', s.name, 'station_code', s.code,
                'available', COALESCE(sp.available, true), 'price_override', sp.price_override, 'price', COALESCE(sp.price_override, p.price),
                'can_make', (SELECT min(floor(si.qty / r.qty))::int FROM recipes r JOIN station_inventory si ON si.ingredient_id=r.ingredient_id AND si.station_id=s.id WHERE r.product_id=p.id)
              ) ORDER BY s.code)
              FROM stations s LEFT JOIN station_products sp ON sp.station_id=s.id AND sp.product_id=p.id WHERE s.active), '[]') AS stations
       FROM products p LEFT JOIN categories c ON c.id=p.category_id ORDER BY c.sort NULLS LAST, p.sort, p.name`,
  );
  const cats = (await query('SELECT c.*, (SELECT count(*)::int FROM products p WHERE p.category_id=c.id) AS product_count FROM categories c ORDER BY c.sort, c.name')).rows;
  res.json({ categories: cats, products: rows });
}));
owner.post('/categories', wrap(async (req, res) => {
  const b = z.object({ name: z.string().min(2), name_ne: z.string().optional(), sort: z.number().int().default(0) }).parse(req.body);
  const r = (await query('INSERT INTO categories(name,name_ne,sort) VALUES ($1,$2,$3) RETURNING *', [b.name, b.name_ne, b.sort])).rows[0];
  await audit(req.user.id, 'category.create', 'category', r.id, { name: b.name });
  res.status(201).json(r);
}));
const CATEGORY_COLS = ['name', 'name_ne', 'sort'];
owner.patch('/categories/:id', wrap(async (req, res) => {
  const b = z.object({ name: z.string().min(2).optional(), name_ne: z.string().nullable().optional(), sort: z.number().int().optional() }).parse(req.body);
  const cols = CATEGORY_COLS.filter((c) => b[c] !== undefined);
  if (!cols.length) throw bad('Nothing to update');
  const { rows } = await query(`UPDATE categories SET ${cols.map((c, i) => `"${c}"=$${i + 2}`).join(',')} WHERE id=$1 RETURNING *`, [req.params.id, ...cols.map((c) => b[c])]);
  if (!rows[0]) throw notFound('Category not found');
  await audit(req.user.id, 'category.update', 'category', req.params.id, b);
  res.json(rows[0]);
}));
owner.delete('/categories/:id', wrap(async (req, res) => {
  const n = (await query('SELECT count(*)::int AS n FROM products WHERE category_id=$1', [req.params.id])).rows[0].n;
  if (n) throw bad(`This category still has ${n} item${n > 1 ? 's' : ''}. Move or delete them first.`);
  const r = await query('DELETE FROM categories WHERE id=$1 RETURNING name', [req.params.id]);
  if (!r.rows[0]) throw notFound('Category not found');
  await audit(req.user.id, 'category.delete', 'category', req.params.id, { name: r.rows[0].name });
  res.json({ ok: true });
}));
const PRODUCT_COLS = [
  'category_id', 'sku', 'name', 'name_ne', 'description', 'description_ne',
  'price', 'cost', 'prep_seconds', 'is_signature', 'is_seasonal',
  'pass_eligible', 'origin', 'image_url', 'active', 'sort', 'price_tier', 'kind',
];
const productSchema = z.object({
  category_id: z.string().uuid().optional(), sku: z.string().min(2).max(20), name: z.string().min(2), name_ne: z.string().optional(),
  description: z.string().optional(), description_ne: z.string().optional(), price: z.number().int().min(0), cost: z.number().int().min(0).default(0),
  prep_seconds: z.number().int().min(10).max(600).default(90), is_signature: z.boolean().default(false), is_seasonal: z.boolean().default(false),
  pass_eligible: z.boolean().default(true), origin: z.string().optional(), image_url: z.string().url().nullable().optional(), active: z.boolean().default(true), sort: z.number().int().default(0),
  price_tier: z.enum(['hot', 'flavored', 'iced']).nullable().optional(), kind: z.enum(['drink', 'food', 'merch']).optional(),
});
async function tierPrice(tier) { return tier ? (await getSettings())[`price_${tier}`] : null; }
owner.post('/products', wrap(async (req, res) => {
  const b = productSchema.parse(req.body);
  if (b.price_tier) b.price = await tierPrice(b.price_tier);
  else delete b.price_tier;
  const cols = PRODUCT_COLS.filter((c) => b[c] !== undefined);
  const { rows } = await query(`INSERT INTO products(${cols.map((c) => `"${c}"`).join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`, cols.map((c) => b[c]));
  await audit(req.user.id, 'product.create', 'product', rows[0].id, { sku: b.sku });
  res.status(201).json(rows[0]);
}));
const mediaIdOf = (url) => (typeof url === 'string' ? url.match(/\/media\/([0-9a-f-]{36})\./i)?.[1] : null) || null;
/** Delete an uploaded picture once nothing on the menu or site uses it any more. */
async function dropMediaIfUnused(db, url) {
  const id = mediaIdOf(url);
  if (!id) return;
  const used = (await db.query(`SELECT 1 FROM products WHERE image_url LIKE '%' || $1 || '%' UNION ALL SELECT 1 FROM site_content WHERE value::text LIKE '%' || $1 || '%' LIMIT 1`, [id])).rows.length;
  if (!used) await db.query('DELETE FROM media WHERE id=$1', [id]);
}
owner.patch('/products/:id', wrap(async (req, res) => {
  const b = productSchema.partial().parse(req.body);
  const cur = (await query('SELECT price_tier, image_url FROM products WHERE id=$1', [req.params.id])).rows[0];
  if (!cur) throw notFound('Product not found');
  if (b.price_tier) b.price = await tierPrice(b.price_tier);                 // tiered drinks take the tier price
  else if (b.price_tier === undefined && cur.price_tier) delete b.price;    // ...and cannot be priced by hand
  const cols = PRODUCT_COLS.filter((c) => b[c] !== undefined);
  if (!cols.length) throw bad('Nothing to update');
  const { rows } = await query(`UPDATE products SET ${cols.map((c, i) => `"${c}"=$${i + 2}`).join(',')} WHERE id=$1 RETURNING *`, [req.params.id, ...cols.map((c) => b[c])]);
  if (!rows[0]) throw notFound('Product not found');
  if (b.image_url !== undefined && cur.image_url && cur.image_url !== b.image_url) await dropMediaIfUnused({ query }, cur.image_url);
  await audit(req.user.id, 'product.update', 'product', req.params.id, b);
  res.json(rows[0]);
}));
owner.delete('/products/:id', wrap(async (req, res) => {
  const p = (await query('SELECT id, sku, name, image_url FROM products WHERE id=$1', [req.params.id])).rows[0];
  if (!p) throw notFound('Product not found');
  try {
    await tx(async (db) => {
      await db.query('DELETE FROM products WHERE id=$1', [p.id]); // recipes, options and station settings go with it
      await audit(req.user.id, 'product.delete', 'product', p.id, { sku: p.sku, name: p.name }, db);
    });
  } catch (e) {
    if (e.code === '23503') throw bad(`${p.name} is part of past orders, offers or a drop, so it cannot be erased without breaking your sales history. Switch off "On the menu" to retire it instead.`);
    throw e;
  }
  await dropMediaIfUnused({ query }, p.image_url);
  res.json({ ok: true });
}));
owner.post('/products/:id/duplicate', wrap(async (req, res) => {
  const src = (await query('SELECT * FROM products WHERE id=$1', [req.params.id])).rows[0];
  if (!src) throw notFound('Product not found');
  const copy = await tx(async (db) => {
    let sku = `${src.sku}-2`.slice(0, 20), n = 2;
    while ((await db.query('SELECT 1 FROM products WHERE sku=$1', [sku])).rows.length) { n += 1; sku = `${src.sku.slice(0, 17)}-${n}`; }
    const restCols = PRODUCT_COLS.filter((k) => !['sku', 'name', 'image_url', 'active'].includes(k) && src[k] !== undefined);
    const cols = ['sku', 'name', 'image_url', 'active', ...restCols];
    const vals = [sku, `${src.name} (copy)`, null, false, ...restCols.map((k) => src[k])];
    const np = (await db.query(`INSERT INTO products(${cols.map((c) => `"${c}"`).join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`, vals)).rows[0];
    await db.query('INSERT INTO recipes(product_id, ingredient_id, qty) SELECT $2, ingredient_id, qty FROM recipes WHERE product_id=$1', [src.id, np.id]);
    const groups = (await db.query('SELECT * FROM option_groups WHERE product_id=$1 ORDER BY sort', [src.id])).rows;
    for (const g of groups) {
      const ng = (await db.query('INSERT INTO option_groups(product_id,name,name_ne,required,multi,sort) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [np.id, g.name, g.name_ne, g.required, g.multi, g.sort])).rows[0];
      for (const o of (await db.query('SELECT * FROM options WHERE group_id=$1 ORDER BY sort', [g.id])).rows) {
        const no = (await db.query('INSERT INTO options(group_id,name,name_ne,price_delta,is_default,sort) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [ng.id, o.name, o.name_ne, o.price_delta, o.is_default, o.sort])).rows[0];
        await db.query('INSERT INTO option_recipes(option_id, ingredient_id, qty) SELECT $2, ingredient_id, qty FROM option_recipes WHERE option_id=$1', [o.id, no.id]);
      }
    }
    await audit(req.user.id, 'product.duplicate', 'product', np.id, { from: src.id }, db);
    return np;
  });
  res.status(201).json(copy);
}));
/** Price and on/off for one item at every station in a single save. A null price falls back to the base price. */
owner.put('/products/:id/stations', wrap(async (req, res) => {
  const rows = z.array(z.object({ station_id: z.string().uuid(), available: z.boolean().optional(), price_override: z.number().int().min(0).nullable().optional() })).min(1).parse(req.body);
  const p = (await query('SELECT id, price_tier FROM products WHERE id=$1', [req.params.id])).rows[0];
  if (!p) throw notFound('Product not found');
  if (p.price_tier && rows.some((r) => r.price_override != null)) throw bad('Hot, flavored and iced drinks have one price at every station. Change the tier price in Settings.');
  await tx(async (db) => {
    for (const r of rows) {
      await db.query(
        `INSERT INTO station_products(station_id, product_id, available, price_override) VALUES ($1,$2,COALESCE($3,true),$4)
         ON CONFLICT (station_id, product_id) DO UPDATE SET available=COALESCE($3, station_products.available),
           price_override = CASE WHEN $5 THEN $4 ELSE station_products.price_override END`,
        [r.station_id, p.id, r.available, r.price_override ?? null, r.price_override !== undefined],
      );
    }
    await audit(req.user.id, 'menu.station_bulk', 'product', p.id, { stations: rows.length }, db);
  });
  res.json({ ok: true });
}));
/** For one item: every ingredient in its recipe and how much of it each station holds, i.e. how many cups are left. */
owner.get('/products/:id/stock', wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT s.id AS station_id, s.name AS station_name, i.id AS ingredient_id, i.name AS ingredient, i.unit, r.qty AS per_cup,
            COALESCE(si.qty, 0) AS on_hand, COALESCE(si.reorder_level, 0) AS reorder_level, floor(COALESCE(si.qty, 0) / r.qty)::int AS cups
       FROM stations s CROSS JOIN recipes r JOIN ingredients i ON i.id=r.ingredient_id
       LEFT JOIN station_inventory si ON si.station_id=s.id AND si.ingredient_id=i.id
      WHERE r.product_id=$1 AND s.active ORDER BY s.code, i.name`, [req.params.id],
  );
  res.json(rows.map((r) => ({ ...r, per_cup: Number(r.per_cup), on_hand: Number(r.on_hand), reorder_level: Number(r.reorder_level) })));
}));
/** Save a new order for items (and optionally categories) after the owner moves them. */
owner.put('/menu/order', wrap(async (req, res) => {
  const b = z.object({ products: z.array(z.string().uuid()).default([]), categories: z.array(z.string().uuid()).default([]) }).parse(req.body);
  await tx(async (db) => {
    for (const [i, id] of b.products.entries()) await db.query('UPDATE products SET sort=$2 WHERE id=$1', [id, i]);
    for (const [i, id] of b.categories.entries()) await db.query('UPDATE categories SET sort=$2 WHERE id=$1', [id, i]);
  });
  res.json({ ok: true });
}));
owner.put('/products/:id/options', wrap(async (req, res) => {
  const groups = z.array(z.object({
    id: z.string().uuid().optional(),
    name: z.string().min(1), name_ne: z.string().nullish(), required: z.boolean().default(false), multi: z.boolean().default(false),
    options: z.array(z.object({ id: z.string().uuid().optional(), name: z.string().min(1), name_ne: z.string().nullish(), price_delta: z.number().int().default(0), is_default: z.boolean().default(false) })).min(1),
  })).parse(req.body);
  const pid = req.params.id;
  if (!(await query('SELECT 1 FROM products WHERE id=$1', [pid])).rows.length) throw notFound('Product not found');
  await tx(async (db) => {
    const keepG = [];
    for (const [gi, g] of groups.entries()) {
      const own = g.id && (await db.query('SELECT 1 FROM option_groups WHERE id=$1 AND product_id=$2', [g.id, pid])).rows.length;
      let gid;
      if (own) { gid = g.id; await db.query('UPDATE option_groups SET name=$2, name_ne=$3, required=$4, multi=$5, sort=$6 WHERE id=$1', [gid, g.name, g.name_ne ?? null, g.required, g.multi, gi]); }
      else gid = (await db.query('INSERT INTO option_groups(product_id,name,name_ne,required,multi,sort) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [pid, g.name, g.name_ne ?? null, g.required, g.multi, gi])).rows[0].id;
      keepG.push(gid);
      const keepO = [];
      for (const [oi, o] of g.options.entries()) {
        const ownO = o.id && (await db.query('SELECT 1 FROM options WHERE id=$1 AND group_id=$2', [o.id, gid])).rows.length;
        if (ownO) { await db.query('UPDATE options SET name=$2, name_ne=$3, price_delta=$4, is_default=$5, sort=$6 WHERE id=$1', [o.id, o.name, o.name_ne ?? null, o.price_delta, o.is_default, oi]); keepO.push(o.id); }
        else keepO.push((await db.query('INSERT INTO options(group_id,name,name_ne,price_delta,is_default,sort) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [gid, o.name, o.name_ne ?? null, o.price_delta, o.is_default, oi])).rows[0].id);
      }
      await db.query('DELETE FROM options WHERE group_id=$1 AND id <> ALL($2::uuid[])', [gid, keepO]);
    }
    await db.query('DELETE FROM option_groups WHERE product_id=$1 AND id <> ALL($2::uuid[])', [pid, keepG]);
    await audit(req.user.id, 'product.options', 'product', pid, { groups: groups.length }, db);
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
  const entries = Object.entries(z.record(z.number()).parse(req.body))
    .filter(([k]) => k in DEFAULT_SETTINGS)
    .map(([k, v]) => [k, validateSettingValue(k, v)]);
  for (const [k, v] of entries) {
    await query(`INSERT INTO settings(key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=now()`, [k, JSON.stringify(v)]);
  }
  await audit(req.user.id, 'settings.update', 'settings', null, Object.fromEntries(entries));
  const out = await getSettings();
  // One price per kind of drink, at every station: changing a tier price reprices every drink in it.
  if (entries.some(([k]) => k.startsWith('price_'))) {
    for (const t of ['hot', 'flavored', 'iced']) await query('UPDATE products SET price=$2 WHERE price_tier=$1', [t, out[`price_${t}`]]);
    await query(`UPDATE station_products SET price_override=NULL WHERE product_id IN (SELECT id FROM products WHERE price_tier IS NOT NULL)`);
  }
  res.json(out);
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
  const b = z.object({ provider: z.enum(['esewa']), day: z.string().regex(/^\d{4}-\d\d-\d\d$/), amount: z.number().int().min(0), note: z.string().optional() }).parse(req.body);
  const { rows } = await query(
    `INSERT INTO settlements(provider, day, amount, note, entered_by) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (provider, day) DO UPDATE SET amount=$3, note=$4, entered_by=$5 RETURNING *`, [b.provider, b.day, b.amount, b.note, req.user.id],
  );
  await audit(req.user.id, 'settlement.enter', 'settlement', rows[0].id, b);
  res.status(201).json(rows[0]);
}));
owner.get('/reports/passes', wrap(async (req, res) => {
  const from = req.query.from || '2020-01-01';
  const to = req.query.to ? `${req.query.to} 23:59:59` : '2099-12-31 23:59:59';
  const s = await getSettings();

  const [kpiRes, byStationRes, breakageRes, listRes] = await Promise.all([
    query(
      `SELECT
        (SELECT count(*)::int FROM passes WHERE status IN ('active','used','expired') AND purchased_at >= $1 AND purchased_at <= $2) AS passes_sold,
        (SELECT COALESCE(sum(price_paid), 0)::int FROM passes WHERE status IN ('active','used','expired') AND purchased_at >= $1 AND purchased_at <= $2) AS total_revenue,
        (SELECT COALESCE(sum(u.cups), 0)::int FROM order_pass_uses u JOIN orders o ON o.id=u.order_id WHERE o.status NOT IN ('cancelled','awaiting_payment') AND o.created_at >= $1 AND o.created_at <= $2) AS redeemed_cups,
        (SELECT count(*)::int FROM passes WHERE status='active' AND expires_at > now()) AS active_passes,
        (SELECT COALESCE(sum(total_cups - used_cups), 0)::int FROM passes WHERE status='active' AND expires_at > now()) AS outstanding_cups,
        (SELECT count(*)::int FROM passes WHERE related_party AND purchased_at >= $1 AND purchased_at <= $2) AS related_party_count,
        (SELECT count(*)::int FROM passes WHERE status='used' AND purchased_at >= $1 AND purchased_at <= $2) AS completed_passes`,
      [from, to],
    ),
    query(
      `SELECT s.id, s.name,
              COALESCE(sum(u.cups), 0)::int AS redeemed_cups,
              count(DISTINCT o.id)::int AS orders_count
         FROM stations s
         LEFT JOIN orders o ON o.station_id = s.id AND o.status NOT IN ('cancelled','awaiting_payment') AND o.created_at >= $1 AND o.created_at <= $2
         LEFT JOIN order_pass_uses u ON u.order_id = o.id
        WHERE s.active
        GROUP BY s.id, s.name
        ORDER BY redeemed_cups DESC`,
      [from, to],
    ),
    query(
      `SELECT count(*)::int AS expired_count,
              COALESCE(sum(total_cups - used_cups), 0)::int AS breakage_cups,
              COALESCE(sum((total_cups - used_cups) * (price_paid / total_cups)), 0)::int AS breakage_value
         FROM passes
        WHERE status = 'expired' OR (status = 'active' AND expires_at < now())`,
    ),
    query(
      `SELECT p.id, p.code, p.status, p.total_cups, p.used_cups,
              GREATEST(0, p.total_cups - p.used_cups) AS remaining,
              p.price_paid, p.purchased_at, p.activated_at, p.expires_at, p.related_party,
              u.name AS customer_name, u.phone AS customer_phone
         FROM passes p
         JOIN users u ON u.id = p.user_id
        WHERE p.status <> 'pending'
        ORDER BY p.purchased_at DESC
        LIMIT 300`,
    ),
  ]);

  const kpi = kpiRes.rows[0];
  const brk = breakageRes.rows[0];
  const unitPrice = s.pass_price / s.pass_cups;
  const liabilityValue = Math.round(kpi.outstanding_cups * unitPrice);

  res.json({
    kpi: {
      ...kpi,
      liability_value: liabilityValue,
      breakage_cups: brk.breakage_cups,
      breakage_value: brk.breakage_value,
      expired_count: brk.expired_count,
      pass_price: s.pass_price,
      pass_cups: s.pass_cups,
      redemption_pct: kpi.passes_sold ? Math.round((kpi.redeemed_cups / (kpi.passes_sold * s.pass_cups)) * 100) : null,
    },
    by_station: byStationRes.rows.map((st) => ({
      ...st,
      est_reimbursement: Math.round(st.redeemed_cups * unitPrice),
    })),
    register: listRes.rows,
  });
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
    await db.query('UPDATE products SET recipe_version = recipe_version + 1 WHERE id=$1', [req.params.productId]); // every station works from the same standard recipe
    await audit(req.user.id, 'recipe.update', 'product', req.params.productId, { lines: b.lines.length }, db);
    return recomputeProductCosts(db, { productId: req.params.productId });
  });
  res.json({ ok: true, recosted: moved });
}));

/* ---- enquiries from the partner and investor pages ---- */
owner.get('/enquiries', wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT e.id, e.kind, e.name, e.email, e.phone, e.org, e.city, e.message, e.extra, e.status, e.note, e.created_at, u.name AS handled_by_name FROM enquiries e LEFT JOIN users u ON u.id=e.handled_by
      WHERE ($1::text IS NULL OR e.status=$1) AND ($2::text IS NULL OR e.kind=$2) ORDER BY (e.status='new') DESC, e.created_at DESC LIMIT 200`, [req.query.status || null, req.query.kind || null]);
  res.json(rows);
}));
owner.patch('/enquiries/:id', wrap(async (req, res) => {
  const b = z.object({ status: z.enum(['new', 'contacted', 'meeting', 'won', 'closed']).optional(), note: z.string().max(500).optional() }).parse(req.body);
  await query('UPDATE enquiries SET status=COALESCE($2,status), note=COALESCE($3,note), handled_by=$4 WHERE id=$1', [req.params.id, b.status, b.note, req.user.id]);
  await audit(req.user.id, 'enquiry.update', 'enquiry', req.params.id, b);
  res.json({ ok: true });
}));

/* ============================================================================
   Data Management: Export, Selective Reset, and Restore
   ============================================================================ */

const EXPORT_TABLES = [
  'stations', 'categories', 'products', 'option_groups', 'options', 'recipes', 'option_recipes',
  'suppliers', 'ingredients', 'station_inventory', 'central_inventory', 'settings',
  'users', 'station_managers', 'orders', 'order_items', 'payments', 'passes', 'coupons',
  'promo_codes', 'daily_offers', 'drops', 'settlements', 'cash_closes',
  'shifts', 'shift_tasks', 'shift_templates', 'time_off', 'staff_profiles',
  'stock_counts', 'stock_count_lines', 'stock_transfers', 'transfer_lines',
  'purchase_orders', 'purchase_lines', 'enquiries', 'audit_log'
];

/** 1. Export all data to JSON */
owner.get('/data/export', wrap(async (req, res) => {
  const tables = {};
  for (const tbl of EXPORT_TABLES) {
    try {
      const { rows } = await query(`SELECT * FROM ${tbl}`);
      // Scrub passwords from users table export for security
      if (tbl === 'users') {
        tables[tbl] = rows.map((u) => {
          const { password_hash, ...safe } = u;
          return safe;
        });
      } else {
        tables[tbl] = rows;
      }
    } catch {
      tables[tbl] = [];
    }
  }

  const filename = `sadhai-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/json');
  res.json({
    app: 'sadhai-coffee',
    version: '1.6.0',
    exported_at: new Date().toISOString(),
    exported_by: req.user.id,
    table_counts: Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length])),
    tables,
  });
}));

/** 2. Selective secured reset */
owner.post('/data/reset', wrap(async (req, res) => {
  const b = z.object({
    password: z.string().min(1, 'Password required'),
    confirmation: z.string().min(1, 'Type RESET to confirm'),
    targets: z.array(z.string()).min(1, 'Select at least one category to reset'),
  }).parse(req.body);

  if (b.confirmation.trim().toUpperCase() !== 'RESET') {
    throw bad('Confirmation phrase must be RESET');
  }

  // Verify owner password
  const { rows: uRows } = await query('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
  if (!uRows[0] || !(await bcrypt.compare(b.password, uRows[0].password_hash))) {
    throw bad('Incorrect password. Security verification failed.');
  }

  const cleared = [];
  await tx(async (db) => {
    // Orders & Transactions
    if (b.targets.includes('orders') || b.targets.includes('all')) {
      await db.query('TRUNCATE order_items, orders, payments, settlements, cash_closes CASCADE');
      cleared.push('orders', 'order_items', 'payments', 'settlements', 'cash_closes');
    }

    // Customers & Customer Loyalty
    if (b.targets.includes('customers') || b.targets.includes('all')) {
      await db.query('TRUNCATE referrals, coupons, passes CASCADE');
      await db.query("DELETE FROM users WHERE role = 'customer'");
      cleared.push('customers', 'coupons', 'passes', 'referrals');
    }

    // Shifts, Attendance & Payroll
    if (b.targets.includes('shifts') || b.targets.includes('all')) {
      await db.query('TRUNCATE payroll_adjustments, payroll_lines, payroll_runs, time_off, shift_tasks, shifts CASCADE');
      cleared.push('shifts', 'payroll');
    }

    // Inventory audit counts & movement history
    if (b.targets.includes('inventory_history') || b.targets.includes('all')) {
      await db.query('TRUNCATE stock_count_lines, stock_counts, transfer_lines, stock_transfers, purchase_lines, purchase_orders, central_moves, inventory_moves CASCADE');
      cleared.push('inventory_movements', 'stock_counts', 'purchases');
    }

    // Marketing campaigns & drops
    if (b.targets.includes('marketing') || b.targets.includes('all')) {
      await db.query('TRUNCATE daily_offers, drops, promo_codes CASCADE');
      cleared.push('daily_offers', 'drops', 'promo_codes');
    }

    // Full baseline catalog reset (clears everything and leaves 0 orders with clean catalog)
    if (b.targets.includes('clean_baseline')) {
      await db.query(`TRUNCATE payroll_adjustments, payroll_lines, payroll_runs, time_off, shift_tasks, shifts, shift_templates, staff_profiles, stock_count_lines, stock_counts, transfer_lines, stock_transfers, purchase_lines, purchase_orders, central_moves, daily_offers, settlements, cash_closes, notifications, referrals, payments, order_items, orders, drops, promo_codes, coupons, passes, refresh_tokens CASCADE`);
      await db.query("DELETE FROM users WHERE id <> $1 AND role = 'customer'", [req.user.id]);
      cleared.push('clean_baseline');
    }

    await audit(req.user.id, 'data.reset', 'system', { targets: b.targets, cleared }, db);
  });

  res.json({ ok: true, cleared, time: new Date().toISOString() });
}));

/** 3. Restore data from backup JSON (with strict table & column schema whitelisting) */
const IDENT_RE = /^[a-z_][a-z0-9_]{0,62}$/;
owner.post('/data/restore', wrap(async (req, res) => {
  const b = z.object({
    password: z.string().min(1, 'Password required'),
    backup: z.object({
      app: z.literal('sadhai-coffee'),
      tables: z.record(z.array(z.record(z.any()))),
    }),
  }).parse(req.body);

  // Verify owner password
  const { rows: uRows } = await query('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
  if (!uRows[0] || !(await bcrypt.compare(b.password, uRows[0].password_hash))) {
    throw bad('Incorrect password. Restore denied.');
  }

  const restored = [];
  await tx(async (db) => {
    // Load valid column names for all exportable tables from information_schema
    const { rows: schemaRows } = await db.query(
      `SELECT table_name, column_name
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ANY($1)`,
      [EXPORT_TABLES],
    );
    const validColsByTable = new Map();
    for (const r of schemaRows) {
      if (!validColsByTable.has(r.table_name)) validColsByTable.set(r.table_name, new Set());
      validColsByTable.get(r.table_name).add(r.column_name);
    }

    const assertSafeCols = (tbl, keys) => {
      const allowed = validColsByTable.get(tbl);
      if (!allowed) throw bad(`Unknown table in backup: ${tbl}`);
      for (const k of keys) {
        if (!IDENT_RE.test(k) || !allowed.has(k)) {
          throw bad(`Invalid or unknown column "${k}" in backup table "${tbl}"`);
        }
      }
    };

    // Restore tables that are present in the backup
    for (const [tbl, rows] of Object.entries(b.backup.tables)) {
      if (!EXPORT_TABLES.includes(tbl) || !Array.isArray(rows) || !rows.length) continue;

      // For safety, do not overwrite the active owner with restored hash if missing
      if (tbl === 'users') {
        for (const row of rows) {
          if (!row || typeof row !== 'object' || Array.isArray(row)) throw bad('Invalid row in users backup');
          if (row.id === req.user.id) continue;
          const cols = Object.keys(row).filter((k) => k !== 'password_hash');
          if (!cols.length) continue;
          assertSafeCols(tbl, cols);
          const quotedCols = cols.map((c) => `"${c}"`).join(',');
          const placeholders = cols.map((_, i) => `$${i + 1}`).join(',');
          const vals = cols.map((k) => row[k]);
          await db.query(
            `INSERT INTO "users" (${quotedCols}, "password_hash") VALUES (${placeholders}, $${cols.length + 1})
             ON CONFLICT ("id") DO UPDATE SET ${cols.map((c) => `"${c}"=EXCLUDED."${c}"`).join(',')}`,
            [...vals, uRows[0].password_hash],
          );
        }
      } else {
        for (const row of rows) {
          if (!row || typeof row !== 'object' || Array.isArray(row)) throw bad(`Invalid row in ${tbl} backup`);
          const cols = Object.keys(row);
          if (!cols.length) continue;
          assertSafeCols(tbl, cols);
          const quotedCols = cols.map((c) => `"${c}"`).join(',');
          const placeholders = cols.map((_, i) => `$${i + 1}`).join(',');
          const vals = cols.map((k) => row[k]);
          await db.query(
            `INSERT INTO "${tbl}" (${quotedCols}) VALUES (${placeholders})
             ON CONFLICT DO NOTHING`,
            vals,
          );
        }
      }
      restored.push(tbl);
    }

    await audit(req.user.id, 'data.restore', 'system', { restored_tables: restored }, db);
  });

  res.json({ ok: true, restored, time: new Date().toISOString() });
}));

