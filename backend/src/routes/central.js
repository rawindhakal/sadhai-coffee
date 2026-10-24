import { Router } from 'express';
import { z } from 'zod';
import { query, tx } from '../lib/db.js';
import { wrap, bad, notFound, forbidden, conflict } from '../lib/http.js';
import { authenticate, requireRole, scopeStations, assertStationAccess } from '../lib/auth.js';
import { audit, notify } from '../lib/notify.js';
import { recomputeProductCosts, unitCostFromPack, effectiveUnitCost } from '../lib/costing.js';
import { getSettings } from '../lib/settings.js';
import { range } from '../lib/reports.js';

/* ========================================================================
   Central stock: everything is bought centrally, held centrally, then sent to the stations.
   Owner and warehouse managers run this router. Stations request and receive through `transfers`.
   ======================================================================== */
export const central = Router();
central.use(authenticate, (req, _res, next) =>
  req.user.role === 'owner' || (req.user.role === 'manager' && req.user.warehouse) ? next() : next(forbidden('Central stock is run by the owner or the warehouse manager')));

const num = z.number().finite();
const ING_SQL = `SELECT i.*, s.name AS supplier_name, COALESCE(ci.qty,0) AS central_qty,
   (SELECT COALESCE(sum(si.qty),0) FROM station_inventory si WHERE si.ingredient_id=i.id) AS stations_qty,
   (SELECT COALESCE(sum(pl.qty_ordered - pl.qty_received),0) FROM purchase_lines pl JOIN purchase_orders po ON po.id=pl.purchase_id WHERE pl.ingredient_id=i.id AND po.status='ordered') AS on_order
  FROM ingredients i LEFT JOIN central_inventory ci ON ci.ingredient_id=i.id LEFT JOIN suppliers s ON s.id=i.supplier_id`;

central.get('/stock', wrap(async (_req, res) => {
  const { rows } = await query(`${ING_SQL} WHERE i.tracked ORDER BY i.category, i.name`);
  res.json(rows.map((r) => ({ ...r, effective_unit_cost: effectiveUnitCost(r), value: Math.round(r.central_qty * r.unit_cost), low: r.central_reorder > 0 && r.central_qty <= r.central_reorder })));
}));

central.post('/stock/:ingredientId/adjust', wrap(async (req, res) => {
  const b = z.object({ delta: num.optional(), qty: num.min(0).optional(), reason: z.enum(['waste', 'adjust']), note: z.string().max(120).optional() }).parse(req.body);
  if (b.delta == null && b.qty == null) throw bad('Provide delta or qty');
  const out = await tx(async (db) => {
    await db.query('INSERT INTO central_inventory(ingredient_id, qty) VALUES ($1,0) ON CONFLICT DO NOTHING', [req.params.ingredientId]);
    const cur = (await db.query('SELECT qty FROM central_inventory WHERE ingredient_id=$1 FOR UPDATE', [req.params.ingredientId])).rows[0].qty;
    const next = b.qty != null ? b.qty : cur + b.delta;
    if (next < 0) throw bad('Stock cannot go below zero');
    await db.query('UPDATE central_inventory SET qty=$2, updated_at=now() WHERE ingredient_id=$1', [req.params.ingredientId, next]);
    const ing = (await db.query('SELECT unit_cost FROM ingredients WHERE id=$1', [req.params.ingredientId])).rows[0];
    await db.query(`INSERT INTO central_moves(ingredient_id, delta, reason, ref, unit_cost, created_by) VALUES ($1,$2,$3,$4,$5,$6)`, [req.params.ingredientId, next - cur, b.reason, b.note || null, ing.unit_cost, req.user.id]);
    await audit(req.user.id, `central.${b.reason}`, 'ingredient', req.params.ingredientId, { from: cur, to: next }, db);
    return next;
  });
  res.json({ qty: out });
}));

