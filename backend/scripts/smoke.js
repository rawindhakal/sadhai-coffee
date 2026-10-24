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
// The customer says a 4-digit code at pickup. Smoke helper: the code as the customer sees it.
const codeOf = async (orderId, token) => (await call('GET', `/orders/${orderId}`, null, token)).body.handover_code;
const decline = (id) => call('POST', `/station/orders/${id}/status`, { status: 'cancelled', reason: 'Declined in test' }, staff.access_token);
const login = async (phone) => (await call('POST', '/auth/login', { phone, password: 'Sadhai@123' })).body;

const owner = await login('9800000001');
const mgr = await login('9800000002');
const staff = await login('9800000011');
ok(owner.user?.role === 'owner' && mgr.user?.role === 'manager' && staff.user?.role === 'station', 'role logins');

const stations = (await call('GET', '/stations')).body;
ok(stations.length === 4, 'public stations list');
const st = stations.find((s) => s.code === 'TU-GATE');
for (const s of stations) await call('PATCH', `/admin/stations/${s.id}`, { opens: '00:00', closes: '23:59', is_open: true, accepting_orders: true }, owner.access_token);
await call('PUT', '/owner/settings', {
  welcome_enabled: 1,
  welcome_trigger: 0,
  welcome_first_cup_enabled: 1,
  welcome_first_cup_pct: 100,
  first_cup_min_spend: 100,
  ladder_count: 3,
  ladder_pct: 30,
  referral_min_spend: 100,
  referrer_require_paid_order: 0,
  offer_require_verified_phone: 0,
}, owner.access_token);
const home = (await call('GET', `/stations/${st.id}/home`)).body;
const menu = home.categories;
const all = menu.flatMap((c) => c.products);
const americano = all.find((p) => p.sku === 'AMR');
const iced = all.find((p) => p.sku === 'ICL');
ok(americano.price === 100 && americano.list_price === 100 && !americano.offer, 'hot coffee is Rs 100');
ok(all.find((p) => p.sku === 'CHL').price === 120 && all.find((p) => p.sku === 'MOC').price === 120, 'flavored drinks are Rs 120');
ok(iced.list_price === 150 && iced.price === 120 && iced.offer, 'iced drinks are Rs 150 (offer of the day: iced latte Rs 120)');
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
ok(q.total === 0 && q.discount === 100, 'free first cup covers a Rs 100 coffee');

const o1 = (await call('POST', '/orders', { station_id: st.id, items: [item], payment_method: 'cash', coupon_id: first.id }, T)).body;
ok(o1.order?.status === 'placed' && /^A\d+$/.test(o1.order.pickup_code), `free-cup order placed (${o1.order?.pickup_code})`);
const reuse = await call('POST', '/orders', { station_id: st.id, items: [item], payment_method: 'cash', coupon_id: first.id }, T);
ok(reuse.status === 409, 'coupon cannot be reused');

const queue = (await call('GET', '/station/orders', null, staff.access_token)).body;
ok(queue.some((o) => o.id === o1.order.id), 'station queue shows the order');
for (const s of ['preparing', 'ready', 'picked_up']) {
  const r = await call('POST', `/station/orders/${o1.order.id}/status`, { status: s, code: s === 'picked_up' ? await codeOf(o1.order.id, T) : undefined }, staff.access_token);
  ok(r.status === 200 && r.body.status === s, `station -> ${s}`);
}
const refAfter = (await call('GET', '/coupons', null, T)).body;
ok(refAfter.some((c) => c.kind === 'referral_cup' && c.status === 'active'), 'referee got a referral cup after first completed order');
const asha = await login('9812345678');
const ashaCoupons = (await call('GET', '/coupons', null, asha.access_token)).body;
ok(ashaCoupons.filter((c) => c.kind === 'referral_cup').length >= 2, 'referrer rewarded too');
ok((await call('POST', `/orders/${o1.order.id}/rate`, { rating: 5, note: 'Fast' }, T)).status === 200, 'rating');

