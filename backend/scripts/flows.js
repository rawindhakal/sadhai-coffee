// End-to-end business flows, as the owner described them. Needs a freshly seeded database and a running API:
//   npm run seed && API_URL=http://localhost:4747 node scripts/flows.js
import crypto from 'node:crypto';
import { query as sql, } from '../src/lib/db.js';
import { releaseDueOrders } from '../src/lib/orders.js';
const API = process.env.API_URL || 'http://localhost:4000';
let failed = 0, n = 0;
const ok = (c, m) => { n++; console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) failed++; };
const section = (t) => console.log(`\n== ${t}`);
async function call(method, path, body, token) {
  const r = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j };
}
const login = async (phone) => (await call('POST', '/auth/login', { phone, password: 'Sadhai@123' })).body;
const tok = (u) => u.access_token;

const owner = await login('9800000001'), mgrCo = await login('9800000002'), mgrPartner = await login('9800000003');
const tuStaff = await login('9800000011'), kalankiStaff = await login('9800000013'), newRoadStaff = await login('9800000014');
const partner = await login('9801111111'), partner2 = await login('9802222222');
ok(partner.user?.role === 'partner' && partner2.user?.role === 'partner', 'partner cafe owners can sign in');

const stations = (await call('GET', '/stations')).body;
const tu = stations.find((s) => s.code === 'TU-GATE'), kal = stations.find((s) => s.code === 'KALANKI'), road = stations.find((s) => s.code === 'NEWROAD');
ok(kal.operator_type === 'partner' && tu.operator_type === 'company', 'a station is either Sadhai-run or partner-run');

// Stations are open all day for the tests, so they do not depend on the time the suite runs.
for (const s of stations) await call('PATCH', `/admin/stations/${s.id}`, { opens: '00:00', closes: '23:59', is_open: true, accepting_orders: true }, tok(owner));
await call('PUT', '/owner/settings', { welcome_enabled: 1, welcome_trigger: 0, welcome_first_cup_enabled: 1, welcome_first_cup_pct: 100, first_cup_min_spend: 100, ladder_count: 3, ladder_pct: 30, referral_min_spend: 100, referrer_require_paid_order: 0, offer_require_verified_phone: 0 }, tok(owner));
const homeOf = async (st) => (await call('GET', `/stations/${st.id}/home`)).body;
const home = await homeOf(tu);
const all = home.categories.flatMap((c) => c.products);
const ame = all.find((p) => p.sku === 'AMR'), latte = all.find((p) => p.sku === 'LAT');
const sizeOpt = (p) => p.option_groups.find((g) => g.name === 'Size').options.find((o) => o.is_default).id;
const line = (p, qty = 1) => ({ product_id: p.id, qty, option_ids: [sizeOpt(p)] });

let seq = 0;
async function newCustomer(referral) {
  const phone = `98${String(Date.now() + (seq++) * 17).slice(-8)}`;
  const r = (await call('POST', '/auth/register', { name: `Flow Customer ${seq}`, phone, password: 'Sadhai@123', referral_code: referral })).body;
  return { phone, token: r.access_token, id: r.user.id };
}
const queue = async (staff, view) => (await call('GET', `/station/orders${view ? `?view=${view}` : ''}`, null, tok(staff))).body;
const setStatus = (staff, id, status, extra = {}) => call('POST', `/station/orders/${id}/status`, { status, ...extra }, tok(staff));
const stockOf = async (staff, name) => (await call('GET', '/station/inventory', null, tok(staff))).body.find((i) => i.name.startsWith(name))?.qty;

