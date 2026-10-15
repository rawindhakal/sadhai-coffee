// Demo data: 4 stations, staff, a full menu, 60 days of order history, passes, coupons, drops.
// Safe to re-run: it wipes and recreates everything. Refuses to run in production unless SEED_FORCE=1.
import bcrypt from 'bcryptjs';
import { pool } from '../src/lib/db.js';

if (process.env.NODE_ENV === 'production' && !process.env.SEED_FORCE) {
  console.error('Refusing to seed in production (set SEED_FORCE=1 to override).');
  process.exit(1);
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
await q(`TRUNCATE partner_settlements, daily_offers, audit_log, settlements, cash_closes, notifications, referrals, payments, order_items, orders, drops, promo_codes, coupons, passes,
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
const ing = {};
for (const [n, unit, cost] of [
  ['Coffee beans (Sevya roast)', 'g', 1.6], ['Milk', 'ml', 0.11], ['Oat milk', 'ml', 0.26], ['Hot cups', 'pcs', 9], ['Cold cups', 'pcs', 11], ['Sugar', 'g', 0.1],
  ['Chiya masala syrup', 'ml', 0.5], ['Ice', 'g', 0.02], ['Suntala syrup', 'ml', 0.6], ['Gur cardamom syrup', 'ml', 0.55], ['Chocolate syrup', 'ml', 0.45], ['Butter croissant', 'pcs', 55], ['Cardamom bun', 'pcs', 38], ['Sadhai mug', 'pcs', 190], ['Canvas tote', 'pcs', 260], ['Gulmi beans 250g', 'pcs', 330], ['Sadhai cap', 'pcs', 230],
]) ing[n] = (await q('INSERT INTO ingredients(name,unit,unit_cost) VALUES ($1,$2,$3) RETURNING id', [n, unit, cost])).rows[0].id;

const B = 'Coffee beans (Sevya roast)';
const products = [
  // sku, cat, name, name_ne, price, cost, flags, origin, desc, recipe
  ['ESP', 'Hot coffee', 'Espresso', 'एस्प्रेसो', 100, 28, {}, null, 'Double shot, short and strong.', { [B]: 18, 'Hot cups': 1 }, false],
  ['AMR', 'Hot coffee', 'Americano', 'अमेरिकानो', 130, 34, {}, null, 'Two shots, hot water. 200 ml, all taxes included.', { [B]: 18, 'Hot cups': 1 }, true],
  ['CAP', 'Hot coffee', 'Cappuccino', 'क्यापुचिनो', 160, 46, {}, null, 'Equal parts espresso, milk and foam.', { [B]: 18, Milk: 120, 'Hot cups': 1 }, true],
  ['LAT', 'Hot coffee', 'Latte', 'ल्याते', 170, 48, {}, null, 'Smooth and milky.', { [B]: 18, Milk: 180, 'Hot cups': 1 }, true],
  ['MOC', 'Hot coffee', 'Mocha', 'मोका', 190, 56, {}, null, 'Latte with chocolate.', { [B]: 18, Milk: 150, 'Chocolate syrup': 20, 'Hot cups': 1 }, true],
  ['ICL', 'Cold coffee', 'Iced latte', 'आइस्ड ल्याते', 180, 52, {}, null, 'Over ice, ready in 90 seconds.', { [B]: 18, Milk: 150, Ice: 120, 'Cold cups': 1 }, true],
  ['CLB', 'Cold coffee', 'Cold brew', 'कोल्ड ब्रु', 190, 50, {}, null, 'Steeped 16 hours, poured in seconds.', { [B]: 22, Ice: 100, 'Cold cups': 1 }, true],
  ['CHL', 'Signature', 'Chiya latte', 'चिया ल्याते', 180, 50, { sig: true }, null, 'Espresso with milk tea spices. Our answer to the roadside chiya.', { [B]: 18, Milk: 170, 'Chiya masala syrup': 18, 'Hot cups': 1 }, true],
  ['SCB', 'Signature', 'Suntala cold brew', 'सुन्तला कोल्ड ब्रु', 210, 60, { sig: true, season: true }, null, 'Cold brew with Nepali mandarin. Seasonal.', { [B]: 22, 'Suntala syrup': 25, Ice: 100, 'Cold cups': 1 }, true],
  ['GPO', 'Signature', 'Gulmi pour-over', 'गुल्मी पोर-ओभर', 220, 62, { sig: true }, 'Gulmi, 1,400 m', 'Single origin from the hills of Gulmi. Brown sugar and cherry.', { [B]: 20, 'Hot cups': 1 }, true],
  ['GUR', 'Signature', 'Gur cardamom latte', 'गुर अलैंची ल्याते', 190, 54, { sig: true, season: true }, null, 'Jaggery and cardamom. Monthly drop with TERAI bakery.', { [B]: 18, Milk: 170, 'Gur cardamom syrup': 18, 'Hot cups': 1 }, true],
  ['CRO', 'Bites', 'Butter croissant', 'बटर क्रोइसाँ', 120, 62, {}, null, 'Baked this morning by TERAI bakery.', { 'Butter croissant': 1 }, false],
  ['BUN', 'Bites', 'Cardamom bun', 'अलैंची बन', 90, 40, {}, null, 'Soft, sticky and warm.', { 'Cardamom bun': 1 }, false],
];
products.push(
  ['MUG', 'Merch', 'Sadhai mug', 'सधैं मग', 450, 190, {}, null, 'Ceramic mug, 300 ml. Cherry glaze.', { 'Sadhai mug': 1 }, false],
  ['TOT', 'Merch', 'Canvas tote', 'क्यानभास झोला', 650, 260, {}, null, 'Heavy canvas tote with the sadhai mark.', { 'Canvas tote': 1 }, false],
  ['BAG', 'Merch', 'Gulmi beans 250g', 'गुल्मी बिन्स २५०ग्राम', 790, 330, {}, 'Gulmi, 1,400 m', 'Roasted by Sevya Coffee Processing. Roast date on the label.', { 'Gulmi beans 250g': 1 }, false],
  ['HAT', 'Merch', 'Sadhai cap', 'सधैं टोपी', 550, 230, {}, null, 'Cherry cap, adjustable.', { 'Sadhai cap': 1 }, false],
);
const prod = {};
for (const [i, [sku, cn, name, name_ne, price, cost, f, origin, desc, recipe, passOk]] of products.entries()) {
  const p = (await q(
    `INSERT INTO products(category_id, sku, name, name_ne, description, price, cost, is_signature, is_seasonal, pass_eligible, origin, sort, kind)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [cat[cn], sku, name, name_ne, desc, price, cost, !!f.sig, !!f.season, passOk, origin, i, cn === 'Merch' ? 'merch' : cn === 'Bites' ? 'food' : 'drink'],
  )).rows[0];
  prod[sku] = p;
  for (const [n, qty] of Object.entries(recipe)) await q('INSERT INTO recipes VALUES ($1,$2,$3)', [p.id, ing[n], qty]);
  if (cn !== 'Bites' && cn !== 'Merch') {
    const g = async (name, name_ne, required, multi, opts, sort) => {
      const gid = (await q('INSERT INTO option_groups(product_id,name,name_ne,required,multi,sort) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [p.id, name, name_ne, required, multi, sort])).rows[0].id;
      for (const [oi, [on, one, d, def]] of opts.entries()) await q('INSERT INTO options(group_id,name,name_ne,price_delta,is_default,sort) VALUES ($1,$2,$3,$4,$5,$6)', [gid, on, one, d, def, oi]);
    };
    await g('Size', 'आकार', true, false, [['Regular', 'सामान्य', 0, true], ['Large', 'ठूलो', 40, false]], 0);
    if (recipe.Milk) await g('Milk', 'दूध', false, false, [['Dairy', 'दूध', 0, true], ['Oat', 'ओट', 40, false]], 1);
    await g('Extras', 'थप', false, true, [['Extra shot', 'थप सट', 40, false], ['Less sugar', 'कम चिनी', 0, false]], 2);
  }
}

/* inventory per station */
for (const s of stations) {
  for (const [n, id] of Object.entries(ing)) {
    const stock = { 'Coffee beans (Sevya roast)': 4000, Milk: 20000, 'Oat milk': 3000, 'Hot cups': 400, 'Cold cups': 250, Sugar: 3000, 'Chiya masala syrup': 1500, Ice: 20000, 'Suntala syrup': 1500, 'Gur cardamom syrup': 1500, 'Chocolate syrup': 1200, 'Butter croissant': 40, 'Cardamom bun': 40, 'Sadhai mug': 24, 'Canvas tote': 20, 'Gulmi beans 250g': 30, 'Sadhai cap': 16 }[n];
    const reorder = { 'Coffee beans (Sevya roast)': 800, Milk: 4000, 'Oat milk': 600, 'Hot cups': 80, 'Cold cups': 60, Ice: 4000, 'Butter croissant': 8, 'Cardamom bun': 8, 'Sadhai mug': 5, 'Canvas tote': 4, 'Gulmi beans 250g': 6, 'Sadhai cap': 3 }[n] ?? Math.round(stock * 0.2);
    await q('INSERT INTO station_inventory(station_id,ingredient_id,qty,reorder_level) VALUES ($1,$2,$3,$4)', [s.id, id, stock, reorder]);
  }
}
await q(`UPDATE station_inventory SET qty = 480 WHERE station_id=$1 AND ingredient_id=$2`, [stations[2].id, ing['Oat milk']]); // low-stock demo
await q(`UPDATE station_inventory SET qty = 5 WHERE station_id=$1 AND ingredient_id=$2`, [stations[3].id, ing['Butter croissant']]);

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
const payW = [['cash', 38], ['esewa', 24], ['khalti', 14], ['fonepay', 24]];
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
    `INSERT INTO passes(user_id,total_cups,used_cups,price_paid,status,purchased_at,expires_at,related_party) VALUES ($1,10,$2,1200,$3,$4,$5,$6) RETURNING id`,
    [cu.u.id, used, used >= 10 ? 'used' : 'active', when, new Date(when.getTime() + 30 * DAY), i === 13],
  )).rows[0];
  await q(`INSERT INTO payments(user_id,pass_id,station_id,purpose,provider,amount,status,created_at,settled_at) VALUES ($1,$2,$3,'pass',$4,1200,'paid',$5,$5)`, [cu.u.id, pass.id, stations[cu.home].id, wpick([['esewa', 3], ['khalti', 2], ['fonepay', 2], ['cash', 3]]), when]);
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
await q(`INSERT INTO promo_codes(code,title,pct,min_total,max_uses,per_user_limit,valid_until,created_by) VALUES ('TUCAMPUS','Campus week',15,100,500,3,now()+interval '20 days',$1),('AMERICANO99','Americano Rs 99',24,0,NULL,1,now()+interval '4 days',$1)`, [owner.id]);
await q(
  `INSERT INTO drops(name,name_ne,partner,product_id,price,cap,sold,starts_at,ends_at) VALUES ('Drop 01: Gur cardamom latte','ड्रप ०१: गुर अलैंची ल्याते','TERAI bakery',$1,169,3000,1284,now()-interval '9 days',now()+interval '21 days')`,
  [prod.GUR.id],
);

