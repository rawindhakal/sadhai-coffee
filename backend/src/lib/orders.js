import { tx, query } from './db.js';
import { bad, conflict, forbidden, notFound } from './http.js';
import { publish } from './hub.js';
import { notify, audit } from './notify.js';
import { getSettings } from './settings.js';
import { initiate } from './payments.js';
import { rtBool } from './runtime.js';
import crypto from 'node:crypto';
import { stockNeeds, recipeBreakdown } from './costing.js';

const KTM_NOW = `(now() AT TIME ZONE 'Asia/Kathmandu')::time`;

/* ---------------------------------------------------------------- offers */

export async function liveOffers(db, stationId) {
  const { rows } = await db.query(
    `SELECT * FROM daily_offers WHERE active AND starts_at <= now() AND ends_at >= now()
        AND (station_id IS NULL OR station_id = $1) AND (max_uses IS NULL OR used < max_uses)`, [stationId],
  );
  return rows;
}

// Cheapest live offer that applies to a product (kind/category/product scope).
export function bestOffer(offers, p, basePrice) {
  let best = null;
  for (const o of offers) {
    const hit = (o.scope === 'product' && o.product_id === p.id) || (o.scope === 'category' && o.category_id === p.category_id) || (o.scope === 'all_drinks' && p.kind === 'drink');
    if (!hit) continue;
    const price = o.offer_price != null && o.scope === 'product' ? o.offer_price : Math.floor((basePrice * (100 - (o.pct || 0))) / 100);
    if (price < basePrice && (!best || price < best.price)) best = { offer: o, price };
  }
  return best;
}

export async function bestSellers(stationId, db = { query }) {
  const { rows } = await db.query(
    `SELECT i.product_id, sum(i.qty)::int AS n FROM order_items i JOIN orders o ON o.id=i.order_id JOIN products p ON p.id=i.product_id
      WHERE o.station_id=$1 AND o.status NOT IN ('cancelled','awaiting_payment') AND o.created_at > now() - interval '30 days' AND p.kind <> 'merch'
      GROUP BY 1 ORDER BY n DESC LIMIT 8`, [stationId],
  );
  if (rows.length >= 4) return rows.map((r) => r.product_id);
  const all = await db.query(
    `SELECT i.product_id, sum(i.qty)::int AS n FROM order_items i JOIN orders o ON o.id=i.order_id JOIN products p ON p.id=i.product_id
      WHERE o.status NOT IN ('cancelled','awaiting_payment') AND p.kind <> 'merch' GROUP BY 1 ORDER BY n DESC LIMIT 8`,
  );
  return all.rows.map((r) => r.product_id);
}

/* ---------------------------------------------------------------- menu */

export async function stationMenu(stationId, db = { query }) {
  const { rows: cats } = await db.query('SELECT id, name, name_ne, sort FROM categories ORDER BY sort, name');
  const { rows: prods } = await db.query(
    `SELECT p.*, COALESCE(sp.price_override, p.price) AS station_price,
            COALESCE(sp.available, true) AS station_available,
            NOT EXISTS (
              SELECT 1 FROM recipes r
              JOIN station_inventory si ON si.ingredient_id = r.ingredient_id AND si.station_id = $1
              WHERE r.product_id = p.id AND si.qty < r.qty
            ) AS in_stock
       FROM products p
       LEFT JOIN station_products sp ON sp.product_id = p.id AND sp.station_id = $1
      WHERE p.active
      ORDER BY p.sort, p.name`,
    [stationId],
  );
  const ids = prods.map((p) => p.id);
  const { rows: groups } = await db.query(
    `SELECT g.id, g.product_id, g.name, g.name_ne, g.required, g.multi, g.sort,
            COALESCE(json_agg(json_build_object('id', o.id, 'name', o.name, 'name_ne', o.name_ne,
              'price_delta', o.price_delta, 'is_default', o.is_default) ORDER BY o.sort, o.name)
              FILTER (WHERE o.id IS NOT NULL), '[]') AS options
       FROM option_groups g LEFT JOIN options o ON o.group_id = g.id
      WHERE g.product_id = ANY($1::uuid[]) GROUP BY g.id ORDER BY g.sort`,
    [ids],
  );
  const { rows: drops } = await db.query(
    `SELECT * FROM drops WHERE active AND starts_at <= now() AND ends_at >= now()`,
  );
  const dropByProduct = new Map(drops.map((d) => [d.product_id, d]));
  const offers = await liveOffers(db, stationId);
  const products = prods.map((p) => {
    const drop = dropByProduct.get(p.id);
    const dropLive = drop && drop.sold < drop.cap;
    const deal = !dropLive ? bestOffer(offers, p, p.station_price) : null;
    return {
      kind: p.kind,
      offer: deal ? { id: deal.offer.id, title: deal.offer.title, title_ne: deal.offer.title_ne, original: p.station_price, ends_at: deal.offer.ends_at } : null,
      id: p.id, category_id: p.category_id, sku: p.sku, name: p.name, name_ne: p.name_ne,
      description: p.description, description_ne: p.description_ne, origin: p.origin,
      image_url: p.image_url, is_signature: p.is_signature, is_seasonal: p.is_seasonal,
      pass_eligible: p.pass_eligible, prep_seconds: p.prep_seconds,
      price: dropLive ? drop.price : deal ? deal.price : p.station_price,
      list_price: p.station_price,
      available: p.station_available && p.in_stock && (!drop || dropLive),
      sold_out_reason: !p.station_available ? 'station' : !p.in_stock ? 'stock' : drop && !dropLive ? 'drop_finished' : null,
      drop: drop ? { id: drop.id, name: drop.name, name_ne: drop.name_ne, partner: drop.partner, cap: drop.cap, sold: drop.sold, remaining: Math.max(0, drop.cap - drop.sold), ends_at: drop.ends_at } : null,
      option_groups: groups.filter((g) => g.product_id === p.id),
    };
  });
  return cats.map((c) => ({ ...c, products: products.filter((p) => p.category_id === c.id) })).filter((c) => c.products.length);
}