// cash payment with percent coupon
const pct = refAfter.find((c) => c.kind === 'pct');
const o2 = (await call('POST', '/orders', { station_id: st.id, items: [{ ...item, qty: 2 }], payment_method: 'cash', coupon_id: pct.id }, T)).body;
ok(o2.order.status === 'placed' && o2.order.payment_method === 'cash' && o2.order.payment_status === 'unpaid', 'cash order is placed immediately for counter payment');
ok(o2.order.discount === Math.floor(o2.order.subtotal * 0.3) || o2.order.discount === 30, '30% coupon applied');
ok((await call('POST', `/orders/${o2.order.id}/cancel`, {}, T)).status === 409, 'a placed order cannot be cancelled by the customer');
const cancel = (await call('POST', `/station/orders/${o2.order.id}/status`, { status: 'cancelled', reason: 'Out of milk' }, staff.access_token));
ok(cancel.status === 200 && cancel.body.status === 'cancelled', 'the station can decline a placed order');
const couponBack = (await call('GET', '/coupons', null, T)).body.find((c) => c.id === pct.id);
ok(couponBack.status === 'active', 'coupon restored when the station declines');

// pass: buy for cash at station counter, then redeem
const onlinePassAttempt = await call('POST', '/passes', {}, T);
ok(onlinePassAttempt.status === 404, 'a customer cannot buy a pass online: passes are sold for cash at the station counter');
const pp = await call('POST', '/station/passes', { phone }, staff.access_token);
ok(pp.status === 201 && (pp.body.pass?.status === 'active' || pp.body.status === 'active'), 'station sells 10-cup pass for cash');
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
ok((await call('GET', '/owner/reconciliation', null, owner.access_token)).status === 404, 'there is no provider reconciliation report any more');
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
ok(cold.offer && cold.price === 120, 'station offer: cold brew 20% off at Kalanki (Rs 150 to Rs 120)');
const below = await call('POST', '/admin/offers', { title: 'Too cheap', scope: 'product', product_id: cold.id, offer_price: 10, station_id: kal.id, hours: 4 }, mgr2.access_token);
ok(below.status === 400, 'manager cannot price below food cost');
const tooMuch = await call('POST', '/admin/offers', { title: 'Half off', scope: 'all_drinks', pct: 50, station_id: kal.id, hours: 4 }, mgr2.access_token);
ok(tooMuch.status === 403, 'manager capped at 40% off');
const good = await call('POST', '/admin/offers', { title: 'Latte 15% off', scope: 'product', product_id: all.find((p) => p.sku === 'LAT').id, pct: 15, station_id: kal.id, hours: 4 }, mgr2.access_token);
ok(good.status === 201, 'manager creates offer for own station');
const otherSt = await call('POST', '/admin/offers', { title: 'Nope', scope: 'all_drinks', pct: 10, station_id: st.id, hours: 4 }, mgr2.access_token);
ok(otherSt.status === 403, 'manager cannot create offers for another manager station');
const kalMenu2 = (await call('GET', `/stations/${kal.id}/menu`)).body.categories.flatMap((c) => c.products).find((p) => p.sku === 'LAT');
ok(kalMenu2.price === 85, 'new offer is live on the menu immediately (latte Rs 100 less 15%)');
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
await call('POST', '/station/passes', { phone }, staff.access_token);
const two = (await call('GET', '/passes', null, T)).body.filter((p) => p.status === 'active');
ok(two.length === 2 && new Set(two.map((p) => p.code)).size === 2, 'a customer can hold two passes with different codes');
ok(two.every((p) => p.total_remaining === 19), 'wallet total across passes is 19 cups');
const big = (await call('POST', '/orders', { station_id: st.id, items: [{ ...item, qty: 10 }], payment_method: 'pass' }, T)).body;
ok(big.order && big.order.total === 0, '10-cup order paid with passes');
const after = (await call('GET', '/passes', null, T)).body.filter((p) => ['active', 'used'].includes(p.status) && p.total_cups === 10);
const rem = after.map((p) => p.remaining).sort((a, b) => a - b);
ok(rem[0] === 0 && rem[1] === 9, `cups spilled from the first pass into the next (${rem.join(', ')} left)`);
ok(after.find((p) => p.remaining === 9)?.state === 'using', 'the next pass becomes "using"');
await decline(big.order.id);
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
const kGet = await call('GET', `/kiosk/orders/${k1.body.order.id}`, null, staff.access_token);
ok(kGet.body.status === 'placed' && kGet.body.handover_code === undefined, 'kiosk: order status endpoint does not leak handover_code');
ok((await call('GET', `/kiosk/orders/${o3.order.id}`, null, staff.access_token)).status === 404, 'kiosk: non-kiosk orders cannot be queried via kiosk endpoint');
const qk = (await call('GET', '/station/orders', null, staff.access_token)).body;
ok(qk.some((o) => o.id === k1.body.order.id && o.customer_name === 'Kiosk Guest'), 'kiosk order shows on the station queue with the guest name');

