// Demo data: 4 stations, staff, a full menu, 60 days of order history, passes, coupons, drops.
// Safe to re-run: it wipes and recreates everything. Refuses to run in production unless SEED_FORCE=1.
import bcrypt from 'bcryptjs';
import { pool } from '../src/lib/db.js';
import { recomputeProductCosts } from '../src/lib/costing.js';
import { autoAssign, computePayroll, settle, todayNpt, addDays } from '../src/lib/roster.js';
import { saveLines } from '../src/routes/hr.js';

if (process.env.NODE_ENV === 'production' && !process.env.SEED_FORCE) {
  console.error('Refusing to seed in production (set SEED_FORCE=1 to override).');
  process.exit(1);
}

// The seed wipes everything, including station hours and any changes made in the dashboards.
// If the database already holds data that does not look like the demo, stop and ask for --force.
{
  const force = process.argv.includes('--force') || process.env.SEED_FORCE;
  const { rows } = await pool.query(`SELECT count(*)::int AS n FROM stations`).catch(() => ({ rows: [{ n: 0 }] }));
  const changed = rows[0].n > 0 ? (await pool.query(`SELECT count(*)::int AS n FROM stations WHERE opens <> '07:00' OR closes <> '20:00' OR code NOT IN ('TU-GATE','TUTH','KALANKI','NEWROAD')`)).rows[0].n : 0;
  if (rows[0].n > 0 && !force && changed > 0) {
    console.error('This database already has stations whose hours or details differ from the demo.\nSeeding would erase them (and every order). If you really want that, run: npm run seed:force');
    process.exit(1);
  }
}

let seed = 42;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const wpick = (pairs) => {
  const total = pairs.reduce((a, [, w]) => a + w, 0);
  let r = rnd() * total;
  for (const [v, w] of pairs) if ((r -= w) <= 0) return v;
  return pairs[0][0];
};

const PASSWORD = 'Sadhai@123';
const hash = await bcrypt.hash(PASSWORD, 10);
const c = await pool.connect();
const q = (t, p) => c.query(t, p);

await q('BEGIN');
await q(`TRUNCATE payroll_adjustments, payroll_lines, payroll_runs, time_off, shift_tasks, shifts, shift_templates, staff_profiles, stock_count_lines, stock_counts, transfer_lines, stock_transfers, purchase_lines, purchase_orders, central_moves, central_inventory, ingredient_cost_history, option_recipes, suppliers, partner_settlements, daily_offers, audit_log, settlements, cash_closes, notifications, referrals, payments, order_items, orders, drops, promo_codes, coupons, passes,
  station_counters, inventory_moves, station_inventory, recipes, ingredients, station_products, options, option_groups, products, categories,
  refresh_tokens, station_managers, users, stations, settings RESTART IDENTITY CASCADE`);

/* ---------- stations ---------- */
const stationDefs = [
  ['TU-GATE', 'Tribhuvan University Gate', 'त्रिभुवन विश्वविद्यालय गेट', 'Kirtipur', 'Kirtipur', 27.6816, 85.2878, 'A', 260],
  ['TUTH', 'Teaching Hospital, Maharajgunj', 'शिक्षण अस्पताल, महाराजगञ्ज', 'Maharajgunj', 'Kathmandu', 27.7360, 85.3300, 'B', 240],
  ['KALANKI', 'Kalanki Bus Stop', 'कलंकी बसपार्क', 'Kalanki', 'Kathmandu', 27.6937, 85.2810, 'C', 220],
  ['NEWROAD', 'New Road Market Corner', 'न्युरोड बजार कुना', 'New Road', 'Kathmandu', 27.7041, 85.3112, 'D', 200],
];
const stations = [];
for (const [code, name, name_ne, address, district, lat, lng, letter, be] of stationDefs) {
  const { rows } = await q(
    `INSERT INTO stations(code,name,name_ne,address,district,lat,lng,order_letter,breakeven_cups) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [code, name, name_ne, address, district, lat, lng, letter, be],
  );
  stations.push(rows[0]);
}
// Existing cafes run Sadhai counters: they keep the cash, Sadhai holds digital money, the cafe earns a share of net sales.
await q(`UPDATE stations SET operator_type='partner', partner_name='Himal Chiya Ghar', partner_phone='+9779801111111', revenue_share_pct=35 WHERE code='KALANKI'`);
await q(`UPDATE stations SET operator_type='partner', partner_name='New Road Cafe & Bakery', partner_phone='+9779802222222', revenue_share_pct=32 WHERE code='NEWROAD'`);

/* ---------- people ---------- */
const mkUser = async (name, phone, role, station_id = null, extra = {}) =>
  (await q(
    `INSERT INTO users(name, phone, password_hash, role, station_id, referral_code, created_at, beans) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [name, phone, hash, role, station_id, extra.code || null, extra.created || new Date(), extra.beans || 0],
  )).rows[0];

const owner = await mkUser('Rabin Sharma', '+9779800000001', 'owner');
const mgr1 = await mkUser('Sunita Thapa', '+9779800000002', 'manager');
const mgr2 = await mkUser('Prakash Rai', '+9779800000003', 'manager');
const partnerIds = new Set([stations[2].id, stations[3].id]); // Kalanki and New Road are partner cafes: they roster and pay their own people
const partner1 = await mkUser('Himal Chiya Ghar (owner)', '+9779801111111', 'partner');
const partner2 = await mkUser('New Road Cafe (owner)', '+9779802222222', 'partner');
await q('INSERT INTO station_managers VALUES ($1,$2)', [stations[2].id, partner1.id]);
await q('INSERT INTO station_managers VALUES ($1,$2)', [stations[3].id, partner2.id]);
for (const [s, m] of [[0, mgr1], [1, mgr1], [2, mgr2], [3, mgr2]]) await q('INSERT INTO station_managers VALUES ($1,$2)', [stations[s].id, m.id]);
const staffNames = ['Bikash Magar', 'Anita KC', 'Suman Tamang', 'Mina Shrestha'];
const staff = [];
for (let i = 0; i < 4; i++) staff.push(await mkUser(staffNames[i], `+97798000000${11 + i}`, 'station', stations[i].id));
const extra = [await mkUser('Dipak Gurung', '+9779800000015', 'station', stations[0].id), await mkUser('Rina Lama', '+9779800000016', 'station', stations[1].id), await mkUser('Kiran Bhandari', '+9779800000017', 'station', stations[2].id), await mkUser('Sanjay Ghale', '+9779800000018', 'station', stations[3].id)];
const staffBy = (i) => (rnd() < 0.55 ? staff[i] : extra[i]);