/* --------------------------------------------------------------- pricing */

async function loadStationForOrder(db, stationId, channel) {
  const { rows } = await db.query(
    `SELECT *, (${KTM_NOW} BETWEEN opens AND closes) AS within_hours FROM stations WHERE id=$1 AND active`,
    [stationId],
  );
  const s = rows[0];
  if (!s) throw notFound('Station not found');
  if (channel !== 'counter') {
    if (!s.is_open || (!s.within_hours && !rtBool('ignore_station_hours'))) throw conflict('This station is closed right now', 'station_closed');
    if (!s.accepting_orders) throw conflict('This station is not taking new orders for a moment', 'station_busy');
  }
  return s;
}

async function priceLines(db, stationId, items) {
  if (!Array.isArray(items) || !items.length) throw bad('Your cart is empty');
  const lines = [];
  const drops = new Map();
  const offerUse = new Map();
  const offers = await liveOffers(db, stationId);
  for (const it of items) {
    const qty = Math.max(1, Math.min(10, Number(it.qty) || 1));
    const { rows } = await db.query(
      `SELECT p.*, COALESCE(sp.price_override, p.price) AS station_price, COALESCE(sp.available, true) AS station_available
         FROM products p LEFT JOIN station_products sp ON sp.product_id = p.id AND sp.station_id = $2
        WHERE p.id = $1 AND p.active`,
      [it.product_id, stationId],
    );
    const p = rows[0];
    if (!p) throw bad('An item in your cart is no longer on the menu');
    if (!p.station_available) throw conflict(`${p.name} is finished at this station for today`, 'sold_out');

    let base = p.station_price;
    const { rows: dr } = await db.query(
      `SELECT * FROM drops WHERE product_id=$1 AND active AND starts_at<=now() AND ends_at>=now() FOR UPDATE`,
      [p.id],
    );
    const drop = dr[0];
    if (drop) {
      const already = drops.get(drop.id) || 0;
      if (drop.sold + already + qty > drop.cap) throw conflict(`${drop.name} is finished. Next drop on the 1st.`, 'drop_finished');
      base = drop.price;
      drops.set(drop.id, already + qty);
    }
    let offerId = null;
    if (!drop) {
      const deal = bestOffer(offers, p, base);
      if (deal) {
        const used = offerUse.get(deal.offer.id) || 0;
        if (deal.offer.max_uses == null || deal.offer.used + used + qty <= deal.offer.max_uses) {
          base = deal.price; offerId = deal.offer.id; offerUse.set(deal.offer.id, used + qty);
        }
      }
    }

    const { rows: groups } = await db.query(
      `SELECT g.id, g.name, g.required, g.multi FROM option_groups g WHERE g.product_id=$1`, [p.id],
    );
    const chosenIds = Array.isArray(it.option_ids) ? it.option_ids : [];
    let chosen = [];
    if (chosenIds.length) {
      const r = await db.query(
        `SELECT o.id, o.name, o.name_ne, o.price_delta, o.group_id FROM options o
           JOIN option_groups g ON g.id=o.group_id WHERE o.id = ANY($1::uuid[]) AND g.product_id=$2`,
        [chosenIds, p.id],
      );
      chosen = r.rows;
      if (chosen.length !== new Set(chosenIds).size) throw bad('One of the options is not valid for this item');
    }
    for (const g of groups) {
      const n = chosen.filter((o) => o.group_id === g.id).length;
      if (g.required && n === 0) throw bad(`Choose ${g.name.toLowerCase()} for ${p.name}`);
      if (!g.multi && n > 1) throw bad(`Choose only one ${g.name.toLowerCase()} for ${p.name}`);
    }
    const unit = base + chosen.reduce((a, o) => a + o.price_delta, 0);
    lines.push({
      product: p, product_id: p.id, name: p.name, qty, unit_price: unit, line_total: unit * qty,
      options: chosen.map((o) => ({ id: o.id, name: o.name, price_delta: o.price_delta })),
      drop_id: drop?.id || null, offer_id: offerId,
    });
  }
  return { lines, drops, offerUse };
}

