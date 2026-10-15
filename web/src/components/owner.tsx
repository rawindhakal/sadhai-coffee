'use client';
import { useState } from 'react';
import { api, fmtDate, fmtDateTime, rs, BASE, store } from '@/lib/api';
import { Empty, Field, Loading, Modal, Stat, useData, useToast } from './ui';
import { RangePicker, sinceDays } from './admin';

export function StationsTab() {
  const { data, reload } = useData<any[]>('/admin/stations');
  const users = useData<any[]>('/owner/users?role=manager');
  const toast = useToast();
  const [edit, setEdit] = useState<any>(null);
  const blank = { code: '', name: '', name_ne: '', address: '', district: '', lat: '', lng: '', opens: '07:00', closes: '20:00', order_letter: 'E', breakeven_cups: 220, manager_ids: [] as string[], operator_type: 'company', partner_name: '', partner_phone: '', revenue_share_pct: 0 };
  async function save() {
    const body: any = { ...edit, lat: edit.lat ? Number(edit.lat) : undefined, lng: edit.lng ? Number(edit.lng) : undefined, breakeven_cups: Number(edit.breakeven_cups) };
    delete body.id; delete body.managers; delete body.partner_phone_; if (!body.partner_name) delete body.partner_name; if (!body.partner_phone) delete body.partner_phone; body.revenue_share_pct = Number(body.revenue_share_pct || 0); delete body.queue; delete body.staff; delete body.created_at; delete body.within_hours;
    try {
      if (edit.id) await api(`/owner/stations/${edit.id}`, { method: 'PATCH', body: { ...body, opens: String(body.opens).slice(0, 5), closes: String(body.closes).slice(0, 5) } });
      else await api('/owner/stations', { method: 'POST', body });
      setEdit(null); reload(); toast('Station saved');
    } catch (e: any) { toast(e.message, true); }
  }
  if (!data) return <Loading />;
  return (
    <>
      <div className="row between" style={{ marginBottom: 12 }}><h3>Stations</h3><button className="btn primary sm" onClick={() => setEdit(blank)}>Open a new station</button></div>
      <div className="card tablewrap" style={{ padding: 0 }}><table><thead><tr><th>Code</th><th>Name</th><th>Hours</th><th>Managers</th><th className="num">Staff</th><th className="num">Queue</th><th /></tr></thead>
        <tbody>{data.map((s) => <tr key={s.id}><td><strong>{s.code}</strong></td><td>{s.name} {!s.active && <span className="chip">Closed down</span>}</td><td>{String(s.opens).slice(0, 5)}–{String(s.closes).slice(0, 5)}</td><td>{s.operator_type === 'partner' ? <span className="chip">{s.partner_name} · {s.revenue_share_pct}%</span> : <span className="chip hill">Sadhai-run</span>} {s.managers.map((m: any) => m.name).join(', ')}</td><td className="num">{s.staff}</td><td className="num">{s.queue}</td>
          <td className="right"><button className="btn sm" onClick={() => setEdit({ ...s, manager_ids: s.managers.map((m: any) => m.id), lat: s.lat ?? '', lng: s.lng ?? '' })}>Edit</button></td></tr>)}</tbody></table></div>
      {edit && (
        <Modal title={edit.id ? 'Edit station' : 'New station'} onClose={() => setEdit(null)}>
          <div className="col">
            <div className="grid g2"><Field label="Code"><input value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value.toUpperCase() })} disabled={!!edit.id} /></Field><Field label="Order letter"><input maxLength={1} value={edit.order_letter} onChange={(e) => setEdit({ ...edit, order_letter: e.target.value.toUpperCase() })} /></Field></div>
            <Field label="Name"><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Name in Nepali"><input value={edit.name_ne || ''} onChange={(e) => setEdit({ ...edit, name_ne: e.target.value })} /></Field>
            <Field label="Address"><input value={edit.address || ''} onChange={(e) => setEdit({ ...edit, address: e.target.value })} /></Field>
            <div className="grid g2"><Field label="Latitude"><input value={edit.lat} onChange={(e) => setEdit({ ...edit, lat: e.target.value })} /></Field><Field label="Longitude"><input value={edit.lng} onChange={(e) => setEdit({ ...edit, lng: e.target.value })} /></Field></div>
            <div className="grid g3"><Field label="Opens"><input type="time" value={String(edit.opens).slice(0, 5)} onChange={(e) => setEdit({ ...edit, opens: e.target.value })} /></Field><Field label="Closes"><input type="time" value={String(edit.closes).slice(0, 5)} onChange={(e) => setEdit({ ...edit, closes: e.target.value })} /></Field><Field label="Break-even cups / day"><input type="number" value={edit.breakeven_cups} onChange={(e) => setEdit({ ...edit, breakeven_cups: e.target.value })} /></Field></div>
            <Field label="Run by"><select value={edit.operator_type} onChange={(e) => setEdit({ ...edit, operator_type: e.target.value })}><option value="company">Sadhai</option><option value="partner">Partner cafe</option></select></Field>
            {edit.operator_type === 'partner' && <div className="grid g3"><Field label="Cafe name"><input value={edit.partner_name || ''} onChange={(e) => setEdit({ ...edit, partner_name: e.target.value })} /></Field><Field label="Cafe phone"><input value={edit.partner_phone || ''} onChange={(e) => setEdit({ ...edit, partner_phone: e.target.value })} /></Field><Field label="Cafe share of net sales (%)"><input type="number" min={0} max={100} value={edit.revenue_share_pct} onChange={(e) => setEdit({ ...edit, revenue_share_pct: e.target.value })} /></Field></div>}
            <Field label="Managers">
              <div className="col" style={{ gap: 4 }}>{users.data?.map((u) => <label key={u.id} className="row"><input type="checkbox" style={{ width: 20, minHeight: 20 }} checked={edit.manager_ids.includes(u.id)} onChange={(e) => setEdit({ ...edit, manager_ids: e.target.checked ? [...edit.manager_ids, u.id] : edit.manager_ids.filter((x: string) => x !== u.id) })} />{u.name}</label>)}</div>
            </Field>
            {edit.id && <label className="row"><input type="checkbox" style={{ width: 20, minHeight: 20 }} checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} />Station is active</label>}
            <button className="btn primary" onClick={save}>Save</button>
          </div>
        </Modal>
      )}
    </>
  );
}