/* ---------- catalogue ---------- */
const cat = {};
for (const [i, [n, ne]] of [['Hot coffee', 'तातो कफी'], ['Cold coffee', 'चिसो कफी'], ['Signature', 'विशेष'], ['Bites', 'खाजा'], ['Merch', 'सामान']].entries()) {
  cat[n] = (await q('INSERT INTO categories(name,name_ne,sort) VALUES ($1,$2,$3) RETURNING id', [n, ne, i])).rows[0].id;
}
/* ---------- suppliers and ingredients (all bought centrally) ---------- */
const sup = {};
for (const [n, ph] of [['Sevya Coffee Processing', '+9779801000001'], ['Himal Dairy', '+9779801000002'], ['Valley Ice and Water', '+9779801000003'], ['Kathmandu Packaging Supplies', '+9779801000004'], ['TERAI Bakery', '+9779801000005'], ['Mero Syrups', '+9779801000006'], ['Sadhai Merch Studio', '+9779801000007']]) {
  sup[n] = (await q('INSERT INTO suppliers(name, phone) VALUES ($1,$2) RETURNING id', [n, ph])).rows[0].id;
}
// name, base unit, category, pack unit, units per pack, Rs per pack, wastage %, supplier, central reorder, central par
// Prices are the owner's: coffee Rs 2,500/kg with 10% wastage, water Rs 5/L, milk Rs 110/L, ice Rs 50/kg, sugar Rs 5 a sachet, syrups Rs 1,500/L.
const INGREDIENTS = [
  ['Coffee beans (Sevya roast)', 'g', 'ingredient', 'kg', 1000, 2500, 10, 'Sevya Coffee Processing', 20000, 60000],
  ['Water', 'ml', 'ingredient', 'L', 1000, 5, 0, 'Valley Ice and Water', 0, 0],
  ['Milk', 'ml', 'ingredient', 'L', 1000, 110, 0, 'Himal Dairy', 40000, 160000],
  ['Oat milk', 'ml', 'ingredient', 'L', 1000, 260, 0, 'Himal Dairy', 6000, 24000],
  ['Ice', 'g', 'ingredient', 'kg', 1000, 50, 0, 'Valley Ice and Water', 40000, 160000],
  ['Sugar sachet', 'pcs', 'ingredient', 'box of 100', 100, 500, 0, 'Kathmandu Packaging Supplies', 800, 3000],
  ['Chiya masala syrup', 'ml', 'ingredient', 'L', 1000, 1500, 0, 'Mero Syrups', 3000, 8000],
  ['Suntala syrup', 'ml', 'ingredient', 'L', 1000, 1500, 0, 'Mero Syrups', 3000, 8000],
  ['Gur cardamom syrup', 'ml', 'ingredient', 'L', 1000, 1500, 0, 'Mero Syrups', 3000, 8000],
  ['Chocolate syrup', 'ml', 'ingredient', 'L', 1000, 1500, 0, 'Mero Syrups', 3000, 8000],
  ['Hot cups', 'pcs', 'packaging', 'sleeve of 50', 50, 450, 0, 'Kathmandu Packaging Supplies', 600, 2000],
  ['Cold cups', 'pcs', 'packaging', 'sleeve of 50', 50, 550, 0, 'Kathmandu Packaging Supplies', 400, 1400],
  ['Butter croissant', 'pcs', 'ingredient', 'tray of 12', 12, 660, 0, 'TERAI Bakery', 24, 72],
  ['Cardamom bun', 'pcs', 'ingredient', 'tray of 12', 12, 456, 0, 'TERAI Bakery', 24, 72],
  ['Sadhai mug', 'pcs', 'retail', 'carton of 6', 6, 1140, 0, 'Sadhai Merch Studio', 24, 72],
  ['Canvas tote', 'pcs', 'retail', 'bundle of 10', 10, 2600, 0, 'Sadhai Merch Studio', 20, 60],
  ['Gulmi beans 250g', 'pcs', 'retail', 'bag', 1, 330, 0, 'Sevya Coffee Processing', 30, 100],
  ['Sadhai cap', 'pcs', 'retail', 'bundle of 10', 10, 2300, 0, 'Sadhai Merch Studio', 12, 40],
];
const ing = {};
const ingRow = {};
for (const [n, unit, category, packUnit, packSize, packPrice, waste, supplier, cReorder, cPar] of INGREDIENTS) {
  const unitCost = packPrice / packSize;
  const r = (await q(
    `INSERT INTO ingredients(name,unit,category,pack_unit,pack_size,pack_price,unit_cost,waste_pct,supplier_id,central_reorder,central_par,last_purchase_cost) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$7) RETURNING id`,
    [n, unit, category, packUnit, packSize, packPrice, unitCost, waste, sup[supplier], cReorder, cPar])).rows[0];
  ing[n] = r.id; ingRow[n] = { unitCost, waste };
  await q('INSERT INTO ingredient_cost_history(ingredient_id, pack_size, pack_price, unit_cost, waste_pct, source) VALUES ($1,$2,$3,$4,$5,$6)', [r.id, packSize, packPrice, unitCost, waste, 'create']);
}

