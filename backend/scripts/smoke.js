// End-to-end API smoke test against a running server: API_URL=http://localhost:4000 npm run smoke
const API = process.env.API_URL || 'http://localhost:4000';
let failed = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) failed++; };
async function call(method, path, body, token) {
  const r = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j };
}
const login = async (phone) => (await call('POST', '/auth/login', { phone, password: 'Sadhai@123' })).body;

const owner = await login('9800000001');
const mgr = await login('9800000002');
const staff = await login('9800000011');
ok(owner.user?.role === 'owner' && mgr.user?.role === 'manager' && staff.user?.role === 'station', 'role logins');

const stations = (await call('GET', '/stations')).body;
ok(stations.length === 4, 'public stations list');
const st = stations.find((s) => s.code === 'TU-GATE');
const home = (await call('GET', `/stations/${st.id}/home`)).body;
const menu = home.categories;
const all = menu.flatMap((c) => c.products);
const americano = all.find((p) => p.sku === 'AMR');
ok(americano && americano.list_price === 130 && americano.price === 99 && americano.offer, 'offer of the day: Americano Rs 99 (list Rs 130)');
ok(home.offers.length >= 2 && home.best_sellers.length >= 4, 'home: offers and best sellers');
ok(menu.some((c) => c.name === 'Merch' && c.products.length === 4), 'merch category with 4 items');

// register a brand-new customer with a referral code
const phone = `98${String(Date.now()).slice(-8)}`;
const reg = (await call('POST', '/auth/register', { name: 'Smoke Tester', phone, password: 'Sadhai@123', referral_code: 'ASHA204' })).body;
ok(reg.access_token, 'register with referral code');
const T = reg.access_token;
const coupons = (await call('GET', '/coupons', null, T)).body;
ok(coupons.length === 4 && coupons.some((c) => c.kind === 'first_cup'), 'signup ladder: free first cup + 3 coupons');

const size = americano.option_groups.find((g) => g.name === 'Size');
const item = { product_id: americano.id, qty: 1, option_ids: [size.options.find((o) => o.is_default).id] };
const bad = await call('POST', '/orders/quote', { station_id: st.id, items: [{ product_id: americano.id, qty: 1 }], payment_method: 'cash' }, T);
ok(bad.status === 400, 'required option enforced');

const first = coupons.find((c) => c.kind === 'first_cup');
const q = (await call('POST', '/orders/quote', { station_id: st.id, items: [item], payment_method: 'cash', coupon_id: first.id }, T)).body;
ok(q.total === 0 && q.discount === 99, 'free first cup covers the offer price');

const o1 = (await call('POST', '/orders', { station_id: st.id, items: [item], payment_method: 'cash', coupon_id: first.id }, T)).body;
ok(o1.order?.status === 'placed' && /^A\d+$/.test(o1.order.pickup_code), `free-cup order placed (${o1.order?.pickup_code})`);
const reuse = await call('POST', '/orders', { station_id: st.id, items: [item], payment_method: 'cash', coupon_id: first.id }, T);
ok(reuse.status === 409, 'coupon cannot be reused');

const queue = (await call('GET', '/station/orders', null, staff.access_token)).body;
ok(queue.some((o) => o.id === o1.order.id), 'station queue shows the order');
for (const s of ['preparing', 'ready', 'picked_up']) {
  const r = await call('POST', `/station/orders/${o1.order.id}/status`, { status: s }, staff.access_token);
  ok(r.status === 200 && r.body.status === s, `station -> ${s}`);
}
const refAfter = (await call('GET', '/coupons', null, T)).body;
ok(refAfter.some((c) => c.kind === 'referral_cup' && c.status === 'active'), 'referee got a referral cup after first completed order');
const asha = await login('9812345678');
const ashaCoupons = (await call('GET', '/coupons', null, asha.access_token)).body;
ok(ashaCoupons.filter((c) => c.kind === 'referral_cup').length >= 2, 'referrer rewarded too');
ok((await call('POST', `/orders/${o1.order.id}/rate`, { rating: 5, note: 'Fast' }, T)).status === 200, 'rating');