await q(`INSERT INTO daily_offers(title,title_ne,blurb,scope,product_id,offer_price,ends_at,created_by) VALUES ('Americano, Rs 99 today','आज अमेरिकानो रु ९९','Everything included. One cup or two.','product',$1,99, date_trunc('day', now() AT TIME ZONE 'Asia/Kathmandu') + interval '1 day' - interval '5 hours 45 minutes',$2)`, [prod.AMR.id, owner.id]);
await q(`INSERT INTO daily_offers(title,blurb,scope,product_id,pct,station_id,ends_at,max_uses,created_by) VALUES ('Cold brew 20% off at Kalanki','Beat the afternoon heat.','product',$1,20,$2, now() + interval '2 days', 200,$3)`, [prod.CLB.id, stations[2].id, mgr2.id]);
await q(`INSERT INTO daily_offers(title,blurb,scope,category_id,pct,ends_at,created_by) VALUES ('Bites 15% off with any coffee','Croissant or bun, fresh from TERAI.','category',$1,15, now() + interval '3 days',$2)`, [cat.Bites, owner.id]);

/* settlements (providers' bank credits) for the last 14 days, with two deliberate gaps */
const { rows: sums } = await q(
  `SELECT provider, (created_at AT TIME ZONE 'Asia/Kathmandu')::date AS day, sum(amount)::int AS amt FROM payments
    WHERE status='paid' AND provider IN ('esewa','khalti','fonepay') AND created_at > now() - interval '15 days' AND created_at < now() - interval '1 day' GROUP BY 1,2`,
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
await q(`INSERT INTO notifications(user_id,kind,title,body) VALUES ($1,'promo','Your Americano, Rs 99 until Sunday','Use code AMERICANO99. One per customer.')`, [demo.id]);
await q(`INSERT INTO audit_log(actor_id,action,entity,meta) VALUES ($1,'seed','system','{"note":"demo data created"}')`, [owner.id]);
await q('COMMIT');
c.release();

const n = (await pool.query(`SELECT count(*)::int AS n FROM orders`)).rows[0].n;
console.log(`Seeded: ${stations.length} stations, ${customers.length} customers, ${n} orders.`);
console.log(`Demo logins (password ${PASSWORD}):`);
console.log('  owner     9800000001');
console.log('  manager   9800000002 (TU Gate + Teaching Hospital)   9800000003 (Kalanki + New Road)');
console.log('  station   9800000011 (TU Gate)  9800000012  9800000013  9800000014');
console.log('  customer  9812345678 (Asha Gurung)');
await pool.end();