async function discountFor(db, user, input, lines, subtotal, stationId) {
  const out = { discount: 0, label: null, coupon_id: null, promo_code_id: null, pass_id: null };
  const cups = lines.reduce((a, l) => a + l.qty, 0);
  const wants = [input.payment_method === 'pass', !!input.coupon_id, !!input.promo_code].filter(Boolean).length;
  if (wants > 1) throw bad('Use one offer at a time: a pass, a coupon or a promo code');

  if (input.payment_method === 'pass') {
    if (!user) throw bad('Sign in to use your pass');
    if (lines.some((l) => !l.product.pass_eligible)) throw bad('Your pass covers drinks only');
    // Passes are used one after another: already-started passes first (soonest to end), then the oldest unstarted one.
    const { rows } = await db.query(
      `SELECT * FROM passes WHERE user_id=$1 AND status='active' AND expires_at > now() AND used_cups < total_cups
        ORDER BY (activated_at IS NULL), expires_at, purchased_at FOR UPDATE`,
      [user.id],
    );
    if (!rows.length) throw conflict('You have no active pass. Buy a 10-cup pass first.', 'no_pass');
    const left = rows.reduce((a, p) => a + (p.total_cups - p.used_cups), 0);
    if (left < cups) throw conflict(`Your passes have ${left} cup${left === 1 ? '' : 's'} left in total`, 'pass_short');
    const plan = [];
    let need = cups;
    for (const p of rows) {
      if (need <= 0) break;
      const take = Math.min(need, p.total_cups - p.used_cups);
      plan.push({ pass_id: p.id, code: p.code, cups: take });
      need -= take;
    }
    return { ...out, discount: subtotal, label: plan.length > 1 ? '10-cup passes' : '10-cup pass', pass_id: plan[0].pass_id, pass_plan: plan };
  }
  if (input.coupon_id) {
    if (!user) throw bad('Sign in to use a coupon');
    const { rows } = await db.query(`SELECT * FROM coupons WHERE id=$1 AND user_id=$2 FOR UPDATE`, [input.coupon_id, user.id]);
    const c = rows[0];
    if (!c || c.status !== 'active' || new Date(c.expires_at) < new Date()) throw conflict('That coupon is no longer valid', 'coupon_invalid');
    if (c.kind === 'first_cup' || c.kind === 'referral_cup') {
      const top = Math.max(...lines.map((l) => l.unit_price));
      out.discount = Math.min(c.free_max ?? top, top);
    } else {
      out.discount = Math.floor((subtotal * c.pct) / 100);
    }
    return { ...out, label: c.title, coupon_id: c.id };
  }
  if (input.promo_code) {
    const { rows } = await db.query(`SELECT * FROM promo_codes WHERE upper(code)=upper($1) FOR UPDATE`, [input.promo_code]);
    const p = rows[0];
    if (!p || !p.active) throw bad('That promo code is not valid');
    if (p.valid_until && new Date(p.valid_until) < new Date()) throw bad('That promo code has expired');
    if (p.max_uses != null && p.used >= p.max_uses) throw bad('That promo code has been fully used');
    if (p.station_id && p.station_id !== stationId) throw bad('That promo code is not valid at this station');
    if (subtotal < p.min_total) throw bad(`Spend at least Rs ${p.min_total} to use ${p.code}`);
    if (user) {
      const { rows: u } = await db.query(
        `SELECT count(*)::int AS n FROM orders WHERE user_id=$1 AND promo_code_id=$2 AND status <> 'cancelled'`, [user.id, p.id],
      );
      if (u[0].n >= p.per_user_limit) throw bad('You have already used this promo code');
    }
    return { ...out, discount: Math.floor((subtotal * p.pct) / 100), label: `${p.code} · ${p.title}`, promo_code_id: p.id };
  }
  return out;
}

const roundUp5 = (ms) => Math.ceil(ms / 300000) * 300000;

/**
 * Pickup later. Same day only, inside opening hours, at least preorder_min_minutes from now, and not in the last 5 minutes before closing.
 * Returns the validated pickup time, or null for "as soon as possible". Kiosk and counter orders are always immediate.
 */
export async function pickupWindow(db, station) {
  const s = await getSettings(db);
  if (!s.preorder_enabled) return null;
  const { rows } = await db.query(
    `SELECT (now() AT TIME ZONE 'Asia/Kathmandu')::date AS d,
            (((now() AT TIME ZONE 'Asia/Kathmandu')::date + $1::time) AT TIME ZONE 'Asia/Kathmandu') AS opens_at,
            (((now() AT TIME ZONE 'Asia/Kathmandu')::date + $2::time) AT TIME ZONE 'Asia/Kathmandu') - interval '5 minutes' AS last_at`, [station.opens, station.closes]);
  const earliest = roundUp5(Date.now() + s.preorder_min_minutes * 60000);
  const latest = new Date(rows[0].last_at).getTime();
  const first = Math.max(earliest, new Date(rows[0].opens_at).getTime());
  return first <= latest ? { earliest: new Date(first).toISOString(), latest: new Date(latest).toISOString(), min_minutes: s.preorder_min_minutes, step_minutes: 5 } : null;
}

async function checkSchedule(db, station, input, channel) {
  if (!input.scheduled_for) return null;
  if (!['app', 'qr', 'web'].includes(channel)) return null;
  const w = await pickupWindow(db, station);
  if (!w) throw conflict('Pickup later is not available at this station right now. Choose as soon as possible.', 'preorder_unavailable');
  const t = new Date(input.scheduled_for).getTime();
  if (Number.isNaN(t)) throw bad('Choose a pickup time');
  if (t < new Date(w.earliest).getTime() - 60000) throw bad(`Pickup must be at least ${w.min_minutes} minutes from now`);
  if (t > new Date(w.latest).getTime() + 60000) throw bad('That time is after this station closes. Choose an earlier time.');
  return new Date(t);
}

export async function quote(db, user, input) {
  const station = await loadStationForOrder(db, input.station_id, input.channel || 'app');
  const scheduledFor = await checkSchedule(db, station, input, input.channel || 'app');
  const { lines, drops, offerUse } = await priceLines(db, station.id, input.items);
  const subtotal = lines.reduce((a, l) => a + l.line_total, 0);
  const d = await discountFor(db, user, input, lines, subtotal, station.id);
  const discount = Math.min(d.discount, subtotal);
  return { station, scheduledFor, lines, drops, offerUse, subtotal, discount, total: subtotal - discount, discount_label: d.label, coupon_id: d.coupon_id, promo_code_id: d.promo_code_id, pass_id: d.pass_id, pass_plan: d.pass_plan || [], cups: lines.reduce((a, l) => a + l.qty, 0) };
}