// digital payment (sandbox) with percent coupon
const pct = refAfter.find((c) => c.kind === 'pct');
const o2 = (await call('POST', '/orders', { station_id: st.id, items: [{ ...item, qty: 2 }], payment_method: 'esewa', coupon_id: pct.id }, T)).body;
ok(o2.order.status === 'awaiting_payment' && o2.payment.mode === 'sandbox', 'esewa order awaits payment');
ok(o2.order.discount === Math.floor(o2.order.subtotal * 0.3), '30% coupon applied');
const paid = (await call('POST', `/payments/${o2.payment.payment_id}/confirm`, {}, T)).body;
ok(paid.order.status === 'placed' && paid.order.payment_status === 'paid', 'sandbox payment confirmed -> placed');
const cancel = (await call('POST', `/orders/${o2.order.id}/cancel`, {}, T));
ok(cancel.status === 200 && cancel.body.status === 'cancelled' && cancel.body.payment_status === 'refunded', 'customer cancels before preparing, refunded');
const couponBack = (await call('GET', '/coupons', null, T)).body.find((c) => c.id === pct.id);
ok(couponBack.status === 'active', 'coupon restored on cancel');

// pass: buy, pay, redeem
const pp = (await call('POST', '/passes', { payment_method: 'khalti' }, T)).body;
await call('POST', `/payments/${pp.payment.payment_id}/confirm`, {}, T);
const passes = (await call('GET', '/passes', null, T)).body;
ok(passes[0]?.status === 'active' && passes[0].remaining === 10, '10-cup pass active');
const o3 = (await call('POST', '/orders', { station_id: st.id, items: [item], payment_method: 'pass' }, T)).body;
ok(o3.order.total === 0 && o3.order.payment_method === 'pass', 'redeem a cup from the pass');
ok((await call('GET', '/passes', null, T)).body[0].remaining === 9, 'pass shows 9 cups left');

// POS walk-in by staff with cash, then manager/owner views
const pos = await call('POST', '/station/orders', { items: [item], payment_method: 'cash' }, staff.access_token);
ok(pos.status === 201 && pos.body.order.channel === 'counter' && pos.body.order.payment_status === 'paid', 'counter POS cash order');
const summary = (await call('GET', '/station/summary', null, staff.access_token)).body;
ok(summary.today.orders > 0, 'station summary');

const ov = (await call('GET', '/admin/overview', null, mgr.access_token)).body;
ok(ov.totals.orders > 1000 && ov.stations.length === 2, `manager overview scoped to 2 stations (${ov.totals.orders} orders)`);
const ovo = (await call('GET', '/admin/overview', null, owner.access_token)).body;
ok(ovo.stations.length === 4 && ovo.totals.revenue > ov.totals.revenue, 'owner overview covers all stations');
ok((await call('GET', '/owner/settings', null, mgr.access_token)).status === 403, 'manager blocked from owner routes');
ok((await call('GET', '/admin/overview?station_id=' + stations.find((s) => s.code === 'KALANKI').id, null, mgr.access_token)).status === 403, 'manager blocked from other manager station');
ok((await call('GET', '/station/orders', null, T)).status === 403, 'customer blocked from station routes');
ok((await call('GET', '/owner/reconciliation', null, owner.access_token)).body.length > 0, 'reconciliation report');
const rep = ovo.pass; ok(rep.sold > 0, 'pass integrity metrics');
// merch: orderable, not pass-eligible, no beans/cups
const mug = all.find((p) => p.sku === 'MUG');
const mo = await call('POST', '/orders/quote', { station_id: st.id, items: [{ product_id: mug.id, qty: 1 }], payment_method: 'pass' }, T);
ok(mo.status === 400, 'pass does not cover merch');
const mq = await call('POST', '/orders/quote', { station_id: st.id, items: [{ product_id: mug.id, qty: 1 }], payment_method: 'cash' }, T);
ok(mq.status === 200 && mq.body.total === 450, 'merch quote Rs 450');

