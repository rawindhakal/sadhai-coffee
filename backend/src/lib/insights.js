import { query } from './db.js';
import { range } from './reports.js';

import { SALE } from './sales.js';
const CUPS = `(SELECT sum(i.qty) FROM order_items i JOIN products pk ON pk.id=i.product_id WHERE i.order_id=o.id AND pk.kind='drink')`;

export async function periodTotals(stationIds, start, end) {
  const { rows } = await query(
    `SELECT count(*)::int AS orders, COALESCE(sum(o.total),0)::int AS revenue, COALESCE(sum(${CUPS}),0)::int AS cups,
            count(DISTINCT o.user_id)::int AS customers, COALESCE(sum(o.discount),0)::int AS discount,
            COALESCE(avg(NULLIF(o.total,0)),0)::int AS avg_ticket
       FROM orders o WHERE o.station_id = ANY($1) AND o.created_at >= $2 AND o.created_at < $3 AND ${SALE}`, [stationIds, start, end]);
  return rows[0];
}

/** Extra analytics that power the dashboard: previous-period comparison, heatmap, category mix, new vs returning. */
export async function extras(stationIds, from, to) {
  const { start, end } = range(from, to);
  const span = end - start;
  const pStart = new Date(start.getTime() - span), pEnd = start;
  const p = [stationIds, start, end];
  const [prev, prevDaily, heat, cats, nvr, hourlyRev] = await Promise.all([
    periodTotals(stationIds, pStart, pEnd),
    query(
      `SELECT (o.created_at AT TIME ZONE 'Asia/Kathmandu')::date AS day, COALESCE(sum(o.total),0)::int AS revenue, count(*)::int AS orders, COALESCE(sum(${CUPS}),0)::int AS cups
         FROM orders o WHERE o.station_id = ANY($1) AND o.created_at >= $2 AND o.created_at < $3 AND ${SALE} GROUP BY 1 ORDER BY 1`, [stationIds, pStart, pEnd]),
    query(
      `SELECT extract(dow FROM o.created_at AT TIME ZONE 'Asia/Kathmandu')::int AS dow, extract(hour FROM o.created_at AT TIME ZONE 'Asia/Kathmandu')::int AS hour, count(*)::int AS orders
         FROM orders o WHERE o.station_id = ANY($1) AND o.created_at >= $2 AND o.created_at < $3 AND ${SALE} GROUP BY 1,2`, p),
    query(
      `SELECT COALESCE(c.name,'Other') AS category, sum(i.line_total)::int AS revenue, sum(i.qty)::int AS qty
         FROM order_items i JOIN orders o ON o.id=i.order_id JOIN products pr ON pr.id=i.product_id LEFT JOIN categories c ON c.id=pr.category_id
        WHERE o.station_id = ANY($1) AND o.created_at >= $2 AND o.created_at < $3 AND ${SALE} GROUP BY 1 ORDER BY revenue DESC`, p),
    query(
      `WITH firsts AS (SELECT user_id, min(created_at) AS first_at FROM orders WHERE user_id IS NOT NULL AND status <> 'cancelled' GROUP BY 1),
            inrange AS (SELECT DISTINCT o.user_id FROM orders o WHERE o.user_id IS NOT NULL AND o.station_id = ANY($1) AND o.created_at >= $2 AND o.created_at < $3 AND ${SALE})
       SELECT count(*) FILTER (WHERE f.first_at >= $2)::int AS new_customers, count(*) FILTER (WHERE f.first_at < $2)::int AS returning_customers
         FROM inrange r JOIN firsts f ON f.user_id=r.user_id`, p),
    query(
      `SELECT extract(hour FROM o.created_at AT TIME ZONE 'Asia/Kathmandu')::int AS hour, COALESCE(sum(o.total),0)::int AS revenue
         FROM orders o WHERE o.station_id = ANY($1) AND o.created_at >= $2 AND o.created_at < $3 AND ${SALE} GROUP BY 1 ORDER BY 1`, p),
  ]);
  return { previous: prev, previous_daily: prevDaily.rows, heatmap: heat.rows, category_mix: cats.rows, new_vs_returning: nvr.rows[0], hourly_revenue: hourlyRev.rows };
}

