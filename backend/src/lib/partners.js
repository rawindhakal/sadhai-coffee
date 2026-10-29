import { query } from './db.js';
import { getSettings } from './settings.js';
import { range } from './reports.js';

/**
 * Partner-cafe statement. Sadhai runs on existing cafes, so money moves two ways:
 *  - the cafe holds the CASH it takes at the counter (and for passes sold over the counter)
 *  - Sadhai holds the DIGITAL money: payments through Fonepay arrive in Sadhai's merchant accounts (digital_held_by_sadhai)
 * The cafe earns revenue_share_pct of net sales. Pass cups count at the pass's per-cup value, so the cafe is paid for them.
 * net_due > 0: Sadhai pays the cafe. net_due < 0: the cafe remits to Sadhai.
 */
export async function statement(stationId, from, to) {
  const { start, end } = range(from, to);
  const st = (await query('SELECT id, code, name, operator_type, partner_name, partner_phone, revenue_share_pct FROM stations WHERE id=$1', [stationId])).rows[0];
  const s = await getSettings();
  const perCup = s.pass_price / s.pass_cups;
  const sales = (await query(
    `SELECT COALESCE(sum(o.total),0)::int AS paid_sales,
            COALESCE(sum((SELECT sum(i.qty) FROM order_items i WHERE i.order_id=o.id)) FILTER (WHERE o.pass_id IS NOT NULL),0)::int AS pass_cups,
            count(*)::int AS orders,
            COALESCE(sum(o.discount) FILTER (WHERE o.pass_id IS NULL),0)::int AS discounts
       FROM orders o WHERE o.station_id=$1 AND o.created_at >= $2 AND o.created_at < $3 AND o.status='picked_up'`, [stationId, start, end])).rows[0];
  const pay = (await query(
    `SELECT COALESCE(sum(amount) FILTER (WHERE provider='cash' AND purpose='order'),0)::int AS cash_orders,
            COALESCE(sum(amount) FILTER (WHERE provider='cash' AND purpose='pass'),0)::int AS cash_passes,
            COALESCE(sum(amount) FILTER (WHERE provider NOT IN ('cash','pass') AND purpose='order'),0)::int AS digital
       FROM payments WHERE station_id=$1 AND status='paid' AND settled_at >= $2 AND settled_at < $3`, [stationId, start, end])).rows[0];
  const refunds = (await query(
    `SELECT COALESCE(sum(amount),0)::int AS n FROM payments WHERE station_id=$1 AND status='refunded' AND created_at >= $2 AND created_at < $3`, [stationId, start, end])).rows[0].n;
  const passValue = Math.round(sales.pass_cups * perCup);
  const netSales = sales.paid_sales + passValue;
  const share = Math.round((netSales * st.revenue_share_pct) / 100);
  const cashHeld = pay.cash_orders + pay.cash_passes;
  const settled = (await query('SELECT * FROM partner_settlements WHERE station_id=$1 AND period_from=$2 AND period_to=$3', [stationId, start.toISOString().slice(0, 10), new Date(end.getTime() - 86400000).toISOString().slice(0, 10)])).rows[0] || null;
  return {
    station: st, period: { from: start, to: end },
    orders: sales.orders, sales_paid: sales.paid_sales, pass_cups: sales.pass_cups, pass_value: passValue, net_sales: netSales,
    discounts: sales.discounts, refunds, partner_share: share, cash_held: cashHeld, digital_held_by_sadhai: pay.digital,
    net_due: share - cashHeld, settled,
  };
}

