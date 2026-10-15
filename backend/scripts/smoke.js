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
// unique passes used one after another
const myPasses = (await call('GET', '/passes', null, T)).body;
ok(/^SP-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(myPasses[0].code), `pass has a unique code (${myPasses[0].code})`);
const pp2 = (await call('POST', '/passes', { payment_method: 'khalti' }, T)).body;
await call('POST', `/payments/${pp2.payment.payment_id}/confirm`, {}, T);
const two = (await call('GET', '/passes', null, T)).body.filter((p) => p.status === 'active');
ok(two.length === 2 && new Set(two.map((p) => p.code)).size === 2, 'a customer can hold two passes with different codes');
ok(two.every((p) => p.total_remaining === 19), 'wallet total across passes is 19 cups');
const big = (await call('POST', '/orders', { station_id: st.id, items: [{ ...item, qty: 10 }], payment_method: 'pass' }, T)).body;
ok(big.order && big.order.total === 0, '10-cup order paid with passes');
const after = (await call('GET', '/passes', null, T)).body.filter((p) => ['active', 'used'].includes(p.status) && p.total_cups === 10);
const rem = after.map((p) => p.remaining).sort((a, b) => a - b);
ok(rem[0] === 0 && rem[1] === 9, `cups spilled from the first pass into the next (${rem.join(', ')} left)`);
ok(after.find((p) => p.remaining === 9)?.state === 'using', 'the next pass becomes "using"');
await call('POST', `/orders/${big.order.id}/cancel`, {}, T);
const back = (await call('GET', '/passes', null, T)).body.filter((p) => p.status === 'active').map((p) => p.remaining).sort();
ok(back.join() === [9, 10].join() || back.join() === [10, 9].join() || back.reduce((a, b) => a + b, 0) === 19, 'cancelling returns the cups to the right passes');

// kiosk self-ordering
const kBase = { items: [item], customer_name: 'Kiosk Guest', customer_phone: '9801112223', payment: 'counter', consent: true };
const k1 = await call('POST', '/kiosk/orders', kBase, staff.access_token);
ok(k1.status === 201 && k1.body.order.channel === 'kiosk' && k1.body.order.customer_name === 'Kiosk Guest' && k1.body.order.payment_status === 'unpaid', 'kiosk: guest order with name and phone');
ok((await call('POST', '/kiosk/orders', { ...kBase, consent: false }, staff.access_token)).status === 400, 'kiosk: consent required');
ok((await call('POST', '/kiosk/orders', { ...kBase, customer_phone: '12345' }, staff.access_token)).status === 400, 'kiosk: phone validated');
ok((await call('POST', '/kiosk/orders', kBase, T)).status === 403, 'kiosk: customers cannot use kiosk routes');
const code = (await call('GET', '/passes', null, T)).body.find((p) => p.status === 'active').code;
ok((await call('POST', '/kiosk/orders', { ...kBase, customer_phone: '9801112223', payment: 'pass', pass_code: code }, staff.access_token)).status === 403, 'kiosk: pass needs the owner phone number as well as the code');
ok((await call('GET', `/kiosk/pass-check?code=${code}&phone=${phone}`, null, staff.access_token)).body.remaining === 19, 'kiosk: pass check shows cups left');
const k2 = await call('POST', '/kiosk/orders', { ...kBase, customer_name: 'Pass Owner', customer_phone: phone, payment: 'pass', pass_code: code }, staff.access_token);
ok(k2.status === 201 && k2.body.order.total === 0 && k2.body.order.payment_method === 'pass', 'kiosk: order paid with a pass code');
const k3 = await call('POST', '/kiosk/orders', { ...kBase, payment: 'esewa' }, staff.access_token);
ok(k3.body.order.status === 'awaiting_payment' && k3.body.payment.mode === 'sandbox', 'kiosk: digital payment waits for confirmation');
await call('POST', `/payments/${k3.body.payment.payment_id}/confirm`, {}, staff.access_token);
ok((await call('GET', `/kiosk/orders/${k3.body.order.id}`, null, staff.access_token)).body.status === 'placed', 'kiosk: paid order reaches the queue');
const qk = (await call('GET', '/station/orders', null, staff.access_token)).body;
ok(qk.some((o) => o.id === k1.body.order.id && o.customer_name === 'Kiosk Guest'), 'kiosk order shows on the station queue with the guest name');

