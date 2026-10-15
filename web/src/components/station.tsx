'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, ago, fmtTime, rs } from '@/lib/api';
import { useEvents } from '@/lib/auth';
import { Empty, ErrorNote, Field, Loading, Modal, Stat, Status, Tabs, useData, useToast } from './ui';
import { CountPanel, TransfersPanel } from './inventory';
import { MyShift } from './people';

/** Station workspace. Staff are pinned to their station; managers/owners pass stationId. */
export function StationWorkspace({ stationId, forcedTab }: { stationId?: string; forcedTab?: 'queue' | 'pos' | 'menu' | 'stock' | 'close' | 'recipes' | 'shift' }) {
  const q = stationId ? `?station_id=${stationId}` : '';
  const qa = (p: string) => `${p}${q}`;
  const [tabState, setTab] = useState<'queue' | 'pos' | 'menu' | 'stock' | 'close' | 'recipes' | 'shift'>('queue');
  const tab = forcedTab || tabState;
  const summary = useData<any>(qa('/station/summary'), [stationId]);
  const toast = useToast();

  useEvents((ev) => { if (['order_new', 'order', 'stock', 'station'].includes(ev)) summary.reload(); });
  const s = summary.data;
  async function toggle(k: 'is_open' | 'accepting_orders') {
    try { await api(qa('/station'), { method: 'PATCH', body: { [k]: !s.station[k] } }); summary.reload(); } catch (e: any) { toast(e.message, true); }
  }
  if (!s) return <><ErrorNote error={summary.error} /><Loading /></>;
  return (
    <>
      <div className="row between wrap" style={{ marginBottom: 8 }}>
        <div><p className="label">{s.station.code}</p><h2>{s.station.name}</h2></div>
        <div className="row wrap">
          <button className={`btn sm ${s.station.is_open ? 'hill' : 'primary'}`} onClick={() => toggle('is_open')}>{s.station.is_open ? 'Open · tap to close' : 'Closed · tap to open'}</button>
          <button className={`btn sm ${s.station.accepting_orders ? 'ghost' : 'primary'}`} onClick={() => toggle('accepting_orders')}>{s.station.accepting_orders ? 'Pause new orders' : 'Resume orders'}</button>
        </div>
      </div>
      <div className="grid g4" style={{ marginBottom: 8 }}>
        <Stat label="Waiting" value={s.queue.waiting} /><Stat label="Making" value={s.queue.making} /><Stat label="Ready" value={s.queue.ready} />
        <Stat label="Cups today" value={s.today.cups} delta={`${Math.round((s.today.cups / s.station.breakeven_cups) * 100)}% of break-even`} />
      </div>
      {!forcedTab && <Tabs value={tab} onChange={setTab} tabs={[{ id: 'queue', label: 'Queue' }, { id: 'pos', label: 'New order' }, { id: 'menu', label: 'Sold out' }, { id: 'stock', label: 'Stock' }, { id: 'close', label: 'Close day' }, { id: 'recipes', label: 'Recipes' }, { id: 'shift', label: 'My shift' }]} />}
      {tab === 'queue' && <Queue q={q} target={s.station.prep_target_seconds} onChange={summary.reload} />}
      {tab === 'pos' && <Pos q={q} stationId={stationId} onDone={() => { summary.reload(); setTab('queue'); }} />}
      {tab === 'menu' && <SoldOut q={q} />}
      {tab === 'stock' && <Stock q={q} stationId={stationId} />}
      {tab === 'recipes' && <RecipeCards q={q} />}
      {tab === 'shift' && <MyShift />}
      {tab === 'close' && <CloseDay q={q} s={s} reload={summary.reload} />}
    </>
  );
}

function beep() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination); o.frequency.value = 880; g.gain.value = 0.08; o.start(); o.stop(ctx.currentTime + 0.18);
  } catch {}
}