export async function liveBoard(stationIds) {
  const today = `((now() AT TIME ZONE 'Asia/Kathmandu')::date::timestamp AT TIME ZONE 'Asia/Kathmandu')`;
  const { rows: stations } = await query(
    `SELECT st.id, st.name, st.code, st.is_open, st.accepting_orders, st.operator_type, st.partner_name, st.prep_target_seconds, st.breakeven_cups,
            count(o.id) FILTER (WHERE o.status='placed')::int AS waiting, count(o.id) FILTER (WHERE o.status='preparing')::int AS making, count(o.id) FILTER (WHERE o.status='ready')::int AS ready,
            COALESCE(max(extract(epoch FROM (now() - o.created_at))) FILTER (WHERE o.status IN ('placed','preparing')),0)::int AS oldest_seconds,
            (SELECT COALESCE(sum(oo.total),0)::int FROM orders oo WHERE oo.station_id=st.id AND oo.created_at >= ${today} AND oo.status = 'picked_up') AS revenue_today,
            (SELECT COALESCE(sum((SELECT sum(i.qty) FROM order_items i JOIN products pk ON pk.id=i.product_id WHERE i.order_id=oo.id AND pk.kind='drink')),0)::int FROM orders oo WHERE oo.station_id=st.id AND oo.created_at >= ${today} AND oo.status = 'picked_up') AS cups_today,
            (SELECT COALESCE(avg(extract(epoch FROM (oo.ready_at - COALESCE(oo.accepted_at, oo.created_at)))),0)::int FROM orders oo WHERE oo.station_id=st.id AND oo.ready_at > now() - interval '1 hour') AS make_seconds_1h,
            (SELECT count(*)::int FROM orders oo WHERE oo.station_id=st.id AND oo.created_at > now() - interval '1 hour' AND oo.status <> 'cancelled') AS orders_1h
       FROM stations st LEFT JOIN orders o ON o.station_id=st.id AND o.status IN ('placed','preparing','ready')
      WHERE st.id = ANY($1) GROUP BY st.id ORDER BY st.name`, [stationIds]);
  const { rows: feed } = await query(
    `SELECT o.id, o.pickup_code, o.status, o.total, o.channel, o.payment_method, o.created_at, o.rating, s.name AS station_name, s.id AS station_id, COALESCE(u.name, o.customer_name, 'Walk-in') AS customer,
            (SELECT string_agg(i.qty || '× ' || i.name, ', ') FROM order_items i WHERE i.order_id=o.id) AS summary
       FROM orders o JOIN stations s ON s.id=o.station_id LEFT JOIN users u ON u.id=o.user_id
      WHERE o.station_id = ANY($1) ORDER BY o.created_at DESC LIMIT 25`, [stationIds]);
  return { stations, feed };
}

