'use client';
import { useState } from 'react';
import { api, fmtDate, fmtDateTime, rs } from '@/lib/api';
import { BarChart, Empty, ErrorNote, Field, LineChart, Loading, Meter, Modal, Stat, Status, useData, useToast } from './ui';

const qs = (o: Record<string, any>) => { const p = Object.entries(o).filter(([, v]) => v); return p.length ? '?' + p.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&') : ''; };

export function StationPicker({ stations, value, onChange, all = true }: { stations: any[]; value: string; onChange: (v: string) => void; all?: boolean }) {
  return (
    <select aria-label="Station" value={value} onChange={(e) => onChange(e.target.value)} style={{ maxWidth: 300 }}>
      {all && <option value="">All my stations</option>}
      {stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
  );
}

export function RangePicker({ days, setDays }: { days: number; setDays: (n: number) => void }) {
  return <div className="row">{[7, 30, 60].map((d) => <button key={d} className={`btn sm ${days === d ? 'primary' : 'ghost'}`} onClick={() => setDays(d)}>{d} days</button>)}</div>;
}
export const sinceDays = (n: number) => new Date(Date.now() - (n - 1) * 86400000).toISOString().slice(0, 10);

export function Overview({ stationId }: { stationId: string }) {
  const [days, setDays] = useState(30);
  const { data: o, error } = useData<any>(`/admin/overview${qs({ station_id: stationId, from: sinceDays(days) })}`, [stationId, days]);
  if (!o) return <><ErrorNote error={error} /><Loading what="Building the numbers" /></>;
  const t = o.totals;
  const hours = Array.from({ length: 13 }, (_, i) => ({ hour: `${i + 7}h`, orders: o.hourly.find((h: any) => h.hour === i + 7)?.orders || 0 }));
  return (
    <div className="col" style={{ gap: 20 }}>
      <RangePicker days={days} setDays={setDays} />
      <div className="grid g4">
        <Stat label="Sales" value={rs(t.revenue)} delta={`${rs(t.gross_margin)} after food cost`} />
        <Stat label="Cups a day" value={t.cups_per_day} delta={`${t.cups.toLocaleString()} cups`} />
        <Stat label="Orders" value={t.orders.toLocaleString()} delta={`${rs(t.avg_ticket)} average`} />
        <Stat label="Through the app or QR" value={`${t.app_share_pct}%`} delta="Target: most orders" />
      </div>
      <div className="grid g2">
        <div className="card"><h3 style={{ marginBottom: 12 }}>Sales by day</h3><LineChart data={o.daily} x="day" y="revenue" /></div>
        <div className="card"><h3 style={{ marginBottom: 12 }}>Busiest hours</h3><BarChart data={hours} x="hour" y="orders" /></div>
      </div>
      <div className="card tablewrap">
        <h3 style={{ marginBottom: 8 }}>Stations against break-even</h3>
        <table><thead><tr><th>Station</th><th className="num">Sales</th><th className="num">Cups / day</th><th>Break-even</th></tr></thead>
          <tbody>{o.stations.map((s: any) => <tr key={s.id}><td>{s.name}</td><td className="num">{rs(s.revenue)}</td><td className="num">{s.cups_per_day} / {s.breakeven_cups}</td><td style={{ minWidth: 160 }}><Meter pct={s.breakeven_pct} label={`${s.name} break-even`} /><span className="small muted">{s.breakeven_pct}%</span></td></tr>)}</tbody></table>
      </div>
      <div className="grid g2">
        <div className="card">
          <h3>Service speed</h3>
          <div className="row" style={{ marginTop: 12, gap: 24 }}>
            <div className="stat"><div className="v">{o.service.avg_make_seconds}s</div><div className="l">Average time to make</div></div>
            <div className="stat"><div className="v">{o.service.within_90s_pct ?? '–'}%</div><div className="l">Made within target</div></div>
            <div className="stat"><div className="v">{o.ratings.avg || '–'}</div><div className="l">Rating ({o.ratings.n})</div></div>
          </div>
        </div>
        <div className="card tablewrap">
          <h3 style={{ marginBottom: 8 }}>Best sellers</h3>
          <table><thead><tr><th>Item</th><th className="num">Cups</th><th className="num">Margin</th></tr></thead>
            <tbody>{o.top_products.slice(0, 6).map((p: any) => <tr key={p.name}><td>{p.name}</td><td className="num">{p.qty.toLocaleString()}</td><td className="num">{p.revenue ? Math.round(((p.revenue - p.cost) / p.revenue) * 100) : 0}%</td></tr>)}</tbody></table>
        </div>
      </div>
      {o.low_stock.length > 0 && (
        <div className="card"><h3>Running low</h3><div className="col" style={{ marginTop: 8 }}>{o.low_stock.map((l: any, i: number) => <div key={i} className="row between"><span>{l.ingredient} <span className="muted small">· {l.station}</span></span><span className="chip cherry">{Math.round(l.qty)} {l.unit} left</span></div>)}</div></div>
      )}
      <div className="grid g3">
        <Stat label="10-cup passes sold" value={o.pass.sold} delta={`${o.pass.redemption_pct ?? 0}% of cups redeemed`} />
        <Stat label="Pass cups still owed" value={o.pass.outstanding_cups} delta={`${rs(o.pass.liability_value)} of coffee to serve`} />
        <Stat label="New customers" value={o.growth.new_customers} delta={`${o.growth.total_customers} in total`} />
      </div>
    </div>
  );
}

export function OrdersTab({ stationId }: { stationId: string }) {
  const [status, setStatus] = useState('');
  const { data, error, reload } = useData<any[]>(`/admin/orders${qs({ station_id: stationId, status, limit: 60 })}`, [stationId, status]);
  const [sel, setSel] = useState<any>(null);
  const toast = useToast();
  const [reason, setReason] = useState('');
  async function refund() {
    try { await api(`/admin/orders/${sel.id}/refund`, { method: 'POST', body: { reason } }); toast('Refund recorded'); setSel(null); setReason(''); reload(); } catch (e: any) { toast(e.message, true); }
  }
  return (
    <>
      <div className="row wrap" style={{ marginBottom: 12 }}>{['', 'placed,preparing,ready', 'picked_up', 'cancelled'].map((s) => <button key={s} className={`btn sm ${status === s ? 'primary' : 'ghost'}`} onClick={() => setStatus(s)}>{s === '' ? 'All' : s.startsWith('placed') ? 'Live' : s === 'picked_up' ? 'Done' : 'Cancelled'}</button>)}</div>
      <ErrorNote error={error} />
      {!data ? <Loading /> : (
        <div className="card tablewrap" style={{ padding: 0 }}><table>
          <thead><tr><th>#</th><th>When</th><th>Station</th><th>Items</th><th>Customer</th><th>Pay</th><th className="num">Total</th><th>Status</th><th /></tr></thead>
          <tbody>{data.map((o) => <tr key={o.id}><td><strong>{o.pickup_code}</strong></td><td>{fmtDateTime(o.created_at)}</td><td>{o.station_name}</td><td>{o.summary}</td><td>{o.customer || 'Walk-in'}</td><td>{o.payment_method}</td><td className="num">{rs(o.total)}</td><td><Status s={o.status} /></td><td><button className="btn sm" onClick={() => setSel(o)}>Refund</button></td></tr>)}</tbody></table></div>
      )}
      {sel && (
        <Modal title={`Refund ${sel.pickup_code}`} onClose={() => setSel(null)}>
          <p className="muted">{sel.summary} · {rs(sel.total)} · {sel.payment_method}. Digital refunds are sent from the provider dashboard; this records the refund and frees any coupon or pass cup.</p>
          <div style={{ margin: '12px 0' }}><Field label="Reason"><input value={reason} onChange={(e) => setReason(e.target.value)} /></Field></div>
          <button className="btn danger block" disabled={reason.length < 3} onClick={refund}>Refund this order</button>
        </Modal>
      )}
    </>
  );
}

export function StaffTab({ stations, stationId }: { stations: any[]; stationId: string }) {
  const { data, reload } = useData<any[]>(`/admin/staff${qs({ station_id: stationId })}`, [stationId]);
  const toast = useToast();
  const [add, setAdd] = useState(false);
  const [f, setF] = useState({ name: '', phone: '', password: '', station_id: stationId || stations[0]?.id });
  async function create() { try { await api('/admin/staff', { method: 'POST', body: f }); setAdd(false); setF({ ...f, name: '', phone: '', password: '' }); reload(); toast('Staff member added'); } catch (e: any) { toast(e.message, true); } }
  async function patch(id: string, body: any) { try { await api(`/admin/staff/${id}`, { method: 'PATCH', body }); reload(); } catch (e: any) { toast(e.message, true); } }
  return (
    <>
      <div className="row between" style={{ marginBottom: 12 }}><h3>Station staff</h3><button className="btn primary sm" onClick={() => setAdd(true)}>Add staff</button></div>
      {!data ? <Loading /> : (
        <div className="card tablewrap" style={{ padding: 0 }}><table><thead><tr><th>Name</th><th>Phone</th><th>Station</th><th>Last sign in</th><th /></tr></thead>
          <tbody>{data.map((u) => <tr key={u.id}><td>{u.name} {!u.active && <span className="chip">Off</span>}</td><td>{u.phone}</td><td>{u.station_name}</td><td>{u.last_login_at ? fmtDateTime(u.last_login_at) : 'Never'}</td>
            <td className="right"><button className="btn sm" onClick={() => patch(u.id, { active: !u.active })}>{u.active ? 'Deactivate' : 'Activate'}</button> <button className="btn sm ghost" onClick={() => { const p = prompt('New password (6+ characters)'); if (p) patch(u.id, { password: p }); }}>Reset password</button></td></tr>)}</tbody></table></div>
      )}
      {add && (
        <Modal title="Add staff" onClose={() => setAdd(false)}>
          <div className="col">
            <Field label="Name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="Mobile number"><input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
            <Field label="Password"><input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
            <Field label="Station"><select value={f.station_id} onChange={(e) => setF({ ...f, station_id: e.target.value })}>{stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
            <button className="btn primary" onClick={create}>Add staff</button>
          </div>
        </Modal>
      )}
    </>
  );
}

export function PromosTab({ stations, isOwner }: { stations: any[]; isOwner: boolean }) {
  const { data, reload } = useData<any[]>('/admin/promos');
  const toast = useToast();
  const [add, setAdd] = useState(false);
  const [f, setF] = useState<any>({ code: '', title: '', pct: 15, min_total: 0, max_uses: '', station_id: isOwner ? '' : stations[0]?.id, days: 14 });
  async function create() {
    try {
      await api('/admin/promos', { method: 'POST', body: { code: f.code, title: f.title, pct: Number(f.pct), min_total: Number(f.min_total), max_uses: f.max_uses ? Number(f.max_uses) : undefined, station_id: f.station_id || undefined, valid_until: new Date(Date.now() + f.days * 86400000).toISOString() } });
      setAdd(false); reload(); toast('Promo code created');
    } catch (e: any) { toast(e.message, true); }
  }
  return (
    <>
      <div className="row between" style={{ marginBottom: 12 }}><h3>Promo codes</h3><button className="btn primary sm" onClick={() => setAdd(true)}>New code</button></div>
      <p className="small muted" style={{ marginBottom: 12 }}>Cap the spend: set a maximum number of uses and an end date. Pause any code that is not paying back within 30 days.</p>
      {!data ? <Loading /> : !data.length ? <Empty>No promo codes yet.</Empty> : (
        <div className="card tablewrap" style={{ padding: 0 }}><table><thead><tr><th>Code</th><th>Offer</th><th>Where</th><th className="num">Used</th><th>Ends</th><th /></tr></thead>
          <tbody>{data.map((p) => <tr key={p.id}><td><strong>{p.code}</strong></td><td>{p.title} · {p.pct}% off{p.min_total ? ` over ${rs(p.min_total)}` : ''}</td><td>{p.station_name || 'All stations'}</td><td className="num">{p.used}{p.max_uses ? ` / ${p.max_uses}` : ''}</td><td>{p.valid_until ? fmtDate(p.valid_until) : 'No end'}</td>
            <td className="right"><button className={`btn sm ${p.active ? 'ghost' : 'hill'}`} onClick={async () => { await api(`/admin/promos/${p.id}`, { method: 'PATCH', body: { active: !p.active } }); reload(); }}>{p.active ? 'Pause' : 'Resume'}</button></td></tr>)}</tbody></table></div>
      )}
      {add && (
        <Modal title="New promo code" onClose={() => setAdd(false)}>
          <div className="col">
            <Field label="Code" hint="Letters and numbers only"><input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} /></Field>
            <Field label="Name for staff"><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
            <div className="grid g2"><Field label="Percent off (max 60)"><input type="number" value={f.pct} onChange={(e) => setF({ ...f, pct: e.target.value })} /></Field><Field label="Minimum spend (Rs)"><input type="number" value={f.min_total} onChange={(e) => setF({ ...f, min_total: e.target.value })} /></Field></div>
            <div className="grid g2"><Field label="Maximum uses"><input type="number" value={f.max_uses} onChange={(e) => setF({ ...f, max_uses: e.target.value })} /></Field><Field label="Valid for (days)"><input type="number" value={f.days} onChange={(e) => setF({ ...f, days: Number(e.target.value) })} /></Field></div>
            <Field label="Station"><select value={f.station_id} onChange={(e) => setF({ ...f, station_id: e.target.value })}>{isOwner && <option value="">All stations</option>}{stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
            <button className="btn primary" onClick={create}>Create</button>
          </div>
        </Modal>
      )}
    </>
  );
}

export function InventoryTab({ stationId }: { stationId: string }) {
  const { data, reload } = useData<any[]>(`/admin/inventory${qs({ station_id: stationId })}`, [stationId]);
  const toast = useToast();
  const [edit, setEdit] = useState<any>(null);
  const [amt, setAmt] = useState('');
  const [mode, setMode] = useState<'restock' | 'adjust' | 'reorder'>('restock');
  if (!data) return <Loading />;
  async function save() {
    try {
      if (mode === 'reorder') await api(`/admin/inventory/${edit.sid}/${edit.id}`, { method: 'PATCH', body: { reorder_level: Number(amt) } });
      else await api(`/admin/inventory/${edit.sid}/${edit.id}`, { method: 'POST', body: mode === 'restock' ? { delta: Number(amt), reason: 'restock' } : { qty: Number(amt), reason: 'adjust' } });
      setEdit(null); setAmt(''); reload(); toast('Saved');
    } catch (e: any) { toast(e.message, true); }
  }
  return (
    <>
      {data.map((st) => (
        <div key={st.station_id} className="card tablewrap" style={{ padding: 0, marginBottom: 16 }}>
          <h3 style={{ padding: '16px 16px 4px' }}>{st.name}</h3>
          <table><thead><tr><th>Ingredient</th><th className="num">On hand</th><th className="num">Reorder at</th><th /></tr></thead>
            <tbody>{st.items.map((i: any) => <tr key={i.id}><td>{i.name} {i.low && <span className="chip cherry">Low</span>}</td><td className="num">{Math.round(i.qty).toLocaleString()} {i.unit}</td><td className="num">{Math.round(i.reorder_level).toLocaleString()}</td><td className="right"><button className="btn sm" onClick={() => setEdit({ ...i, sid: st.station_id, sname: st.name })}>Update</button></td></tr>)}</tbody></table>
        </div>
      ))}
      {edit && (
        <Modal title={`${edit.name} · ${edit.sname}`} onClose={() => setEdit(null)}>
          <div className="row wrap" style={{ marginBottom: 12 }}>{([['restock', 'Add delivery'], ['adjust', 'Set count'], ['reorder', 'Reorder level']] as const).map(([m, l]) => <button key={m} className={`btn sm ${mode === m ? 'primary' : 'ghost'}`} onClick={() => setMode(m)}>{l}</button>)}</div>
          <Field label={`Amount (${edit.unit})`}><input type="number" min="0" value={amt} onChange={(e) => setAmt(e.target.value)} autoFocus /></Field>
          <button className="btn primary block" style={{ marginTop: 16 }} disabled={amt === ''} onClick={save}>Save</button>
        </Modal>
      )}
    </>
  );
}

export function StationMenuTab({ stationId, isOwner }: { stationId: string; isOwner: boolean }) {
  const { data, reload } = useData<any[]>(stationId ? `/admin/stations/${stationId}/products` : null, [stationId]);
  const toast = useToast();
  if (!stationId) return <Empty>Choose one station above to manage its menu.</Empty>;
  if (!data) return <Loading />;
  async function put(p: any, body: any) { try { await api(`/admin/stations/${stationId}/products/${p.id}`, { method: 'PUT', body }); reload(); } catch (e: any) { toast(e.message, true); } }
  return (
    <div className="card tablewrap" style={{ padding: 0 }}><table><thead><tr><th>Item</th><th className="num">Price</th><th className="num">Station price</th><th /></tr></thead>
      <tbody>{data.map((p) => <tr key={p.id}><td>{p.name} <span className="small muted">{p.category}</span></td><td className="num">{rs(p.price)}</td>
        <td className="num">{isOwner ? <input style={{ width: 90, minHeight: 36, textAlign: 'right' }} type="number" defaultValue={p.price_override ?? ''} placeholder={String(p.price)} onBlur={(e) => put(p, { price_override: e.target.value === '' ? null : Number(e.target.value) })} /> : p.price_override ? rs(p.price_override) : '–'}</td>
        <td className="right"><button className={`btn sm ${p.available ? 'ghost' : 'hill'}`} onClick={() => put(p, { available: !p.available })}>{p.available ? 'Selling · pause' : 'Paused · resume'}</button></td></tr>)}</tbody></table></div>
  );
}

export function CashTab({ stationId }: { stationId: string }) {
  const { data } = useData<any[]>(`/admin/cash-closes${qs({ station_id: stationId })}`, [stationId]);
  if (!data) return <Loading />;
  return !data.length ? <Empty>No cash counts yet.</Empty> : (
    <div className="card tablewrap" style={{ padding: 0 }}><table><thead><tr><th>Date</th><th>Station</th><th className="num">Expected</th><th className="num">Counted</th><th className="num">Difference</th><th>Closed by</th></tr></thead>
      <tbody>{data.map((c) => <tr key={c.id}><td>{fmtDate(c.business_date)}</td><td>{c.station_name}</td><td className="num">{rs(c.expected_cash)}</td><td className="num">{rs(c.counted_cash)}</td><td className="num" style={{ color: c.diff ? 'var(--cherry)' : undefined, fontWeight: c.diff ? 700 : 400 }}>{c.diff ? rs(c.diff) : 'Matches'}</td><td>{c.closed_by_name}</td></tr>)}</tbody></table></div>
  );
}

export function ReviewsTab({ stationId }: { stationId: string }) {
  const { data } = useData<any[]>(`/admin/reviews${qs({ station_id: stationId })}`, [stationId]);
  if (!data) return <Loading />;
  return !data.length ? <Empty>No ratings yet.</Empty> : (
    <div className="col">{data.map((r) => <div key={r.id} className="card flat row between"><div><strong>{r.rating} out of 5</strong> <span className="muted small">· {r.pickup_code} · {r.station_name} · {r.customer}</span>{r.rating_note && <div className="small">{r.rating_note}</div>}</div><span className="small muted">{fmtDate(r.created_at)}</span></div>)}</div>
  );
}

/* ---------------- offers of the day (manager + owner) ---------------- */
export function OffersTab({ stations, isOwner }: { stations: any[]; isOwner: boolean }) {
  const { data, reload } = useData<any[]>('/admin/offers');
  const menu = useData<any>('/owner/menu', []); // owner only; managers fall back below
  const prods = useData<any[]>(stations[0] ? `/admin/stations/${stations[0].id}/products` : null);
  const toast = useToast();
  const [f, setF] = useState<any>(null);
  const items: any[] = (isOwner ? menu.data?.products : prods.data) || [];
  const cats: any[] = isOwner ? menu.data?.categories || [] : [];
  const blank = () => ({ title: '', blurb: '', scope: 'product', product_id: items[0]?.id, category_id: cats[0]?.id, mode: 'pct', pct: 15, offer_price: '', station_id: isOwner ? '' : stations[0]?.id, hours: 12, max_uses: '' });
  async function create() {
    try {
      await api('/admin/offers', { method: 'POST', body: {
        title: f.title, blurb: f.blurb || undefined, scope: f.scope, product_id: f.scope === 'product' ? f.product_id : undefined, category_id: f.scope === 'category' ? f.category_id : undefined,
        pct: f.mode === 'pct' ? Number(f.pct) : undefined, offer_price: f.mode === 'price' ? Number(f.offer_price) : undefined,
        station_id: f.station_id || undefined, hours: Number(f.hours), max_uses: f.max_uses ? Number(f.max_uses) : undefined,
      } });
      setF(null); reload(); toast('Offer is live');
    } catch (e: any) { toast(e.message, true); }
  }
  return (
    <>
      <div className="row between" style={{ marginBottom: 8 }}><h3>Offer of the day</h3><button className="btn primary sm" onClick={() => setF(blank())}>New offer</button></div>
      <p className="small muted" style={{ marginBottom: 12 }}>Offers go live in the customer app the moment you save them, at the station you choose. Managers can go up to 40% off and never below food cost. Every offer is recorded in the audit log.</p>
      {!data ? <Loading /> : !data.length ? <Empty>No offers yet.</Empty> : (
        <div className="card tablewrap" style={{ padding: 0 }}><table><thead><tr><th>Offer</th><th>What</th><th>Where</th><th>Ends</th><th className="num">Used</th><th /></tr></thead>
          <tbody>{data.map((o) => <tr key={o.id} style={{ opacity: o.live ? 1 : 0.55 }}><td><strong>{o.title}</strong> {o.live && <span className="chip hill">Live</span>}</td>
            <td>{o.scope === 'product' ? o.product_name : o.scope === 'category' ? o.category_name : 'All drinks'} · {o.offer_price != null ? rs(o.offer_price) : `${o.pct}% off`}</td><td>{o.station_name || 'All stations'}</td><td>{fmtDateTime(o.ends_at)}</td><td className="num">{o.used}{o.max_uses ? ` / ${o.max_uses}` : ''}</td>
            <td className="right">{o.live ? <button className="btn sm ghost" onClick={async () => { await api(`/admin/offers/${o.id}`, { method: 'PATCH', body: { active: false } }); reload(); }}>Stop</button> : null}</td></tr>)}</tbody></table></div>
      )}
      {f && (
        <Modal title="New offer of the day" onClose={() => setF(null)}>
          <div className="col">
            <Field label="Headline"><input value={f.title} placeholder="Americano, Rs 99 today" onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
            <Field label="One line for customers"><input value={f.blurb} maxLength={140} onChange={(e) => setF({ ...f, blurb: e.target.value })} /></Field>
            <Field label="Applies to"><select value={f.scope} onChange={(e) => setF({ ...f, scope: e.target.value })}><option value="product">One item</option>{isOwner && <option value="category">A category</option>}<option value="all_drinks">All drinks</option></select></Field>
            {f.scope === 'product' && <Field label="Item"><select value={f.product_id} onChange={(e) => setF({ ...f, product_id: e.target.value })}>{items.map((p) => <option key={p.id} value={p.id}>{p.name} · {rs(p.price)}</option>)}</select></Field>}
            {f.scope === 'category' && <Field label="Category"><select value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })}>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>}
            <div className="row wrap">
              <button className={`btn sm ${f.mode === 'pct' ? 'primary' : 'ghost'}`} onClick={() => setF({ ...f, mode: 'pct' })}>Percent off</button>
              {f.scope === 'product' && <button className={`btn sm ${f.mode === 'price' ? 'primary' : 'ghost'}`} onClick={() => setF({ ...f, mode: 'price' })}>Fixed price</button>}
            </div>
            {f.mode === 'pct' ? <Field label="Percent off"><input type="number" min={1} max={60} value={f.pct} onChange={(e) => setF({ ...f, pct: e.target.value })} /></Field> : <Field label="Price (Rs, all-in)"><input type="number" value={f.offer_price} onChange={(e) => setF({ ...f, offer_price: e.target.value })} /></Field>}
            <div className="grid g2"><Field label="Runs for (hours)"><input type="number" min={1} value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} /></Field><Field label="Cup limit (optional)"><input type="number" value={f.max_uses} onChange={(e) => setF({ ...f, max_uses: e.target.value })} /></Field></div>
            <Field label="Station"><select value={f.station_id} onChange={(e) => setF({ ...f, station_id: e.target.value })}>{isOwner && <option value="">All stations</option>}{stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
            <button className="btn primary" disabled={f.title.length < 3} onClick={create}>Publish offer</button>
          </div>
        </Modal>
      )}
    </>
  );
}