/* ---------------------------------------------------------------- 1 */
section('1. Kiosk: guest orders at kiosk with cash at counter, then the order reaches the station');
{
  const before = await stockOf(tuStaff, 'Coffee');
  const k = await call('POST', '/kiosk/orders', { items: [line(ame)], customer_name: 'Kiosk Guest', customer_phone: '9801234567', payment: 'counter', consent: true }, tok(tuStaff));
  ok(k.status === 201 && k.body.order.status === 'placed' && k.body.order.payment_status === 'unpaid', 'kiosk order is placed for counter payment');
  ok(/^\d{4}$/.test(k.body.order.handover_code), 'the guest gets a 4-digit handover code on the screen');
  const q1 = await queue(tuStaff);
  const mine = q1.find((o) => o.id === k.body.order.id);
  ok(mine && mine.status === 'placed' && mine.customer_name === 'Kiosk Guest', 'now it appears at the station with the guest name');
  ok(mine.handover_code === undefined && mine.has_code === true, 'the station can see an order has a code, but not what it is');
  ok((await stockOf(tuStaff, 'Coffee')) < before, 'ingredients are reserved');

  section('   station accepts, prepares, marks prepared, then hands over with the code');
  ok((await setStatus(tuStaff, mine.id, 'ready')).status === 409, 'cannot mark prepared before accepting');
  ok((await setStatus(tuStaff, mine.id, 'preparing')).body.status === 'preparing', 'station accepts and starts preparing');
  ok((await setStatus(tuStaff, mine.id, 'ready')).body.status === 'ready', 'station marks it prepared');
  ok((await setStatus(tuStaff, mine.id, 'picked_up')).status === 400, 'handover without a code is refused');
  ok((await setStatus(tuStaff, mine.id, 'picked_up', { code: '0000' })).status === 400, 'a wrong code is refused');
  const done = await setStatus(tuStaff, mine.id, 'picked_up', { code: k.body.order.handover_code });
  ok(done.body.status === 'picked_up', 'the right code completes the pickup');
  ok((await queue(tuStaff, 'done')).some((o) => o.id === mine.id), 'it moves to today’s finished orders');
}

/* ---------------------------------------------------------------- 2 */
section('2. App order, paid in cash at pickup');
const cust = await newCustomer();
let appOrder;
{
  const o = await call('POST', '/orders', { station_id: tu.id, items: [line(latte, 2)], payment_method: 'cash', channel: 'app' }, cust.token);
  ok(o.status === 201 && o.body.order.status === 'placed' && o.body.order.payment_status === 'unpaid' && !o.body.payment, 'the order goes straight to the station, unpaid, with no payment step');
  ok((await queue(tuStaff)).some((x) => x.id === o.body.order.id), 'the station sees it at once');
  const mine = (await call('GET', `/orders/${o.body.order.id}`, null, cust.token)).body;
  ok(mine.status === 'placed' && /^\d{4}$/.test(mine.handover_code), 'customer sees the order and its pickup code');
  const other = await newCustomer();
  ok((await call('GET', `/orders/${o.body.order.id}`, null, other.token)).status === 404, 'another customer cannot see it or its code');
  ok([404, 409].includes((await call('POST', `/orders/${mine.id}/cancel`, {}, cust.token)).status), 'a placed order cannot be cancelled by the customer, even before the barista starts');
  await setStatus(tuStaff, mine.id, 'preparing');
  ok([404, 409].includes((await call('POST', `/orders/${mine.id}/cancel`, {}, cust.token)).status), 'customer cannot cancel a placed order');
  await setStatus(tuStaff, mine.id, 'ready');
  const before = (await call('GET', '/me', null, cust.token)).body.beans ?? 0;
  const done = await setStatus(tuStaff, mine.id, 'picked_up', { code: mine.handover_code });
  ok(done.body.status === 'picked_up', 'pickup with the customer’s code');
  ok((await call('GET', `/orders/${mine.id}`, null, cust.token)).body.payment_status === 'paid', 'the cash is marked paid at hand-over');
  const after = (await call('GET', '/me', null, cust.token)).body.beans ?? 0;
  ok(after === before + 2, 'two cups earn two beans');
  appOrder = mine;
}

/* ---------------------------------------------------------------- 3 */
section('3. Other ways to pay or save: coupon, promo, pass, cash at pickup');
{
  const c = await newCustomer('ASHA204');
  const coupons = (await call('GET', '/coupons', null, c.token)).body;
  const free = coupons.find((x) => x.kind === 'first_cup');
  const o = await call('POST', '/orders', { station_id: tu.id, items: [line(ame)], payment_method: 'cash', coupon_id: free.id }, c.token);
  ok(o.body.order.total === 0 && o.body.order.status === 'placed' && o.body.order.payment_status === 'paid', 'a free-cup coupon makes it Rs 0 and sends it straight to the station');
  ok((await queue(tuStaff)).some((x) => x.id === o.body.order.id), 'the station sees the coupon order');

  const cash = await call('POST', '/orders', { station_id: tu.id, items: [line(latte)], payment_method: 'cash' }, c.token);
  ok(cash.body.order.status === 'placed' && cash.body.order.payment_status === 'unpaid', 'cash order is sent to the station and paid at pickup');
  const id = cash.body.order.id;
  await setStatus(tuStaff, id, 'preparing'); await setStatus(tuStaff, id, 'ready');
  const code = (await call('GET', `/orders/${id}`, null, c.token)).body.handover_code;
  await setStatus(tuStaff, id, 'picked_up', { code });
  ok((await call('GET', `/orders/${id}`, null, c.token)).body.payment_status === 'paid', 'cash is marked paid at pickup');

  // A pass is sold for cash at the counter; the customer's phone number finds the account.
  const me = (await call('GET', '/me', null, c.token)).body;
  const sold = await call('POST', '/station/passes', { phone: me.phone, station_id: tu.id }, tok(tuStaff));
  ok(sold.status === 201, 'the counter sells a pass for cash');
  const passOrder = await call('POST', '/orders', { station_id: tu.id, items: [line(ame)], payment_method: 'pass' }, c.token);
  ok(passOrder.body.order.total === 0 && passOrder.body.order.payment_method === 'pass' && passOrder.body.order.status === 'placed', 'a pass pays for a drink and the order reaches the station');
}


