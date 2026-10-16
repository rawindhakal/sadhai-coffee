// Clean baseline setup for production:
// Stations, menu catalog, ingredients, recipes, and one owner account.
// Zero demo orders, zero test customers, zero fake transactions.
import bcrypt from 'bcryptjs';
import { pool } from '../src/lib/db.js';
import { recomputeProductCosts } from '../src/lib/costing.js';

const PASSWORD = process.env.ADMIN_PASSWORD || 'Sadhai@123';
const hash = await bcrypt.hash(PASSWORD, 10);
const c = await pool.connect();
const q = (t, p) => c.query(t, p);

console.log('Clearing all tables...');
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

await q(`UPDATE stations SET operator_type='partner', partner_name='Himal Chiya Ghar', partner_phone='+9779801111111', revenue_share_pct=35 WHERE code='KALANKI'`);
await q(`UPDATE stations SET operator_type='partner', partner_name='New Road Cafe & Bakery', partner_phone='+9779802222222', revenue_share_pct=32 WHERE code='NEWROAD'`);

/* ---------- owner account ---------- */
const owner = (await q(
  `INSERT INTO users(name, phone, password_hash, role, station_id, created_at, beans) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
  ['Rabin Sharma', '+9779800000001', hash, 'owner', null, new Date(), 0],
)).rows[0];

/* ---------- catalogue ---------- */
const cat = {};
for (const [i, [n, ne]] of [['Hot coffee', 'तातो कफी'], ['Cold coffee', 'चिसो कफी'], ['Signature', 'विशेष'], ['Bites', 'खाजा'], ['Merch', 'सामान']].entries()) {
  cat[n] = (await q('INSERT INTO categories(name,name_ne,sort) VALUES ($1,$2,$3) RETURNING id', [n, ne, i])).rows[0].id;
}

/* ---------- suppliers and ingredients ---------- */
const sup = {};
for (const [n, ph] of [
  ['Sevya Coffee Processing', '+9779801000001'],
  ['Himal Dairy', '+9779801000002'],
  ['Valley Ice and Water', '+9779801000003'],
  ['Kathmandu Packaging Supplies', '+9779801000004'],
  ['TERAI Bakery', '+9779801000005'],
  ['Mero Syrups', '+9779801000006'],
  ['Sadhai Merch Studio', '+9779801000007'],
]) {
  sup[n] = (await q('INSERT INTO suppliers(name, phone) VALUES ($1,$2) RETURNING id', [n, ph])).rows[0].id;
}

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
    [n, unit, category, packUnit, packSize, packPrice, unitCost, waste, sup[supplier], cReorder, cPar],
  )).rows[0];
  ing[n] = r.id;
  ingRow[n] = { unitCost, waste };
  await q('INSERT INTO ingredient_cost_history(ingredient_id, pack_size, pack_price, unit_cost, waste_pct, source) VALUES ($1,$2,$3,$4,$5,$6)', [r.id, packSize, packPrice, unitCost, waste, 'create']);
}

const B = 'Coffee beans (Sevya roast)';
const DS = 16;
const products = [
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

for (const [i, [sku, cn, name, name_ne, price, cost, f, origin, desc, recipe, passOk, method]] of products.entries()) {
  const p = (await q(
    `INSERT INTO products(category_id, sku, name, name_ne, description, price, cost, is_signature, is_seasonal, pass_eligible, origin, sort, kind, recipe_method, price_tier)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
    [cat[cn], sku, name, name_ne, desc, price, cost, !!f.sig, !!f.season, passOk, origin, i, cn === 'Merch' ? 'merch' : cn === 'Bites' ? 'food' : 'drink', method, TIER[sku] || null],
  )).rows[0];

  for (const [n, qty] of Object.entries(recipe)) {
    await q('INSERT INTO recipes VALUES ($1,$2,$3)', [p.id, ing[n], qty]);
  }

  if (cn !== 'Bites' && cn !== 'Merch') {
    const g = async (name, name_ne, required, multi, opts, sort) => {
      const gid = (await q('INSERT INTO option_groups(product_id,name,name_ne,required,multi,sort) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [p.id, name, name_ne, required, multi, sort])).rows[0].id;
      const ids = {};
      for (const [oi, [on, one, d, def]] of opts.entries()) {
        ids[on] = (await q('INSERT INTO options(group_id,name,name_ne,price_delta,is_default,sort) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [gid, on, one, d, def, oi])).rows[0].id;
      }
      return ids;
    };
    const delta = async (optionId, name, qty) => q('INSERT INTO option_recipes(option_id, ingredient_id, qty) VALUES ($1,$2,$3)', [optionId, ing[name], qty]);
    const size = await g('Size', 'आकार', true, false, [['Regular', 'सामान्य', 0, true], ['Large', 'ठूलो', 40, false]], 0);
    if (recipe.Milk) await delta(size.Large, 'Milk', 50);
    if (recipe.Ice) await delta(size.Large, 'Ice', 40);
    if (recipe.Water) await delta(size.Large, 'Water', 40);
    if (recipe.Milk) {
      const milk = await g('Milk', 'दूध', false, false, [['Dairy', 'दूध', 0, true], ['Oat', 'ओट', 40, false]], 1);
      await delta(milk.Oat, 'Milk', -recipe.Milk);
      await delta(milk.Oat, 'Oat milk', recipe.Milk);
    }
    const extras = await g('Extras', 'थप', false, true, [['Extra shot', 'थप सट', 60, false]], 2);
    await delta(extras['Extra shot'], B, DS);
    const sugar = await g('Sugar', 'चिनी', false, false, [['No sugar', 'चिनी नहाल्ने', 0, true], ['1 sachet', '१ सेट', 0, false], ['2 sachets', '२ सेट', 0, false]], 3);
    await delta(sugar['1 sachet'], 'Sugar sachet', 1);
    await delta(sugar['2 sachets'], 'Sugar sachet', 2);
  }
}

/* ---------- inventory initial baseline ---------- */
const STOCK = { [B]: 4000, Milk: 20000, 'Oat milk': 3000, 'Hot cups': 400, 'Cold cups': 250, 'Sugar sachet': 300, 'Chiya masala syrup': 1500, Ice: 20000, 'Suntala syrup': 1500, 'Gur cardamom syrup': 1500, 'Chocolate syrup': 1200, 'Butter croissant': 40, 'Cardamom bun': 40, 'Sadhai mug': 24, 'Canvas tote': 20, 'Gulmi beans 250g': 30, 'Sadhai cap': 16 };
const REORDER = { [B]: 800, Milk: 4000, 'Oat milk': 600, 'Hot cups': 80, 'Cold cups': 60, Ice: 4000, 'Sugar sachet': 60, 'Butter croissant': 8, 'Cardamom bun': 8, 'Sadhai mug': 5, 'Canvas tote': 4, 'Gulmi beans 250g': 6, 'Sadhai cap': 3 };

for (const s of stations) {
  for (const [n, id] of Object.entries(ing)) {
    if (n === 'Water') continue;
    const stock = STOCK[n] || 1000;
    await q('INSERT INTO station_inventory(station_id,ingredient_id,qty,reorder_level,par_level) VALUES ($1,$2,$3,$4,$5)', [s.id, id, stock, REORDER[n] ?? Math.round(stock * 0.2), stock]);
  }
}
await q(`UPDATE ingredients SET tracked=false WHERE name='Water'`);

// Recompute product costs from recipes
await recomputeProductCosts({ query: (t, p) => c.query(t, p) });

await q('COMMIT');
c.release();

console.log('Clean reset complete!');
console.log(`- Stations: ${stations.length}`);
console.log(`- Categories: ${Object.keys(cat).length}`);
console.log(`- Products: ${products.length}`);
console.log('- Orders: 0 (completely clean)');
console.log('- Customers: 0 (completely clean)');
console.log(`- Owner Login: 9800000001 / ${PASSWORD}`);
await pool.end();