export function MenuTab() {
  const { data, reload } = useData<any>('/owner/menu');
  const toast = useToast();
  const [edit, setEdit] = useState<any>(null);
  if (!data) return <Loading />;
  const blank = { sku: '', name: '', name_ne: '', description: '', price: 150, cost: 45, category_id: data.categories[0]?.id, prep_seconds: 90, is_signature: false, is_seasonal: false, pass_eligible: true, active: true };
  async function save() {
    const { id, category, option_groups, recipe, created_at, ...b } = edit;
    try {
      b.price = Number(b.price); b.cost = Number(b.cost); b.prep_seconds = Number(b.prep_seconds);
      for (const k of Object.keys(b)) if (b[k] === null || b[k] === '') delete b[k];
      if (id) await api(`/owner/products/${id}`, { method: 'PATCH', body: b }); else await api('/owner/products', { method: 'POST', body: b });
      setEdit(null); reload(); toast('Item saved');
    } catch (e: any) { toast(e.message, true); }
  }
  return (
    <>
      <div className="row between" style={{ marginBottom: 12 }}><h3>Menu and prices</h3><button className="btn primary sm" onClick={() => setEdit(blank)}>Add item</button></div>
      <p className="small muted" style={{ marginBottom: 12 }}>Prices are all-in: VAT and service included. Nothing is added at the till.</p>
      <div className="card tablewrap" style={{ padding: 0 }}><table><thead><tr><th>Item</th><th>Category</th><th className="num">Price</th><th className="num">Food cost</th><th className="num">Margin</th><th /></tr></thead>
        <tbody>{data.products.map((p: any) => <tr key={p.id} style={{ opacity: p.active ? 1 : 0.5 }}><td><strong>{p.name}</strong> {p.is_signature && <span className="chip hill">Signature</span>} {p.is_seasonal && <span className="chip marigold">Seasonal</span>}<div className="small muted">{p.name_ne}</div></td><td>{p.category}</td><td className="num">{rs(p.price)}</td><td className="num">{rs(p.cost)}</td><td className="num">{p.price ? Math.round(((p.price - p.cost) / p.price) * 100) : 0}%</td><td className="right"><button className="btn sm" onClick={() => setEdit(p)}>Edit</button></td></tr>)}</tbody></table></div>
      {edit && (
        <Modal title={edit.id ? edit.name : 'New item'} onClose={() => setEdit(null)}>
          <div className="col">
            <div className="grid g2"><Field label="SKU"><input value={edit.sku} disabled={!!edit.id} onChange={(e) => setEdit({ ...edit, sku: e.target.value.toUpperCase() })} /></Field><Field label="Category"><select value={edit.category_id} onChange={(e) => setEdit({ ...edit, category_id: e.target.value })}>{data.categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field></div>
            <Field label="Name"><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Name in Nepali"><input value={edit.name_ne || ''} onChange={(e) => setEdit({ ...edit, name_ne: e.target.value })} /></Field>
            <Field label="Description"><input value={edit.description || ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            <div className="grid g3"><Field label="Price (Rs, all-in)"><input type="number" value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} /></Field><Field label="Food cost (Rs)"><input type="number" value={edit.cost} onChange={(e) => setEdit({ ...edit, cost: e.target.value })} /></Field><Field label="Seconds to make"><input type="number" value={edit.prep_seconds} onChange={(e) => setEdit({ ...edit, prep_seconds: e.target.value })} /></Field></div>
            {([['is_signature', 'Signature item'], ['is_seasonal', 'Seasonal'], ['pass_eligible', 'Covered by the 10-cup pass'], ['active', 'On the menu']] as const).map(([k, l]) => <label key={k} className="row"><input type="checkbox" style={{ width: 20, minHeight: 20 }} checked={!!edit[k]} onChange={(e) => setEdit({ ...edit, [k]: e.target.checked })} />{l}</label>)}
            <button className="btn primary" onClick={save}>Save</button>
          </div>
        </Modal>
      )}
    </>
  );
}

export function DropsTab() {
  const drops = useData<any[]>('/admin/drops');
  const menu = useData<any>('/owner/menu');
  const toast = useToast();
  const [f, setF] = useState<any>(null);
  async function create() {
    try {
      await api('/owner/drops', { method: 'POST', body: { name: f.name, partner: f.partner || undefined, product_id: f.product_id, price: Number(f.price), cap: Number(f.cap), starts_at: new Date().toISOString(), ends_at: new Date(Date.now() + Number(f.days) * 86400000).toISOString() } });
      setF(null); drops.reload(); toast('Drop is live');
    } catch (e: any) { toast(e.message, true); }
  }
  if (!drops.data) return <Loading />;
  return (
    <>
      <div className="row between" style={{ marginBottom: 12 }}><h3>Limited drops</h3><button className="btn primary sm" onClick={() => setF({ name: '', partner: '', product_id: menu.data?.products[0]?.id, price: 169, cap: 3000, days: 30 })}>New drop</button></div>
      <p className="small muted" style={{ marginBottom: 12 }}>One capped drink a month with a local partner. Start at 3,000 cups and pass the food-cost check first.</p>
      {!drops.data.length ? <Empty>No drops yet.</Empty> : <div className="col">{drops.data.map((d) => (
        <div key={d.id} className="card"><div className="row between"><div><h3>{d.name}</h3><p className="small muted">{d.partner} · {d.product_name} · {rs(d.price)} · until {fmtDate(d.ends_at)}</p></div>
          <button className={`btn sm ${d.active ? 'ghost' : 'hill'}`} onClick={async () => { await api(`/owner/drops/${d.id}`, { method: 'PATCH', body: { active: !d.active } }); drops.reload(); }}>{d.active ? 'Stop' : 'Resume'}</button></div>
          <div className="bar" style={{ margin: '12px 0 4px' }}><i style={{ width: `${Math.min(100, (d.sold / d.cap) * 100)}%` }} /></div><p className="small">{d.sold.toLocaleString()} of {d.cap.toLocaleString()} cups sold</p></div>
      ))}</div>}
      {f && (
        <Modal title="New drop" onClose={() => setF(null)}>
          <div className="col">
            <Field label="Name"><input value={f.name} placeholder="Drop 02: Suntala cold brew" onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="Partner"><input value={f.partner} onChange={(e) => setF({ ...f, partner: e.target.value })} /></Field>
            <Field label="Item"><select value={f.product_id} onChange={(e) => setF({ ...f, product_id: e.target.value })}>{menu.data?.products.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
            <div className="grid g3"><Field label="Drop price"><input type="number" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></Field><Field label="Cup cap"><input type="number" value={f.cap} onChange={(e) => setF({ ...f, cap: e.target.value })} /></Field><Field label="Days"><input type="number" value={f.days} onChange={(e) => setF({ ...f, days: e.target.value })} /></Field></div>
            <button className="btn primary" onClick={create}>Start the drop</button>
          </div>
        </Modal>
      )}
    </>
  );
}

export function TeamTab() {
  const { data, reload } = useData<any[]>('/owner/users');
  const stations = useData<any[]>('/admin/stations');
  const toast = useToast();
  const [f, setF] = useState<any>(null);
  async function create() { try { await api('/owner/users', { method: 'POST', body: { ...f, station_id: f.role === 'station' ? f.station_id : undefined, managed_station_ids: f.managed } }); setF(null); reload(); toast('User added'); } catch (e: any) { toast(e.message, true); } }
  async function patch(id: string, body: any) { try { await api(`/owner/users/${id}`, { method: 'PATCH', body }); reload(); } catch (e: any) { toast(e.message, true); } }
  if (!data) return <Loading />;
  return (
    <>
      <div className="row between" style={{ marginBottom: 12 }}><h3>Team</h3><button className="btn primary sm" onClick={() => setF({ name: '', phone: '', password: '', role: 'manager', station_id: stations.data?.[0]?.id, managed: [] })}>Add person</button></div>
      <div className="card tablewrap" style={{ padding: 0 }}><table><thead><tr><th>Name</th><th>Role</th><th>Phone</th><th>Station</th><th>Last sign in</th><th /></tr></thead>
        <tbody>{data.map((u) => <tr key={u.id}><td>{u.name} {!u.active && <span className="chip">Off</span>}</td><td><span className="chip">{u.role}</span></td><td>{u.phone}</td><td>{u.station_name || (u.managed_stations.length ? `${u.managed_stations.length} stations` : '–')}</td><td>{u.last_login_at ? fmtDateTime(u.last_login_at) : 'Never'}</td>
          <td className="right"><button className="btn sm" onClick={() => patch(u.id, { active: !u.active })}>{u.active ? 'Deactivate' : 'Activate'}</button> <button className="btn sm ghost" onClick={() => { const p = prompt('New password (6+ characters)'); if (p) patch(u.id, { password: p }); }}>Reset password</button></td></tr>)}</tbody></table></div>
      {f && (
        <Modal title="Add person" onClose={() => setF(null)}>
          <div className="col">
            <Field label="Role"><select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option value="manager">Manager</option><option value="station">Station staff</option><option value="owner">Owner</option></select></Field>
            <Field label="Name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="Mobile number"><input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
            <Field label="Password"><input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
            {f.role === 'station' && <Field label="Station"><select value={f.station_id} onChange={(e) => setF({ ...f, station_id: e.target.value })}>{stations.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>}
            {f.role === 'manager' && <Field label="Stations to manage">{stations.data?.map((s) => <label key={s.id} className="row"><input type="checkbox" style={{ width: 20, minHeight: 20 }} checked={f.managed.includes(s.id)} onChange={(e) => setF({ ...f, managed: e.target.checked ? [...f.managed, s.id] : f.managed.filter((x: string) => x !== s.id) })} />{s.name}</label>)}</Field>}
            <button className="btn primary" onClick={create}>Add</button>
          </div>
        </Modal>
      )}
    </>
  );
}

export function FinanceTab() {
  const [days, setDays] = useState(14);
  const rec = useData<any[]>(`/owner/reconciliation?from=${sinceDays(days)}`, [days]);
  const passes = useData<any[]>('/owner/passes');
  const ov = useData<any>(`/admin/overview?from=${sinceDays(30)}`);
  const toast = useToast();
  const [s, setS] = useState<any>(null);
  async function enter() { try { await api('/owner/settlements', { method: 'POST', body: { provider: s.provider, day: s.day, amount: Number(s.amount) } }); setS(null); rec.reload(); toast('Settlement saved'); } catch (e: any) { toast(e.message, true); } }
  async function csv() {
    const r = await fetch(`${BASE}/owner/export/orders.csv?from=${sinceDays(30)}`, { headers: { Authorization: `Bearer ${store.get()?.access}` } });
    const url = URL.createObjectURL(await r.blob()); const a = document.createElement('a'); a.href = url; a.download = 'sadhai-orders.csv'; a.click(); URL.revokeObjectURL(url);
  }
  return (
    <div className="col" style={{ gap: 20 }}>
      {ov.data && <div className="grid g4">
        <Stat label="Sales, 30 days" value={rs(ov.data.totals.revenue)} />
        <Stat label="Margin after food cost" value={rs(ov.data.totals.gross_margin)} delta={`${Math.round((ov.data.totals.gross_margin / Math.max(1, ov.data.totals.revenue)) * 100)}%`} />
        <Stat label="Passes sold vs cups redeemed" value={`${ov.data.pass.sold} / ${ov.data.pass.redeemed_cups}`} delta={`${ov.data.pass.outstanding_cups} cups still owed`} />
        <Stat label="Related-party passes" value={ov.data.pass.related_party} delta="Keep this at zero" tone={ov.data.pass.related_party ? 'bad' : 'good'} />
      </div>}
      <div className="card tablewrap">
        <div className="row between wrap" style={{ marginBottom: 8 }}><h3>App sales against provider settlements</h3><div className="row"><RangePicker days={days} setDays={setDays} /><button className="btn sm" onClick={() => setS({ provider: 'esewa', day: sinceDays(2), amount: '' })}>Enter settlement</button></div></div>
        <p className="small muted" style={{ marginBottom: 8 }}>Reconcile every month. A difference is usually a provider fee or a refund; anything else needs an explanation.</p>
        {!rec.data ? <Loading /> : !rec.data.length ? <Empty>Nothing to reconcile in this period.</Empty> : <table><thead><tr><th>Day</th><th>Provider</th><th className="num">App says</th><th className="num">Provider paid</th><th className="num">Difference</th></tr></thead>
          <tbody>{rec.data.map((r, i) => <tr key={i}><td>{fmtDate(r.day)}</td><td>{r.provider}</td><td className="num">{rs(r.app_amount)}</td><td className="num">{r.settled == null ? <span className="chip marigold">Not entered</span> : rs(r.settled)}</td><td className="num" style={{ color: r.diff ? 'var(--cherry)' : undefined, fontWeight: r.diff ? 700 : 400 }}>{r.settled == null ? '–' : r.diff ? rs(r.diff) : 'Matches'}</td></tr>)}</tbody></table>}
      </div>
      <div className="card tablewrap">
        <div className="row between"><h3 style={{ marginBottom: 8 }}>Pass register</h3><button className="btn sm" onClick={csv}>Export orders (CSV)</button></div>
        {!passes.data ? <Loading /> : <table><thead><tr><th>Customer</th><th>Bought</th><th className="num">Used</th><th>Status</th><th>Related party</th></tr></thead>
          <tbody>{passes.data.slice(0, 20).map((p) => <tr key={p.id}><td>{p.name}<div className="small muted">{p.phone}</div></td><td>{fmtDate(p.purchased_at)} · {rs(p.price_paid)}</td><td className="num">{p.used_cups} / {p.total_cups}</td><td>{p.status}</td><td><input type="checkbox" style={{ width: 20, minHeight: 20 }} checked={p.related_party} aria-label="Related party" onChange={async (e) => { await api(`/owner/passes/${p.id}`, { method: 'PATCH', body: { related_party: e.target.checked } }); passes.reload(); }} /></td></tr>)}</tbody></table>}
      </div>
      {s && (
        <Modal title="Provider settlement" onClose={() => setS(null)}>
          <div className="col">
            <Field label="Provider"><select value={s.provider} onChange={(e) => setS({ ...s, provider: e.target.value })}><option value="esewa">eSewa</option><option value="khalti">Khalti</option><option value="fonepay">Fonepay</option></select></Field>
            <Field label="Sales day"><input type="date" value={s.day} onChange={(e) => setS({ ...s, day: e.target.value })} /></Field>
            <Field label="Amount credited to the bank (Rs)"><input type="number" value={s.amount} onChange={(e) => setS({ ...s, amount: e.target.value })} /></Field>
            <button className="btn primary" disabled={s.amount === ''} onClick={enter}>Save</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function GrowthTab() {
  const [days, setDays] = useState(30);
  const { data: o } = useData<any>(`/admin/overview?from=${sinceDays(days)}`, [days]);
  const set = useData<any>('/owner/settings');
  const toast = useToast();
  const [msg, setMsg] = useState({ title: '', body: '', segment: 'all' });
  if (!o) return <Loading />;
  const g = o.growth;
  async function send() { try { const r = await api('/owner/broadcast', { method: 'POST', body: msg }); toast(`Sent to ${r.sent} customers`); setMsg({ title: '', body: '', segment: 'all' }); } catch (e: any) { toast(e.message, true); } }
  return (
    <div className="col" style={{ gap: 20 }}>
      <RangePicker days={days} setDays={setDays} />
      <div className="grid g4">
        <Stat label="Repeat rate within 90 days" value={g.repeat_rate_90d_pct == null ? 'Too early' : `${g.repeat_rate_90d_pct}%`} delta="Target 35 to 45%" />
        <Stat label="Orders through the app or QR" value={`${o.totals.app_share_pct}%`} />
        <Stat label="Cost per acquired customer" value={g.cost_per_acquired_customer == null ? '–' : rs(g.cost_per_acquired_customer)} delta="Offer spend ÷ new customers" />
        <Stat label="New customers" value={g.new_customers} delta={`${g.total_customers} in total`} />
      </div>
      <div className="card tablewrap"><h3 style={{ marginBottom: 8 }}>Offer spend</h3>
        {!g.offers.length ? <Empty>No offers used in this period.</Empty> : <table><thead><tr><th>Offer</th><th className="num">Uses</th><th className="num">Spend</th></tr></thead><tbody>{g.offers.map((x: any) => <tr key={x.kind}><td>{({ first_cup: 'Free first cup', pct: '30% off ladder', referral_cup: 'Referral cup', promo: 'Promo codes', pass: '10-cup pass' } as any)[x.kind] || x.kind}</td><td className="num">{x.uses}</td><td className="num">{rs(x.spend)}</td></tr>)}</tbody></table>}
        <p className="small muted" style={{ marginTop: 8 }}>Stop any rung whose payback is longer than {set.data?.offer_payback_max_days ?? 30} days.</p>
      </div>
      <div className="card tablewrap"><h3 style={{ marginBottom: 8 }}>Payment mix</h3><table><thead><tr><th>Method</th><th className="num">Orders</th><th className="num">Sales</th></tr></thead><tbody>{o.payment_mix.map((m: any) => <tr key={m.provider}><td>{m.provider}</td><td className="num">{m.orders}</td><td className="num">{rs(m.revenue)}</td></tr>)}</tbody></table></div>
      <div className="card col">
        <h3>Send a message</h3>
        <p className="small muted">One push a day at most per customer. Plain copy, no guilt: “Your Americano, Rs 99 until Sunday.”</p>
        <Field label="Title"><input maxLength={80} value={msg.title} onChange={(e) => setMsg({ ...msg, title: e.target.value })} /></Field>
        <Field label="Message"><input maxLength={200} value={msg.body} onChange={(e) => setMsg({ ...msg, body: e.target.value })} /></Field>
        <Field label="Who"><select value={msg.segment} onChange={(e) => setMsg({ ...msg, segment: e.target.value })}><option value="all">All customers</option><option value="inactive_14d">Not ordered in 14 days</option></select></Field>
        <button className="btn primary" disabled={msg.title.length < 3} onClick={send}>Send</button>
      </div>
    </div>
  );
}

export function SettingsTab() {
  const { data, reload } = useData<Record<string, number>>('/owner/settings');
  const toast = useToast();
  const [v, setV] = useState<Record<string, string>>({});
  if (!data) return <Loading />;
  const labels: Record<string, string> = { pass_price: 'Pass price (Rs)', pass_cups: 'Cups in a pass', pass_valid_days: 'Pass validity (days)', first_cup_days: 'Free first cup valid (days)', first_cup_max: 'Free cup covers up to (Rs)', ladder_count: 'Coupons after the first cup', ladder_pct: 'Coupon percent off', ladder_days: 'Coupons valid (days)', referral_cap_month: 'Referral cups per month', referral_cup_max: 'Referral cup covers up to (Rs)', promo_push_daily_cap: 'Promo messages per day', offer_payback_max_days: 'Longest allowed payback (days)' };
  async function save() { try { await api('/owner/settings', { method: 'PUT', body: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, Number(x)])) }); setV({}); reload(); toast('Settings saved'); } catch (e: any) { toast(e.message, true); } }
  return (
    <div className="card col">
      <h3>Offers and loyalty rules</h3>
      <div className="grid g3">{Object.keys(labels).map((k) => <Field key={k} label={labels[k]}><input type="number" value={v[k] ?? data[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></Field>)}</div>
      <button className="btn primary" disabled={!Object.keys(v).length} onClick={save}>Save changes</button>
    </div>
  );
}

export function AuditTab() {
  const { data } = useData<any[]>('/owner/audit?limit=150');
  if (!data) return <Loading />;
  return <div className="card tablewrap" style={{ padding: 0 }}><table><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Details</th></tr></thead><tbody>{data.map((a) => <tr key={a.id}><td>{fmtDateTime(a.created_at)}</td><td>{a.actor || 'System'}</td><td>{a.action}</td><td className="small muted">{a.meta ? JSON.stringify(a.meta).slice(0, 90) : ''}</td></tr>)}</tbody></table></div>;
}