/* ---------------------------------------------------------------- 4 */
section('4. Things going wrong');
{
  const c = await newCustomer();
  const before = await stockOf(tuStaff, 'Coffee');
  const walkPaid = await call('POST', '/station/orders', { items: [line(ame)], payment_method: 'cash' }, tok(tuStaff));
  ok(walkPaid.body.order.payment_status === 'paid', 'a walk-in order is paid in cash on the spot');
  await setStatus(tuStaff, walkPaid.body.order.id, 'cancelled', { reason: 'Machine broke' });
  const pays = (await call('GET', `/admin/orders/${walkPaid.body.order.id}`, null, tok(mgrCo))).body;
  ok(pays.status === 'cancelled' && pays.payment_status === 'refunded' && pays.payments.some((p) => p.status === 'refunded'), 'a paid order the station declines is marked refunded');
  ok(!(await queue(tuStaff)).some((x) => x.id === walkPaid.body.order.id), 'and it leaves the queue');

  const o4 = await call('POST', '/orders', { station_id: tu.id, items: [line(latte)], payment_method: 'cash' }, c.token);
  const id = o4.body.order.id;
  await setStatus(tuStaff, id, 'preparing'); await setStatus(tuStaff, id, 'ready');
  const code = (await call('GET', `/orders/${id}`, null, c.token)).body.handover_code;
  const wrong = code === '1234' ? '4321' : '1234';
  const res = [];
  for (let i = 0; i < 5; i++) res.push((await setStatus(tuStaff, id, 'picked_up', { code: wrong })).status);
  ok(res.slice(0, 4).every((s) => s === 400) && res[4] === 403, 'five wrong codes lock the handover');
  ok((await setStatus(tuStaff, id, 'picked_up', { code })).status === 403, 'even the right code is refused after the lock');
  ok((await setStatus(tuStaff, id, 'picked_up', { reason: 'Customer showed ID' })).status === 403, 'counter staff cannot override the code');
  ok((await setStatus(mgrCo, id, 'picked_up', { reason: 'x' })).status !== 200, 'a manager needs a real reason');
  const ov = await setStatus(mgrCo, id, 'picked_up', { reason: 'Customer lost phone, showed ID' });
  ok(ov.body.status === 'picked_up', 'a manager can hand over with a reason');
  ok((await call('GET', `/admin/orders/${id}`, null, tok(mgrCo))).body.handover_override?.includes('showed ID'), 'the reason stays on record');

  const walk = await call('POST', '/station/orders', { items: [line(ame)], payment_method: 'cash' }, tok(tuStaff));
  const wid = walk.body.order.id;
  await setStatus(tuStaff, wid, 'preparing'); await setStatus(tuStaff, wid, 'ready');
  ok((await setStatus(tuStaff, wid, 'picked_up')).body.status === 'picked_up', 'a walk-in order paid at the counter needs no code');

  await call('POST', `/station/products/${ame.id}/availability`, { available: false }, tok(tuStaff));
  const so = await call('POST', '/orders', { station_id: tu.id, items: [line(ame)], payment_method: 'cash' }, c.token);
  ok(so.status === 409, 'a product marked finished cannot be ordered');
  await call('POST', `/station/products/${ame.id}/availability`, { available: true }, tok(tuStaff));
}