/* ---- ingredients: pack price, wastage, supplier. Changing a price re-costs every recipe that uses it. ---- */
const ingSchema = z.object({
  name: z.string().trim().min(2).max(60), unit: z.enum(['g', 'ml', 'pcs']), category: z.enum(['ingredient', 'packaging', 'retail']).default('ingredient'),
  pack_unit: z.string().max(10).default('pcs'), pack_size: num.positive(), pack_price: num.min(0), waste_pct: num.min(0).max(60).default(0),
  supplier_id: z.string().uuid().nullable().optional(), central_reorder: num.min(0).default(0), central_par: num.min(0).default(0),
});
central.post('/ingredients', wrap(async (req, res) => {
  const b = ingSchema.parse(req.body);
  const ing = await tx(async (db) => {
    const { rows } = await db.query(
      `INSERT INTO ingredients(name, unit, category, pack_unit, pack_size, pack_price, unit_cost, waste_pct, supplier_id, central_reorder, central_par) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [b.name, b.unit, b.category, b.pack_unit, b.pack_size, b.pack_price, unitCostFromPack(b.pack_price, b.pack_size), b.waste_pct, b.supplier_id || null, b.central_reorder, b.central_par]);
    await db.query('INSERT INTO central_inventory(ingredient_id, qty) VALUES ($1,0)', [rows[0].id]);
    await db.query('INSERT INTO station_inventory(station_id, ingredient_id, qty, reorder_level) SELECT id, $1, 0, 0 FROM stations', [rows[0].id]);
    await db.query(`INSERT INTO ingredient_cost_history(ingredient_id, pack_size, pack_price, unit_cost, waste_pct, source, changed_by) VALUES ($1,$2,$3,$4,$5,'create',$6)`, [rows[0].id, b.pack_size, b.pack_price, rows[0].unit_cost, b.waste_pct, req.user.id]);
    await audit(req.user.id, 'ingredient.create', 'ingredient', rows[0].id, { name: b.name }, db);
    return rows[0];
  });
  res.status(201).json(ing);
}));

central.patch('/ingredients/:id', wrap(async (req, res) => {
  const b = ingSchema.partial().parse(req.body);
  const out = await tx(async (db) => {
    const cur = (await db.query('SELECT * FROM ingredients WHERE id=$1 FOR UPDATE', [req.params.id])).rows[0];
    if (!cur) throw notFound('Ingredient not found');
    const next = { ...cur, ...Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined)) };
    next.unit_cost = unitCostFromPack(next.pack_price, next.pack_size);
    await db.query(
      `UPDATE ingredients SET name=$2, unit=$3, category=$4, pack_unit=$5, pack_size=$6, pack_price=$7, unit_cost=$8, waste_pct=$9, supplier_id=$10, central_reorder=$11, central_par=$12 WHERE id=$1`,
      [cur.id, next.name, next.unit, next.category, next.pack_unit, next.pack_size, next.pack_price, next.unit_cost, next.waste_pct, next.supplier_id, next.central_reorder, next.central_par]);
    const priced = Number(cur.unit_cost) !== next.unit_cost || Number(cur.waste_pct) !== Number(next.waste_pct);
    let moved = [];
    if (priced) {
      await db.query(`INSERT INTO ingredient_cost_history(ingredient_id, pack_size, pack_price, unit_cost, waste_pct, source, changed_by) VALUES ($1,$2,$3,$4,$5,'edit',$6)`, [cur.id, next.pack_size, next.pack_price, next.unit_cost, next.waste_pct, req.user.id]);
      moved = await recomputeProductCosts(db, { ingredientId: cur.id });
      await audit(req.user.id, 'ingredient.price', 'ingredient', cur.id, { from: cur.pack_price, to: next.pack_price, waste: next.waste_pct, products: moved.length }, db);
    }
    return { moved };
  });
  res.json({ ok: true, affected_products: out.moved });
}));
central.get('/ingredients/:id/history', wrap(async (req, res) => {
  const { rows } = await query(`SELECT h.*, u.name AS by FROM ingredient_cost_history h LEFT JOIN users u ON u.id=h.changed_by WHERE h.ingredient_id=$1 ORDER BY h.id DESC LIMIT 30`, [req.params.id]);
  res.json(rows);
}));

/* ---- suppliers ---- */
central.get('/suppliers', wrap(async (_req, res) => res.json((await query(`SELECT s.*, (SELECT count(*)::int FROM ingredients i WHERE i.supplier_id=s.id) AS items FROM suppliers s ORDER BY active DESC, name`)).rows)));
central.post('/suppliers', wrap(async (req, res) => {
  const b = z.object({ name: z.string().trim().min(2), phone: z.string().optional(), email: z.string().optional(), address: z.string().optional(), notes: z.string().optional() }).parse(req.body);
  res.status(201).json((await query('INSERT INTO suppliers(name, phone, email, address, notes) VALUES ($1,$2,$3,$4,$5) RETURNING *', [b.name, b.phone, b.email, b.address, b.notes])).rows[0]);
}));
central.patch('/suppliers/:id', wrap(async (req, res) => {
  const b = z.object({ name: z.string().optional(), phone: z.string().optional(), email: z.string().optional(), address: z.string().optional(), notes: z.string().optional(), active: z.boolean().optional() }).parse(req.body);
  await query(`UPDATE suppliers SET name=COALESCE($2,name), phone=COALESCE($3,phone), email=COALESCE($4,email), address=COALESCE($5,address), notes=COALESCE($6,notes), active=COALESCE($7,active) WHERE id=$1`, [req.params.id, b.name, b.phone, b.email, b.address, b.notes, b.active]);
  res.json({ ok: true });
}));

/* ---- purchasing ---- */
async function purchaseView(id) {
  const po = (await query(`SELECT po.*, s.name AS supplier_name, u.name AS created_by_name FROM purchase_orders po LEFT JOIN suppliers s ON s.id=po.supplier_id LEFT JOIN users u ON u.id=po.created_by WHERE po.id=$1`, [id])).rows[0];
  if (!po) return null;
  const lines = (await query(`SELECT l.*, i.name, i.unit, i.unit_cost AS standard_cost, i.pack_size, i.pack_unit FROM purchase_lines l JOIN ingredients i ON i.id=l.ingredient_id WHERE l.purchase_id=$1 ORDER BY i.name`, [id])).rows;
  const total = lines.reduce((a, l) => a + l.qty_ordered * l.unit_cost, 0);
  return { ...po, lines, total: Math.round(total) };
}
central.get('/purchases', wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT po.id FROM purchase_orders po WHERE ($1::text IS NULL OR po.status=$1) ORDER BY po.created_at DESC LIMIT 60`, [req.query.status || null]);
  res.json(await Promise.all(rows.map((r) => purchaseView(r.id))));
}));
central.post('/purchases', wrap(async (req, res) => {
  const b = z.object({
    supplier_id: z.string().uuid().optional(), expected_on: z.string().optional(), note: z.string().max(200).optional(), status: z.enum(['draft', 'ordered']).default('ordered'),
    lines: z.array(z.object({ ingredient_id: z.string().uuid(), qty: num.positive().optional(), unit_cost: num.min(0).optional(), packs: num.positive().optional(), pack_price: num.min(0).optional() })).min(1),
  }).parse(req.body);
  const id = await tx(async (db) => {
    const po = (await db.query('INSERT INTO purchase_orders(supplier_id, status, expected_on, note, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id', [b.supplier_id || null, b.status, b.expected_on || null, b.note || null, req.user.id])).rows[0];
    for (const l of b.lines) {
      const ing = (await db.query('SELECT unit_cost, pack_size FROM ingredients WHERE id=$1', [l.ingredient_id])).rows[0];
      if (!ing) throw notFound('Ingredient not found');
      const qty = l.qty ?? (l.packs ? l.packs * ing.pack_size : null);
      if (!qty) throw bad('Give a quantity or a number of packs');
      const unit = l.unit_cost ?? (l.pack_price != null ? unitCostFromPack(l.pack_price, ing.pack_size) : ing.unit_cost);
      await db.query('INSERT INTO purchase_lines(purchase_id, ingredient_id, qty_ordered, unit_cost) VALUES ($1,$2,$3,$4)', [po.id, l.ingredient_id, qty, unit]);
    }
    await audit(req.user.id, 'purchase.create', 'purchase', po.id, { lines: b.lines.length }, db);
    return po.id;
  });
  res.status(201).json(await purchaseView(id));
}));
central.post('/purchases/:id/receive', wrap(async (req, res) => {
  const b = z.object({ invoice_no: z.string().max(40).optional(), update_standard_cost: z.boolean().default(false),
    lines: z.array(z.object({ line_id: z.string().uuid(), qty_received: num.min(0), unit_cost: num.min(0).optional() })).min(1) }).parse(req.body);
  await tx(async (db) => {
    const po = (await db.query('SELECT * FROM purchase_orders WHERE id=$1 FOR UPDATE', [req.params.id])).rows[0];
    if (!po) throw notFound('Purchase not found');
    if (!['ordered', 'draft'].includes(po.status)) throw conflict('This purchase is already closed');
    for (const r of b.lines) {
      const l = (await db.query('SELECT * FROM purchase_lines WHERE id=$1 AND purchase_id=$2 FOR UPDATE', [r.line_id, po.id])).rows[0];
      if (!l) throw notFound('Line not found');
      if (r.qty_received <= 0) continue;
      const cost = r.unit_cost ?? l.unit_cost;
      await db.query('UPDATE purchase_lines SET qty_received = qty_received + $2, received_unit_cost = $3 WHERE id=$1', [l.id, r.qty_received, cost]);
      await db.query('INSERT INTO central_inventory(ingredient_id, qty) VALUES ($1,$2) ON CONFLICT (ingredient_id) DO UPDATE SET qty = central_inventory.qty + $2, updated_at=now()', [l.ingredient_id, r.qty_received]);
      await db.query(`INSERT INTO central_moves(ingredient_id, delta, reason, ref, unit_cost, created_by) VALUES ($1,$2,'purchase',$3,$4,$5)`, [l.ingredient_id, r.qty_received, `PO-${po.number}`, cost, req.user.id]);
      await db.query('UPDATE ingredients SET last_purchase_cost=$2 WHERE id=$1', [l.ingredient_id, cost]);
      if (b.update_standard_cost) {
        const ing = (await db.query('SELECT * FROM ingredients WHERE id=$1', [l.ingredient_id])).rows[0];
        if (Math.abs(Number(ing.unit_cost) - cost) > 1e-9) {
          await db.query('UPDATE ingredients SET unit_cost=$2, pack_price=$3 WHERE id=$1', [ing.id, cost, Math.round(cost * ing.pack_size * 100) / 100]);
          await db.query(`INSERT INTO ingredient_cost_history(ingredient_id, pack_size, pack_price, unit_cost, waste_pct, source, changed_by) VALUES ($1,$2,$3,$4,$5,'purchase',$6)`, [ing.id, ing.pack_size, Math.round(cost * ing.pack_size * 100) / 100, cost, ing.waste_pct, req.user.id]);
          await recomputeProductCosts(db, { ingredientId: ing.id });
        }
      }
    }
    const open = (await db.query('SELECT count(*)::int AS n FROM purchase_lines WHERE purchase_id=$1 AND qty_received < qty_ordered', [po.id])).rows[0].n;
    await db.query(`UPDATE purchase_orders SET invoice_no=COALESCE($2,invoice_no), status=$3, received_at=CASE WHEN $3='received' THEN now() ELSE received_at END, received_by=$4 WHERE id=$1`, [po.id, b.invoice_no || null, open ? 'ordered' : 'received', req.user.id]);
    await audit(req.user.id, 'purchase.receive', 'purchase', po.id, { invoice: b.invoice_no, complete: !open }, db);
  });
  res.json(await purchaseView(req.params.id));
}));
central.post('/purchases/:id/cancel', wrap(async (req, res) => {
  const r = await query(`UPDATE purchase_orders SET status='cancelled' WHERE id=$1 AND status IN ('draft','ordered') AND NOT EXISTS (SELECT 1 FROM purchase_lines WHERE purchase_id=$1 AND qty_received > 0) RETURNING id`, [req.params.id]);
  if (!r.rowCount) throw conflict('Only purchases with nothing received can be cancelled');
  await audit(req.user.id, 'purchase.cancel', 'purchase', req.params.id);
  res.json({ ok: true });
}));
central.get('/suggestions', wrap(async (_req, res) => {
  const { rows } = await query(`${ING_SQL} WHERE i.central_reorder > 0 ORDER BY i.name`);
  res.json(rows.filter((r) => r.central_qty + r.on_order <= r.central_reorder).map((r) => {
    const need = Math.max(0, r.central_par - r.central_qty - r.on_order);
    const packs = r.pack_size > 0 ? Math.ceil(need / r.pack_size) : 0;
    return { ingredient_id: r.id, name: r.name, unit: r.unit, pack_unit: r.pack_unit, central_qty: r.central_qty, on_order: r.on_order, reorder: r.central_reorder, par: r.central_par, suggested_packs: packs, suggested_qty: packs * r.pack_size, unit_cost: r.unit_cost, estimated_cost: Math.round(packs * r.pack_price), supplier_id: r.supplier_id, supplier_name: r.supplier_name };
  }));
}));

/* ---- dispatching stock to stations ---- */
export async function transferView(id, db = { query }) {
  const t = (await db.query(`SELECT t.*, s.name AS station_name, s.code AS station_code, ru.name AS requested_by_name, du.name AS dispatched_by_name, rc.name AS received_by_name FROM stock_transfers t JOIN stations s ON s.id=t.station_id
     LEFT JOIN users ru ON ru.id=t.requested_by LEFT JOIN users du ON du.id=t.dispatched_by LEFT JOIN users rc ON rc.id=t.received_by WHERE t.id=$1`, [id])).rows[0];
  if (!t) return null;
  const lines = (await db.query(`SELECT l.*, i.name, i.unit FROM transfer_lines l JOIN ingredients i ON i.id=l.ingredient_id WHERE l.transfer_id=$1 ORDER BY i.name`, [id])).rows;
  const value = lines.reduce((a, l) => a + l.qty_sent * l.unit_cost, 0);
  const shortage = lines.reduce((a, l) => a + (l.qty_received != null ? Math.max(0, l.qty_sent - l.qty_received) * l.unit_cost : 0), 0);
  return { ...t, lines, value: Math.round(value), shortage_value: Math.round(shortage) };
}
const linesSchema = z.array(z.object({ ingredient_id: z.string().uuid(), qty: num.positive() })).min(1);

central.get('/transfers', wrap(async (req, res) => {
  const { rows } = await query(`SELECT id FROM stock_transfers WHERE ($1::text IS NULL OR status=$1) ORDER BY created_at DESC LIMIT 80`, [req.query.status || null]);
  res.json(await Promise.all(rows.map((r) => transferView(r.id))));
}));
async function dispatch(db, transferId, sendLines, userId) {
  const t = (await db.query('SELECT * FROM stock_transfers WHERE id=$1 FOR UPDATE', [transferId])).rows[0];
  if (!t) throw notFound('Transfer not found');
  if (t.status !== 'requested') throw conflict('This transfer was already sent or closed');
  for (const l of sendLines) {
    const ing = (await db.query('SELECT name, unit_cost FROM ingredients WHERE id=$1', [l.ingredient_id])).rows[0];
    if (!ing) throw notFound('Ingredient not found');
    const cur = (await db.query('SELECT qty FROM central_inventory WHERE ingredient_id=$1 FOR UPDATE', [l.ingredient_id])).rows[0]?.qty ?? 0;
    if (cur < l.qty) throw conflict(`Not enough ${ing.name} in the central store (${Math.round(cur)} left)`);
    await db.query('UPDATE central_inventory SET qty = qty - $2, updated_at=now() WHERE ingredient_id=$1', [l.ingredient_id, l.qty]);
    await db.query(`INSERT INTO central_moves(ingredient_id, delta, reason, ref, unit_cost, created_by) VALUES ($1,$2,'transfer_out',$3,$4,$5)`, [l.ingredient_id, -l.qty, `TR-${t.number}`, ing.unit_cost, userId]);
    const ex = (await db.query('SELECT id FROM transfer_lines WHERE transfer_id=$1 AND ingredient_id=$2', [t.id, l.ingredient_id])).rows[0];
    if (ex) await db.query('UPDATE transfer_lines SET qty_sent=$2, unit_cost=$3 WHERE id=$1', [ex.id, l.qty, ing.unit_cost]);
    else await db.query('INSERT INTO transfer_lines(transfer_id, ingredient_id, qty_requested, qty_sent, unit_cost) VALUES ($1,$2,0,$3,$4)', [t.id, l.ingredient_id, l.qty, ing.unit_cost]);
  }
  await db.query('UPDATE transfer_lines SET qty_sent=0 WHERE transfer_id=$1 AND qty_sent=0', [t.id]);
  await db.query(`UPDATE stock_transfers SET status='dispatched', dispatched_at=now(), dispatched_by=$2 WHERE id=$1`, [t.id, userId]);
  await audit(userId, 'transfer.dispatch', 'transfer', t.id, { station: t.station_id }, db);
  return t;
}
async function notifyStation(stationId, title, body) {
  const { rows } = await query(`SELECT user_id FROM station_managers WHERE station_id=$1 UNION SELECT id FROM users WHERE role='station' AND station_id=$1 AND active`, [stationId]);
  for (const r of rows) await notify(r.user_id, { kind: 'stock', title, body, data: { station_id: stationId } });
}
// Send stock to a station. With no request_id this creates and sends in one step; with one it fulfils that request (lines may be trimmed).
central.post('/transfers', wrap(async (req, res) => {
  const b = z.object({ station_id: z.string().uuid().optional(), request_id: z.string().uuid().optional(), lines: linesSchema, note: z.string().max(200).optional() }).parse(req.body);
  const id = await tx(async (db) => {
    let tid = b.request_id;
    if (!tid) {
      if (!b.station_id) throw bad('Choose a station');
      tid = (await db.query('INSERT INTO stock_transfers(station_id, status, note, requested_by) VALUES ($1,$2,$3,$4) RETURNING id', [b.station_id, 'requested', b.note || null, req.user.id])).rows[0].id;
    }
    await dispatch(db, tid, b.lines, req.user.id);
    return tid;
  });
  const t = await transferView(id);
  await notifyStation(t.station_id, `Stock on its way (TR-${t.number})`, `${t.lines.length} items from the central store. Confirm what arrives.`);
  res.status(201).json(t);
}));
central.post('/transfers/:id/cancel', wrap(async (req, res) => {
  await tx(async (db) => {
    const t = (await db.query('SELECT * FROM stock_transfers WHERE id=$1 FOR UPDATE', [req.params.id])).rows[0];
    if (!t) throw notFound('Transfer not found');
    if (!['requested', 'dispatched'].includes(t.status)) throw conflict('This transfer is closed');
    if (t.status === 'dispatched') {
      for (const l of (await db.query('SELECT * FROM transfer_lines WHERE transfer_id=$1 AND qty_sent > 0', [t.id])).rows) {
        await db.query('UPDATE central_inventory SET qty = qty + $2, updated_at=now() WHERE ingredient_id=$1', [l.ingredient_id, l.qty_sent]);
        await db.query(`INSERT INTO central_moves(ingredient_id, delta, reason, ref, unit_cost, created_by) VALUES ($1,$2,'transfer_cancel',$3,$4,$5)`, [l.ingredient_id, l.qty_sent, `TR-${t.number}`, l.unit_cost, req.user.id]);
      }
    }
    await db.query(`UPDATE stock_transfers SET status='cancelled' WHERE id=$1`, [t.id]);
    await audit(req.user.id, 'transfer.cancel', 'transfer', t.id, null, db);
  });
  res.json({ ok: true });
}));

/* ---- views across the whole network ---- */
central.get('/matrix', wrap(async (_req, res) => {
  const [ings, stations, inv] = await Promise.all([
    query(`SELECT i.id, i.name, i.unit, i.category, i.unit_cost, COALESCE(ci.qty,0) AS central_qty, i.central_reorder FROM ingredients i LEFT JOIN central_inventory ci ON ci.ingredient_id=i.id WHERE i.tracked ORDER BY i.category, i.name`),
    query(`SELECT id, name, code FROM stations WHERE active ORDER BY name`),
    query(`SELECT station_id, ingredient_id, qty, reorder_level, par_level FROM station_inventory`),
  ]);
  const by = new Map(inv.rows.map((r) => [`${r.station_id}:${r.ingredient_id}`, r]));
  res.json({
    stations: stations.rows,
    ingredients: ings.rows.map((i) => ({ ...i, stations: stations.rows.map((s) => { const r = by.get(`${s.id}:${i.id}`); return { station_id: s.id, qty: r?.qty ?? 0, reorder_level: r?.reorder_level ?? 0, par_level: r?.par_level ?? 0, low: !!r && r.reorder_level > 0 && r.qty <= r.reorder_level, value: Math.round((r?.qty ?? 0) * i.unit_cost) }; }) })),
  });
}));
central.get('/valuation', wrap(async (_req, res) => {
  const [c, st] = await Promise.all([
    query(`SELECT COALESCE(sum(ci.qty * i.unit_cost),0)::int AS value FROM central_inventory ci JOIN ingredients i ON i.id=ci.ingredient_id`),
    query(`SELECT s.id, s.name, COALESCE(sum(si.qty * i.unit_cost),0)::int AS value FROM stations s LEFT JOIN station_inventory si ON si.station_id=s.id LEFT JOIN ingredients i ON i.id=si.ingredient_id WHERE s.active GROUP BY s.id ORDER BY s.name`),
  ]);
  const stationsValue = st.rows.reduce((a, r) => a + r.value, 0);
  res.json({ central: c.rows[0].value, stations: st.rows, stations_total: stationsValue, total: c.rows[0].value + stationsValue });
}));

/* ========================================================================
   Stations and managers: ask for stock, confirm what arrived, count shelves.
   ======================================================================== */
export const transfers = Router();
transfers.use(authenticate, requireRole('station', 'manager', 'owner'));
async function stationFor(req) {
  const id = req.user.role === 'station' ? req.user.station_id : req.body?.station_id || req.query.station_id;
  if (!id) throw bad('station_id is required');
  await assertStationAccess(req.user, id);
  return id;
}
transfers.get('/', wrap(async (req, res) => {
  const ids = await scopeStations(req.user);
  const { rows } = await query(`SELECT id FROM stock_transfers WHERE station_id = ANY($1) AND ($2::text IS NULL OR status=$2) ORDER BY created_at DESC LIMIT 40`, [ids, req.query.status || null]);
  res.json(await Promise.all(rows.map((r) => transferView(r.id))));
}));
transfers.get('/suggest', wrap(async (req, res) => {
  const sid = await stationFor(req);
  const { rows } = await query(
    `SELECT i.id AS ingredient_id, i.name, i.unit, si.qty, si.par_level, si.reorder_level, i.pack_size, i.pack_unit, COALESCE(ci.qty,0) AS central_qty,
            (SELECT COALESCE(sum(l.qty_sent),0) FROM transfer_lines l JOIN stock_transfers t ON t.id=l.transfer_id WHERE t.station_id=si.station_id AND l.ingredient_id=i.id AND t.status='dispatched') AS in_transit
       FROM station_inventory si JOIN ingredients i ON i.id=si.ingredient_id LEFT JOIN central_inventory ci ON ci.ingredient_id=i.id
      WHERE si.station_id=$1 AND si.par_level > 0 AND si.qty <= GREATEST(si.reorder_level, si.par_level * 0.5) ORDER BY i.name`, [sid]);
  res.json(rows.map((r) => { const need = Math.max(0, r.par_level - r.qty - r.in_transit); const step = r.pack_unit === 'pcs' ? 1 : 100; return { ...r, suggested_qty: Math.ceil(need / step) * step }; }).filter((r) => r.suggested_qty > 0));
}));
transfers.post('/request', wrap(async (req, res) => {
  const b = z.object({ station_id: z.string().uuid().optional(), lines: linesSchema, note: z.string().max(200).optional() }).parse(req.body);
  const sid = await stationFor(req);
  const id = await tx(async (db) => {
    const t = (await db.query('INSERT INTO stock_transfers(station_id, status, note, requested_by) VALUES ($1,$2,$3,$4) RETURNING id, number', [sid, 'requested', b.note || null, req.user.id])).rows[0];
    for (const l of b.lines) await db.query('INSERT INTO transfer_lines(transfer_id, ingredient_id, qty_requested) VALUES ($1,$2,$3)', [t.id, l.ingredient_id, l.qty]);
    await audit(req.user.id, 'transfer.request', 'transfer', t.id, { station: sid }, db);
    return t.id;
  });
  const t = await transferView(id);
  const owners = (await query(`SELECT id FROM users WHERE role='owner' AND active UNION SELECT id FROM users WHERE role='manager' AND warehouse AND active`)).rows;
  for (const o of owners) await notify(o.id, { kind: 'stock', title: `Stock request TR-${t.number}`, body: `${t.station_name} asked for ${t.lines.length} items.`, data: { transfer_id: t.id } });
  res.status(201).json(t);
}));
transfers.post('/:id/receive', wrap(async (req, res) => {
  const b = z.object({ lines: z.array(z.object({ ingredient_id: z.string().uuid(), qty_received: num.min(0) })).optional(), note: z.string().max(200).optional() }).parse(req.body);
  const t0 = (await query('SELECT * FROM stock_transfers WHERE id=$1', [req.params.id])).rows[0];
  if (!t0) throw notFound('Transfer not found');
  await assertStationAccess(req.user, t0.station_id);
  await tx(async (db) => {
    const t = (await db.query('SELECT * FROM stock_transfers WHERE id=$1 FOR UPDATE', [t0.id])).rows[0];
    if (t.status !== 'dispatched') throw conflict('Nothing to receive on this transfer');
    const lines = (await db.query('SELECT * FROM transfer_lines WHERE transfer_id=$1 AND qty_sent > 0', [t.id])).rows;
    const given = new Map((b.lines || []).map((l) => [l.ingredient_id, l.qty_received]));
    for (const l of lines) {
      const got = given.has(l.ingredient_id) ? given.get(l.ingredient_id) : l.qty_sent;
      if (got > l.qty_sent + 1e-9) throw bad('You cannot receive more than was sent');
      await db.query('UPDATE transfer_lines SET qty_received=$2 WHERE id=$1', [l.id, got]);
      if (got > 0) {
        await db.query(`INSERT INTO station_inventory(station_id, ingredient_id, qty) VALUES ($1,$2,$3) ON CONFLICT (station_id, ingredient_id) DO UPDATE SET qty = station_inventory.qty + $3, updated_at=now()`, [t.station_id, l.ingredient_id, got]);
        await db.query(`INSERT INTO inventory_moves(station_id, ingredient_id, delta, reason, ref, created_by) VALUES ($1,$2,$3,'transfer_in',$4,$5)`, [t.station_id, l.ingredient_id, got, `TR-${t.number}`, req.user.id]);
      }
    }
    await db.query(`UPDATE stock_transfers SET status='received', received_at=now(), received_by=$2, receive_note=$3 WHERE id=$1`, [t.id, req.user.id, b.note || null]);
    await audit(req.user.id, 'transfer.receive', 'transfer', t.id, { station: t.station_id }, db);
  });
  const t = await transferView(t0.id);
  if (t.shortage_value > 0) {
    const owners = (await query(`SELECT id FROM users WHERE role='owner' AND active UNION SELECT id FROM users WHERE role='manager' AND warehouse AND active`)).rows;
    for (const o of owners) await notify(o.id, { kind: 'stock', title: `Short delivery at ${t.station_name}`, body: `TR-${t.number} arrived Rs ${t.shortage_value} short of what was sent.`, data: { transfer_id: t.id } });
  }
  res.json(t);
}));
transfers.post('/:id/cancel', wrap(async (req, res) => {
  const t = (await query('SELECT * FROM stock_transfers WHERE id=$1', [req.params.id])).rows[0];
  if (!t) throw notFound('Transfer not found');
  await assertStationAccess(req.user, t.station_id);
  const r = await query(`UPDATE stock_transfers SET status='cancelled' WHERE id=$1 AND status='requested' RETURNING id`, [t.id]);
  if (!r.rowCount) throw conflict('Only requests that are not yet sent can be cancelled');
  res.json({ ok: true });
}));

// A shelf count: compares what the system expects with what is really there, logs the difference at cost and resets the stock.
transfers.post('/counts', wrap(async (req, res) => {
  const b = z.object({ station_id: z.string().uuid().optional(), note: z.string().max(200).optional(), counts: z.array(z.object({ ingredient_id: z.string().uuid(), counted: num.min(0) })).min(1) }).parse(req.body);
  const sid = await stationFor(req);
  const out = await tx(async (db) => {
    const c = (await db.query('INSERT INTO stock_counts(station_id, counted_by, note) VALUES ($1,$2,$3) RETURNING id', [sid, req.user.id, b.note || null])).rows[0];
    let total = 0;
    const lines = [];
    for (const l of b.counts) {
      const cur = (await db.query(`SELECT si.qty, i.name, i.unit, i.unit_cost, i.waste_pct FROM station_inventory si JOIN ingredients i ON i.id=si.ingredient_id WHERE si.station_id=$1 AND si.ingredient_id=$2 FOR UPDATE OF si`, [sid, l.ingredient_id])).rows[0];
      if (!cur) continue;
      const variance = l.counted - cur.qty;
      const value = variance * effectiveUnitCost(cur);
      total += value;
      await db.query('INSERT INTO stock_count_lines(count_id, ingredient_id, expected, counted, variance, variance_value) VALUES ($1,$2,$3,$4,$5,$6)', [c.id, l.ingredient_id, cur.qty, l.counted, variance, value]);
      if (variance !== 0) {
        await db.query('UPDATE station_inventory SET qty=$3, updated_at=now() WHERE station_id=$1 AND ingredient_id=$2', [sid, l.ingredient_id, l.counted]);
        await db.query(`INSERT INTO inventory_moves(station_id, ingredient_id, delta, reason, ref, created_by) VALUES ($1,$2,$3,'count',$4,$5)`, [sid, l.ingredient_id, variance, `count:${c.id}`, req.user.id]);
      }
      lines.push({ ingredient: cur.name, unit: cur.unit, expected: cur.qty, counted: l.counted, variance, value: Math.round(value) });
    }
    await db.query('UPDATE stock_counts SET variance_value=$2 WHERE id=$1', [c.id, total]);
    await audit(req.user.id, 'stock.count', 'station', sid, { variance_value: Math.round(total) }, db);
    return { id: c.id, variance_value: Math.round(total), lines };
  });
  const limit = (await getSettings()).variance_alert_value;
  if (Math.abs(out.variance_value) >= limit) {
    const st = (await query('SELECT name FROM stations WHERE id=$1', [sid])).rows[0].name;
    const to = (await query(`SELECT user_id AS id FROM station_managers WHERE station_id=$1 UNION SELECT id FROM users WHERE role='owner' AND active`, [sid])).rows;
    for (const u of to) await notify(u.id, { kind: 'stock', title: `Stock count difference at ${st}`, body: `Rs ${out.variance_value} against what the system expected.`, data: { station_id: sid } });
  }
  res.status(201).json(out);
}));
transfers.get('/counts', wrap(async (req, res) => {
  const ids = await scopeStations(req.user);
  const { rows } = await query(`SELECT c.id, c.created_at, c.variance_value, c.note, s.name AS station_name, u.name AS counted_by FROM stock_counts c JOIN stations s ON s.id=c.station_id LEFT JOIN users u ON u.id=c.counted_by WHERE c.station_id = ANY($1) ORDER BY c.created_at DESC LIMIT 40`, [ids]);
  res.json(rows);
}));
// Shrinkage report: count differences and logged waste at cost, by station and by ingredient.
transfers.get('/variance', wrap(async (req, res) => {
  const ids = await scopeStations(req.user);
  const { start, end } = range(req.query.from, req.query.to);
  const [bySt, byIng, waste] = await Promise.all([
    query(`SELECT s.id, s.name, count(DISTINCT c.id)::int AS counts, COALESCE(sum(l.variance_value),0)::int AS variance_value, COALESCE(sum(l.variance_value) FILTER (WHERE l.variance_value < 0),0)::int AS loss
             FROM stations s LEFT JOIN stock_counts c ON c.station_id=s.id AND c.created_at >= $2 AND c.created_at < $3 LEFT JOIN stock_count_lines l ON l.count_id=c.id WHERE s.id = ANY($1) GROUP BY s.id ORDER BY loss`, [ids, start, end]),
    query(`SELECT i.name, i.unit, COALESCE(sum(l.variance),0) AS variance, COALESCE(sum(l.variance_value),0)::int AS variance_value FROM stock_count_lines l JOIN stock_counts c ON c.id=l.count_id JOIN ingredients i ON i.id=l.ingredient_id
            WHERE c.station_id = ANY($1) AND c.created_at >= $2 AND c.created_at < $3 GROUP BY i.id ORDER BY sum(l.variance_value) LIMIT 12`, [ids, start, end]),
    query(`SELECT s.name, COALESCE(sum(abs(m.delta) * i.unit_cost * (1 + i.waste_pct/100)),0)::int AS value FROM inventory_moves m JOIN ingredients i ON i.id=m.ingredient_id JOIN stations s ON s.id=m.station_id
            WHERE m.station_id = ANY($1) AND m.reason='waste' AND m.created_at >= $2 AND m.created_at < $3 GROUP BY s.name`, [ids, start, end]),
  ]);
  res.json({ by_station: bySt.rows, by_ingredient: byIng.rows, waste: waste.rows });
}));