/* ------------------------------------------------------------- inventory */

const optionIds = (x) => x.option_ids || (Array.isArray(x.options) ? x.options.map((o) => o.id) : []);

// What an order uses from stock: the recipe plus chosen options, including the allowed wastage.
async function needsFor(db, lines) {
  return stockNeeds(db, lines.map((l) => ({ product_id: l.product_id, qty: l.qty, option_ids: optionIds(l) })));
}

async function deductStock(db, stationId, needs, ref, userId) {
  const low = [];
  for (const [ing, qty] of needs) {
    const { rows } = await db.query(
      `SELECT si.qty, si.reorder_level, i.name FROM station_inventory si JOIN ingredients i ON i.id=si.ingredient_id
        WHERE si.station_id=$1 AND si.ingredient_id=$2 FOR UPDATE OF si`, [stationId, ing],
    );
    if (!rows[0]) continue; // not tracked at this station
    if (rows[0].qty < qty) throw conflict(`${rows[0].name} just ran out`, 'sold_out');
    const after = rows[0].qty - qty;
    await db.query('UPDATE station_inventory SET qty=$3, updated_at=now() WHERE station_id=$1 AND ingredient_id=$2', [stationId, ing, after]);
    await db.query(`INSERT INTO inventory_moves(station_id, ingredient_id, delta, reason, ref, created_by) VALUES ($1,$2,$3,'sale',$4,$5)`, [stationId, ing, -qty, ref, userId]);
    if (rows[0].qty > rows[0].reorder_level && after <= rows[0].reorder_level) low.push(rows[0].name);
  }
  return low;
}

async function restoreStock(db, stationId, needs, ref, userId) {
  for (const [ing, qty] of needs) {
    const r = await db.query('UPDATE station_inventory SET qty=qty+$3, updated_at=now() WHERE station_id=$1 AND ingredient_id=$2', [stationId, ing, qty]);
    if (r.rowCount) await db.query(`INSERT INTO inventory_moves(station_id, ingredient_id, delta, reason, ref, created_by) VALUES ($1,$2,$3,'adjust',$4,$5)`, [stationId, ing, qty, `restore:${ref}`, userId]);
  }
}

async function alertLowStock(stationId, names) {
  if (!names.length) return;
  const { rows } = await query(
    `SELECT user_id FROM station_managers WHERE station_id=$1 UNION SELECT id FROM users WHERE role='station' AND station_id=$1 AND active`, [stationId],
  );
  for (const r of rows) await notify(r.user_id, { kind: 'stock', title: 'Low stock', body: `${names.join(', ')} below reorder level`, data: { station_id: stationId } });
  publish(`station:${stationId}`, 'stock_low', { names });
}

/* ---------------------------------------------------------------- orders */

/** The handover code is shown only to the customer (and on the kiosk screen). Station views get has_code instead. */
export async function fullOrder(id, db = { query }, { reveal = false } = {}) {
  const o = await loadOrder(id, db);
  if (!o) return null;
  o.has_code = !!o.handover_code;
  if (!reveal) delete o.handover_code;
  delete o.code_attempts;
  return o;
}

async function loadOrder(id, db) {
  const { rows } = await db.query(
    `SELECT o.*, s.name AS station_name, s.name_ne AS station_name_ne, s.code AS station_code, s.address AS station_address,
            u.name AS user_name, u.phone AS user_phone,
            (SELECT p.id FROM payments p WHERE p.order_id=o.id ORDER BY p.created_at DESC LIMIT 1) AS payment_id,
            COALESCE((SELECT json_agg(json_build_object('id', i.id, 'product_id', i.product_id, 'name', i.name, 'unit_price', i.unit_price,
              'qty', i.qty, 'options', i.options, 'line_total', i.line_total) ORDER BY i.name) FROM order_items i WHERE i.order_id=o.id), '[]') AS items
       FROM orders o JOIN stations s ON s.id=o.station_id LEFT JOIN users u ON u.id=o.user_id WHERE o.id=$1`, [id],
  );
  return rows[0] || null;
}

async function nextPickupCode(db, station) {
  const { rows } = await db.query(
    `INSERT INTO station_counters(station_id, day, n) VALUES ($1, (now() AT TIME ZONE 'Asia/Kathmandu')::date, 1)
     ON CONFLICT (station_id, day) DO UPDATE SET n = station_counters.n + 1 RETURNING n`, [station.id],
  );
  return `${station.order_letter}${rows[0].n}`;
}

function emitOrder(order, event = 'order') {
  publish([`station:${order.station_id}`, order.user_id && `user:${order.user_id}`].filter(Boolean), event, {
    id: order.id, status: order.status, pickup_code: order.pickup_code, station_id: order.station_id, payment_status: order.payment_status,
  });
}

/** Moves an order into the live queue: reserves stock, tells station and customer. */
async function placeOrder(db, order, items, actorId) {
  const needs = await needsFor(db, items);
  const low = await deductStock(db, order.station_id, needs, order.id, actorId);
  const prep = (await getSettings(db)).preorder_prep_minutes;
  await db.query(`UPDATE orders SET status='placed', released_at = CASE WHEN scheduled_for IS NULL OR scheduled_for <= now() + make_interval(mins => $2) THEN now() END WHERE id=$1`, [order.id, prep]);
  return low;
}