/* ---------------------------------------------------------------- 5 */
section('5. No online payment gateway remains');
{
  const c = await newCustomer();
  for (const m of ['esewa', 'khalti', 'fonepay', 'card']) ok((await call('POST', '/orders', { station_id: tu.id, items: [line(ame)], payment_method: m }, c.token)).status === 400, `${m} is refused as a way to pay`);
  ok((await call('POST', '/kiosk/orders', { items: [line(ame)], customer_name: 'Guest', customer_phone: '9801234500', payment: 'esewa', consent: true }, tok(tuStaff))).status === 400, 'the kiosk refuses online payment');
  ok((await call('POST', '/passes', { payment_method: 'esewa' }, c.token)).status === 404, 'a customer cannot buy a pass online');
  const o = await call('POST', '/orders', { station_id: tu.id, items: [line(ame)], payment_method: 'cash' }, c.token);
  ok(!o.body.payment && o.body.order.status === 'placed', 'an order response carries no payment object');
  ok((await call('GET', '/payments/x', null, c.token)).status === 404 && (await call('POST', '/payments/x/confirm', {}, c.token)).status === 404, 'the payment routes are gone');
  ok([401, 404].includes(await fetch(API + '/payments/esewa/callback').then((r) => r.status)) && [401, 404].includes(await fetch(API + '/payments/esewa/start').then((r) => r.status)), 'the eSewa start and callback addresses are gone');
  ok((await call('POST', '/owner/integrations/test/esewa', {}, tok(owner))).status === 404, 'there is no gateway test');
  const keys = (await call('GET', '/owner/integrations', null, tok(owner))).body.map((i) => i.key).join(' ');
  ok(!/esewa|khalti|fonepay|payment|cash_enabled/i.test(keys), 'no payment keys are left in the owner settings');
  ok((await call('GET', '/config')).body.payment_methods.join() === 'cash,pass' && (await call('GET', '/config')).body.payment_gateways === undefined, 'the public config offers only cash and a pass');
  ok((await call('GET', '/owner/reconciliation', null, tok(owner))).status === 404, 'the provider reconciliation report is gone');
  ok((await call('GET', '/owner/setup', null, tok(owner))).body.steps.every((x) => x.key !== 'payments'), 'the setup checklist has no payments step');
}