export async function scorecard(stationIds, from, to) {
  const { start, end } = range(from, to);
  const p = [stationIds, start, end];
  const [stations, staff] = await Promise.all([
    query(
      `SELECT st.id, st.name, st.operator_type, st.partner_name,
              count(o.id)::int AS orders,
              count(o.id) FILTER (WHERE o.status='cancelled')::int AS cancelled,
              count(o.id) FILTER (WHERE o.ready_at IS NOT NULL AND o.channel <> 'counter' AND extract(epoch FROM (o.ready_at - COALESCE(o.accepted_at,o.created_at))) <= st.prep_target_seconds)::int AS on_time,
              count(o.id) FILTER (WHERE o.ready_at IS NOT NULL AND o.channel <> 'counter')::int AS timed,
              count(o.id) FILTER (WHERE o.ready_at IS NOT NULL AND o.accepted_at IS NOT NULL AND extract(epoch FROM (o.ready_at - o.accepted_at)) < 12)::int AS rushed,
              COALESCE(avg(o.rating),0)::numeric(3,2) AS rating, count(o.rating)::int AS rated,
              COALESCE(sum(o.discount),0)::int AS discount, COALESCE(sum(o.total) FILTER (WHERE o.status='picked_up'),0)::int AS sales,
              (SELECT COALESCE(sum(abs(c.diff)),0)::int FROM cash_closes c WHERE c.station_id=st.id AND c.business_date >= ($2 AT TIME ZONE 'Asia/Kathmandu')::date) AS cash_diff,
              (SELECT count(*)::int FROM cash_closes c WHERE c.station_id=st.id AND c.diff <> 0 AND c.business_date >= ($2 AT TIME ZONE 'Asia/Kathmandu')::date) AS cash_diff_days,
              (SELECT count(*)::int FROM (
                 SELECT DISTINCT (o2.created_at AT TIME ZONE 'Asia/Kathmandu')::date AS d FROM orders o2
                  WHERE o2.station_id=st.id AND o2.payment_method='cash' AND o2.status='picked_up' AND o2.created_at >= $2 AND o2.created_at < $3 AND o2.created_at < date_trunc('day', now())
              ) x WHERE NOT EXISTS (SELECT 1 FROM cash_closes c WHERE c.station_id=st.id AND c.business_date=x.d)) AS days_without_cash_count
         FROM stations st LEFT JOIN orders o ON o.station_id=st.id AND o.created_at >= $2 AND o.created_at < $3
        WHERE st.id = ANY($1) GROUP BY st.id ORDER BY st.name`, p),
    query(
      `SELECT u.id, u.name, s.name AS station, count(o.id)::int AS orders_made,
              COALESCE(avg(extract(epoch FROM (o.ready_at - COALESCE(o.accepted_at,o.created_at)))),0)::int AS avg_make_seconds,
              count(o.id) FILTER (WHERE extract(epoch FROM (o.ready_at - o.accepted_at)) < 12)::int AS rushed,
              (SELECT count(*)::int FROM audit_log a WHERE a.actor_id=u.id AND a.action='order.cancel' AND a.created_at >= $2 AND a.created_at < $3) AS cancels,
              (SELECT count(*)::int FROM audit_log a WHERE a.actor_id=u.id AND a.action='order.cash_collected' AND a.created_at >= $2 AND a.created_at < $3) AS cash_marked
         FROM users u JOIN stations s ON s.id=u.station_id
         LEFT JOIN orders o ON o.ready_by=u.id AND o.created_at >= $2 AND o.created_at < $3
        WHERE u.role='station' AND u.station_id = ANY($1) GROUP BY u.id, s.name ORDER BY s.name, orders_made DESC`, p),
  ]);
  return {
    stations: stations.rows.map((r) => ({
      ...r,
      cancel_pct: r.orders ? Math.round((r.cancelled / r.orders) * 1000) / 10 : 0,
      on_time_pct: r.timed ? Math.round((r.on_time / r.timed) * 100) : null,
      discount_pct: r.sales ? Math.round((r.discount / (r.sales + r.discount)) * 1000) / 10 : 0,
      flags: [
        r.cash_diff_days >= 2 && `Cash did not match on ${r.cash_diff_days} days`,
        r.days_without_cash_count > 0 && `${r.days_without_cash_count} trading days with no cash count`,
        r.orders && r.cancelled / r.orders > 0.04 && 'Cancellations above 4%',
        r.rushed > 3 && `${r.rushed} orders marked ready in under 12 seconds`,
        r.timed && r.on_time / r.timed < 0.6 && 'Fewer than 60% of drinks made on time',
        r.rated >= 5 && Number(r.rating) < 4 && 'Average rating below 4',
      ].filter(Boolean),
    })),
    staff: staff.rows,
  };
}