export async function createOrder(user, input) {
  const channel = input.channel || 'app';
  const result = await tx(async (db) => {
    const q = await quote(db, user, { ...input, channel });
    const method = q.total === 0 && q.pass_id ? 'pass' : input.payment_method;
    if (!['cash', 'fonepay', 'pass'].includes(method)) throw bad('Choose how you will pay');

    const code = await nextPickupCode(db, q.station);
    const digital = method === 'fonepay' && q.total > 0; // counter Fonepay orders show a QR too; they are never taken on trust
    const paidNow = q.total === 0 || (channel === 'counter' && !digital && input.paid_now !== false);
    const { rows } = await db.query(
      `INSERT INTO orders(station_id, user_id, customer_name, pickup_code, channel, status, subtotal, discount, total, discount_label,
         payment_method, payment_status, coupon_id, promo_code_id, pass_id, drop_id, note, scheduled_for, customer_phone, handover_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
      [q.station.id, user?.id || null, input.customer_name || null, code, channel, digital ? 'awaiting_payment' : 'placed',
        q.subtotal, q.discount, q.total, q.discount_label, method, paidNow ? 'paid' : 'unpaid', q.coupon_id, q.promo_code_id, q.pass_id,
        [...q.drops.keys()][0] || null, input.note?.slice(0, 200) || null, q.scheduledFor, input.customer_phone || null, String(crypto.randomInt(1000, 10000))],
    );
    const order = rows[0];
    for (const l of q.lines) {
      const unitCost = Math.round((await recipeBreakdown(l.product_id, l.options.map((o) => o.id), db)).cost) || l.product.cost || 0;
      await db.query(
        `INSERT INTO order_items(order_id, product_id, name, unit_price, qty, options, line_total, offer_id, cost) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [order.id, l.product_id, l.name, l.unit_price, l.qty, JSON.stringify(l.options), l.line_total, l.offer_id, unitCost],
      );
    }
    // consume offers
    if (q.coupon_id) await db.query(`UPDATE coupons SET status='used', used_order_id=$2 WHERE id=$1`, [q.coupon_id, order.id]);
    if (q.promo_code_id) await db.query('UPDATE promo_codes SET used=used+1 WHERE id=$1', [q.promo_code_id]);
    if (q.pass_plan.length) {
      const validDays = (await getSettings(db)).pass_valid_days;
      for (const u of q.pass_plan) {
        await db.query(
          `UPDATE passes SET used_cups = used_cups + $2,
             status = CASE WHEN used_cups + $2 >= total_cups THEN 'used' ELSE status END,
             expires_at = CASE WHEN activated_at IS NULL THEN now() + ($3 || ' days')::interval ELSE expires_at END,
             activated_at = COALESCE(activated_at, now())
           WHERE id=$1`, [u.pass_id, u.cups, String(validDays)]);
        await db.query('INSERT INTO order_pass_uses(order_id, pass_id, cups) VALUES ($1,$2,$3)', [order.id, u.pass_id, u.cups]);
      }
    }
    for (const [dropId, n] of q.drops) await db.query('UPDATE drops SET sold=sold+$2 WHERE id=$1', [dropId, n]);
    for (const [offerId, n] of q.offerUse) await db.query('UPDATE daily_offers SET used=used+$2 WHERE id=$1', [offerId, n]);

    // payment record
    const { rows: pay } = await db.query(
      `INSERT INTO payments(user_id, order_id, station_id, purpose, provider, amount, status, settled_at)
       VALUES ($1,$2,$3,'order',$4,$5,$6, $7) RETURNING *`,
      [user?.id || null, order.id, q.station.id, q.total === 0 ? (method === 'pass' ? 'pass' : method) : method, q.total, paidNow ? 'paid' : 'pending', paidNow ? new Date() : null],
    );

    let low = [];
    let paymentInit = null;
    if (digital) {
      paymentInit = await initiate(method, pay[0], { orderLabel: `Sadhai ${code}` });
      await db.query('UPDATE payments SET provider_ref=COALESCE($2, provider_ref), raw=$3 WHERE id=$1', [pay[0].id, paymentInit.provider_ref || null, paymentInit.raw || null]);
    } else {
      low = await placeOrder(db, order, q.lines, user?.id);
    }
    await audit(user?.id, 'order.create', 'order', order.id, { total: q.total, channel }, db);
    return { id: order.id, low, paymentInit, stationId: q.station.id };
  });

  const order = await fullOrder(result.id, undefined, { reveal: true });
  if (order.status === 'placed') {
    emitOrder(order, order.scheduled_for && !order.released_at ? 'order' : 'order_new');
    if (order.user_id) await notify(order.user_id, { kind: 'order', title: `Order ${order.pickup_code} received`, body: `${order.station_name} is on it. Your coffee in 90 seconds.`, data: { order_id: order.id } });
    alertLowStock(result.stationId, result.low).catch(() => {});
  }
  return { order, payment: result.paymentInit };
}