const B = 'Coffee beans (Sevya roast)';
const DS = 16; // a double shot of espresso is 16 g of coffee
const products = [
  // sku, category, name, Nepali name, price, (cost is calculated from the recipe), flags, origin, description, recipe, pass-eligible, method
  ['ESP', 'Hot coffee', 'Espresso', 'एस्प्रेसो', 100, 0, {}, null, 'Double shot, short and strong.', { [B]: DS, 'Hot cups': 1 }, false, 'Dose 16 g, tamp level, pull 36 g in 28 seconds into a hot cup.'],
  ['AMR', 'Hot coffee', 'Americano', 'अमेरिकानो', 100, 0, {}, null, 'Two shots, hot water. 200 ml, all taxes included.', { [B]: DS, Water: 120, 'Hot cups': 1 }, true, 'Pull a double shot, add 120 ml hot water to the cup.'],
  ['CAP', 'Hot coffee', 'Cappuccino', 'क्यापुचिनो', 100, 0, {}, null, 'Equal parts espresso, milk and foam.', { [B]: DS, Milk: 120, 'Hot cups': 1 }, true, 'Double shot, steam 120 ml milk to 60 C with thick foam.'],
  ['LAT', 'Hot coffee', 'Latte', 'ल्याते', 100, 0, {}, null, 'Smooth and milky.', { [B]: DS, Milk: 180, 'Hot cups': 1 }, true, 'Double shot, steam 180 ml milk to 60 C with light foam.'],
  ['MOC', 'Hot coffee', 'Mocha', 'मोका', 120, 0, {}, null, 'Latte with chocolate.', { [B]: DS, Milk: 150, 'Chocolate syrup': 20, 'Hot cups': 1 }, true, '20 ml chocolate syrup in the cup, double shot, then 150 ml steamed milk.'],
  ['ICL', 'Cold coffee', 'Iced latte', 'आइस्ड ल्याते', 150, 0, {}, null, 'Over ice, ready in 90 seconds.', { [B]: DS, Milk: 150, Ice: 120, 'Cold cups': 1 }, true, 'Fill cup with 120 g ice, pour 150 ml cold milk, top with a double shot.'],
  ['CLB', 'Cold coffee', 'Cold brew', 'कोल्ड ब्रु', 150, 0, {}, null, 'Steeped 16 hours, poured in seconds.', { [B]: 20, Water: 200, Ice: 100, 'Cold cups': 1 }, true, 'Pour 200 ml of the 16-hour cold brew over 100 g ice.'],
  ['CHL', 'Signature', 'Chiya latte', 'चिया ल्याते', 120, 0, { sig: true }, null, 'Espresso with milk tea spices. Our answer to the roadside chiya.', { [B]: DS, Milk: 170, 'Chiya masala syrup': 18, 'Hot cups': 1 }, true, '18 ml chiya masala syrup in the cup, double shot, 170 ml steamed milk.'],
  ['SCB', 'Signature', 'Suntala cold brew', 'सुन्तला कोल्ड ब्रु', 150, 0, { sig: true, season: true }, null, 'Cold brew with Nepali mandarin. Seasonal.', { [B]: 20, Water: 150, 'Suntala syrup': 25, Ice: 100, 'Cold cups': 1 }, true, '25 ml suntala syrup, 100 g ice, 150 ml cold brew, stir.'],
  ['GPO', 'Signature', 'Gulmi pour-over', 'गुल्मी पोर-ओभर', 100, 0, { sig: true }, 'Gulmi, 1,400 m', 'Single origin from the hills of Gulmi. Brown sugar and cherry.', { [B]: 20, Water: 300, 'Hot cups': 1 }, true, '20 g medium-fine, 300 ml water at 93 C in four pours over 2:45.'],
  ['GUR', 'Signature', 'Gur cardamom latte', 'गुर अलैंची ल्याते', 120, 0, { sig: true, season: true }, null, 'Jaggery and cardamom. Monthly drop with TERAI bakery.', { [B]: DS, Milk: 170, 'Gur cardamom syrup': 18, 'Hot cups': 1 }, true, '18 ml gur cardamom syrup, double shot, 170 ml steamed milk.'],
  ['CRO', 'Bites', 'Butter croissant', 'बटर क्रोइसाँ', 120, 0, {}, null, 'Baked this morning by TERAI bakery.', { 'Butter croissant': 1 }, false, 'Warm 3 minutes at 160 C.'],
  ['BUN', 'Bites', 'Cardamom bun', 'अलैंची बन', 90, 0, {}, null, 'Soft, sticky and warm.', { 'Cardamom bun': 1 }, false, 'Warm 2 minutes at 160 C.'],
  ['MUG', 'Merch', 'Sadhai mug', 'सधैं मग', 450, 0, {}, null, 'Ceramic mug, 300 ml. Cherry glaze.', { 'Sadhai mug': 1 }, false, null],
  ['TOT', 'Merch', 'Canvas tote', 'क्यानभास झोला', 650, 0, {}, null, 'Heavy canvas tote with the sadhai mark.', { 'Canvas tote': 1 }, false, null],
  ['BAG', 'Merch', 'Gulmi beans 250g', 'गुल्मी बिन्स २५०ग्राम', 790, 0, {}, 'Gulmi, 1,400 m', 'Roasted by Sevya Coffee Processing. Roast date on the label.', { 'Gulmi beans 250g': 1 }, false, null],
  ['HAT', 'Merch', 'Sadhai cap', 'सधैं टोपी', 550, 0, {}, null, 'Cherry cap, adjustable.', { 'Sadhai cap': 1 }, false, null],
];
const TIER = { ESP: 'hot', AMR: 'hot', CAP: 'hot', LAT: 'hot', GPO: 'hot', MOC: 'flavored', CHL: 'flavored', GUR: 'flavored', ICL: 'iced', CLB: 'iced', SCB: 'iced' };
const prod = {};
for (const [i, [sku, cn, name, name_ne, price, cost, f, origin, desc, recipe, passOk, method]] of products.entries()) {
  const p = (await q(
    `INSERT INTO products(category_id, sku, name, name_ne, description, price, cost, is_signature, is_seasonal, pass_eligible, origin, sort, kind, recipe_method, price_tier)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
    [cat[cn], sku, name, name_ne, desc, price, cost, !!f.sig, !!f.season, passOk, origin, i, cn === 'Merch' ? 'merch' : cn === 'Bites' ? 'food' : 'drink', method, TIER[sku] || null],
  )).rows[0];
  prod[sku] = p;
  for (const [n, qty] of Object.entries(recipe)) await q('INSERT INTO recipes VALUES ($1,$2,$3)', [p.id, ing[n], qty]);
  if (cn !== 'Bites' && cn !== 'Merch') {
    // returns { optionName: id } so each option can carry its own stock and cost effect
    const g = async (name, name_ne, required, multi, opts, sort) => {
      const gid = (await q('INSERT INTO option_groups(product_id,name,name_ne,required,multi,sort) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [p.id, name, name_ne, required, multi, sort])).rows[0].id;
      const ids = {};
      for (const [oi, [on, one, d, def]] of opts.entries()) ids[on] = (await q('INSERT INTO options(group_id,name,name_ne,price_delta,is_default,sort) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [gid, on, one, d, def, oi])).rows[0].id;
      return ids;
    };
    const delta = async (optionId, name, qty) => q('INSERT INTO option_recipes(option_id, ingredient_id, qty) VALUES ($1,$2,$3)', [optionId, ing[name], qty]);
    const size = await g('Size', 'आकार', true, false, [['Regular', 'सामान्य', 0, true], ['Large', 'ठूलो', 40, false]], 0);
    if (recipe.Milk) await delta(size.Large, 'Milk', 50);
    if (recipe.Ice) await delta(size.Large, 'Ice', 40);
    if (recipe.Water) await delta(size.Large, 'Water', 40);
    if (recipe.Milk) {
      const milk = await g('Milk', 'दूध', false, false, [['Dairy', 'दूध', 0, true], ['Oat', 'ओट', 40, false]], 1);
      await delta(milk.Oat, 'Milk', -recipe.Milk); await delta(milk.Oat, 'Oat milk', recipe.Milk);
    }
    const extras = await g('Extras', 'थप', false, true, [['Extra shot', 'थप सट', 60, false]], 2);
    await delta(extras['Extra shot'], B, DS);
    const sugar = await g('Sugar', 'चिनी', false, false, [['No sugar', 'चिनी नहाल्ने', 0, true], ['1 sachet', '१ सेट', 0, false], ['2 sachets', '२ सेट', 0, false]], 3);
    await delta(sugar['1 sachet'], 'Sugar sachet', 1); await delta(sugar['2 sachets'], 'Sugar sachet', 2);
  }
}

/* ---------- central store, station stock, and the movements between them ---------- */
const CENTRAL = { [B]: 38000, Milk: 90000, 'Oat milk': 14000, Ice: 120000, 'Sugar sachet': 1800, 'Chiya masala syrup': 2400, 'Suntala syrup': 5200, 'Gur cardamom syrup': 4100, 'Chocolate syrup': 6200, 'Hot cups': 1300, 'Cold cups': 900, 'Butter croissant': 18, 'Cardamom bun': 60, 'Sadhai mug': 40, 'Canvas tote': 31, 'Gulmi beans 250g': 54, 'Sadhai cap': 22 };
for (const [n, id] of Object.entries(ing)) if (n !== 'Water') await q('INSERT INTO central_inventory(ingredient_id, qty) VALUES ($1,$2)', [id, CENTRAL[n] ?? 0]);
const STOCK = { [B]: 4000, Milk: 20000, 'Oat milk': 3000, 'Hot cups': 400, 'Cold cups': 250, 'Sugar sachet': 300, 'Chiya masala syrup': 1500, Ice: 20000, 'Suntala syrup': 1500, 'Gur cardamom syrup': 1500, 'Chocolate syrup': 1200, 'Butter croissant': 40, 'Cardamom bun': 40, 'Sadhai mug': 24, 'Canvas tote': 20, 'Gulmi beans 250g': 30, 'Sadhai cap': 16 };
const REORDER = { [B]: 800, Milk: 4000, 'Oat milk': 600, 'Hot cups': 80, 'Cold cups': 60, Ice: 4000, 'Sugar sachet': 60, 'Butter croissant': 8, 'Cardamom bun': 8, 'Sadhai mug': 5, 'Canvas tote': 4, 'Gulmi beans 250g': 6, 'Sadhai cap': 3 };
for (const s of stations) {
  for (const [n, id] of Object.entries(ing)) {
    if (n === 'Water') continue; // tap water is costed but not counted
    const stock = STOCK[n];
    await q('INSERT INTO station_inventory(station_id,ingredient_id,qty,reorder_level,par_level) VALUES ($1,$2,$3,$4,$5)', [s.id, id, stock, REORDER[n] ?? Math.round(stock * 0.2), stock]);
  }
}
await q(`UPDATE station_inventory SET qty = 480 WHERE station_id=$1 AND ingredient_id=$2`, [stations[2].id, ing['Oat milk']]); // low-stock demo
await q(`UPDATE station_inventory SET qty = 5 WHERE station_id=$1 AND ingredient_id=$2`, [stations[3].id, ing['Butter croissant']]);
await q(`UPDATE users SET warehouse=true WHERE id=$1`, [mgr1.id]); // Sunita runs the warehouse too

await q(`UPDATE ingredients SET tracked=false WHERE name='Water'`);

// two received purchases and one on order
const mkPO = async (supplier, days, lines, status, invoice) => {
  const po = (await q(`INSERT INTO purchase_orders(supplier_id,status,invoice_no,created_by,created_at,received_at,received_by) VALUES ($1,$2::text,$3,$4::uuid,now() - ($5 || ' days')::interval,CASE WHEN $2::text='received' THEN now() - ($5 || ' days')::interval + interval '1 day' END,CASE WHEN $2::text='received' THEN $4::uuid END) RETURNING id, number`, [sup[supplier], status, invoice, owner.id, String(days)])).rows[0];
  for (const [n, qty, unit, got] of lines) await q('INSERT INTO purchase_lines(purchase_id,ingredient_id,qty_ordered,unit_cost,qty_received,received_unit_cost) VALUES ($1,$2,$3,$4,$5,$6)', [po.id, ing[n], qty, unit, got ?? 0, got ? unit : null]);
  return po;
};
await mkPO('Sevya Coffee Processing', 9, [[B, 50000, 2.5, 50000]], 'received', 'SEV-2210');
await mkPO('Kathmandu Packaging Supplies', 6, [['Hot cups', 1500, 9, 1500], ['Cold cups', 1000, 11, 1000]], 'received', 'KPS-0891');
await mkPO('Himal Dairy', 0, [['Milk', 200000, 0.11, 0], ['Oat milk', 20000, 0.26, 0]], 'ordered', null);

// transfers: history, one on the road, one waiting
const mkTR = async (st, status, daysAgo, lines, short = {}) => {
  const t = (await q(`INSERT INTO stock_transfers(station_id,status,requested_by,created_at,dispatched_at,dispatched_by,received_at,received_by) VALUES ($1,$2::text,$3::uuid,now() - ($4 || ' days')::interval,CASE WHEN $2::text IN ('dispatched','received') THEN now() - ($4 || ' days')::interval + interval '3 hours' END,CASE WHEN $2::text IN ('dispatched','received') THEN $5::uuid END,CASE WHEN $2::text='received' THEN now() - ($4 || ' days')::interval + interval '1 day' END,CASE WHEN $2::text='received' THEN $3::uuid END) RETURNING id`, [stations[st].id, status, staff[st].id, String(daysAgo), mgr1.id])).rows[0];
  for (const [n, qty] of lines) await q('INSERT INTO transfer_lines(transfer_id,ingredient_id,qty_requested,qty_sent,qty_received,unit_cost) VALUES ($1,$2,$3,$4,$5,$6)', [t.id, ing[n], qty, status === 'requested' ? 0 : qty, status === 'received' ? qty - (short[n] || 0) : null, ingRow[n].unitCost]);
};
await mkTR(0, 'received', 7, [[B, 5000], ['Milk', 24000], ['Hot cups', 300]]);
await mkTR(1, 'received', 5, [[B, 5000], ['Milk', 30000], ['Cold cups', 200]], { Milk: 2000 });
await mkTR(3, 'received', 3, [['Butter croissant', 24], ['Cardamom bun', 24]]);
await mkTR(2, 'dispatched', 0, [['Oat milk', 6000], ['Milk', 20000]]);
await mkTR(3, 'requested', 0, [['Butter croissant', 36], ['Hot cups', 200]]);

// shelf counts: one clean, one with a loss
const mkCount = async (st, daysAgo, rows) => {
  const c = (await q(`INSERT INTO stock_counts(station_id,counted_by,created_at) VALUES ($1,$2,now() - ($3 || ' days')::interval) RETURNING id`, [stations[st].id, staff[st].id, String(daysAgo)])).rows[0];
  let total = 0;
  for (const [n, expected, counted] of rows) { const v = counted - expected; const val = v * ingRow[n].unitCost * (1 + ingRow[n].waste / 100); total += val; await q('INSERT INTO stock_count_lines VALUES ($1,$2,$3,$4,$5,$6)', [c.id, ing[n], expected, counted, v, val]); }
  await q('UPDATE stock_counts SET variance_value=$2 WHERE id=$1', [c.id, total]);
};
await mkCount(0, 6, [[B, 3200, 3185], ['Milk', 15000, 15000]]);
await mkCount(1, 4, [[B, 3600, 2900], ['Milk', 18000, 17200], ['Butter croissant', 30, 26]]);

// products.cost now comes from the recipes (same function the app uses when a price changes)
await recomputeProductCosts({ query: (t, p) => c.query(t, p) });

/* ---------- customers + history ---------- */
const first = ['Asha', 'Bibek', 'Chandra', 'Deepa', 'Eshan', 'Gita', 'Hari', 'Isha', 'Janak', 'Kabita', 'Laxman', 'Mira', 'Nabin', 'Pooja', 'Rojina', 'Sagar', 'Tara', 'Umesh', 'Yuvraj', 'Sabina', 'Roshan', 'Sarita', 'Dinesh'];
const last = ['Gurung', 'Thapa', 'Shrestha', 'Rai', 'Tamang', 'Magar', 'Adhikari', 'Poudel', 'KC', 'Limbu', 'Karki', 'Basnet'];
const customers = [];
const now = Date.now();
const DAY = 86400000;
const demo = await mkUser('Asha Gurung', '+9779812345678', 'customer', null, { code: 'ASHA204', created: new Date(now - 50 * DAY), beans: 24 });
customers.push({ u: demo, home: 0, start: 50, freq: 0.5 });
for (let i = 0; i < 40; i++) {
  const nm = `${pick(first)} ${pick(last)}`;
  const age = Math.floor(5 + rnd() * 58);
  const u = await mkUser(nm, `+97798${String(10000000 + i * 137 + 1000).slice(0, 8)}`.slice(0, 14), 'customer', null,
    { code: `${nm.replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase()}${100 + i}`, created: new Date(now - age * DAY) });
  customers.push({ u, home: Math.floor(rnd() * 4), start: age, freq: 0.08 + rnd() * 0.45 });
}
await q(`UPDATE users SET active=true WHERE true`);

const menuWeights = [['AMR', 26], ['LAT', 16], ['CAP', 13], ['CHL', 14], ['ICL', 9], ['CLB', 6], ['ESP', 5], ['MOC', 4], ['GPO', 3], ['SCB', 4], ['GUR', 5], ['CRO', 4], ['BUN', 3]];
const hourW = [[7, 6], [8, 14], [9, 12], [10, 8], [11, 7], [12, 9], [13, 8], [14, 6], [15, 8], [16, 9], [17, 8], [18, 5], [19, 3]];
const stationBase = [150, 120, 130, 100];
const payW = [['cash', 38], ['fonepay', 62]];
const counters = new Map();

async function insertOrder({ st, user, at, lines, channel, method, status = 'picked_up', discount = 0, label = null, pass_id = null, coupon_id = null, rating = null, note = null, who = null }) {
  const sub = lines.reduce((a, l) => a + l.unit * l.qty, 0);
  const total = Math.max(0, sub - discount);
  const key = `${st.id}${new Date(at.getTime() + 20700000).toISOString().slice(0, 10)}`;
  const n = (counters.get(key) || 0) + 1;
  counters.set(key, n);
  const make = 55 + Math.floor(rnd() * 70); // seconds to make
  const created = at;
  const accepted = new Date(at.getTime() + 6000 + rnd() * 20000);
  const ready = new Date(accepted.getTime() + make * 1000);
  const picked = new Date(ready.getTime() + 20000 + rnd() * 150000);
  const o = (await q(
    `INSERT INTO orders(station_id,user_id,pickup_code,channel,status,subtotal,discount,total,discount_label,payment_method,payment_status,coupon_id,pass_id,rating,rating_note,created_at,accepted_at,ready_at,picked_up_at,accepted_by,ready_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING id`,
    [st.id, user?.id || null, `${st.order_letter}${n}`, channel, status, sub, Math.min(discount, sub), total, label, method, status === 'cancelled' ? 'refunded' : 'paid', coupon_id, pass_id, rating, note,
      created, status === 'cancelled' ? null : accepted, status === 'cancelled' ? null : ready, status === 'picked_up' ? picked : null,
      status === 'cancelled' ? null : who?.id, status === 'cancelled' ? null : who?.id],
  )).rows[0];
  for (const l of lines) {
    await q('INSERT INTO order_items(order_id,product_id,name,unit_price,qty,options,line_total) VALUES ($1,$2,$3,$4,$5,$6,$7)', [o.id, l.p.id, l.p.name, l.unit, l.qty, JSON.stringify(l.options || []), l.unit * l.qty]);
  }
  if (status !== 'cancelled') {
    await q(`INSERT INTO payments(user_id,order_id,station_id,purpose,provider,amount,status,created_at,settled_at) VALUES ($1,$2,$3,'order',$4,$5,'paid',$6,$6)`,
      [user?.id || null, o.id, st.id, method === 'pass' ? 'pass' : method, total, picked]);
  }
  return o.id;
}

const buildLines = () => {
  const n = rnd() < 0.78 ? 1 : rnd() < 0.8 ? 2 : 3;
  const lines = [];
  for (let i = 0; i < n; i++) {
    const p = prod[wpick(menuWeights)];
    const large = p.category_id !== cat.Bites && rnd() < 0.22;
    lines.push({ p, qty: 1, unit: p.price + (large ? 40 : 0), options: large ? [{ name: 'Large', price_delta: 40 }] : [] });
  }
  return lines;
};

const dayStart = (d) => { const x = new Date(now - d * DAY); x.setUTCHours(1, 0, 0, 0); return x; }; // ~06:45 NPT
let orderCount = 0;
for (let d = 60; d >= 0; d--) {
  const dayStartAt = dayStart(d);
  const dow = new Date(dayStartAt.getTime() + 20700000).getUTCDay();
  const growth = 0.55 + 0.45 * ((60 - d) / 60);
  for (const [si, st] of stations.entries()) {
    if (d === 0 && false) continue;
    const base = stationBase[si] * growth * (dow === 6 ? 0.55 : 1) * (0.9 + rnd() * 0.2);
    const regulars = customers.filter((cu) => cu.home === si && cu.start >= d && rnd() < cu.freq);
    const total = Math.round(base / 1.45);
    for (let k = 0; k < total; k++) {
      const hour = wpick(hourW);
      const minute = Math.floor(rnd() * 60);
      const t = new Date(Date.UTC(dayStartAt.getUTCFullYear(), dayStartAt.getUTCMonth(), dayStartAt.getUTCDate(), 0, 0, 0) + (hour * 60 + minute) * 60000 - 20700000);
      if (d === 0 && t.getTime() > now) continue;
      const reg = k < regulars.length ? regulars[k].u : (rnd() < 0.4 ? pick(customers).u : null);
      const channel = reg ? wpick([['app', 70], ['qr', 20], ['counter', 10]]) : 'counter';
      const method = wpick(payW);
      const lines = buildLines();
      const cancelled = rnd() < 0.015;
      await insertOrder({
        st, user: reg, at: t, lines, channel: reg ? channel : 'counter', method: method, status: cancelled ? 'cancelled' : 'picked_up', who: staffBy(si),
        rating: !cancelled && reg && rnd() < 0.35 ? wpick([[5, 50], [4, 30], [3, 8], [2, 5], [1, 3]]) : null,
      });
      orderCount++;
    }
  }
}
void staff; void orderCount;

// Pass sales and redemption (plus one flagged related-party pass for the integrity report)
for (const [i, cu] of customers.slice(0, 14).entries()) {
  const used = Math.min(10, Math.floor(rnd() * 11));
  const when = new Date(now - (3 + i * 3) * DAY);
  const pass = (await q(
    `INSERT INTO passes(user_id,total_cups,used_cups,price_paid,status,purchased_at,expires_at,related_party,code,activated_at) VALUES ($1,10,$2,900,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [cu.u.id, used, used >= 10 ? 'used' : 'active', when, new Date(when.getTime() + 30 * DAY), i === 13, `SP-DEMO-${1000 + i}`, used > 0 ? when : null],
  )).rows[0];
  await q(`INSERT INTO payments(user_id,pass_id,station_id,purpose,provider,amount,status,created_at,settled_at) VALUES ($1,$2,$3,'pass',$4,900,'paid',$5,$5)`, [cu.u.id, pass.id, stations[cu.home].id, wpick([['fonepay', 4], ['cash', 3]]), when]);
  if (cu.u.id === demo.id) await q(`UPDATE passes SET used_cups=4, status='active', purchased_at=now() - interval '6 days', expires_at=now() + interval '24 days' WHERE id=$1`, [pass.id]);
}

/* coupons + referrals for demo customer, ladder for a few */
await q(`INSERT INTO coupons(user_id,kind,title,pct,expires_at) VALUES ($1,'pct','30% off · cup 3',30,now()+interval '9 days'),($1,'pct','30% off · cup 4',30,now()+interval '9 days'),($1,'referral_cup','Free cup: your friend joined',NULL,now()+interval '25 days')`, [demo.id]);
await q(`UPDATE coupons SET free_max=200 WHERE kind='referral_cup'`);
for (const cu of customers.slice(1, 6)) {
  await q(`INSERT INTO coupons(user_id,kind,title,free_max,expires_at) VALUES ($1,'first_cup','Your first cup is free',200,now()+interval '10 days')`, [cu.u.id]);
}
await q(`INSERT INTO referrals(referrer_id,referee_id,status,rewarded_at) VALUES ($1,$2,'rewarded',now()-interval '12 days'),($1,$3,'pending',NULL)`, [demo.id, customers[1].u.id, customers[2].u.id]);

/* promos, drops */
await q(`INSERT INTO promo_codes(code,title,pct,min_total,max_uses,per_user_limit,valid_until,created_by) VALUES ('TUCAMPUS','Campus week',15,100,500,3,now()+interval '20 days',$1),('AMERICANO99','Americano Rs 80',20,0,NULL,1,now()+interval '4 days',$1)`, [owner.id]);
await q(
  `INSERT INTO drops(name,name_ne,partner,product_id,price,cap,sold,starts_at,ends_at) VALUES ('Drop 01: Gur cardamom latte','ड्रप ०१: गुर अलैंची ल्याते','TERAI bakery',$1,99,3000,1284,now()-interval '9 days',now()+interval '21 days')`,
  [prod.GUR.id],
);

await q(`INSERT INTO daily_offers(title,title_ne,blurb,scope,product_id,offer_price,ends_at,created_by) VALUES ('Iced latte, Rs 120 today','आज आइस्ड ल्याते रु १२०','Beat the heat. Everything included.','product',$1,120, (((now() AT TIME ZONE 'Asia/Kathmandu')::date + 1)::timestamp AT TIME ZONE 'Asia/Kathmandu'),$2)`, [prod.ICL.id, owner.id]);
await q(`INSERT INTO daily_offers(title,blurb,scope,product_id,pct,station_id,ends_at,max_uses,created_by) VALUES ('Cold brew 20% off at Kalanki','Beat the afternoon heat.','product',$1,20,$2, now() + interval '2 days', 200,$3)`, [prod.CLB.id, stations[2].id, mgr2.id]);
await q(`INSERT INTO daily_offers(title,blurb,scope,category_id,pct,ends_at,created_by) VALUES ('Bites 15% off with any coffee','Croissant or bun, fresh from TERAI.','category',$1,15, now() + interval '3 days',$2)`, [cat.Bites, owner.id]);

/* settlements (providers' bank credits) for the last 14 days, with two deliberate gaps */
const { rows: sums } = await q(
  `SELECT provider, (created_at AT TIME ZONE 'Asia/Kathmandu')::date AS day, sum(amount)::int AS amt FROM payments
    WHERE status='paid' AND provider NOT IN ('cash','pass') AND created_at > now() - interval '15 days' AND created_at < now() - interval '1 day' GROUP BY 1,2`,
);
let gap = 0;
for (const r of sums) {
  const diff = (gap++ % 17 === 4) ? -Math.round(r.amt * 0.012) : 0; // provider fee held back
  await q(`INSERT INTO settlements(provider,day,amount,entered_by) VALUES ($1,$2,$3,$4)`, [r.provider, r.day, r.amt + diff, owner.id]);
}
/* cash closes */
for (let d = 7; d >= 1; d--) {
  for (const st of stations) {
    const { rows } = await q(
      `SELECT COALESCE(sum(amount),0)::int AS n FROM payments WHERE station_id=$1 AND provider='cash' AND status='paid' AND (settled_at AT TIME ZONE 'Asia/Kathmandu')::date = (now() AT TIME ZONE 'Asia/Kathmandu')::date - $2::int`,
      [st.id, d],
    );
    const diff = rnd() < 0.15 ? -Math.floor(rnd() * 120) : 0;
    await q(`INSERT INTO cash_closes(station_id,business_date,expected_cash,counted_cash,diff,closed_by) VALUES ($1,(now() AT TIME ZONE 'Asia/Kathmandu')::date - $2::int,$3,$4,$5,$6)`,
      [st.id, d, rows[0].n, rows[0].n + diff, diff, staff[stations.indexOf(st)].id]);
  }
}

/* ---------- staff: profiles, 6-hour shift times, leave, a bonus ---------- */
const MORE_STAFF = [['Pratik Maharjan', 0], ['Nirmala Khadka', 0], ['Aayush Dahal', 1], ['Sita Pandey', 1], ['Rohan Bista', 2], ['Gita Oli', 2], ['Kamal Sherpa', 3], ['Binita Roka', 3]];
const staffAll = [...staff, ...extra];
for (const [i, [nm, si]] of MORE_STAFF.entries()) staffAll.push(await mkUser(nm, `+97798000000${19 + i}`, 'station', stations[si].id));
const POS = ['supervisor', 'barista', 'all_rounder', 'cashier'];
const perStation = new Map();
for (const u of staffAll) { const n = perStation.get(u.station_id) || 0; perStation.set(u.station_id, n + 1); u.pos = POS[n % 4]; }
const companyStaff = staffAll.filter((u) => !partnerIds.has(u.station_id));
for (const [i, u] of companyStaff.entries()) {
  const pos = u.pos;
  const rate = { supervisor: 150, all_rounder: 130, barista: 120, cashier: 110 }[pos];
  await q(`INSERT INTO staff_profiles(user_id, employee_code, position, skills, hourly_rate, max_shifts_week, days_off, preferred_shift, can_float, joined_on) VALUES ($1,$2,$3,$4,$5,6,$6,$7,$8,current_date - $9::int)`,
    [u.id, `SC-${String(i + 1).padStart(4, '0')}`, pos, pos === 'cashier' ? ['counter'] : ['bar', 'counter'], rate, i % 5 === 2 ? [0] : [], ['morning', 'any', 'evening', 'any'][i % 4], pos === 'all_rounder', 120 + i * 11]);
}
for (const st of stations.filter((x) => !partnerIds.has(x.id))) {
  for (const [i, [name, kind, start, min, max]] of [['Morning', 'morning', '07:00', 1, 3], ['Midday', 'midday', '10:00', 1, 2], ['Evening', 'evening', '14:00', 1, 3]].entries()) {
    await q(`INSERT INTO shift_templates(station_id, name, kind, start_time, hours, min_staff, max_staff, sort) VALUES ($1,$2,$3,$4,6,$5,$6,$7)`, [st.id, name, kind, start, min, max, i]);
  }
}
const todayStr = todayNpt();
await q(`INSERT INTO time_off(user_id, from_date, to_date, kind, reason, status, decided_by, decided_at) VALUES ($1,$2,$3,'leave','Family wedding','approved',$4,now())`, [companyStaff[1].id, addDays(todayStr, 2), addDays(todayStr, 3), mgr1.id]);
await q(`INSERT INTO time_off(user_id, from_date, to_date, kind, reason) VALUES ($1,$2,$3,'leave','Visiting home')`, [companyStaff[5].id, addDays(todayStr, 12), addDays(todayStr, 14)]);
await q(`INSERT INTO payroll_adjustments(user_id, month, label, amount, created_by) VALUES ($1, date_trunc('month', now()), 'Festival bonus', 1000, $2)`, [staffAll[0].id, owner.id]);
await q(`INSERT INTO notifications(user_id,kind,title,body) VALUES ($1,'promo','Iced latte, Rs 120 today','Beat the heat. Everything included.')`, [demo.id]);
await q(`INSERT INTO audit_log(actor_id,action,entity,meta) VALUES ($1,'seed','system','{"note":"demo data created"}')`, [owner.id]);
await q('COMMIT');
c.release();

/* ---------- rosters: four weeks of history with attendance, and this coming week published ---------- */
const allIds = stations.filter((x) => !partnerIds.has(x.id)).map((x) => x.id);
const pastFrom = addDays(todayStr, -28), pastTo = addDays(todayStr, -1);
await autoAssign({ stationIds: allIds, from: pastFrom, to: pastTo, replace: true, userId: owner.id });
const pastShifts = (await pool.query(`SELECT sh.*, p.hourly_rate AS rate FROM shifts sh LEFT JOIN staff_profiles p ON p.user_id=sh.user_id WHERE sh.shift_date BETWEEN $1 AND $2 AND sh.user_id IS NOT NULL`, [pastFrom, pastTo])).rows;
let k = 0;
for (const sh of pastShifts) {
  k++;
  const start = new Date(sh.start_at), end = new Date(sh.end_at);
  if (k % 31 === 0) { await pool.query(`UPDATE shifts SET published=true, status='absent', paid_minutes=0, hourly_rate=$2 WHERE id=$1`, [sh.id, sh.rate]); continue; }
  const inAt = new Date(start.getTime() + ((k * 7) % 17 - 5) * 60000);
  const outAt = k % 47 === 0 ? new Date(end.getTime() - 40 * 60000) : new Date(end.getTime() + ((k * 3) % 23 - 3) * 60000);
  const mins = settle(sh, inAt, outAt, 10);
  await pool.query(`UPDATE shifts SET published=true, status='completed', checked_in_at=$2, checked_out_at=$3, paid_minutes=$4, hourly_rate=$5 WHERE id=$1`, [sh.id, inAt, outAt, mins, sh.rate]);
  await pool.query(`UPDATE shift_tasks SET done_at=$2, done_by=$3 WHERE shift_id=$1 AND random() < 0.92`, [sh.id, inAt, sh.user_id]);
}
await autoAssign({ stationIds: allIds, from: todayStr, to: addDays(todayStr, 13), replace: true, userId: owner.id });
await pool.query(`UPDATE shifts SET published=true WHERE shift_date BETWEEN $1 AND $2 AND user_id IS NOT NULL`, [todayStr, addDays(todayStr, 6)]);

// payroll: one paid run, one draft
const mkRun = async (from, to, status, ref) => {
  const lines = await computePayroll(from, to);
  const run = (await pool.query(`INSERT INTO payroll_runs(period_from, period_to, status, created_by, approved_at, paid_at, reference) VALUES ($1,$2,$3,$4, CASE WHEN $3::text <> 'draft' THEN now() - interval '5 days' END, CASE WHEN $3::text = 'paid' THEN now() - interval '4 days' END, $5) RETURNING id`, [from, to, status, owner.id, ref])).rows[0];
  const cl = await pool.connect();
  try { await saveLines(cl, run.id, lines); } finally { cl.release(); }
};
await mkRun(addDays(todayStr, -28), addDays(todayStr, -15), 'paid', 'DEMO-PAY-001');
await mkRun(addDays(todayStr, -14), addDays(todayStr, -1), 'draft', null);

const n = (await pool.query(`SELECT count(*)::int AS n FROM orders`)).rows[0].n;
console.log(`Seeded: ${stations.length} stations, ${customers.length} customers, ${n} orders.`);
console.log(`Demo logins (password ${PASSWORD}):`);
console.log('  owner     9800000001');
console.log('  manager   9800000002 (TU Gate + Teaching Hospital)   9800000003 (Kalanki + New Road)');
console.log('  station   9800000011 (TU Gate)  9800000012  9800000013  9800000014   (16 staff in all, 9800000011 to 9800000026)');
console.log('  partner   9801111111 (Himal Chiya Ghar, Kalanki)   9802222222 (New Road Cafe)');
console.log('  customer  9812345678 (Asha Gurung)');
await pool.end();