// push notifications (dry-run without Firebase credentials)
ok((await call('POST', '/me/push-token', { token: 'dev-android-token-1234567890', platform: 'android', app_version: '1.2.0' }, T)).status === 201, 'device token registered');
await call('POST', `/station/orders/${k2.body.order.id}/status`, { status: 'preparing' }, staff.access_token);
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
await call('POST', `/station/orders/${k2.body.order.id}/status`, { status: 'picked_up', code: k2.body.order.handover_code }, staff.access_token);

// recipes, costing and central inventory
const costing = (await call('GET', '/admin/costing', null, owner.access_token)).body;
const rowOf = (sku) => costing.rows.find((r) => r.sku === sku);
ok(rowOf('ESP').cost === 53, 'costing: espresso = 16 g coffee at Rs 2,500/kg + 10% wastage (Rs 44) + cup (Rs 9)');
ok(rowOf('AMR').cost === 54 && costing.target_pct === 35 && rowOf('CHL').over_target, 'costing: flags items above the target food-cost %');
ok(rowOf('LAT').price === 100 && rowOf('LAT').food_cost_pct > 70, 'costing: shows the real food cost of a Rs 100 latte');
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
await decline(usage.body.order.id);
const cnt = await call('POST', '/transfers/counts', { counts: [{ ingredient_id: coffee.id, counted: (await stInv()) - 100 }], note: 'closing count' }, staff.access_token);
ok(cnt.status === 201 && cnt.body.lines[0].variance === -100 && cnt.body.variance_value === -275, 'shelf count: 100 g missing = Rs 275 loss at cost incl. wastage');
const vr = (await call('GET', '/transfers/variance', null, mgr.access_token)).body;
ok(vr.by_station.some((s) => s.loss < 0), 'variance report shows the loss');
const val = (await call('GET', '/central/valuation', null, owner.access_token)).body;
ok(val.total > 0 && val.stations.length === 4, 'inventory valuation across central store and stations');
const mx = (await call('GET', '/central/matrix', null, owner.access_token)).body;
ok(mx.stations.length === 4 && mx.ingredients.length > 10, 'stock matrix: every ingredient at every station');