/** Called when money is confirmed (sandbox confirm, provider callback or webhook). */
export async function confirmPayment(paymentId, { ref, raw, outcome = 'paid' } = {}) {
  const res = await tx(async (db) => {
    const { rows } = await db.query('SELECT * FROM payments WHERE id=$1 FOR UPDATE', [paymentId]);
    const p = rows[0];
    if (!p) throw notFound('Payment not found');
    if (p.status === 'paid') return { already: true, payment: p };
    if (p.status !== 'pending') throw conflict('Payment is no longer pending');

    if (outcome !== 'paid') {
      await db.query(`UPDATE payments SET status='failed', raw=$2 WHERE id=$1`, [paymentId, raw || null]);
      if (p.order_id) await cancelInTx(db, p.order_id, null, 'Payment failed', { refund: false });
      if (p.pass_id) await db.query(`DELETE FROM passes WHERE id=$1 AND status='pending'`, [p.pass_id]);
      return { failed: true, payment: p };
    }
    await db.query(`UPDATE payments SET status='paid', provider_ref=COALESCE($2, provider_ref), raw=$3, settled_at=now() WHERE id=$1`, [paymentId, ref || null, raw || null]);

    let low = [];
    if (p.purpose === 'order') {
      const o = (await db.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE', [p.order_id])).rows[0];
      if (o.status === 'awaiting_payment') {
        const items = (await db.query('SELECT product_id, qty, options FROM order_items WHERE order_id=$1', [o.id])).rows;
        try {
          await db.query('SAVEPOINT stock');
          await db.query(`UPDATE orders SET payment_status='paid' WHERE id=$1`, [o.id]);
          low = await placeOrder(db, o, items, o.user_id);
          await db.query('RELEASE SAVEPOINT stock');
        } catch (e) {
          await db.query('ROLLBACK TO SAVEPOINT stock');
          await db.query(`UPDATE orders SET payment_status='paid' WHERE id=$1`, [o.id]);
          await cancelInTx(db, o.id, null, 'An ingredient ran out while paying. You were refunded.', { refund: true });
          return { cancelled: true, orderId: o.id, payment: p };
        }
      }
    } else if (p.purpose === 'pass') {
      const days = (await getSettings(db)).pass_use_by_days;
      await db.query(`UPDATE passes SET status='active', purchased_at=now(), expires_at=now() + ($2 || ' days')::interval WHERE id=$1`, [p.pass_id, String(days)]);
    }
    return { payment: p, orderId: p.order_id, passId: p.pass_id, low };
  });

  if (res.orderId) {
    const order = await fullOrder(res.orderId);
    if (order.status === 'placed') {
      emitOrder(order, order.scheduled_for && !order.released_at ? 'order' : 'order_new');
      if (order.user_id) await notify(order.user_id, { kind: 'order', title: `Order ${order.pickup_code} received`, body: 'Payment confirmed. Your coffee in 90 seconds.', data: { order_id: order.id } });
      alertLowStock(order.station_id, res.low || []).catch(() => {});
    } else if (order.status === 'cancelled') {
      emitOrder(order);
    }
  }
  if (res.passId && !res.failed) {
    const code = (await query('SELECT code FROM passes WHERE id=$1', [res.passId])).rows[0]?.code;
    await notify(res.payment.user_id, { kind: 'pass', title: 'Your 10-cup pass is ready', body: `Pass ${code}. It starts when you use your first cup, then lasts 30 days.`, data: { pass_id: res.passId } });
  }
  return res;
}

async function cancelInTx(db, orderId, actorId, reason, { refund = true } = {}) {
  const o = (await db.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE', [orderId])).rows[0];
  if (!o) throw notFound('Order not found');
  if (['picked_up', 'cancelled'].includes(o.status)) throw conflict('This order can no longer be cancelled');
  const items = (await db.query('SELECT product_id, qty, options FROM order_items WHERE order_id=$1', [orderId])).rows;
  const cups = items.reduce((a, i) => a + i.qty, 0);

  if (['placed'].includes(o.status)) {
    await restoreStock(db, o.station_id, await needsFor(db, items), o.id, actorId); // untouched ingredients go back; once preparing it is waste
  }
  if (o.coupon_id) await db.query(`UPDATE coupons SET status = CASE WHEN expires_at > now() THEN 'active' ELSE 'expired' END, used_order_id=NULL WHERE id=$1`, [o.coupon_id]);
  if (o.promo_code_id) await db.query('UPDATE promo_codes SET used = GREATEST(used-1,0) WHERE id=$1', [o.promo_code_id]);
  const uses = (await db.query('SELECT pass_id, cups FROM order_pass_uses WHERE order_id=$1', [orderId])).rows;
  for (const u of uses) await db.query(`UPDATE passes SET used_cups = GREATEST(used_cups-$2,0), status = CASE WHEN status='used' THEN 'active' ELSE status END WHERE id=$1`, [u.pass_id, u.cups]);
  if (!uses.length && o.pass_id) await db.query(`UPDATE passes SET used_cups = GREATEST(used_cups-$2,0), status = CASE WHEN status='used' THEN 'active' ELSE status END WHERE id=$1`, [o.pass_id, cups]);
  const offerItems = (await db.query('SELECT offer_id, sum(qty)::int AS n FROM order_items WHERE order_id=$1 AND offer_id IS NOT NULL GROUP BY 1', [orderId])).rows;
  for (const oi of offerItems) await db.query('UPDATE daily_offers SET used = GREATEST(used-$2,0) WHERE id=$1', [oi.offer_id, oi.n]);
  if (o.drop_id) {
    const dropItems = (await db.query(`SELECT i.qty FROM order_items i JOIN drops d ON d.product_id=i.product_id WHERE i.order_id=$1 AND d.id=$2`, [orderId, o.drop_id])).rows;
    await db.query('UPDATE drops SET sold = GREATEST(sold-$2,0) WHERE id=$1', [o.drop_id, dropItems.reduce((a, i) => a + i.qty, 0)]);
  }
  if (refund && o.payment_status === 'paid' && o.total > 0) {
    await db.query(`UPDATE payments SET status='refunded', raw = COALESCE(raw,'{}'::jsonb) || '{"refund_pending_manual": true}'::jsonb WHERE order_id=$1 AND status='paid'`, [orderId]);
    await db.query(`UPDATE orders SET payment_status='refunded' WHERE id=$1`, [orderId]);
  } else if (o.payment_status !== 'paid') {
    await db.query(`UPDATE payments SET status='failed' WHERE order_id=$1 AND status='pending'`, [orderId]);
  }
  await db.query(`UPDATE orders SET status='cancelled', cancelled_at=now(), cancel_reason=$2 WHERE id=$1`, [orderId, reason]);
  await audit(actorId, 'order.cancel', 'order', orderId, { reason }, db);
}

export async function cancelOrder(orderId, actor, reason) {
  const o = (await query('SELECT * FROM orders WHERE id=$1', [orderId])).rows[0];
  if (!o) throw notFound('Order not found');
  if (actor.role === 'customer') {
    if (o.user_id !== actor.id) throw forbidden();
    // Once an order is placed it goes straight to the bar, so only an unpaid order can be cancelled by the customer.
    if (o.status !== 'awaiting_payment') throw conflict('Your order has gone to the barista, so it cannot be cancelled. Ask at the counter if something is wrong.', 'in_progress');
  }
  await tx((db) => cancelInTx(db, orderId, actor.id, reason || 'Cancelled', { refund: true }));
  const order = await fullOrder(orderId);
  emitOrder(order);
  if (order.user_id && actor.id !== order.user_id) await notify(order.user_id, { kind: 'order', title: `Order ${order.pickup_code} cancelled`, body: reason || 'The station could not make this order.', data: { order_id: order.id } });
  return order;
}

const FLOW = { placed: ['preparing', 'cancelled'], preparing: ['ready', 'cancelled'], ready: ['picked_up'], awaiting_payment: ['cancelled'] };

/**
 * The customer reads a 4-digit code from their phone or kiosk receipt and says it at the counter.
 * A manager or owner can hand an order over without it, with a reason that stays on record.
 * Returns the override reason when one was used. Walk-in counter orders need no code.
 */
async function checkHandover(orderId, actor, code, override) {
  const o = (await query('SELECT status, channel, handover_code, code_attempts FROM orders WHERE id=$1', [orderId])).rows[0];
  if (!o) throw notFound('Order not found');
  if (o.status !== 'ready') throw conflict(`Cannot move an order from ${o.status} to picked_up`);
  if (o.channel === 'counter' || !o.handover_code) return null;
  const reason = String(override || '').trim();
  const canOverride = ['manager', 'owner'].includes(actor.role) && reason.length >= 3;
  if (String(code || '').trim() === o.handover_code && o.code_attempts < 5) return null;
  if (canOverride) return reason.slice(0, 120);
  if (code) await query('UPDATE orders SET code_attempts = code_attempts + 1 WHERE id=$1', [orderId]);
  if (o.code_attempts >= 4) throw forbidden('Too many wrong codes. Ask the manager to hand this order over.');
  throw bad(code ? 'That code does not match this order' : 'Ask the customer for their 4-digit code');
}

export async function advanceOrder(orderId, next, actor, { code, override } = {}) {
  if (next === 'cancelled') return cancelOrder(orderId, actor, override || 'Cancelled by the station');
  let overridden = null;
  if (next === 'picked_up') overridden = await checkHandover(orderId, actor, code, override);
  const res = await tx(async (db) => {
    const o = (await db.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE', [orderId])).rows[0];
    if (!o) throw notFound('Order not found');
    if (!FLOW[o.status]?.includes(next)) throw conflict(`Cannot move an order from ${o.status} to ${next}`);
    const col = { preparing: 'accepted_at', ready: 'ready_at', picked_up: 'picked_up_at' }[next];
    await db.query(
      `UPDATE orders SET status=$2, ${col}=now(), ${next === 'picked_up' ? 'picked_up_by=$3, handover_override=$4,' : ''} ${next === 'ready' ? 'accepted_at=COALESCE(accepted_at, now()), ready_by=$3,' : ''} ${next === 'preparing' ? 'accepted_by=$3,' : ''} payment_status = payment_status WHERE id=$1`,
      next === 'picked_up' ? [orderId, next, actor.id, overridden] : next === 'ready' || next === 'preparing' ? [orderId, next, actor.id] : [orderId, next],
    );
    let referral = null;
    if (next === 'picked_up') {
      if (o.payment_status === 'unpaid') {
        await db.query(`UPDATE orders SET payment_status='paid' WHERE id=$1`, [orderId]);
        await db.query(`UPDATE payments SET status='paid', settled_at=now() WHERE order_id=$1 AND status='pending'`, [orderId]);
      }
      if (o.user_id) {
        const cups = (await db.query(`SELECT COALESCE(sum(i.qty),0)::int AS n FROM order_items i JOIN products p ON p.id=i.product_id WHERE i.order_id=$1 AND p.kind='drink'`, [orderId])).rows[0].n;
        await db.query('UPDATE users SET beans = beans + $2 WHERE id=$1', [o.user_id, cups]);
        referral = await rewardReferral(db, o.user_id);
      }
    }
    await audit(actor.id, `order.${next}`, 'order', orderId, null, db);
    return { referral };
  });
  const order = await fullOrder(orderId);
  emitOrder(order);
  if (order.user_id) {
    const msg = {
      preparing: { title: `${order.pickup_code} is being made`, body: 'Your barista has started your coffee.' },
      ready: { title: `${order.pickup_code} is ready`, body: `Your ${order.items[0]?.name || 'coffee'} is ready. Show your 4-digit code at the counter.` },
      picked_up: { title: 'Enjoy your coffee', body: 'You earned beans for this order. Tell us how it was.' },
    }[next];
    if (msg) await notify(order.user_id, { kind: 'order', ...msg, data: { order_id: order.id } });
    if (res.referral) {
      for (const r of res.referral) await notify(r.user_id, { kind: 'info', title: 'A free cup is waiting', body: r.body });
    }
  }
  return order;
}

/** "Give a cup. Get a cup." Both sides rewarded after the friend's first completed order. Capped per month. */
async function rewardReferral(db, userId) {
  const { rows } = await db.query(`SELECT * FROM referrals WHERE referee_id=$1 AND status='pending' FOR UPDATE`, [userId]);
  const ref = rows[0];
  if (!ref) return null;
  const done = (await db.query(`SELECT count(*)::int AS n FROM orders WHERE user_id=$1 AND status='picked_up'`, [userId])).rows[0].n;
  if (done !== 1) return null;
  const s = await getSettings(db);
  const monthCount = (await db.query(
    `SELECT count(*)::int AS n FROM referrals WHERE referrer_id=$1 AND status='rewarded' AND rewarded_at >= date_trunc('month', now())`, [ref.referrer_id],
  )).rows[0].n;
  await db.query(`UPDATE referrals SET status='rewarded', rewarded_at=now() WHERE id=$1`, [ref.id]);
  const out = [];
  const grant = async (uid, title) => db.query(
    `INSERT INTO coupons(user_id, kind, title, free_max, expires_at) VALUES ($1,'referral_cup',$2,$3, now() + interval '30 days')`, [uid, title, s.referral_cup_max],
  );
  await grant(userId, 'Free cup from a friend');
  out.push({ user_id: userId, body: 'Your friend gave you a cup. Use it on your next order.' });
  if (monthCount < s.referral_cap_month) {
    await grant(ref.referrer_id, 'Free cup: your friend joined');
    out.push({ user_id: ref.referrer_id, body: 'Your friend had their first cup. Yours is on us.' });
  }
  return out;
}

export async function rateOrder(orderId, user, rating, note) {
  const { rows } = await query(
    `UPDATE orders SET rating=$3, rating_note=$4 WHERE id=$1 AND user_id=$2 AND status='picked_up' RETURNING id`, [orderId, user.id, rating, note || null],
  );
  if (!rows[0]) throw conflict('You can rate an order after you pick it up');
}

/* ---------------------------------------------------------------- passes */

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I, so a code read out loud is not mistaken
const newPassCode = () => {
  const pick = (n) => Array.from({ length: n }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join('');
  return `SP-${pick(4)}-${pick(4)}`;
};

/** Buying another pass is always allowed. Each pass gets its own unique code and passes are used one after another. */
export async function buyPass(user, method, { stationId = null, soldBy = null } = {}) {
  const s = await getSettings();
  const price = s.pass_price;
  const { pass, pay } = await tx(async (db) => {
    const cashNow = method === 'cash' && soldBy;
    let rows;
    for (let i = 0; ; i++) {
      try {
        await db.query('SAVEPOINT code');
        ({ rows } = await db.query(
          `INSERT INTO passes(user_id, total_cups, price_paid, status, purchased_at, expires_at, code)
           VALUES ($1,$2,$3,$4, now(), CASE WHEN $4='active' THEN now() + ($5 || ' days')::interval END, $6) RETURNING *`,
          [user.id, s.pass_cups, price, cashNow ? 'active' : 'pending', String(s.pass_use_by_days), newPassCode()],
        ));
        await db.query('RELEASE SAVEPOINT code');
        break;
      } catch (e) {
        await db.query('ROLLBACK TO SAVEPOINT code');
        if (e.code !== '23505' || i > 5) throw e;
      }
    }
    const { rows: p } = await db.query(
      `INSERT INTO payments(user_id, pass_id, station_id, purpose, provider, amount, status, settled_at)
       VALUES ($1,$2,$3,'pass',$4,$5,$6,$7) RETURNING *`,
      [user.id, rows[0].id, stationId, method, price, cashNow ? 'paid' : 'pending', cashNow ? new Date() : null],
    );
    await audit(soldBy || user.id, 'pass.sell', 'pass', rows[0].id, { method, code: rows[0].code }, db);
    return { pass: rows[0], pay: p[0] };
  });
  if (method === 'cash' && soldBy) {
    await notify(user.id, { kind: 'pass', title: 'Your 10-cup pass is ready', body: `Pass ${pass.code}. It starts when you use your first cup, then lasts 30 days.`, data: { pass_id: pass.id } });
    return { pass, payment: null };
  }
  if (method === 'cash') throw bad('Pay for a pass in the app with Fonepay, or buy it at the counter');
  const init = await initiate(method, pay, { orderLabel: 'Sadhai 10-cup pass' });
  await query('UPDATE payments SET provider_ref=COALESCE($2, provider_ref), raw=$3 WHERE id=$1', [pay.id, init.provider_ref || null, init.raw || null]);
  return { pass, payment: init };
}

/* ---------------------------------------------------------- user ladder */

/** Retired: new customers no longer get an automatic free first cup or 30%-off ladder. Discounts now come from promo codes. */
export async function issueSignupLadder(_userId, _db = { query }) {
  return;
}

/** Moves scheduled orders onto the station queue shortly before their pickup time. Run every 30 seconds. */
export async function releaseDueOrders() {
  const prep = (await getSettings()).preorder_prep_minutes;
  const { rows } = await query(
    `UPDATE orders SET released_at = now() WHERE status='placed' AND scheduled_for IS NOT NULL AND released_at IS NULL AND scheduled_for <= now() + make_interval(mins => $1) RETURNING id`, [prep]);
  for (const r of rows) {
    const order = await fullOrder(r.id);
    emitOrder(order, 'order_new');
    if (order.user_id) await notify(order.user_id, { kind: 'order', title: `Order ${order.pickup_code} is with the barista`, body: 'Your coffee is being lined up for your pickup time.', data: { order_id: order.id } });
  }
  return rows.length;
}
