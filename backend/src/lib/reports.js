import { query } from './db.js';
import { getSettings } from './settings.js';

import { SALE, IN_PROGRESS } from './sales.js';
const DAY = `(o.created_at AT TIME ZONE 'Asia/Kathmandu')::date`;

export function range(from, to) {
  const end = to ? new Date(`${to}T00:00:00+05:45`) : new Date();
  if (to) end.setDate(end.getDate() + 1);
  const start = from ? new Date(`${from}T00:00:00+05:45`) : new Date(end.getTime() - 30 * 86400000);
  return { start, end };
}

export async function overview(stationIds, from, to) {
  const { start, end } = range(from, to);
  const days = Math.max(1, Math.round((end - start) / 86400000));
  const p = [stationIds, start, end];
  const s = await getSettings();

  const [tot, daily, byStation, top, hourly, prep, mix, pass, ratings, lowStock, customers, offers] = await Promise.all([
    query(
      `SELECT count(*)::int AS orders,
              COALESCE(sum(o.total),0)::int AS revenue,
              COALESCE(sum(o.discount),0)::int AS discount,
              COALESCE(sum((SELECT sum(i.qty) FROM order_items i JOIN products pk ON pk.id=i.product_id WHERE i.order_id=o.id AND pk.kind='drink')),0)::int AS cups,
              COALESCE(avg(NULLIF(o.total,0)),0)::int AS avg_ticket,
              count(*) FILTER (WHERE o.channel IN ('app','qr','web'))::int AS digital_orders,
              count(DISTINCT o.user_id)::int AS customers,
              COALESCE(sum((SELECT sum(i.qty * COALESCE(NULLIF(i.cost,0), pr.cost)) FROM order_items i JOIN products pr ON pr.id=i.product_id WHERE i.order_id=o.id)),0)::int AS food_cost
         FROM orders o WHERE o.station_id = ANY($1) AND o.created_at >= $2 AND o.created_at < $3 AND ${SALE}`, p),
    query(
      `SELECT ${DAY} AS day, count(*)::int AS orders, COALESCE(sum(o.total),0)::int AS revenue,
              COALESCE(sum((SELECT sum(i.qty) FROM order_items i JOIN products pk ON pk.id=i.product_id WHERE i.order_id=o.id AND pk.kind='drink')),0)::int AS cups
         FROM orders o WHERE o.station_id = ANY($1) AND o.created_at >= $2 AND o.created_at < $3 AND ${SALE}
        GROUP BY 1 ORDER BY 1`, p),
    query(
      `SELECT st.id, st.name, st.code, st.breakeven_cups, count(o.id)::int AS orders, COALESCE(sum(o.total),0)::int AS revenue,
              COALESCE(sum((SELECT sum(i.qty) FROM order_items i JOIN products pk ON pk.id=i.product_id WHERE i.order_id=o.id AND pk.kind='drink')),0)::int AS cups
         FROM stations st LEFT JOIN orders o ON o.station_id=st.id AND o.created_at >= $2 AND o.created_at < $3 AND ${SALE}
        WHERE st.id = ANY($1) GROUP BY st.id ORDER BY revenue DESC`, p),
    query(
      `SELECT i.name, sum(i.qty)::int AS qty, sum(i.line_total)::int AS revenue, sum(i.qty * COALESCE(NULLIF(i.cost,0), pr.cost))::int AS cost
         FROM order_items i JOIN orders o ON o.id=i.order_id JOIN products pr ON pr.id=i.product_id
        WHERE o.station_id = ANY($1) AND o.created_at >= $2 AND o.created_at < $3 AND ${SALE}
        GROUP BY i.name ORDER BY qty DESC LIMIT 10`, p),
    query(
      `SELECT extract(hour FROM o.created_at AT TIME ZONE 'Asia/Kathmandu')::int AS hour, count(*)::int AS orders
         FROM orders o WHERE o.station_id = ANY($1) AND o.created_at >= $2 AND o.created_at < $3 AND ${SALE}
        GROUP BY 1 ORDER BY 1`, p),
    query(
      `SELECT COALESCE(avg(extract(epoch FROM (o.ready_at - COALESCE(o.accepted_at, o.created_at)))),0)::int AS avg_make_seconds,
              COALESCE(avg(extract(epoch FROM (o.ready_at - o.created_at))),0)::int AS avg_wait_seconds,
              count(*) FILTER (WHERE extract(epoch FROM (o.ready_at - COALESCE(o.accepted_at, o.created_at))) <= st.prep_target_seconds)::int AS within_target,
              count(*)::int AS measured
         FROM orders o JOIN stations st ON st.id=o.station_id
        WHERE o.station_id = ANY($1) AND o.created_at >= $2 AND o.created_at < $3 AND o.ready_at IS NOT NULL AND o.channel <> 'counter'`, p),
    query(
      `SELECT o.payment_method AS provider, count(*)::int AS orders, COALESCE(sum(o.total),0)::int AS revenue
         FROM orders o WHERE o.station_id = ANY($1) AND o.created_at >= $2 AND o.created_at < $3 AND ${SALE}
        GROUP BY 1 ORDER BY revenue DESC`, p),
    query(
      `SELECT (SELECT count(*)::int FROM passes WHERE status IN ('active','used','expired') AND purchased_at >= $1 AND purchased_at < $2) AS sold,
              (SELECT COALESCE(sum(u.cups),0)::int FROM order_pass_uses u JOIN orders o ON o.id=u.order_id
                WHERE o.station_id = ANY($3) AND o.status <> 'cancelled' AND o.created_at >= $1 AND o.created_at < $2) AS redeemed_cups,
              (SELECT COALESCE(sum(total_cups - used_cups),0)::int FROM passes WHERE status='active' AND expires_at > now()) AS outstanding_cups,
              (SELECT COALESCE(sum(price_paid),0)::int FROM passes WHERE status IN ('active','used','expired') AND purchased_at >= $1 AND purchased_at < $2) AS sold_value,
              (SELECT count(*)::int FROM passes WHERE related_party AND purchased_at >= $1 AND purchased_at < $2) AS related_party`,
      [start, end, stationIds]),
    query(
      `SELECT COALESCE(avg(rating),0)::numeric(3,2) AS avg, count(rating)::int AS n,
              COALESCE(json_agg(json_build_object('code', pickup_code, 'rating', rating, 'note', rating_note, 'at', created_at) ORDER BY created_at DESC)
                FILTER (WHERE rating <= 2), '[]') AS low
         FROM orders o WHERE o.station_id = ANY($1) AND o.created_at >= $2 AND o.created_at < $3 AND rating IS NOT NULL`, p),
    query(
      `SELECT st.name AS station, i.name AS ingredient, i.unit, si.qty, si.reorder_level
         FROM station_inventory si JOIN ingredients i ON i.id=si.ingredient_id JOIN stations st ON st.id=si.station_id
        WHERE si.station_id = ANY($1) AND si.qty <= si.reorder_level ORDER BY si.qty / NULLIF(si.reorder_level,0) NULLS FIRST LIMIT 20`, [stationIds]),
    query(
      `SELECT (SELECT count(*)::int FROM users WHERE role='customer' AND created_at >= $1 AND created_at < $2) AS new_customers,
              (SELECT count(*)::int FROM users WHERE role='customer') AS total_customers`, [start, end]),
    query(
      `SELECT CASE WHEN o.coupon_id IS NOT NULL THEN c.kind WHEN o.promo_code_id IS NOT NULL THEN 'promo' WHEN o.pass_id IS NOT NULL THEN 'pass' END AS kind,
              count(*)::int AS uses, COALESCE(sum(o.discount),0)::int AS spend,
              COALESCE(sum(o.total - COALESCE((SELECT sum(i.qty * COALESCE(NULLIF(i.cost,0), pr.cost)) FROM order_items i JOIN products pr ON pr.id=i.product_id WHERE i.order_id=o.id),0)),0)::int AS margin_on_orders
         FROM orders o LEFT JOIN coupons c ON c.id=o.coupon_id
        WHERE o.station_id = ANY($1) AND o.created_at >= $2 AND o.created_at < $3 AND ${SALE}
          AND (o.coupon_id IS NOT NULL OR o.promo_code_id IS NOT NULL OR o.pass_id IS NOT NULL)
        GROUP BY 1`, p),
  ]);

  const t = tot.rows[0];
  const cupsPerDay = t.cups / days;
  const repeat = await repeatRate(stationIds);
  const ladderSpend = offers.rows.filter((r) => ['first_cup', 'pct', 'referral_cup'].includes(r.kind)).reduce((a, r) => a + r.spend, 0);
  const newC = customers.rows[0].new_customers;
  const pr = prep.rows[0];
  const ps = pass.rows[0];

  const inProgress = (await query(`SELECT count(*)::int AS orders, COALESCE(sum(o.total),0)::int AS amount FROM orders o WHERE o.station_id = ANY($1) AND ${IN_PROGRESS}`, [stationIds])).rows[0];

  return {
    range: { from: start, to: end, days },
    in_progress: inProgress,
    totals: {
      ...t,
      gross_margin: t.revenue - t.food_cost,
      cups_per_day: Math.round(cupsPerDay * 10) / 10,
      app_share_pct: t.orders ? Math.round((t.digital_orders / t.orders) * 100) : 0,
    },
    daily: daily.rows,
    stations: byStation.rows.map((r) => ({ ...r, cups_per_day: Math.round((r.cups / days) * 10) / 10, breakeven_pct: Math.round((r.cups / days / r.breakeven_cups) * 100) })),
    top_products: top.rows,
    hourly: hourly.rows,
    service: {
      avg_make_seconds: pr.avg_make_seconds,
      avg_wait_seconds: pr.avg_wait_seconds,
      within_90s_pct: pr.measured ? Math.round((pr.within_target / pr.measured) * 100) : null,
      measured: pr.measured,
    },
    payment_mix: mix.rows,
    pass: { ...ps, redemption_pct: ps.sold ? Math.round((ps.redeemed_cups / (ps.sold * s.pass_cups)) * 100) : null, liability_value: Math.round((ps.outstanding_cups * s.pass_price) / s.pass_cups) },
    ratings: ratings.rows[0],
    low_stock: lowStock.rows,
    growth: {
      new_customers: newC,
      total_customers: customers.rows[0].total_customers,
      repeat_rate_90d_pct: repeat,
      offers: offers.rows,
      ladder_spend: ladderSpend,
      cost_per_acquired_customer: newC ? Math.round(ladderSpend / newC) : null,
    },
  };
}

// Share of customers (first order at least 90 days ago) who ordered again within 90 days of their first.
export async function repeatRate(stationIds) {
  const { rows } = await query(
    `WITH f AS (
       SELECT o.user_id, min(o.created_at) AS first_at FROM orders o
        WHERE o.user_id IS NOT NULL AND o.station_id = ANY($1) AND o.status='picked_up' GROUP BY 1
     )
     SELECT count(*)::int AS cohort,
            count(*) FILTER (WHERE EXISTS (SELECT 1 FROM orders o2 WHERE o2.user_id=f.user_id AND o2.status='picked_up'
                 AND o2.created_at > f.first_at + interval '1 hour' AND o2.created_at <= f.first_at + interval '90 days'))::int AS repeated
       FROM f WHERE first_at <= now() - interval '90 days'`, [stationIds]);
  const r = rows[0];
  return r.cohort ? Math.round((r.repeated / r.cohort) * 100) : null;
}