// push notifications (dry-run without Firebase credentials)
ok((await call('POST', '/me/push-token', { token: 'dev-android-token-1234567890', platform: 'android', app_version: '1.2.0' }, T)).status === 201, 'device token registered');
await call('POST', `/station/orders/${k2.body.order.id}/status`, { status: 'ready' }, staff.access_token);
await new Promise((r) => setTimeout(r, 500));
const pst = (await call('GET', '/admin/push/status', null, owner.access_token)).body;
ok(pst.devices.some((d) => d.platform === 'android') && pst.deliveries_7d.some((d) => d.status === 'dry_run' || d.status === 'sent'), 'order-ready notification went to the registered device');
const pv = (await call('POST', '/admin/push/preview', { type: 'phone', phone }, owner.access_token)).body;
ok(pv.customers === 1 && pv.devices >= 1, 'push audience preview');
const camp = await call('POST', '/admin/push/campaigns', { title: 'Americano, Rs 99 today', body: 'Order ahead.', audience: { type: 'phone', phone } }, owner.access_token);
ok(camp.status === 201 && camp.body.status === 'sent' && camp.body.result.sent === 1, 'owner sends a push campaign now');
ok((await call('POST', '/admin/push/campaigns', { title: 'Everyone', audience: { type: 'all' } }, mgr.access_token)).status === 403, 'manager cannot message all customers');
ok((await call('POST', '/admin/push/campaigns', { title: 'Later', audience: { type: 'phone', phone }, send_at: new Date(Date.now() + 3600e3).toISOString() }, owner.access_token)).body.status === 'scheduled', 'campaigns can be scheduled');
const camp2 = await call('POST', '/admin/push/campaigns', { title: 'Second today', audience: { type: 'phone', phone } }, owner.access_token);
ok(camp2.body.result.sent === 0, 'daily promo cap stops a second marketing push');
await call('PATCH', '/me', { notif_offers: false }, T);
const auto = (await call('POST', '/admin/push/automations/run', {}, owner.access_token)).body;
ok(typeof auto.pass_expiry === 'number', 'automations run');
await call('POST', `/station/orders/${k2.body.order.id}/status`, { status: 'picked_up' }, staff.access_token);