{
// ---------- v1.3: price tiers, standard recipes, owner settings and keys, pictures, enquiries ----------
const setRes = await call('PUT', '/owner/settings', { price_hot: 110 }, owner.access_token);
ok(setRes.status === 200 && (await call('GET', `/stations/${st.id}/menu`)).body.categories.flatMap((c) => c.products).find((p) => p.sku === 'AMR').price === 110, 'changing the hot price reprices every hot drink');
await call('PUT', '/owner/settings', { price_hot: 100 }, owner.access_token);
const ovr = await call('PUT', `/admin/stations/${st.id}/products/${americano.id}`, { price_override: 90 }, owner.access_token);
ok(ovr.status === 400, 'a tiered drink cannot have a per-station price');
const cards = (await call('GET', '/station/recipes', null, staff.access_token)).body;
const amrCard = cards.find((c) => c.sku === 'AMR');
ok(amrCard && amrCard.lines.some((l) => l.name.startsWith('Coffee') && l.qty === 16) && amrCard.recipe_method && !JSON.stringify(cards).includes('unit_cost'), 'recipe cards show the standard recipe and no costs');

const ints = (await call('GET', '/owner/integrations', null, owner.access_token)).body;
const esk = ints.find((i) => i.key === 'nestsms_api_key');
ok(esk.secret && esk.value === null, 'secrets are never sent to the browser');
ok((await call('GET', '/owner/integrations', null, mgr.access_token)).status === 403, 'only the owner can see integrations');
ok((await call('PUT', '/owner/integrations', { values: { sms_mode: 'maybe' } }, owner.access_token)).status === 400, 'invalid setting values are refused');
ok((await call('PUT', '/owner/integrations', { values: { nestsms_api_url: 'http://169.254.169.254/latest/meta-data/' } }, owner.access_token)).status === 400, 'SSRF private/metadata URL is refused');
const put = await call('PUT', '/owner/integrations', { values: { nestsms_api_key: 'live_secret_key_abcd1234', support_email: 'help@sadhai.test' } }, owner.access_token);
const kh = put.body.settings.find((i) => i.key === 'nestsms_api_key');
ok(put.status === 200 && kh.is_set && kh.masked.endsWith('1234') && !JSON.stringify(put.body).includes('abcd1234') && kh.source === 'dashboard', 'owner saves a key from the dashboard; it comes back masked');
ok((await call('GET', '/config')).body.site.support_email === 'help@sadhai.test', 'company details are live in the public config');
ok((await call('POST', '/owner/integrations/vapid', {}, owner.access_token)).status === 400, 'existing browser push keys are not replaced without confirmation');
await call('PUT', '/owner/integrations', { values: { nestsms_api_key: null, support_email: null } }, owner.access_token);
ok(!(await call('GET', '/owner/integrations', null, owner.access_token)).body.find((i) => i.key === 'nestsms_api_key').is_set, 'clearing a key removes it');
ok((await call('GET', `/me?access_token=${T}`)).status === 401, 'query string access_token is rejected on non-SSE routes');
const badRestore = await call('POST', '/owner/data/restore', { password: 'Sadhai@123', backup: { app: 'sadhai-coffee', tables: { categories: [{ id: '00000000-0000-0000-0000-000000000001', 'bad_col);--': 'x' }] } } }, owner.access_token);
ok(badRestore.status === 400, 'owner data restore rejects unknown/invalid SQL column names');

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const up = await call('POST', '/owner/media', { filename: 'sun.png', mime: 'image/png', data: png }, owner.access_token);
ok(up.status === 201 && up.body.url.includes('/media/'), 'owner uploads a picture');
const evil = await call('POST', '/owner/media', { filename: 'x.svg', mime: 'image/svg+xml', data: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64') }, owner.access_token);
ok(evil.status === 400, 'an SVG with a script is refused');
const evilAnim = await call('POST', '/owner/media', { filename: 'x2.svg', mime: 'image/svg+xml', data: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><animate attributeName="href" values="javascript:alert(1)"/></svg>').toString('base64') }, owner.access_token);
ok(evilAnim.status === 400, 'an SVG with <animate> is refused');
ok((await call('POST', '/owner/media', { filename: 'x.png', mime: 'image/png', data: Buffer.from('not a picture at all, just text').toString('base64') }, owner.access_token)).status === 400, 'a fake picture is refused');
const img = await fetch(up.body.url.replace(/^https?:\/\/[^/]+/, API));
ok(img.status === 200 && img.headers.get('content-type') === 'image/png' && img.headers.get('cross-origin-resource-policy') === 'cross-origin', 'uploaded pictures are served publicly');
const site0 = (await call('GET', '/owner/site', null, owner.access_token)).body;
const heroNew = { ...site0.content.hero, headline_en: 'Coffee, the Sadhai way', layers: { sun: up.body.id, far: null, mid: null, near: null }, timer_cup: null };
ok((await call('PUT', '/owner/site/hero', heroNew, owner.access_token)).status === 200, 'owner edits the hero text and a layer');
const site1 = (await call('GET', '/site')).body;
ok(site1.hero.headline_en === 'Coffee, the Sadhai way' && site1.hero.layers.sun?.url && site1.hero.layers.far === null, 'the public site shows the new hero and falls back to built-in art for the rest');
ok((await call('PUT', '/owner/site/hero', heroNew, mgr.access_token)).status === 403, 'managers cannot edit the site');
await call('DELETE', '/owner/site/hero', null, owner.access_token);
ok((await call('GET', '/site')).body.hero.headline_en === 'Good coffee, every day.', 'resetting restores the default hero');
const ppl = (await call('GET', '/site')).body.people;
ok(Array.isArray(ppl) && ppl.length === 4 && ppl.every((x) => x.title && x.art === null), 'the home page has four people cards by default');
const pplNew = ppl.map((x, i) => ({ role: x.role, title: i === 1 ? 'Our baristas' : x.title, text: x.text, art: null }));
ok((await call('PUT', '/owner/site/people', pplNew, owner.access_token)).status === 200 && (await call('GET', '/site')).body.people[1].title === 'Our baristas', 'owner edits the people cards');
ok((await call('PUT', '/owner/site/people', pplNew.slice(0, 3), owner.access_token)).status === 400, 'the people cards must be exactly four');
await call('DELETE', '/owner/site/people', null, owner.access_token);

const enq = await call('POST', '/enquiries', { kind: 'partner', name: 'Tara Cafe', email: 'tara@example.com', org: 'Tara Cafe', city: 'Pokhara', message: 'Interested', consent: true }, null);
ok(enq.status === 201, 'partner enquiry accepted');
ok((await call('POST', '/enquiries', { kind: 'investor', name: 'X Y', email: 'x@y.com', consent: false }, null)).status === 400, 'enquiry needs consent');
ok((await call('POST', '/enquiries', { kind: 'investor', name: 'Bot', email: 'b@b.com', consent: true, website: 'http://spam' }, null)).status === 400, 'bots that fill the hidden field are refused');
const enqs = (await call('GET', '/owner/enquiries', null, owner.access_token)).body;
ok(enqs.some((e) => e.name === 'Tara Cafe' && e.status === 'new'), 'owner sees the enquiry');
await call('PATCH', `/owner/enquiries/${enqs.find((e) => e.name === 'Tara Cafe').id}`, { status: 'contacted' }, owner.access_token);
ok((await call('GET', '/site/economics')).body.enabled === false, 'unit economics are hidden from investors until the owner switches them on');
const inv = { ...site0.content.investors, show_unit_economics: true };
await call('PUT', '/owner/site/investors', inv, owner.access_token);
const eco = (await call('GET', '/site/economics')).body;
ok(eco.enabled && eco.tiers.length === 3 && eco.tiers.find((t) => t.tier === 'hot').price === 100, 'unit economics show the three tiers when enabled');
await call('DELETE', '/owner/site/investors', null, owner.access_token);
ok(/^\d+$/.test(String((await call('GET', '/config')).body.partner_share_pct)) && (await call('GET', '/config')).body.pricing.iced === 150, 'public config carries tier prices and the partner share');

// ---------- staff, rosters, duties, attendance, time off, payroll ----------
const people = (await call('GET', '/hr/staff', null, owner.access_token)).body;
ok(people.length === 8 && people.every((p) => p.hourly_rate !== undefined) && people.every((p) => /Tribhuvan|Teaching/.test(p.station_name)), 'owner sees the 8 Sadhai-run staff with pay rates; partner cafes are not rostered');
const mgrPeople = (await call('GET', '/hr/staff', null, mgr.access_token)).body;
ok(mgrPeople.length >= 8 && mgrPeople.every((p) => p.hourly_rate === undefined), 'managers see their staff but not pay rates');
ok((await call('PATCH', `/hr/staff/${mgrPeople[0].id}`, { hourly_rate: 500 }, mgr.access_token)).status === 403, 'managers cannot change pay rates');
const monday = (() => { const d = new Date(Date.now() + 345 * 60000); const dow = (d.getUTCDay() + 6) % 7; const m = new Date(d.getTime() - dow * 864e5 + 14 * 864e5); return m.toISOString().slice(0, 10); })();
const sunday = new Date(Date.parse(monday) + 6 * 864e5).toISOString().slice(0, 10);
const rosterRun = await call('POST', '/hr/roster/auto-assign', { from: monday, to: sunday }, mgr.access_token);
ok(rosterRun.status === 200 && rosterRun.body.created > 30, `auto-assign filled the roster (${rosterRun.body.created} shifts, ${rosterRun.body.unfilled?.length} open)`);
const roster = (await call('GET', `/hr/roster?from=${monday}&to=${sunday}`, null, mgr.access_token)).body;
const worked = roster.shifts.filter((x) => x.user_id);
ok(worked.every((x) => (new Date(x.end_at) - new Date(x.start_at)) / 3600e3 === 6), 'every shift is 6 hours');
const byUser = {};
for (const x of worked) (byUser[x.user_id] ||= []).push(x);
ok(Object.values(byUser).every((l) => new Set(l.map((x) => x.date)).size === l.length), 'nobody has two shifts on one day');
ok(Object.values(byUser).every((l) => l.length <= 6), 'nobody works more than 6 shifts a week');
ok(Object.values(byUser).every((l) => { const s2 = [...l].sort((a, b) => new Date(a.start_at) - new Date(b.start_at)); return s2.every((x, i) => i === 0 || (new Date(x.start_at) - new Date(s2[i - 1].end_at)) / 3600e3 >= 11); }), 'at least 11 hours of rest between shifts');
ok(worked.every((x) => x.duty && x.tasks > 0), 'every shift has a duty and a checklist');
const dayDuty = (d, st2) => worked.filter((x) => x.date === d && x.station_id === st2).map((x) => x.duty).join('|');
const someDay = worked[0].date, someSt = worked[0].station_id;
ok(/Opening/.test(dayDuty(someDay, someSt)) && /Closing/.test(dayDuty(someDay, someSt)), 'the first shift opens and the last closes');
ok(worked.every((x) => !x.user_id || roster.shifts.filter((y) => y.user_id === x.user_id && y.date === x.date).length === 1), 'one shift per person per day, checked again');
const unpub = worked.filter((x) => !x.published).length;
const pub = await call('POST', '/hr/roster/publish', { from: monday, to: sunday }, mgr.access_token);
ok(unpub > 0 && pub.body.published === unpub, 'publishing tells staff their shifts are ready');

// new staff member: create, rostered shift now, check in, tick a task, check out, get paid by the hour
const nm = `98${String(Date.now()).slice(-8)}`;
const newStaff = await call('POST', '/hr/staff', { name: 'Test Barista', phone: nm, password: 'Sadhai@123', station_id: st.id, position: 'barista', hourly_rate: 120 }, owner.access_token);
ok(newStaff.status === 201, 'owner adds a staff member with an hourly rate');
const ts = await login(nm);
const startInstant = new Date(Date.now() - 5 * 60000);
const nptStart = new Date(startInstant.getTime() + 345 * 60000);
const sDate = nptStart.toISOString().slice(0, 10), sTime = nptStart.toISOString().slice(11, 16);
const add = await call('POST', '/hr/roster/shifts', { station_id: st.id, user_id: newStaff.body.id, date: sDate, start: sTime, hours: 6 }, mgr.access_token);
ok(add.status === 201, 'manager adds a shift by hand');
ok((await call('POST', '/hr/roster/shifts', { station_id: st.id, user_id: newStaff.body.id, date: sDate, start: '16:00', hours: 6 }, mgr.access_token)).status === 409, 'a second shift on the same day is refused');
ok((await call('POST', '/hr/me/check-in', {}, ts.access_token)).status === 409, 'staff cannot start an unpublished shift');
await call('POST', '/hr/roster/publish', { station_id: st.id, from: sDate, to: sDate }, mgr.access_token);
const me1 = (await call('GET', '/hr/me', null, ts.access_token)).body;
ok(me1.next && me1.can_check_in && me1.next.tasks.length > 0, 'staff see their shift, duty and checklist');
ok((await call('POST', '/hr/me/check-in', {}, ts.access_token)).status === 200, 'check in');
const task = (await call('GET', '/hr/me', null, ts.access_token)).body.current.tasks[0];
ok((await call('POST', `/hr/me/tasks/${task.id}/toggle`, {}, ts.access_token)).body.done === true, 'tick a checklist task');
const out = await call('POST', '/hr/me/check-out', {}, ts.access_token);
ok(out.status === 200 && out.body.minutes >= 0 && out.body.minutes <= 15, `check out records the paid minutes (${out.body.minutes})`);
const adj = await call('POST', `/hr/shifts/${add.body.id}/adjust`, { minutes: 360, reason: 'Covered a busy morning' }, mgr.access_token);
ok(adj.status === 200, 'manager adjusts the hours with a reason');
const pv = (await call('GET', `/hr/payroll/preview?from=${sDate}&to=${sDate}`, null, owner.access_token)).body;
const line = pv.find((l) => l.name === 'Test Barista');
ok(line && line.regular_minutes === 360 && line.overtime_minutes === 0 && line.gross === 720, 'pay = 6 hours at Rs 120 an hour = Rs 720');
ok((await call('GET', `/hr/payroll/preview?from=${sDate}&to=${sDate}`, null, mgr.access_token)).status === 403, 'managers cannot see payroll');
const lastMonth = pv.length ? null : null;
const runFrom = new Date(Date.now() + 345 * 60000 - 20 * 864e5).toISOString().slice(0, 10);
const prev2 = (await call('GET', `/hr/payroll/preview?from=${runFrom}&to=${sDate}`, null, owner.access_token)).body;
ok(prev2.length >= 8 && prev2.every((l) => Math.abs(l.gross - ((l.regular_minutes / 60) * l.hourly_rate + (l.overtime_minutes / 60) * l.hourly_rate * 1.5)) < 0.01), 'payroll lines add up: regular hours + overtime at 1.5 times');

// time off respected by the roster, and decided by the manager
const tReq = await call('POST', '/hr/me/time-off', { from_date: sDate, to_date: sDate, reason: 'Test' }, ts.access_token);
ok(tReq.status === 201, 'staff ask for time off');
const decided = await call('POST', `/hr/time-off/${tReq.body.id}/decide`, { approve: true }, mgr.access_token);
ok(decided.status === 200, 'manager approves it');
ok((await call('GET', `/hr/time-off?status=approved`, null, mgr.access_token)).body.some((t) => t.id === tReq.body.id), 'approved leave is on record');

// payroll run lifecycle
const run = await call('POST', '/hr/payroll/runs', { from: sDate, to: sDate }, owner.access_token);
ok(run.status === 201, 'owner creates a payroll run');
ok((await call('POST', `/hr/payroll/runs/${run.body.id}/approve`, {}, owner.access_token)).status === 200, 'approve payroll');
ok((await call('POST', '/hr/payroll/runs', { from: sDate, to: sDate }, owner.access_token)).status === 409, 'an approved period cannot be run twice');
ok((await call('POST', `/hr/shifts/${add.body.id}/adjust`, { minutes: 300, reason: 'Late change' }, mgr.access_token)).status === 409, 'approved hours are locked');
ok((await call('POST', `/hr/payroll/runs/${run.body.id}/pay`, { reference: 'BANK-123' }, owner.access_token)).status === 200, 'mark paid with a reference');
const detail = (await call('GET', `/hr/payroll/runs/${run.body.id}`, null, owner.access_token)).body;
ok(detail.status === 'paid' && detail.lines.some((l) => l.name === 'Test Barista' && Number(l.gross) === 720) && detail.totals.gross >= 720, 'paid run keeps its payslip lines');

const ovw = (await call('GET', '/admin/overview', null, owner.access_token)).body;
ok(ovw.labour.hours > 100 && ovw.labour.cost > 0 && ovw.labour.sales_per_hour > 0, 'overview shows labour hours, cost and sales per labour hour');
ok((await call('GET', '/admin/overview', null, mgr.access_token)).body.labour.cost === null, 'managers see hours but not labour cost');
const setup = (await call('GET', '/owner/setup', null, owner.access_token)).body;
ok(setup.total >= 10 && setup.steps.every((x) => x.title && typeof x.done === 'boolean'), 'setup checklist reports each step');

// no online payments
ok((await call('POST', '/orders', { station_id: st.id, items: [item], payment_method: 'esewa' }, T)).status === 400, 'online payment methods are refused');
ok((await call('GET', '/config')).body.payment_methods.join() === 'cash,pass', 'the public config offers cash and a pass only');
}

// store compliance: version endpoint, data export, account deletion
const ver = (await call('GET', '/version')).body;
ok(ver.version && ver.min_app_version && ver.privacy_url, 'GET /version for update checks');
const exp = (await call('GET', '/me/export', null, T)).body;
ok(exp.profile?.phone && Array.isArray(exp.orders), 'customer can export their data');
const wrongPw = await call('DELETE', '/me', { password: 'nope-nope' }, T);
ok(wrongPw.status === 401, 'delete account needs the right password');
const pending = await call('POST', '/orders', { station_id: st.id, items: [item], payment_method: 'cash' }, T);
ok((await call('DELETE', '/me', { password: 'Sadhai@123' }, T)).status === 409, 'cannot delete with an order in progress');
await decline(pending.body.order.id);
await decline(o3.order.id);
ok((await call('DELETE', '/me', { password: 'Sadhai@123' }, T)).status === 200, 'account deleted');
ok((await call('POST', '/auth/login', { phone, password: 'Sadhai@123' })).status === 401, 'deleted account cannot sign in');
ok((await call('GET', '/me', null, T)).status === 401, 'old token stops working');
console.log(failed ? `\n${failed} FAILED` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