function Queue({ q, target, onChange }: { q: string; target: number; onChange: () => void }) {
  const { data, reload, error } = useData<any[]>(`/station/orders${q}`);
  const [, tick] = useState(0);
  const toast = useToast();
  const [find, setFind] = useState('');
  const [found, setFound] = useState<any>(null);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t); }, []);
  useEvents((ev) => { if (ev === 'order_new') beep(); if (['order_new', 'order'].includes(ev)) { reload(); onChange(); } });

  async function move(id: string, status: string) {
    try { await api(`/station/orders/${id}/status${q}`, { method: 'POST', body: { status } }); reload(); onChange(); setFound(null); } catch (e: any) { toast(e.message, true); }
  }
  async function pay(id: string) { try { await api(`/station/orders/${id}/pay${q}`, { method: 'POST' }); reload(); setFound(null); toast('Cash recorded'); } catch (e: any) { toast(e.message, true); } }
  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    try { setFound(await api(`/station/orders/lookup${q ? q + '&' : '?'}code=${encodeURIComponent(find)}`)); } catch (e: any) { toast(e.message, true); }
  }

  const cols = [['placed', 'New'], ['preparing', 'Making'], ['ready', 'Ready for pickup']] as const;
  return (
    <>
      <form className="row" onSubmit={lookup} style={{ marginBottom: 16, maxWidth: 420 }}><input placeholder="Find by pickup number, e.g. A27" value={find} onChange={(e) => setFind(e.target.value)} /><button className="btn">Find</button></form>
      <ErrorNote error={error} />
      <div className="kanban">
        {cols.map(([st, label]) => {
          const list = (data || []).filter((o) => o.status === st);
          return (
            <div key={st} className="kcol" aria-label={label}>
              <div className="row between"><h4>{label}</h4><span className="chip">{list.length}</span></div>
              {!list.length && <p className="small muted center" style={{ padding: 16 }}>Nothing here.</p>}
              {list.map((o) => <Ticket key={o.id} o={o} target={target} move={move} pay={pay} />)}
            </div>
          );
        })}
      </div>
      {found && (
        <Modal title={`Order ${found.pickup_code}`} onClose={() => setFound(null)}>
          <Ticket o={found} target={target} move={move} pay={pay} bare />
        </Modal>
      )}
    </>
  );
}

function Ticket({ o, target, move, pay, bare }: any) {
  const secs = Math.floor((Date.now() - new Date(o.status === 'ready' ? o.ready_at : o.created_at).getTime()) / 1000);
  const late = ['placed', 'preparing'].includes(o.status) && secs > target;
  const next: Record<string, [string, string]> = { placed: ['preparing', 'Start'], preparing: ['ready', 'Ready'], ready: ['picked_up', 'Handed over'] };
  return (
    <div className={`ticket ${late ? 'late' : ''}`} style={bare ? { border: 0, padding: 0 } : undefined}>
      <div className="row between">
        <span className="code">{o.pickup_code}</span>
        <div className="right">
          {['placed', 'preparing', 'ready'].includes(o.status) && <div className="price" style={{ color: late ? 'var(--cherry)' : undefined }}>{Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}{late ? ' late' : ''}</div>}
          <div className="small muted">{o.channel} · {fmtTime(o.created_at)}</div>
        </div>
      </div>
      <div className="col" style={{ gap: 2, margin: '10px 0' }}>
        {o.items.map((i: any) => <div key={i.id}><strong>{i.qty} × {i.name}</strong><div className="small muted">{i.options?.map((x: any) => x.name).join(', ')}</div></div>)}
        {o.note && <div className="small" style={{ background: 'var(--surface-sunk)', padding: 6, borderRadius: 6 }}>Note: {o.note}</div>}
      </div>
      <div className="row between small"><span>{o.customer_name || o.user_name || 'Walk-in'}</span><span><Status s={o.payment_status} /> {rs(o.total)}</span></div>
      {o.status === 'ready' && o.payment_status === 'unpaid' && o.total > 0 && <p className="small err" style={{ margin: '6px 0' }}>Collect {rs(o.total)} cash at hand-over.</p>}
      <div className="row" style={{ marginTop: 10 }}>
        {next[o.status] && <button className="btn primary grow" onClick={() => move(o.id, next[o.status][0])}>{next[o.status][1]}</button>}
        {o.payment_status === 'unpaid' && o.total > 0 && o.status !== 'cancelled' && <button className="btn sm" onClick={() => pay(o.id)}>Got cash</button>}
        {['placed', 'preparing'].includes(o.status) && <button className="btn danger sm" onClick={() => confirm(`Cancel ${o.pickup_code}?`) && move(o.id, 'cancelled')}>Cancel</button>}
      </div>
    </div>
  );
}

