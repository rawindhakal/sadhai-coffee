'use client';
import { useEffect, useMemo, useState } from 'react';
import { api, ago, fmtDateTime, rs } from '@/lib/api';
import { Icon } from '../icons';
import { Empty, ErrorNote, Meter, Status, useData, useToast } from '../ui';
import { AreaChart, compact, Donut, HBars, Heatmap } from './charts';
import { DataTable, Kpi, Seg, Skeleton, pctDelta } from './kit';
import { AlertsPanel, useDash } from './shell';
import { SetupChecklist } from '../studio';
import { useAuth } from '@/lib/auth';

const qs = (o: Record<string, any>) => { const p = Object.entries(o).filter(([, v]) => v); return p.length ? '?' + p.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&') : ''; };
const PAY_COLORS: Record<string, string> = { cash: '#5A3322', fonepay: '#F2A81D', pass: '#A81F2A', esewa: '#2F5D46', khalti: '#7C97A6' };

/* ============================== Overview ============================== */
export function OverviewSection() {
  const { user } = useAuth();
  const { stationId, days, from, tick, setStationId, go } = useDash();
  const { data: o, error } = useData<any>(`/admin/overview${qs({ station_id: stationId, from })}`, [stationId, days, tick]);
  const [metric, setMetric] = useState<'revenue' | 'orders' | 'cups'>('revenue');
  const [cmp, setCmp] = useState(true);
  if (error) return <ErrorNote error={error} />;
  if (!o) return <div className="col"><Skeleton h={110} /><Skeleton h={300} /></div>;
  const t = o.totals, p = o.previous;
  const daily: any[] = o.daily;
  const sp = (k: string) => daily.map((d) => d[k]);
  const fmt = metric === 'revenue' ? rs : (n: number) => Math.round(n).toLocaleString();
  const pd: any[] = o.previous_daily;
  const series = daily.map((d, i) => ({ label: new Date(d.day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Kathmandu' }), value: d[metric], prev: pd[i]?.[metric] }));
  const nvr = o.new_vs_returning || { new_customers: 0, returning_customers: 0 };
  const nvrTotal = nvr.new_customers + nvr.returning_customers || 1;
  const hr = o.hourly_revenue || [];
  const peak = hr.reduce((a: any, b: any) => (b.revenue > (a?.revenue || 0) ? b : a), null);
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <Kpi label="Sales" value={rs(t.revenue)} delta={pctDelta(t.revenue, p.revenue)} spark={sp('revenue')} />
        <Kpi label="Orders" value={t.orders.toLocaleString()} delta={pctDelta(t.orders, p.orders)} spark={sp('orders')} onClick={() => go('orders')} />
        <Kpi label="Cups" value={t.cups.toLocaleString()} delta={pctDelta(t.cups, p.cups)} spark={sp('cups')} hint={`${t.cups_per_day} a day`} />
        <Kpi label="Average ticket" value={rs(t.avg_ticket)} delta={pctDelta(t.avg_ticket, p.avg_ticket)} />
        {t.gross_margin != null && <Kpi label="Gross margin" value={`${Math.round((t.gross_margin / Math.max(1, t.revenue)) * 100)}%`} hint={`${rs(t.gross_margin)} after food cost`} />}
        <Kpi label="Through app or QR" value={`${t.app_share_pct}%`} hint="of all orders" />
        {o.labour && <Kpi label="Staff hours" value={`${Math.round(o.labour.hours)} h`} hint={o.labour.sales_per_hour != null ? `${rs(o.labour.sales_per_hour)} sales an hour${o.labour.cost_pct != null ? ` · pay is ${o.labour.cost_pct}% of sales` : ''}` : undefined} onClick={() => go('staff')} />}
      </div>
      {user?.role === 'owner' && <SetupChecklist />}

      <div className="cols c-21">
        <div className="panel">
          <div className="ph"><h3>Trend</h3>
            <div className="row wrap"><Seg value={metric} onChange={setMetric} options={[{ id: 'revenue', label: 'Sales' }, { id: 'orders', label: 'Orders' }, { id: 'cups', label: 'Cups' }]} />
              <label className="row small" style={{ gap: 6 }}><input type="checkbox" style={{ width: 18, minHeight: 18 }} checked={cmp} onChange={(e) => setCmp(e.target.checked)} />Compare to previous {days} days</label></div></div>
          <AreaChart data={series} format={fmt} showPrev={cmp} />
          <div className="legend" style={{ marginTop: 8 }}><span><i style={{ background: 'var(--cherry)' }} />This period</span>{cmp && <span><i style={{ background: 'var(--ink-muted)' }} />Previous period</span>}{peak && <span>Busiest hour for sales: {peak.hour}:00</span>}</div>
        </div>
        <div className="panel"><div className="ph"><h3>Needs attention</h3></div><AlertsPanel limit={4} /></div>
      </div>

      <div className="cols c-3">
        <div className="panel"><div className="ph"><h3>Stations</h3><span className="small muted">Click to focus</span></div>
          <div className="col" style={{ gap: 12 }}>{o.stations.map((s: any) => (
            <button key={s.id} className="col" style={{ all: 'unset', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 4 }} onClick={() => setStationId(s.id === stationId ? '' : s.id)}>
              <span className="row between small"><strong>{s.name}</strong><span>{rs(s.revenue)}</span></span>
              <Meter pct={s.breakeven_pct} label={`${s.name} break-even`} />
              <span className="small muted">{s.cups_per_day} of {s.breakeven_cups} cups a day · {s.breakeven_pct}% of break-even</span>
            </button>))}</div></div>
        <div className="panel"><div className="ph"><h3>How customers pay</h3></div>
          <Donut format={rs} parts={o.payment_mix.map((m: any) => ({ label: m.provider === 'pass' ? '10-cup pass' : m.provider[0].toUpperCase() + m.provider.slice(1), value: m.revenue || m.orders, color: PAY_COLORS[m.provider] || '#999' }))} /></div>
        <div className="panel"><div className="ph"><h3>Sales by category</h3></div>
          <HBars rows={o.category_mix.map((c: any) => ({ label: c.category, value: c.revenue, sub: `${c.qty.toLocaleString()} sold` }))} format={(n) => rs(n)} /></div>
      </div>

      <div className="cols c-2">
        <div className="panel"><div className="ph"><h3>When customers order</h3></div><Heatmap cells={o.heatmap} /></div>
        <div className="panel">
          <div className="ph"><h3>Customers and service</h3></div>
          <div className="col" style={{ gap: 16 }}>
            <div><div className="row between small"><span>New vs returning customers</span><span className="muted">{nvr.new_customers} new · {nvr.returning_customers} returning</span></div>
              <div className="bar" style={{ height: 14, marginTop: 6 }}><i style={{ width: `${(nvr.new_customers / nvrTotal) * 100}%`, background: 'var(--marigold)' }} /></div></div>
            <div className="grid g3" style={{ gap: 10 }}>
              <div className="card flat stat"><div className="v">{o.service.avg_make_seconds}s</div><div className="l">Average time to make</div></div>
              <div className="card flat stat"><div className="v">{o.service.within_90s_pct ?? '–'}%</div><div className="l">Made on time</div></div>
              <div className="card flat stat"><div className="v">{o.ratings.avg || '–'}</div><div className="l">Rating ({o.ratings.n})</div></div>
            </div>
            <div className="grid g3" style={{ gap: 10 }}>
              <div className="card flat stat"><div className="v">{o.pass.sold}</div><div className="l">Passes sold</div><div className="d muted">{o.pass.outstanding_cups} cups owed</div></div>
              <div className="card flat stat"><div className="v">{o.growth.new_customers}</div><div className="l">New customers</div></div>
              <div className="card flat stat"><div className="v">{o.growth.repeat_rate_90d_pct ?? '–'}{o.growth.repeat_rate_90d_pct != null && '%'}</div><div className="l">Repeat in 90 days</div></div>
            </div>
          </div>
        </div>
      </div>

      <div className="panel"><div className="ph"><h3>Best sellers</h3></div>
        <DataTable csvName="best-sellers" rows={o.top_products.map((p: any) => ({ id: p.name, ...p, margin: p.revenue && p.cost != null ? Math.round(((p.revenue - p.cost) / p.revenue) * 100) : null }))} pageSize={10}
          cols={[{ key: 'name', label: 'Item', sort: (r: any) => r.name, render: (r: any) => <strong>{r.name}</strong> }, { key: 'qty', label: 'Sold', num: true, sort: (r: any) => r.qty, render: (r: any) => r.qty.toLocaleString() },
            { key: 'revenue', label: 'Sales', num: true, sort: (r: any) => r.revenue, render: (r: any) => rs(r.revenue) }, ...(o.partner ? [] : [{ key: 'margin', label: 'Margin', num: true, sort: (r: any) => r.margin, render: (r: any) => <span style={{ color: r.margin < 55 ? 'var(--cherry)' : undefined }}>{r.margin}%</span> }])]} />
      </div>
    </div>
  );
}

/* ============================== Live ============================== */
export function LiveSection() {
  const { stationId, tick, openOrder, setStationId, go } = useDash();
  const { data, error, reload } = useData<any>(`/admin/live${qs({ station_id: stationId })}`, [stationId, tick]);
  const [, force] = useState(0);
  const toast = useToast();
  useEffect(() => { const i = setInterval(() => force((n) => n + 1), 5000); return () => clearInterval(i); }, []);
  if (error) return <ErrorNote error={error} />;
  if (!data) return <Skeleton h={200} n={2} />;
  async function toggle(s: any, k: 'is_open' | 'accepting_orders') {
    try { await api(`/admin/stations/${s.id}`, { method: 'PATCH', body: { [k]: !s[k] } }); reload(); } catch (e: any) { toast(e.message, true); }
  }
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        {data.stations.map((s: any) => {
          const total = s.waiting + s.making + s.ready;
          const hot = s.oldest_seconds > s.prep_target_seconds * 2;
          return (
            <div key={s.id} className={`stcard ${hot ? 'hot' : ''} ${!s.is_open ? 'off' : ''}`}>
              <div className="row between"><div><strong style={{ fontSize: 17 }}>{s.name}</strong><div className="small muted">{s.operator_type === 'partner' ? s.partner_name : 'Sadhai-run'}</div></div>
                <span className={`chip ${s.is_open && s.accepting_orders ? 'hill' : 'marigold'}`}>{!s.is_open ? 'Closed' : !s.accepting_orders ? 'Paused' : 'Taking orders'}</span></div>
              <div className="grid" style={{ gap: 8, gridTemplateColumns: 'repeat(3, 1fr)' }}>
                <div className="card flat stat" style={{ padding: 10 }}><div className="v" style={{ fontSize: 26 }}>{s.waiting}</div><div className="l">Waiting</div></div>
                <div className="card flat stat" style={{ padding: 10 }}><div className="v" style={{ fontSize: 26 }}>{s.making}</div><div className="l">Making</div></div>
                <div className="card flat stat" style={{ padding: 10 }}><div className="v" style={{ fontSize: 26 }}>{s.ready}</div><div className="l">Ready</div></div>
              </div>
              {total > 0 && <p className="small" style={{ color: hot ? 'var(--cherry)' : undefined, fontWeight: hot ? 700 : 400 }}>Oldest order has waited {Math.floor(s.oldest_seconds / 60)}:{String(s.oldest_seconds % 60).padStart(2, '0')}{hot ? ' · running late' : ''}</p>}
              <div className="row between small muted"><span>Today {rs(s.revenue_today)} · {s.cups_today} cups</span><span>{s.orders_1h} orders last hour</span></div>
              <Meter pct={Math.round((s.cups_today / s.breakeven_cups) * 100)} label="Cups today against break-even" />
              <div className="row wrap">
                <button className="btn sm grow" onClick={() => { setStationId(s.id); go('run'); }}>Open station</button>
                <button className={`btn sm ${s.is_open ? 'ghost' : 'hill'}`} onClick={() => toggle(s, 'is_open')}>{s.is_open ? 'Close' : 'Open'}</button>
                <button className={`btn sm ${s.accepting_orders ? 'ghost' : 'hill'}`} onClick={() => toggle(s, 'accepting_orders')}>{s.accepting_orders ? 'Pause' : 'Resume'}</button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="panel">
        <div className="ph"><h3>Live order feed</h3><span className="small muted row" style={{ gap: 6 }}><span className="livedot" />Updates as orders arrive</span></div>
        <div className="col" style={{ gap: 0 }}>
          {data.feed.map((f: any) => (
            <button key={f.id} className="row" style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 4px', borderBottom: '1px solid var(--hairline)' }} onClick={() => openOrder(f.id)}>
              <strong style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: 'var(--cherry)', minWidth: 52 }}>{f.pickup_code}</strong>
              <span className="grow" style={{ minWidth: 0 }}><span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.summary}</span><span className="small muted">{f.customer} · {f.station_name} · {f.channel} · {ago(f.created_at)} ago</span></span>
              <Status s={f.status} /><span className="price">{rs(f.total)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ============================== Orders ============================== */
export function OrdersSection() {
  const { stationId, tick, openOrder } = useDash();
  const [status, setStatus] = useState('');
  const [channel, setChannel] = useState('');
  const { data, error } = useData<any[]>(`/admin/orders${qs({ station_id: stationId, status, limit: 200 })}`, [stationId, status, tick]);
  const rows = (data || []).filter((o) => !channel || o.channel === channel);
  return (
    <div className="panel">
      <div className="ph"><h3>Orders</h3><div className="row wrap"><Seg value={status} onChange={setStatus} options={[{ id: '', label: 'All' }, { id: 'placed,preparing,ready', label: 'Live' }, { id: 'picked_up', label: 'Done' }, { id: 'cancelled', label: 'Cancelled' }]} />
        <Seg value={channel} onChange={setChannel} options={[{ id: '', label: 'Any channel' }, { id: 'app', label: 'App' }, { id: 'qr', label: 'QR' }, { id: 'counter', label: 'Counter' }]} /></div></div>
      <ErrorNote error={error} />
      {!data ? <Skeleton h={50} n={6} /> : (
        <DataTable csvName="orders" rows={rows} onRow={(r: any) => openOrder(r.id)} search={(r: any) => `${r.pickup_code} ${r.customer || ''} ${r.summary || ''} ${r.station_name}`}
          cols={[
            { key: 'code', label: '#', sort: (r: any) => r.pickup_code, render: (r: any) => <strong>{r.pickup_code}</strong> },
            { key: 'when', label: 'When', sort: (r: any) => r.created_at, render: (r: any) => fmtDateTime(r.created_at), csv: (r: any) => r.created_at },
            { key: 'station', label: 'Station', sort: (r: any) => r.station_name, render: (r: any) => r.station_name, hideSm: true },
            { key: 'items', label: 'Items', render: (r: any) => <span className="small">{r.summary}</span>, csv: (r: any) => r.summary },
            { key: 'customer', label: 'Customer', sort: (r: any) => r.customer || '', render: (r: any) => r.customer || 'Walk-in' },
            { key: 'pay', label: 'Pay', sort: (r: any) => r.payment_method, render: (r: any) => r.payment_method },
            { key: 'total', label: 'Total', num: true, sort: (r: any) => r.total, render: (r: any) => rs(r.total) },
            { key: 'status', label: 'Status', sort: (r: any) => r.status, render: (r: any) => <Status s={r.status} />, csv: (r: any) => r.status },
          ]} />
      )}
    </div>
  );
}

/* ============================== Customers ============================== */
const SEG: Record<string, { label: string; tone: string; hint: string }> = {
  new: { label: 'New', tone: 'marigold', hint: 'Joined in the last 14 days' }, active: { label: 'Active', tone: 'hill', hint: 'Ordered in the last 14 days' },
  at_risk: { label: 'Cooling off', tone: 'cherry', hint: 'Last order 15 to 45 days ago' }, lapsed: { label: 'Lapsed', tone: '', hint: 'No order for 45+ days' }, never: { label: 'Never ordered', tone: '', hint: 'Signed up, no order yet' },
};
export function CustomersSection() {
  const { from, days, openCustomer, go } = useDash();
  const ins = useData<any>(`/admin/customers/insights${qs({ from })}`, [days]);
  const list = useData<any[]>('/admin/customers', []);
  if (!ins.data) return <Skeleton h={100} n={3} />;
  const segs: any[] = ins.data.segments;
  const total = segs.reduce((a, s) => a + s.customers, 0) || 1;
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
        {['new', 'active', 'at_risk', 'lapsed', 'never'].map((k) => { const s = segs.find((x) => x.segment === k); return <div key={k} className="kpi"><span className="kl">{SEG[k].label}</span><span className="kv">{s?.customers || 0}</span><span className="small muted">{SEG[k].hint}</span><div className="bar" style={{ marginTop: 6 }}><i style={{ width: `${((s?.customers || 0) / total) * 100}%`, background: k === 'at_risk' ? 'var(--cherry)' : k === 'new' ? 'var(--marigold)' : 'var(--hill)' }} /></div></div>; })}
      </div>
      <div className="cols c-2">
        <div className="panel"><div className="ph"><h3>Top customers</h3><span className="small muted">By spend in this period</span></div>
          <HBars rows={ins.data.top.map((c: any) => ({ id: c.id, label: c.name, sub: `${c.orders} orders`, value: c.spent }))} format={rs} color="var(--hill)" onPick={openCustomer} /></div>
        <div className="panel"><div className="ph"><h3>Win them back</h3><button className="btn sm" onClick={() => go('growth')}>Send a message</button></div>
          <p className="small muted" style={{ marginBottom: 8 }}>Regulars who have gone quiet for two to six weeks.</p>
          {!ins.data.at_risk.length ? <Empty>Nobody is cooling off. Good.</Empty> : <div className="col" style={{ gap: 0 }}>{ins.data.at_risk.map((c: any) => (
            <button key={c.id} style={{ all: 'unset', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 12, padding: '9px 0', borderBottom: '1px solid var(--hairline)' }} onClick={() => openCustomer(c.id)}>
              <span><strong>{c.name}</strong><span className="small muted" style={{ display: 'block' }}>{c.orders} orders · usually {c.favourite || 'coffee'}</span></span><span className="small muted">{ago(c.last_order)} ago</span></button>))}</div>}
        </div>
      </div>
      <div className="panel"><div className="ph"><h3>All customers</h3></div>
        {!list.data ? <Skeleton h={44} n={5} /> : <DataTable csvName="customers" rows={list.data} onRow={(r: any) => openCustomer(r.id)} search={(r: any) => `${r.name} ${r.phone}`}
          cols={[{ key: 'name', label: 'Name', sort: (r: any) => r.name, render: (r: any) => <strong>{r.name}</strong> }, { key: 'phone', label: 'Phone', render: (r: any) => r.phone },
            { key: 'orders', label: 'Orders', num: true, sort: (r: any) => r.orders, render: (r: any) => r.orders }, { key: 'spent', label: 'Spent', num: true, sort: (r: any) => r.spent, render: (r: any) => rs(r.spent) },
            { key: 'last', label: 'Last order', sort: (r: any) => r.last_order || '', render: (r: any) => (r.last_order ? `${ago(r.last_order)} ago` : 'Never'), csv: (r: any) => r.last_order || '' }]} />}
      </div>
    </div>
  );
}