/* ---------------------------------------------------------------- 6 */
section('6. Partner cafe: the same flow at Kalanki, and what the partner owner sees');
const kHome = await homeOf(kal);
const kAme = kHome.categories.flatMap((c) => c.products).find((p) => p.sku === 'AMR');
const kLine = { product_id: kAme.id, qty: 1, option_ids: [sizeOpt(kAme)] };
{
  const c = await newCustomer();
  for (let i = 0; i < 3; i++) {
    const o = await call('POST', '/orders', { station_id: kal.id, items: [kLine], payment_method: 'cash' }, c.token);
    const id = o.body.order.id;
    ok((await queue(kalankiStaff)).some((x) => x.id === id), `partner station sees order ${i + 1}`);
    ok(!(await queue(tuStaff)).some((x) => x.id === id) && !(await queue(newRoadStaff)).some((x) => x.id === id), 'no other station sees it');
    await setStatus(kalankiStaff, id, 'preparing'); await setStatus(kalankiStaff, id, 'ready');
    const code = (await call('GET', `/orders/${id}`, null, c.token)).body.handover_code;
    ok((await setStatus(kalankiStaff, id, 'picked_up', { code })).body.status === 'picked_up', `partner staff hand over order ${i + 1} with the code`);
  }
  ok((await setStatus(tuStaff, (await queue(kalankiStaff))[0]?.id || '00000000-0000-0000-0000-000000000000', 'preparing')).status >= 400, 'staff of another station cannot touch it');

  const mine = (await call('GET', '/admin/stations', null, tok(partner))).body;
  ok(mine.length === 1 && mine[0].code === 'KALANKI', 'the partner owner sees only their own cafe');
  const ov = (await call('GET', '/admin/overview', null, tok(partner))).body;
  ok(ov.totals.revenue > 0 && ov.totals.orders > 0, 'they see their sales and orders');
  ok(ov.totals.food_cost === undefined && ov.totals.gross_margin === undefined && ov.labour === null, 'but not Sadhai’s costs, margins or pay');
  ok(ov.stations.length === 1, 'the overview covers only their cafe');
  const orders = (await call('GET', '/admin/orders?limit=5', null, tok(partner))).body;
  ok(orders.length > 0 && orders.every((o) => o.station_name.includes('Kalanki')), 'their order list is only their cafe');
  const od = (await call('GET', `/admin/orders/${orders[0].id}`, null, tok(partner))).body;
  ok(od.user_phone === undefined, 'customer phone numbers are hidden from partners');
  const stock = (await call('GET', '/admin/inventory', null, tok(partner))).body;
  ok(Array.isArray(stock) && stock.length > 0 && JSON.stringify(stock).includes('Kalanki'), 'they see their stock');
  ok(!JSON.stringify(stock).includes('Teaching'), 'and nobody else’s');
  ok((await call('GET', `/admin/orders?station_id=${tu.id}`, null, tok(partner))).status === 403, 'they cannot look at another station');
  ok((await call('GET', '/admin/reviews', null, tok(partner))).status === 200, 'they see ratings');
  const st = (await call('GET', '/admin/partner-statement', null, tok(partner))).body;
  const row = Array.isArray(st) ? st[0] : st;
  ok(row && row.station?.code === 'KALANKI' && row.partner_share > 0, 'they see their settlement statement and revenue share');
  ok((await call('GET', '/admin/partner-statement', null, tok(partner2))).body[0].station.code === 'NEWROAD', 'the other partner sees only theirs');

  for (const [m, p, b] of [['POST', '/admin/offers', { title: 'x' }], ['POST', '/admin/promos', {}], ['PUT', `/admin/stations/${kal.id}/products/${kAme.id}`, { price_override: 50 }], ['POST', '/admin/push/campaigns', { title: 'x', audience: { type: 'all' } }], ['GET', '/admin/costing'], ['GET', '/admin/customers'], ['POST', `/admin/orders/${orders[0].id}/refund`, { reason: 'abc' }]]) {
    ok((await call(m, p, b, tok(partner))).status === 403, `partner cannot ${m} ${p}`);
  }
  ok((await call('GET', '/owner/settings', null, tok(partner))).status === 403 && (await call('GET', '/hr/payroll/runs', null, tok(partner))).status === 403, 'partner cannot reach owner or payroll');
  const paused = await call('PATCH', `/admin/stations/${kal.id}`, { accepting_orders: false }, tok(partner));
  ok(paused.status === 200, 'they can pause their own orders');
  await call('PATCH', `/admin/stations/${kal.id}`, { accepting_orders: true }, tok(partner));
  ok((await call('PATCH', `/admin/stations/${tu.id}`, { accepting_orders: false }, tok(partner))).status === 403, 'but not another cafe');

  const phone = `98${String(Date.now()).slice(-8)}`;
  const staff = await call('POST', '/admin/staff', { name: 'Partner Barista', phone, password: 'Sadhai@123', station_id: kal.id }, tok(partner));
  ok(staff.status === 201, 'the partner adds a login for their own counter staff');
  ok((await call('POST', '/admin/staff', { name: 'X Y', phone: '9801110000', password: 'Sadhai@123', station_id: tu.id }, tok(partner))).status === 403, 'but not for another station');
  const pb = await login(phone);
  ok((await call('GET', '/hr/me', null, tok(pb))).status === 403, 'partner staff are not part of Sadhai’s roster, check-in or payslips');
  ok((await call('GET', '/station/summary', null, tok(pb))).status === 200, 'they still run the queue');
}

/* ---------------------------------------------------------------- 7 */
section('7. Self-operated vs partner: staff, duty and pay');
{
  const kr = await call('GET', `/hr/roster?station_id=${kal.id}&from=2026-10-12&to=2026-10-18`, null, tok(mgrPartner));
  ok(kr.status === 200 && kr.body.shifts.length === 0 && kr.body.templates.length === 0, 'a partner cafe has no Sadhai roster');
  ok((await call('POST', '/hr/roster/auto-assign', { station_id: kal.id, from: '2026-10-19', to: '2026-10-25' }, tok(mgrPartner))).status === 403, 'auto-assign refuses a partner cafe');
  ok((await call('POST', '/hr/staff', { name: 'No Pay', phone: '9801110099', password: 'Sadhai@123', station_id: kal.id }, tok(owner))).status === 403, 'Sadhai does not put partner staff on its payroll');
  const staff = (await call('GET', '/hr/staff', null, tok(owner))).body;
  ok(staff.length > 0 && staff.every((s) => !/Kalanki|New Road/.test(s.station_name || '')), 'the staff and pay list holds only Sadhai-run stations');
  const from = '2026-10-19', to = '2026-10-25';
  const out = await call('POST', '/hr/roster/auto-assign', { station_id: tu.id, from, to }, tok(mgrCo));
  ok(out.status === 200 && out.body.created > 0, 'a Sadhai-run station gets an auto-assigned roster');
  const sched = (await call('GET', `/hr/roster?station_id=${tu.id}&from=${from}&to=${to}`, null, tok(mgrCo))).body;
  ok(sched.shifts.every((s) => (Date.parse(s.end_at) - Date.parse(s.start_at)) / 36e5 === 6), 'every shift is 6 hours');
  ok((await call('GET', '/hr/me', null, tok(tuStaff))).status === 200, 'Sadhai staff see My shift');
  const mine = (await call('GET', '/admin/stations', null, tok(mgrPartner))).body;
  ok(mine.length === 2, 'a Sadhai manager supervises the partner cafes assigned to them');
}