/* ---------------- accountability: scorecard + partner statement ---------------- */
export function PartnerStatementCard({ s, settle }: { s: any; settle?: (s: any) => void }) {
  const due = s.net_due;
  return (
    <div className="card">
      <div className="row between wrap"><div><h3>{s.station.name}</h3><p className="small muted">{s.station.partner_name} · cafe keeps {s.station.revenue_share_pct}% of net sales</p></div>
        {s.settled ? <span className="chip hill">Settled · {s.settled.reference}</span> : settle && s.station.operator_type === 'partner' ? <button className="btn sm primary" onClick={() => settle(s)}>Mark settled</button> : null}</div>
      <div className="grid g4" style={{ marginTop: 12 }}>
        <Stat label="Net sales" value={rs(s.net_sales)} delta={`${s.orders} orders · ${s.pass_cups} pass cups`} />
        <Stat label="Cafe share" value={rs(s.partner_share)} />
        <Stat label="Cash the cafe holds" value={rs(s.cash_held)} delta="Belongs to Sadhai" />
        <Stat label={due >= 0 ? 'Sadhai pays the cafe' : 'Cafe remits to Sadhai'} value={rs(Math.abs(due))} tone={due >= 0 ? 'good' : 'bad'} delta={`${rs(s.digital_held_by_sadhai)} paid digitally to Sadhai`} />
      </div>
      <p className="small muted" style={{ marginTop: 8 }}>Pass cups count at the pass’s per-cup value so the cafe is paid for them. Refunds in the period: {rs(s.refunds)}.</p>
    </div>
  );
}