export async function alerts(stationIds, isOwner) {
  const out = [];
  const push = (severity, type, title, detail, section) => out.push({ severity, type, title, detail, section });

  const low = await query(
    `SELECT st.name AS station, i.name, i.unit, si.qty FROM station_inventory si JOIN ingredients i ON i.id=si.ingredient_id JOIN stations st ON st.id=si.station_id
      WHERE si.station_id = ANY($1) AND si.reorder_level > 0 AND si.qty <= si.reorder_level ORDER BY si.qty / si.reorder_level LIMIT 8`, [stationIds]);
  for (const r of low.rows) push(r.qty <= 0 ? 'critical' : 'warning', 'stock', `${r.name} low at ${r.station}`, `${Math.round(r.qty)} ${r.unit} left. Items that need it will sell out.`, 'stock');

  const late = await query(
    `SELECT s.name AS station, count(*)::int AS n, max(extract(epoch FROM (now() - o.created_at)))::int AS oldest
       FROM orders o JOIN stations s ON s.id=o.station_id WHERE o.station_id = ANY($1) AND o.status IN ('placed','preparing') AND (o.scheduled_for IS NULL OR o.released_at IS NOT NULL) AND now() - COALESCE(o.released_at, o.created_at) > make_interval(secs => s.prep_target_seconds * 2)
      GROUP BY s.name`, [stationIds]);
  for (const r of late.rows) push('critical', 'late', `${r.n} order${r.n > 1 ? 's' : ''} running late at ${r.station}`, `The oldest has waited ${Math.round(r.oldest / 60)} min.`, 'live');

  const closed = await query(
    `SELECT name FROM stations WHERE id = ANY($1) AND active AND (NOT is_open OR NOT accepting_orders) AND (now() AT TIME ZONE 'Asia/Kathmandu')::time BETWEEN opens AND closes`, [stationIds]);
  for (const r of closed.rows) push('warning', 'paused', `${r.name} is closed or paused in opening hours`, 'Customers cannot order there until it is reopened.', 'live');

  const cash = await query(
    `SELECT s.name AS station,
            COALESCE((SELECT sum(amount) FROM payments p WHERE p.station_id=s.id AND p.provider='cash' AND p.status='paid' AND (p.settled_at AT TIME ZONE 'Asia/Kathmandu')::date = (now() AT TIME ZONE 'Asia/Kathmandu')::date - 1),0)::int AS cash,
            c.diff, c.id AS close_id
       FROM stations s LEFT JOIN cash_closes c ON c.station_id=s.id AND c.business_date = (now() AT TIME ZONE 'Asia/Kathmandu')::date - 1 WHERE s.id = ANY($1) AND s.active`, [stationIds]);
  for (const r of cash.rows) {
    if (r.cash > 0 && !r.close_id) push('warning', 'cash', `${r.station} did not count its cash yesterday`, `Rs ${r.cash} of cash sales had no cash count.`, 'cash');
    else if (r.diff && Math.abs(r.diff) >= 100) push('warning', 'cash', `Cash difference at ${r.station}`, `Yesterday's count was off by Rs ${r.diff}.`, 'cash');
  }

  const rated = await query(
    `SELECT s.name AS station, count(*)::int AS n FROM orders o JOIN stations s ON s.id=o.station_id WHERE o.station_id = ANY($1) AND o.rating <= 2 AND o.created_at > now() - interval '24 hours' GROUP BY s.name`, [stationIds]);
  for (const r of rated.rows) push('warning', 'rating', `${r.n} low rating${r.n > 1 ? 's' : ''} at ${r.station} in 24 hours`, 'Read the comments and follow up with the team.', 'reviews');

  const noOffer = await query(
    `SELECT s.name FROM stations s WHERE s.id = ANY($1) AND s.active AND NOT EXISTS (SELECT 1 FROM daily_offers d WHERE d.active AND d.ends_at > now() AND d.starts_at <= now() AND (d.station_id IS NULL OR d.station_id=s.id))`, [stationIds]);
  for (const r of noOffer.rows) push('info', 'offer', `No offer of the day at ${r.name}`, 'A daily offer lifts repeat orders. Set one in two minutes.', 'offers');
  const ending = await query(
    `SELECT title, ends_at FROM daily_offers WHERE active AND ends_at > now() AND ends_at < now() + interval '2 hours' AND (station_id IS NULL OR station_id = ANY($1))`, [stationIds]);
  for (const r of ending.rows) push('info', 'offer', `“${r.title}” ends soon`, 'Extend it or replace it before it runs out.', 'offers');

  const stale = await query(`SELECT count(*)::int AS n FROM passes WHERE status='active' AND expires_at BETWEEN now() AND now() + interval '3 days' AND used_cups < total_cups`);
  if (stale.rows[0].n) push('info', 'pass', `${stale.rows[0].n} pass${stale.rows[0].n > 1 ? 'es' : ''} expire within 3 days with cups left`, 'Send a reminder so customers use them and keep their price.', isOwner ? 'marketing' : 'customers');

  if (isOwner) {
    const refunds = await query(`SELECT count(*)::int AS n, COALESCE(sum(amount),0)::int AS amt FROM payments WHERE status='refunded' AND provider IN ('esewa','fonepay') AND (raw->>'refund_pending_manual')::boolean`);
    if (refunds.rows[0].n) push('warning', 'refund', `${refunds.rows[0].n} online refund${refunds.rows[0].n > 1 ? 's' : ''} to pay back`, `Rs ${refunds.rows[0].amt} to send back from your eSewa or Fonepay merchant account. Mark each one done in Finance.`, 'finance');
    const enq = await query(`SELECT count(*)::int AS n FROM enquiries WHERE status='new'`);
    if (enq.rows[0].n) push('info', 'enquiry', `${enq.rows[0].n} new partner or investor enquir${enq.rows[0].n > 1 ? 'ies' : 'y'}`, 'Someone is waiting to hear back.', 'enquiries');
  }
  const order = { critical: 0, warning: 1, info: 2 };
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}