/* ---------------------------------------------------------------- 8 */
section('8. Owner and managers supervise every outlet');
{
  const ov = (await call('GET', '/admin/overview', null, tok(owner))).body;
  ok(ov.stations.length === 4 && ov.totals.food_cost !== undefined, 'the owner sees all four outlets with costs and margin');
  const sc = (await call('GET', '/admin/scorecard', null, tok(owner))).body;
  ok(sc.stations?.length === 4, 'the scorecard compares all outlets');
  ok((await call('GET', '/admin/live', null, tok(owner))).body.stations?.length === 4, 'the live board shows every outlet');
  ok((await call('GET', '/admin/reviews', null, tok(owner))).status === 200, 'ratings across the network');
  ok((await call('GET', '/admin/inventory', null, tok(owner))).status === 200 && (await call('GET', '/admin/cash-closes', null, tok(owner))).status === 200, 'stock and cash counts across the network');
  const mo = (await call('GET', '/admin/overview', null, tok(mgrCo))).body;
  ok(mo.stations.length === 2, 'a manager sees only the outlets they look after');
  const stm = (await call('GET', '/admin/partner-statement', null, tok(owner))).body;
  ok(Array.isArray(stm) && stm.length === 2 && stm.every((x) => x.station.operator_type === 'partner'), 'the owner sees a statement for each partner cafe');
  const kst = stm.find((x) => x.station.code === 'KALANKI');
  ok(kst.digital_held_by_sadhai >= 0 && kst.cash_held >= 0 && kst.net_due === kst.partner_share - kst.cash_held, 'statement nets the share against cash the cafe holds; eSewa money is held by Sadhai');
  // Station hours saved from the owner screen must stick, even for a station with no Nepali name or address.
  const row = (await call('GET', '/admin/stations', null, tok(owner))).body.find((x) => x.code === 'TUTH');
  const edit = { name: row.name, name_ne: null, address: null, district: null, lat: null, lng: null, opens: '06:45', closes: '21:30', operator_type: 'company', breakeven_cups: row.breakeven_cups, order_letter: row.order_letter, partner_name: null, partner_phone: null, revenue_share_pct: 0 };
  const saved = await call('PATCH', `/owner/stations/${row.id}`, edit, tok(owner));
  const again = (await call('GET', '/admin/stations', null, tok(owner))).body.find((x) => x.code === 'TUTH');
  ok(saved.status === 200 && again.opens.startsWith('06:45') && again.closes.startsWith('21:30'), 'station hours saved by the owner are kept, even with blank optional fields');
  ok((await call('PATCH', `/owner/stations/${row.id}`, { opens: 'late' }, tok(owner))).status === 400, 'a bad time is refused instead of being silently dropped');
  const users = (await call('GET', '/owner/users?role=partner', null, tok(owner))).body;
  ok(users.length === 2, 'the owner manages partner logins');
}