function Pos({ q, stationId, onDone }: { q: string; stationId?: string; onDone: () => void }) {
  const menu = useData<any>(`/station/menu${q}`);
  const toast = useToast();
  const [cart, setCart] = useState<any[]>([]);
  const [phone, setPhone] = useState('');
  const [cust, setCust] = useState<any>(null);
  const [method, setMethod] = useState('cash');
  const [offer, setOffer] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState<any>(null);
  const total = cart.reduce((a, l) => a + l.unit * l.qty, 0);

  async function find() { const v = phone.trim(); const key = v.toUpperCase().startsWith('SP-') ? 'pass_code' : 'phone'; try { setCust(await api(`/station/customers/lookup${q ? q + '&' : '?'}${key}=${encodeURIComponent(v)}`)); } catch (e: any) { toast(e.message, true); setCust(null); } }
  async function place() {
    setBusy(true);
    try {
      const body: any = { items: cart.map((l) => ({ product_id: l.p.id, qty: l.qty, option_ids: l.option_ids })), payment_method: offer === 'pass' ? 'pass' : method, station_id: stationId };
      if (cust) body.customer_phone = cust.phone;
      if (offer && offer !== 'pass') body.coupon_id = offer;
      const out = await api(`/station/orders`, { method: 'POST', body });
      toast(`Order ${out.order.pickup_code} · ${rs(out.order.total)}`); setCart([]); setCust(null); setPhone(''); onDone();
    } catch (e: any) { toast(e.message, true); } finally { setBusy(false); }
  }
  async function sellPass() {
    try { await api(`/station/passes`, { method: 'POST', body: { phone: cust.phone, station_id: stationId } }); toast('Pass sold for cash'); find(); } catch (e: any) { toast(e.message, true); }
  }
  if (!menu.data) return <Loading />;
  return (
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', alignItems: 'start' }}>
      <div className="col">
        {menu.data.categories.map((c: any) => (
          <div key={c.id}><p className="label" style={{ marginBottom: 6 }}>{c.name}</p>
            <div className="grid g4" style={{ gap: 8 }}>
              {c.products.map((p: any) => <button key={p.id} className="btn" disabled={!p.available} style={{ flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left', gap: 2 }} onClick={() => setPicking(p)}><strong>{p.name}</strong><span className="small muted">{p.available ? rs(p.price) : 'Finished'}</span></button>)}
            </div>
          </div>
        ))}
      </div>
      <div className="card col">
        <h3>Counter order</h3>
        {!cart.length && <p className="muted small">Tap an item to add it.</p>}
        {cart.map((l, i) => <div key={i} className="row between"><span>{l.qty} × {l.p.name} <span className="small muted">{l.names.join(', ')}</span></span><span className="row"><span className="price">{rs(l.unit * l.qty)}</span><button className="btn ghost sm" aria-label="Remove" onClick={() => setCart(cart.filter((_, j) => j !== i))}>×</button></span></div>)}
        <div className="row"><input placeholder="Customer phone or pass code (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" /><button className="btn sm" onClick={find}>Find</button></div>
        {cust && (
          <div className="card flat">
            <strong>{cust.name}</strong> <span className="small muted">{cust.beans} beans</span>
            <div className="col" style={{ gap: 4, marginTop: 6 }}>
              <label className="row small"><input type="radio" style={{ width: 18, minHeight: 18 }} checked={offer === ''} onChange={() => setOffer('')} />No offer</label>
              {cust.pass && <label className="row small"><input type="radio" style={{ width: 18, minHeight: 18 }} checked={offer === 'pass'} onChange={() => setOffer('pass')} />10-cup pass ({cust.pass.remaining} cups left{cust.pass.count > 1 ? ` across ${cust.pass.count} passes` : ''})</label>}
              {cust.coupons.map((c: any) => <label key={c.id} className="row small"><input type="radio" style={{ width: 18, minHeight: 18 }} checked={offer === c.id} onChange={() => setOffer(c.id)} />{c.title}</label>)}
              <button className="btn sm" onClick={sellPass}>Sell a 10-cup pass (cash){cust.pass ? ' · another' : ''}</button>
            </div>
          </div>
        )}
        {offer !== 'pass' && <div className="row wrap">{['cash', 'esewa', 'khalti', 'fonepay'].map((m) => <button key={m} className={`btn sm ${method === m ? 'primary' : 'ghost'}`} onClick={() => setMethod(m)}>{m}</button>)}</div>}
        <div className="row between"><strong>Total</strong><strong style={{ fontSize: 24 }}>{rs(total)}</strong></div>
        <p className="small muted">{method === 'cash' && offer !== 'pass' ? 'Collect cash now.' : 'Confirm the payment on the customer’s phone or QR before you tap.'}</p>
        <button className="btn primary lg" disabled={!cart.length || busy} onClick={place}>{busy ? 'Placing…' : 'Take order'}</button>
      </div>
      {picking && <PosItem p={picking} onClose={() => setPicking(null)} onAdd={(l: any) => { setCart([...cart, l]); setPicking(null); }} />}
    </div>
  );
}

function PosItem({ p, onClose, onAdd }: any) {
  const [sel, setSel] = useState<Record<string, string[]>>(Object.fromEntries(p.option_groups.map((g: any) => [g.id, g.options.filter((o: any) => o.is_default).map((o: any) => o.id)])));
  const [qty, setQty] = useState(1);
  const ids = Object.values(sel).flat();
  const opts = p.option_groups.flatMap((g: any) => g.options).filter((o: any) => ids.includes(o.id));
  const unit = p.price + opts.reduce((a: number, o: any) => a + o.price_delta, 0);
  return (
    <Modal title={p.name} onClose={onClose}>
      {p.option_groups.map((g: any) => (
        <div key={g.id} style={{ marginBottom: 12 }}><p className="label">{g.name}</p><div className="row wrap" style={{ marginTop: 6 }}>
          {g.options.map((o: any) => { const on = (sel[g.id] || []).includes(o.id); return <button key={o.id} aria-pressed={on} className={`btn sm ${on ? 'primary' : 'ghost'}`} onClick={() => setSel((s) => ({ ...s, [g.id]: g.multi ? (on ? s[g.id].filter((x) => x !== o.id) : [...s[g.id], o.id]) : (on && !g.required ? [] : [o.id]) }))}>{o.name}{o.price_delta ? ` +${o.price_delta}` : ''}</button>; })}
        </div></div>
      ))}
      <div className="row between"><div className="row"><button className="btn ghost sm" onClick={() => setQty(Math.max(1, qty - 1))}>−</button><strong>{qty}</strong><button className="btn ghost sm" onClick={() => setQty(Math.min(10, qty + 1))}>+</button></div>
        <button className="btn primary" onClick={() => onAdd({ p, qty, unit, option_ids: ids, names: opts.map((o: any) => o.name) })}>Add · {rs(unit * qty)}</button></div>
    </Modal>
  );
}

function SoldOut({ q }: { q: string }) {
  const menu = useData<any>(`/station/menu${q}`);
  const toast = useToast();
  if (!menu.data) return <Loading />;
  async function set(p: any, available: boolean) {
    try { await api(`/station/products/${p.id}/availability${q}`, { method: 'POST', body: { available } }); menu.reload(); } catch (e: any) { toast(e.message, true); }
  }
  return (
    <div className="card" style={{ padding: 0 }}>
      {menu.data.categories.flatMap((c: any) => c.products).map((p: any) => (
        <div key={p.id} className="row between" style={{ padding: 14, borderBottom: '1px solid var(--hairline)' }}>
          <div><strong>{p.name}</strong><div className="small muted">{p.sold_out_reason === 'stock' ? 'Out of an ingredient' : p.sold_out_reason === 'station' ? 'Marked finished' : p.sold_out_reason === 'drop_finished' ? 'Drop finished' : rs(p.price)}</div></div>
          {p.sold_out_reason === 'stock' ? <span className="chip">Restock to sell</span> : <button className={`btn sm ${p.available ? 'ghost' : 'hill'}`} onClick={() => set(p, !p.available)}>{p.available ? 'Mark finished' : 'Back on'}</button>}
        </div>
      ))}
    </div>
  );
}

function Stock({ q, stationId }: { q: string; stationId?: string }) {
  const inv = useData<any[]>(`/station/inventory${q}`);
  const toast = useToast();
  const [edit, setEdit] = useState<any>(null);
  const [amt, setAmt] = useState('');
  const [reason, setReason] = useState('restock');
  if (!inv.data) return <Loading />;
  async function save() {
    try { await api(`/station/inventory/${edit.id}${q}`, { method: 'POST', body: { delta: reason === 'waste' ? -Math.abs(Number(amt)) : Number(amt), reason } }); setEdit(null); setAmt(''); inv.reload(); toast('Stock updated'); } catch (e: any) { toast(e.message, true); }
  }
  return (
    <>
      <div className="card tablewrap" style={{ padding: 0 }}><table>
        <thead><tr><th>Ingredient</th><th className="num">On hand</th><th className="num">Reorder at</th><th /></tr></thead>
        <tbody>{inv.data.map((i) => (
          <tr key={i.id}><td>{i.name} {i.low && <span className="chip cherry">Low</span>}</td><td className="num">{Math.round(i.qty).toLocaleString()} {i.unit}</td><td className="num">{Math.round(i.reorder_level).toLocaleString()}</td><td className="right"><button className="btn sm" onClick={() => setEdit(i)}>Update</button></td></tr>
        ))}</tbody></table></div>
      <div style={{ marginTop: 16 }}><TransfersPanel mode="station" stationId={stationId} /></div>
      <div style={{ marginTop: 16 }}><CountPanel role={stationId ? 'manager' : 'station'} stationId={stationId} /></div>
      {edit && (
        <Modal title={edit.name} onClose={() => setEdit(null)}>
          <div className="row wrap" style={{ marginBottom: 12 }}>{['restock', 'waste'].map((r) => <button key={r} className={`btn sm ${reason === r ? 'primary' : 'ghost'}`} onClick={() => setReason(r)}>{r === 'restock' ? 'Received stock' : 'Wasted'}</button>)}</div>
          <Field label={`Amount (${edit.unit})`}><input type="number" min="0" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} autoFocus /></Field>
          <button className="btn primary block" style={{ marginTop: 16 }} disabled={!Number(amt)} onClick={save}>Save</button>
        </Modal>
      )}
    </>
  );
}

function CloseDay({ q, s, reload }: { q: string; s: any; reload: () => void }) {
  const toast = useToast();
  const [counted, setCounted] = useState('');
  const c = s.cash_close;
  async function close() {
    try { await api(`/station/cash-close${q}`, { method: 'POST', body: { counted_cash: Number(counted) } }); toast('Day closed'); reload(); } catch (e: any) { toast(e.message, true); }
  }
  return (
    <div className="grid g2">
      <div className="card col">
        <h3>Today</h3>
        <div className="row between"><span>Orders</span><strong>{s.today.orders}</strong></div>
        <div className="row between"><span>Cups</span><strong>{s.today.cups}</strong></div>
        <div className="row between"><span>Sales</span><strong>{rs(s.today.revenue)}</strong></div>
        <div className="row between"><span>Average time to make</span><strong>{s.today.avg_make_seconds}s</strong></div>
      </div>
      <div className="card col">
        <h3>Count the cash drawer</h3>
        <div className="row between"><span>Expected cash</span><strong>{rs(s.expected_cash)}</strong></div>
        <Field label="Counted cash (Rs)"><input type="number" min="0" value={counted} onChange={(e) => setCounted(e.target.value)} /></Field>
        {counted !== '' && <p className={Number(counted) - s.expected_cash === 0 ? 'ok' : 'err'}>{Number(counted) - s.expected_cash === 0 ? 'Matches.' : `Difference ${rs(Number(counted) - s.expected_cash)}`}</p>}
        <button className="btn primary" disabled={counted === ''} onClick={close}>Close the day</button>
        {c && <p className="small muted">Closed today: counted {rs(c.counted_cash)}, difference {rs(c.diff)}.</p>}
      </div>
    </div>
  );
}


/** Standard recipe cards: every station makes each drink the same way. */
function RecipeCards({ q }: { q: string }) {
  const { data, error } = useData<any[]>(`/station/recipes${q}`);
  const [find, setFind] = useState('');
  if (error) return <ErrorNote error={error} />;
  if (!data) return <Loading />;
  const list = data.filter((p) => p.name.toLowerCase().includes(find.toLowerCase()));
  return (
    <div className="col" style={{ gap: 12 }}>
      <input type="search" aria-label="Find a recipe" placeholder="Find a drink" value={find} onChange={(e) => setFind(e.target.value)} />
      <div className="grid g3">{list.map((p) => (
        <div key={p.id} className="panel">
          <div className="row between"><strong>{p.name}</strong><span className="chip">v{p.recipe_version}</span></div>
          <p className="small muted">{p.category}</p>
          <ul style={{ margin: '8px 0', paddingLeft: 18 }}>{p.lines.map((l: any) => <li key={l.name}>{l.qty} {l.unit} {l.name.toLowerCase()}</li>)}</ul>
          {Object.entries(p.options).map(([k, v]: any) => <p key={k} className="small"><strong>{k}</strong>: {v.map((l: any) => `${l.qty} ${l.unit} ${l.name.toLowerCase()}`).join(', ')}</p>)}
          {p.recipe_method && <p className="small muted" style={{ marginTop: 8 }}>{p.recipe_method}</p>}
        </div>))}</div>
    </div>
  );
}