export function AccountabilityTab({ stationId, isOwner }: { stationId: string; isOwner: boolean }) {
  const [days, setDays] = useState(30);
  const from = sinceDays(days);
  const sc = useData<any>(`/admin/scorecard${qs({ station_id: stationId, from })}`, [stationId, days]);
  const st = useData<any[]>(`/admin/partner-statement${qs({ station_id: stationId, from })}`, [stationId, days]);
  const toast = useToast();
  async function settle(s: any) {
    const reference = prompt(`Reference for this settlement (bank transfer or cash remittance) for ${s.station.name}`);
    if (!reference) return;
    try { await api(`/owner/partners/${s.station.id}/settle`, { method: 'POST', body: { from, to: new Date().toISOString().slice(0, 10), reference } }); toast('Settlement recorded'); st.reload(); } catch (e: any) { toast(e.message, true); }
  }
  return (
    <div className="col" style={{ gap: 20 }}>
      <RangePicker days={days} setDays={setDays} />
      {st.data && st.data.length > 0 && <><h3>Partner cafe statements</h3>{st.data.map((s) => <PartnerStatementCard key={s.station.id} s={s} settle={isOwner ? settle : undefined} />)}</>}
      <h3>Station scorecard</h3>
      {!sc.data ? <Loading /> : (
        <>
          <div className="card tablewrap" style={{ padding: 0 }}><table><thead><tr><th>Station</th><th className="num">On time</th><th className="num">Cancelled</th><th className="num">Rating</th><th className="num">Discount</th><th className="num">Cash gaps</th><th>Watch</th></tr></thead>
            <tbody>{sc.data.stations.map((r: any) => <tr key={r.id}><td><strong>{r.name}</strong><div className="small muted">{r.operator_type === 'partner' ? r.partner_name : 'Sadhai-run'}</div></td>
              <td className="num">{r.on_time_pct ?? '–'}%</td><td className="num">{r.cancel_pct}%</td><td className="num">{r.rated ? r.rating : '–'}</td><td className="num">{r.discount_pct}%</td><td className="num">{r.cash_diff_days} days · {rs(r.cash_diff)}</td>
              <td>{r.flags.length ? r.flags.map((x: string) => <div key={x} className="chip cherry" style={{ margin: 2 }}>{x}</div>) : <span className="chip hill">Clear</span>}</td></tr>)}</tbody></table></div>
          <h3>Staff</h3>
          <div className="card tablewrap" style={{ padding: 0 }}><table><thead><tr><th>Name</th><th>Station</th><th className="num">Drinks made</th><th className="num">Average time</th><th className="num">Rushed (&lt;12s)</th><th className="num">Cancels</th><th className="num">Cash marked</th></tr></thead>
            <tbody>{sc.data.staff.map((u: any) => <tr key={u.id}><td>{u.name}</td><td>{u.station}</td><td className="num">{u.orders_made}</td><td className="num">{u.avg_make_seconds}s</td><td className="num" style={{ color: u.rushed > 3 ? 'var(--cherry)' : undefined, fontWeight: u.rushed > 3 ? 700 : 400 }}>{u.rushed}</td><td className="num">{u.cancels}</td><td className="num">{u.cash_marked}</td></tr>)}</tbody></table></div>
          <p className="small muted">Every order records who started it and who marked it ready. Orders marked ready in under 12 seconds, unmatched cash counts and unusual cancellations are flagged so each counter stays accountable, whoever runs it.</p>
        </>
      )}
    </div>
  );
}