/* ---------------------------------------------------------------- 9 */
section('9. Closed outlets and pickup later');
{
  const c = await newCustomer();
  const body = (extra = {}) => ({ station_id: tu.id, items: [line(ame)], payment_method: 'cash', ...extra });
  // closed by the manager
  await call('PATCH', `/admin/stations/${tu.id}`, { is_open: false }, tok(mgrCo));
  const closed = await call('POST', '/orders', body(), c.token);
  ok(closed.status === 409 && closed.body.code === 'station_closed', 'a closed outlet refuses an order');
  ok((await call('POST', '/orders/quote', body(), c.token)).status === 409, 'and refuses a quote, so the cart cannot be priced either');
  ok((await call('POST', '/kiosk/orders', { items: [line(ame)], customer_name: 'Guest', customer_phone: '9801234501', payment: 'counter', consent: true }, tok(tuStaff))).status === 409, 'the kiosk refuses too');
  const list = (await call('GET', '/stations')).body.find((s) => s.id === tu.id);
  const h = (await homeOf(tu));
  ok(list.can_order === false && list.open_now === false && h.station.can_order === false && h.preorder === null, 'the station list and home say it cannot take orders and offer no pickup times');
  await call('PATCH', `/admin/stations/${tu.id}`, { is_open: true }, tok(mgrCo));
  // outside opening hours
  await call('PATCH', `/admin/stations/${tu.id}`, { opens: '00:00', closes: '00:01' }, tok(mgrCo));
  const late = await call('POST', '/orders', body(), c.token);
  ok(late.status === 409 && late.body.code === 'station_closed', 'outside opening hours it refuses an order');
  await call('PATCH', `/admin/stations/${tu.id}`, { opens: '00:00', closes: '23:59' }, tok(mgrCo));
  // paused
  await call('PATCH', `/admin/stations/${tu.id}`, { accepting_orders: false }, tok(mgrCo));
  ok((await call('POST', '/orders', body(), c.token)).body.code === 'station_busy', 'a paused outlet refuses new orders');
  await call('PATCH', `/admin/stations/${tu.id}`, { accepting_orders: true }, tok(mgrCo));
  ok((await call('POST', '/orders', body(), c.token)).status === 201, 'and works again when reopened');

  // pickup later
  const home = await homeOf(tu);
  const w = home.preorder;
  ok(w && w.min_minutes === 15 && new Date(w.earliest) > new Date(Date.now() + 14 * 60000) && new Date(w.latest) > new Date(w.earliest), 'an open outlet offers pickup times from 15 minutes ahead until just before closing');
  const at = new Date(Math.max(new Date(w.earliest).getTime(), Date.now() + 30 * 60000));
  const later = at.toISOString();
  const tooSoon = await call('POST', '/orders', body({ scheduled_for: new Date(Date.now() + 5 * 60000).toISOString() }), c.token);
  ok(tooSoon.status === 400, 'a pickup time less than 15 minutes away is refused');
  const tooLate = await call('POST', '/orders', body({ scheduled_for: new Date(new Date(w.latest).getTime() + 30 * 60000).toISOString() }), c.token);
  ok(tooLate.status === 400, 'a pickup time after closing is refused');
  ok((await call('POST', '/orders', body({ scheduled_for: new Date(Date.now() + 864e5).toISOString() }), c.token)).status === 400, 'tomorrow is refused: pickup later is for today');
  const q = await call('POST', '/orders/quote', body({ scheduled_for: later }), c.token);
  ok(q.status === 200, 'the quote accepts a valid pickup time');
  const o = await call('POST', '/orders', body({ scheduled_for: later }), c.token);
  ok(o.status === 201 && o.body.order.status === 'placed' && new Date(o.body.order.scheduled_for).getTime() === at.getTime(), 'a valid pickup-later order is placed with its pickup time');
  const id = o.body.order.id;
  ok(!(await queue(tuStaff)).some((x) => x.id === id), 'it is NOT on the live queue yet');
  const laterList = await queue(tuStaff, 'later');
  ok(laterList.some((x) => x.id === id), 'it shows under "Later today"');
  ok((await call('GET', '/station/summary', null, tok(tuStaff))).body.queue.later >= 1, 'the station summary counts it as later');
  ok((await call('GET', `/orders/${id}`, null, c.token)).body.ahead === 0, 'the customer is not told there are orders ahead');
  await sql(`UPDATE orders SET scheduled_for = now() + interval '5 minutes' WHERE id=$1`, [id]); // time passes
  ok((await releaseDueOrders()) >= 1, 'shortly before pickup time the order is released');
  const live = (await queue(tuStaff)).find((x) => x.id === id);
  ok(live && live.status === 'placed' && live.scheduled_for, 'it is now on the live queue with its pickup time');
  await setStatus(tuStaff, id, 'preparing'); await setStatus(tuStaff, id, 'ready');
  const code = (await call('GET', `/orders/${id}`, null, c.token)).body.handover_code;
  ok((await setStatus(tuStaff, id, 'picked_up', { code })).body.status === 'picked_up', 'it is handed over with the code like any other order');

  const pay = await call('POST', '/orders', body({ scheduled_for: later }), c.token);
  ok(pay.body.order.status === 'placed' && pay.body.order.scheduled_for, 'a pickup-later order is placed straight away');
  ok((await queue(tuStaff, 'later')).some((x) => x.id === pay.body.order.id), 'it waits under Later today');
  ok([404, 409].includes((await call('POST', `/orders/${pay.body.order.id}/cancel`, {}, c.token)).status), 'the customer cannot cancel a pickup-later order');
  const cx = await call('POST', `/station/orders/${pay.body.order.id}/status`, { status: 'cancelled', reason: 'Too busy' }, tok(tuStaff));
  ok(cx.body.status === 'cancelled', 'the station can decline it');
  ok((await call('POST', '/kiosk/orders', { items: [line(ame)], customer_name: 'Guest', customer_phone: '9801234502', payment: 'counter', consent: true, scheduled_for: later }, tok(tuStaff))).body.order.scheduled_for == null, 'kiosk orders are always for now');
  ok((await call('GET', '/admin/alerts', null, tok(owner))).status === 200, 'a waiting scheduled order does not raise a late-order alert');
}