export async function customerInsights(from, to) {
  const { start, end } = range(from, to);
  const segs = await query(
    `WITH c AS (
       SELECT u.id, u.created_at, max(o.created_at) FILTER (WHERE o.status='picked_up') AS last_order, count(o.id) FILTER (WHERE o.status='picked_up')::int AS n,
              COALESCE(sum(o.total) FILTER (WHERE o.status='picked_up'),0)::int AS spent
         FROM users u LEFT JOIN orders o ON o.user_id=u.id WHERE u.role='customer' AND u.active GROUP BY u.id)
     SELECT CASE WHEN last_order IS NULL THEN 'never' WHEN created_at > now() - interval '14 days' THEN 'new' WHEN last_order > now() - interval '14 days' THEN 'active'
                 WHEN last_order > now() - interval '45 days' THEN 'at_risk' ELSE 'lapsed' END AS segment,
            count(*)::int AS customers, COALESCE(sum(spent),0)::int AS spent FROM c GROUP BY 1`);
  const top = await query(
    `SELECT u.id, u.name, u.phone, count(o.id)::int AS orders, sum(o.total)::int AS spent, max(o.created_at) AS last_order
       FROM users u JOIN orders o ON o.user_id=u.id AND o.status='picked_up' WHERE o.created_at >= $1 AND o.created_at < $2 GROUP BY u.id ORDER BY spent DESC LIMIT 8`, [start, end]);
  const atRisk = await query(
    `SELECT u.id, u.name, u.phone, count(o.id)::int AS orders, max(o.created_at) AS last_order, sum(o.total)::int AS spent,
            (SELECT i.name FROM order_items i JOIN orders o2 ON o2.id=i.order_id WHERE o2.user_id=u.id GROUP BY i.name ORDER BY sum(i.qty) DESC LIMIT 1) AS favourite
       FROM users u JOIN orders o ON o.user_id=u.id AND o.status='picked_up' WHERE u.role='customer' AND u.active GROUP BY u.id
     HAVING max(o.created_at) < now() - interval '14 days' AND max(o.created_at) > now() - interval '45 days' AND count(o.id) >= 2 ORDER BY sum(o.total) DESC LIMIT 12`);
  return { segments: segs.rows, top: top.rows, at_risk: atRisk.rows };
}

export async function customerDetail(id) {
  const u = (await query(`SELECT id, name, phone, beans, created_at, active, referral_code FROM users WHERE id=$1 AND role='customer'`, [id])).rows[0];
  if (!u) return null;
  const [orders, fav, pass, coupons, stats] = await Promise.all([
    query(`SELECT o.id, o.pickup_code, o.status, o.total, o.created_at, s.name AS station_name FROM orders o JOIN stations s ON s.id=o.station_id WHERE o.user_id=$1 ORDER BY o.created_at DESC LIMIT 10`, [id]),
    query(`SELECT i.name, sum(i.qty)::int AS qty FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.user_id=$1 AND o.status='picked_up' GROUP BY i.name ORDER BY qty DESC LIMIT 4`, [id]),
    query(`SELECT total_cups - used_cups AS remaining, expires_at FROM passes WHERE user_id=$1 AND status='active' AND expires_at > now() LIMIT 1`, [id]),
    query(`SELECT count(*)::int AS n FROM coupons WHERE user_id=$1 AND status='active' AND expires_at > now()`, [id]),
    query(`SELECT count(*) FILTER (WHERE status='picked_up')::int AS orders, COALESCE(sum(total) FILTER (WHERE status='picked_up'),0)::int AS spent, COALESCE(avg(rating),0)::numeric(3,2) AS rating FROM orders WHERE user_id=$1`, [id]),
  ]);
  return { ...u, ...stats.rows[0], recent_orders: orders.rows, favourites: fav.rows, pass: pass.rows[0] || null, active_coupons: coupons.rows[0].n };
}

export async function search(stationIds, q) {
  const term = `%${q}%`;
  const [orders, customers, products] = await Promise.all([
    query(`SELECT o.id, o.pickup_code, o.status, o.total, o.created_at, s.name AS station_name FROM orders o JOIN stations s ON s.id=o.station_id
            WHERE o.station_id = ANY($1) AND upper(o.pickup_code) = upper($2) ORDER BY o.created_at DESC LIMIT 6`, [stationIds, q]),
    query(`SELECT id, name, phone FROM users WHERE role='customer' AND (name ILIKE $1 OR phone ILIKE $1) ORDER BY name LIMIT 6`, [term]),
    query(`SELECT id, name, price FROM products WHERE name ILIKE $1 ORDER BY name LIMIT 5`, [term]),
  ]);
  return { orders: orders.rows, customers: customers.rows, products: products.rows };
}