// recipes, costing and central inventory
const costing = (await call('GET', '/admin/costing', null, owner.access_token)).body;
const rowOf = (sku) => costing.rows.find((r) => r.sku === sku);
ok(rowOf('ESP').cost === 53, 'costing: espresso = 16 g coffee at Rs 2,500/kg + 10% wastage (Rs 44) + cup (Rs 9)');
ok(rowOf('AMR').cost === 54 && costing.target_pct === 35 && rowOf('CHL').over_target, 'costing: flags items above the target food-cost %');
const amrId = rowOf('AMR').id;
const rec = (await call('GET', `/admin/recipes/${amrId}`, null, owner.access_token)).body;
ok(Math.round(rec.breakdown.find((l) => l.name.startsWith('Coffee')).cost * 100) / 100 === 44 && rec.product.recipe_method, 'recipe card shows the coffee line at Rs 44 and the method');
const ingList = (await call('GET', '/admin/ingredients', null, owner.access_token)).body;
const coffee = ingList.find((i) => i.name.startsWith('Coffee'));
ok(coffee.unit_cost === 2.5 && coffee.waste_pct === 10 && coffee.pack_size === 1000, 'coffee: Rs 2,500 per 1,000 g pack, 10% wastage');
const bump = await call('PATCH', `/central/ingredients/${coffee.id}`, { pack_price: 3000 }, owner.access_token);
ok(bump.status === 200 && bump.body.affected_products.some((p) => p.name === 'Americano' && p.after > p.before), 'raising the coffee price re-costs every drink that uses it');
await call('PATCH', `/central/ingredients/${coffee.id}`, { pack_price: 2500 }, owner.access_token);
ok((await call('GET', '/admin/costing', null, owner.access_token)).body.rows.find((r) => r.sku === 'AMR').cost === 54, 'price restored, cost restored');
ok((await call('GET', '/central/stock', null, mgr2.access_token)).status === 403, 'central stock is closed to managers without the warehouse role');
const cstock0 = (await call('GET', '/central/stock', null, mgr.access_token)).body;
const c0 = cstock0.find((i) => i.id === coffee.id).central_qty;
const po = await call('POST', '/central/purchases', { lines: [{ ingredient_id: coffee.id, packs: 10 }] }, mgr.access_token);
ok(po.status === 201 && po.body.lines[0].qty_ordered === 10000 && po.body.total === 25000, 'purchase order: 10 kg of coffee = Rs 25,000');
const rcv = await call('POST', `/central/purchases/${po.body.id}/receive`, { invoice_no: 'T-1', lines: [{ line_id: po.body.lines[0].id, qty_received: 10000 }] }, mgr.access_token);
ok(rcv.body.status === 'received', 'receiving closes the purchase');
ok((await call('GET', '/central/stock', null, mgr.access_token)).body.find((i) => i.id === coffee.id).central_qty === c0 + 10000, 'central stock goes up by what was received');
const stInv = async () => (await call('GET', '/station/inventory', null, staff.access_token)).body.find((i) => i.id === coffee.id).qty;
const s0 = await stInv();
const req1 = await call('POST', '/transfers/request', { lines: [{ ingredient_id: coffee.id, qty: 1000 }], note: 'running low' }, staff.access_token);
ok(req1.status === 201 && req1.body.status === 'requested', 'station requests stock');
const disp = await call('POST', '/central/transfers', { request_id: req1.body.id, lines: [{ ingredient_id: coffee.id, qty: 1000 }] }, mgr.access_token);
ok(disp.body.status === 'dispatched' && disp.body.value === 2500, 'warehouse dispatches (Rs 2,500 at cost)');
ok((await call('GET', '/central/stock', null, mgr.access_token)).body.find((i) => i.id === coffee.id).central_qty === c0 + 9000, 'central stock goes down by what was sent');
const recv = await call('POST', `/transfers/${req1.body.id}/receive`, { lines: [{ ingredient_id: coffee.id, qty_received: 900 }], note: 'one bag split' }, staff.access_token);
ok(recv.body.status === 'received' && recv.body.shortage_value === 250, 'station confirms 900 g of 1,000 g: shortage worth Rs 250 is recorded');
ok(await stInv() === s0 + 900, 'station stock rises by what it actually received');
ok((await call('POST', `/transfers/${req1.body.id}/receive`, {}, staff.access_token)).status === 409, 'a transfer cannot be received twice');
const before = await stInv();
const usage = await call('POST', '/orders', { station_id: st.id, items: [item], payment_method: 'cash' }, T);
ok(Math.round((before - await stInv()) * 10) / 10 === 17.6, 'a sale uses 16 g + 10% wastage = 17.6 g of coffee from the station');
await call('POST', `/orders/${usage.body.order.id}/cancel`, {}, T);
const cnt = await call('POST', '/transfers/counts', { counts: [{ ingredient_id: coffee.id, counted: (await stInv()) - 100 }], note: 'closing count' }, staff.access_token);
ok(cnt.status === 201 && cnt.body.lines[0].variance === -100 && cnt.body.variance_value === -275, 'shelf count: 100 g missing = Rs 275 loss at cost incl. wastage');
const vr = (await call('GET', '/transfers/variance', null, mgr.access_token)).body;
ok(vr.by_station.some((s) => s.loss < 0), 'variance report shows the loss');
const val = (await call('GET', '/central/valuation', null, owner.access_token)).body;
ok(val.total > 0 && val.stations.length === 4, 'inventory valuation across central store and stations');
const mx = (await call('GET', '/central/matrix', null, owner.access_token)).body;
ok(mx.stations.length === 4 && mx.ingredients.length > 10, 'stock matrix: every ingredient at every station');

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