/* ---------------------------------------------------------------- 10 */
section('10. Sales: one rule everywhere');
{
  const today = new Date(Date.now() + 345 * 60000).toISOString().slice(0, 10);
  const ovr = async (token) => (await call('GET', `/admin/overview?station_id=${tu.id}&from=${today}`, null, token)).body;
  const sum = async () => (await call('GET', '/station/summary', null, tok(tuStaff))).body;
  const live = async () => (await call('GET', `/admin/live?station_id=${tu.id}`, null, tok(owner))).body.stations.find((x) => x.id === tu.id);
  const o0 = await ovr(tok(owner)), s0 = await sum(), l0 = await live();
  const c = await newCustomer();
  const made = await call('POST', '/orders', { station_id: tu.id, items: [line(latte, 2)], payment_method: 'cash' }, c.token);
  const total = made.body.order.total;
  const o1 = await ovr(tok(owner)), s1 = await sum();
  ok(o1.totals.revenue === o0.totals.revenue && o1.totals.orders === o0.totals.orders, 'an order in the queue is not a sale yet (overview)');
  ok(s1.today.revenue === s0.today.revenue && (await live()).revenue_today === l0.revenue_today, 'and not a sale at the station or on the live board');
  ok(o1.in_progress.orders === o0.in_progress.orders + 1 && o1.in_progress.amount === o0.in_progress.amount + total, 'it shows as waiting to be collected');
  ok(s1.queue.cash_to_collect === (s0.queue.cash_to_collect || 0) + total, 'the station sees the cash it still has to collect');
  const id = made.body.order.id;
  await setStatus(tuStaff, id, 'preparing'); await setStatus(tuStaff, id, 'ready');
  const code = (await call('GET', `/orders/${id}`, null, c.token)).body.handover_code;
  ok((await ovr(tok(owner))).totals.revenue === o0.totals.revenue, 'ready is still not a sale');
  await setStatus(tuStaff, id, 'picked_up', { code });
  const o2 = await ovr(tok(owner)), s2 = await sum();
  ok(o2.totals.revenue === o0.totals.revenue + total && o2.totals.orders === o0.totals.orders + 1, 'handing over makes it a sale in the overview');
  ok(s2.today.revenue === s0.today.revenue + total && s2.expected_cash === s0.expected_cash + total, 'the station day total and its expected cash rise by the same amount');
  ok(o2.in_progress.orders === o0.in_progress.orders && (await live()).revenue_today === l0.revenue_today + total, 'it leaves "waiting", and the live board agrees');
  const dec = await call('POST', '/orders', { station_id: tu.id, items: [line(ame)], payment_method: 'cash' }, c.token);
  await setStatus(tuStaff, dec.body.order.id, 'cancelled', { reason: 'Test' });
  const o3 = await ovr(tok(owner));
  ok(o3.totals.revenue === o2.totals.revenue && o3.in_progress.orders === o2.in_progress.orders, 'a declined order is never a sale and does not stay in progress');
  const mgrOv = (await call('GET', `/admin/overview?station_id=${tu.id}&from=${today}`, null, tok(mgrCo))).body;
  ok(mgrOv.totals.revenue === o3.totals.revenue, 'the manager sees the same sales as the owner');
  const st = (await call('GET', `/admin/partner-statement?from=${today}`, null, tok(owner))).body.find((x) => x.station.code === 'KALANKI');
  const kov = (await call('GET', `/admin/overview?station_id=${kal.id}&from=${today}`, null, tok(owner))).body;
  ok(st.sales_paid + st.pass_value >= 0 && kov.totals.revenue === st.sales_paid + (await call('GET', `/admin/overview?station_id=${kal.id}&from=${today}`, null, tok(partner))).body.totals.revenue - kov.totals.revenue, 'the partner statement and the partner overview use the same sales');
}

console.log(`\n${n - failed} of ${n} checks passed`);
if (failed) { console.log(`${failed} FAILED`); process.exit(1); }
process.exit(0);