// manager offers: guardrails + live effect
const kal = stations.find((s) => s.code === 'KALANKI');
const mgr2 = await login('9800000003');
const cold = (await call('GET', `/stations/${kal.id}/menu`)).body.categories.flatMap((c) => c.products).find((p) => p.sku === 'CLB');
ok(cold.offer && cold.price === 152, 'station offer: cold brew 20% off at Kalanki');
const below = await call('POST', '/admin/offers', { title: 'Too cheap', scope: 'product', product_id: cold.id, offer_price: 10, station_id: kal.id, hours: 4 }, mgr2.access_token);
ok(below.status === 400, 'manager cannot price below food cost');
const tooMuch = await call('POST', '/admin/offers', { title: 'Half off', scope: 'all_drinks', pct: 50, station_id: kal.id, hours: 4 }, mgr2.access_token);
ok(tooMuch.status === 403, 'manager capped at 40% off');
const good = await call('POST', '/admin/offers', { title: 'Latte 15% off', scope: 'product', product_id: all.find((p) => p.sku === 'LAT').id, pct: 15, station_id: kal.id, hours: 4 }, mgr2.access_token);
ok(good.status === 201, 'manager creates offer for own station');
const otherSt = await call('POST', '/admin/offers', { title: 'Nope', scope: 'all_drinks', pct: 10, station_id: st.id, hours: 4 }, mgr2.access_token);
ok(otherSt.status === 403, 'manager cannot create offers for another manager station');
const kalMenu2 = (await call('GET', `/stations/${kal.id}/menu`)).body.categories.flatMap((c) => c.products).find((p) => p.sku === 'LAT');
ok(kalMenu2.price === 144, 'new offer is live on the menu immediately');
await call('PATCH', `/admin/offers/${good.body.id}`, { active: false }, mgr2.access_token);

// accountability
const ps = (await call('GET', '/owner/partners', null, owner.access_token)).body;
ok(ps.length === 2 && ps.every((x) => x.net_sales > 0 && x.partner_share > 0), 'partner statements for 2 partner cafes');
ok(ps[0].net_due === ps[0].partner_share - ps[0].cash_held, 'statement: net due = share minus cash held');
const sc = (await call('GET', '/admin/scorecard', null, owner.access_token)).body;
ok(sc.stations.length === 4 && sc.staff.length >= 8, 'scorecard with staff table');
ok((await call('GET', '/admin/partner-statement', null, mgr2.access_token)).body.length === 2, 'manager sees own partner statements');
// store compliance: version endpoint, data export, account deletion
const ver = (await call('GET', '/version')).body;
ok(ver.version && ver.min_app_version && ver.privacy_url, 'GET /version for update checks');
const exp = (await call('GET', '/me/export', null, T)).body;
ok(exp.profile?.phone && Array.isArray(exp.orders), 'customer can export their data');
const wrongPw = await call('DELETE', '/me', { password: 'nope-nope' }, T);
ok(wrongPw.status === 401, 'delete account needs the right password');
const pending = await call('POST', '/orders', { station_id: st.id, items: [item], payment_method: 'cash' }, T);
ok((await call('DELETE', '/me', { password: 'Sadhai@123' }, T)).status === 409, 'cannot delete with an order in progress');
await call('POST', `/orders/${pending.body.order.id}/cancel`, {}, T);
await call('POST', `/orders/${o3.order.id}/cancel`, {}, T);
ok((await call('DELETE', '/me', { password: 'Sadhai@123' }, T)).status === 200, 'account deleted');
ok((await call('POST', '/auth/login', { phone, password: 'Sadhai@123' })).status === 401, 'deleted account cannot sign in');
ok((await call('GET', '/me', null, T)).status === 401, 'old token stops working');
console.log(failed ? `\n${failed} FAILED` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
