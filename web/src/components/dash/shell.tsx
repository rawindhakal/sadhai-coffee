'use client';
import { Logo } from '../logo';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, fmtDateTime, fmtTime, rs } from '@/lib/api';
import { useAuth, useEvents } from '@/lib/auth';
import { Icon } from '../icons';
import { ErrorNote, Status, useData, useToast } from '../ui';
import { Drawer, Seg, Skeleton } from './kit';

export type Tab = { id: string; label: string };
export type Section = { key: string; label: string; icon: string; group?: string; badge?: number; keywords?: string; tabs?: Tab[] };
type Ctx = {
  role: string; stations: any[]; stationId: string; setStationId: (s: string) => void; days: number; setDays: (n: number) => void; from: string;
  go: (key: string) => void; section: string; sub: string; openOrder: (id: string) => void; openCustomer: (id: string) => void; tick: number; live: boolean;
};
const DashCtx = createContext<Ctx>(null as any);
export const useDash = () => useContext(DashCtx);
export const sinceDays = (n: number) => new Date(Date.now() - (n - 1) * 86400000).toISOString().slice(0, 10);

export function DashShell({ sections, role, children }: { sections: Section[]; role: string; children: (section: string) => React.ReactNode }) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const isStaff = role === 'station';
  const stationsQ = useData<any[]>(isStaff ? null : '/admin/stations');
  const stations = stationsQ.data || [];
  const [section, setSection] = useState(sections[0].key);
  const [subTab, setSubTab] = useState('');
  const [closed, setClosed] = useState<string[]>([]);
  const [stationId, setStationId] = useState('');
  const [days, setDays] = useState(30);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [tick, setTick] = useState(0);
  const [live, setLive] = useState(false);
  const [order, setOrder] = useState<string | null>(null);
  const [customer, setCustomer] = useState<string | null>(null);
  const [palette, setPalette] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);

  // hash routing: #live, #orders ... so links, refresh and the back button all work
  useEffect(() => {
    const read = () => { const [h, t] = location.hash.replace('#', '').split('/'); const s = sections.find((x) => x.key === h); if (s) { setSection(h); setSubTab(s.tabs ? (s.tabs.some((x) => x.id === t) ? t : s.tabs[0].id) : ''); } };
    read(); window.addEventListener('hashchange', read);
    try { setCollapsed(localStorage.getItem('sadhai.collapsed') === '1'); const t = localStorage.getItem('sadhai.theme'); if (t) { setDark(t === 'dark'); document.documentElement.dataset.theme = t; } } catch {}
    return () => window.removeEventListener('hashchange', read);
  }, []);
  const go = useCallback((target: string) => {
    const [key, t] = target.split('/');
    const s = sections.find((x) => x.key === key);
    const next = s?.tabs ? (s.tabs.some((x) => x.id === t) ? t : s.tabs[0].id) : '';
    location.hash = next ? `${key}/${next}` : key; setSection(key); setSubTab(next); setMobileOpen(false);
  }, [sections]);
  const toggleGroup = (g: string) => setClosed((c) => (c.includes(g) ? c.filter((x) => x !== g) : [...c, g]));
  const toggleTheme = () => { const n = dark ? 'light' : 'dark'; setDark(!dark); document.documentElement.dataset.theme = n; try { localStorage.setItem('sadhai.theme', n); } catch {} };
  const toggleCollapse = () => { setCollapsed(!collapsed); try { localStorage.setItem('sadhai.collapsed', collapsed ? '0' : '1'); } catch {} };

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(true); } };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, []);

  useEvents((ev, d) => {
    setLive(true);
    if (ev === 'order_new') toast(`New order ${d.pickup_code}`);
    if (['order_new', 'order', 'stock', 'stock_low', 'station'].includes(ev)) setTick((t) => t + 1);
  });
  useEffect(() => { const t = setTimeout(() => setLive(true), 1500); const i = setInterval(() => setTick((n) => n + 1), 60000); return () => { clearTimeout(t); clearInterval(i); }; }, []);

  const alerts = useData<any[]>(isStaff ? null : '/admin/alerts' + (stationId ? `?station_id=${stationId}` : ''), [stationId, tick]);
  const urgent = (alerts.data || []).filter((a) => a.severity !== 'info').length;

  const ctx: Ctx = useMemo(() => ({ role, stations, stationId, setStationId, days, setDays, from: sinceDays(days), go, section, sub: subTab, openOrder: setOrder, openCustomer: setCustomer, tick, live }), [role, stations, stationId, days, go, section, subTab, tick, live]);
  const cur = sections.find((s) => s.key === section) || sections[0];
  const groups = sections.reduce<Record<string, Section[]>>((a, s) => { (a[s.group || ''] ||= []).push(s); return a; }, {});

  return (
    <DashCtx.Provider value={ctx}>
      <div className={`dash ${collapsed ? 'collapsed' : ''}`}>
        <div className={`overlay-mobile ${mobileOpen ? 'show' : ''}`} onClick={() => setMobileOpen(false)} />
        <aside className={`sidebar ${mobileOpen ? 'open' : ''}`} aria-label="Sections">
          <div className="brandrow"><Logo /></div>
          {Object.entries(groups).map(([g, items]) => {
            const shut = !!g && closed.includes(g) && !items.some((s) => s.key === section);
            return (
              <div key={g} className="navgroup">
                {g && <button className="grouphead" onClick={() => toggleGroup(g)} aria-expanded={!shut}><span>{g}</span><Icon name={shut ? 'chevr' : 'chevd'} size={14} /></button>}
                {!shut && items.map((s) => {
                  const badge = s.badge;
                  const here = section === s.key;
                  return (
                    <div key={s.key}>
                      <button className={`navitem ${here ? 'on' : ''}`} onClick={() => go(s.key)} aria-current={here && !s.tabs ? 'page' : undefined} aria-expanded={s.tabs ? here : undefined} title={s.label}>
                        <Icon name={s.icon} size={20} /><span className="lbl">{s.label}</span>{badge ? <span className="nb">{badge}</span> : null}{s.tabs && <Icon name={here ? 'chevd' : 'chevr'} size={14} />}
                      </button>
                      {here && s.tabs && (
                        <div className="subnav" role="group" aria-label={`${s.label} pages`}>
                          {s.tabs.map((t) => <button key={t.id} className={`subitem ${subTab === t.id ? 'on' : ''}`} onClick={() => go(`${s.key}/${t.id}`)} aria-current={subTab === t.id ? 'page' : undefined}><span className="lbl">{t.label}</span></button>)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
          <div className="grow" />
          <button className="navitem" onClick={toggleCollapse} title="Collapse menu" style={{ opacity: 0.8 }}><Icon name={collapsed ? 'chevr' : 'chevl'} size={20} /><span className="lbl">Collapse</span></button>
        </aside>

        <div className="dmain">
          <header className="dtop">
            <button className="iconbtn" style={{ display: 'none' }} id="burger" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Icon name="menu" size={20} /></button>
            <button className="iconbtn burger" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Icon name="menu" size={20} /></button>
            <div className="titlebox">
              {(cur.group || cur.tabs) && <nav className="crumbs" aria-label="Breadcrumb">{cur.group && <span>{cur.group}</span>}{cur.tabs && <><span aria-hidden>›</span><button onClick={() => go(cur.key)}>{cur.label}</button></>}</nav>}
              <h1>{cur.tabs ? cur.tabs.find((t) => t.id === subTab)?.label || cur.label : cur.label}</h1>
            </div>
            <span className="small muted row" style={{ gap: 6 }}><span className={`livedot ${live ? '' : 'off'}`} />{live ? 'Live' : 'Connecting'}</span>
            <div className="grow" />
            {!isStaff && stations.length > 0 && (
              <select aria-label="Station" value={stationId} onChange={(e) => setStationId(e.target.value)} style={{ width: 'auto', minHeight: 40, padding: '6px 12px', maxWidth: 240 }}>
                <option value="">{role === 'owner' ? 'All stations' : 'All my stations'}</option>
                {stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
            {!isStaff && <Seg value={days} onChange={setDays} options={[{ id: 7, label: '7d' }, { id: 30, label: '30d' }, { id: 60, label: '60d' }]} />}
            {!isStaff && <button className="btn ghost sm" onClick={() => setPalette(true)} aria-label="Search"><Icon name="search" size={16} /><span className="hide-sm">Search</span><kbd className="hide-sm" style={{ fontSize: 11, border: '1px solid var(--hairline)', borderRadius: 4, padding: '0 5px' }}>⌘K</kbd></button>}
            {!isStaff && (
              <div style={{ position: 'relative' }}>
                <button className="iconbtn" onClick={() => setAlertsOpen(!alertsOpen)} aria-label={`Alerts, ${urgent} need attention`} aria-expanded={alertsOpen}><Icon name="bell" size={20} />{urgent > 0 && <span className="nb">{urgent}</span>}</button>
                {alertsOpen && <AlertsPopover alerts={alerts.data} onGo={(s) => { setAlertsOpen(false); go(s); }} />}
              </div>
            )}
            <button className="iconbtn" onClick={toggleTheme} aria-label="Toggle dark mode"><Icon name={dark ? 'sun' : 'moon'} size={20} /></button>
            <button className="btn ghost sm" onClick={async () => { await logout(); router.replace('/'); }}><span className="hide-sm">{user?.name?.split(' ')[0]} · </span>Sign out</button>
          </header>
          <main className="dbody" id="main">{children(section)}</main>
        </div>
      </div>

      {order && <OrderDrawer id={order} onClose={() => setOrder(null)} role={role} />}
      {customer && <CustomerDrawer id={customer} onClose={() => setCustomer(null)} openOrder={(id) => { setCustomer(null); setOrder(id); }} />}
      {palette && <Palette sections={sections} onClose={() => setPalette(false)} go={(s) => { setPalette(false); go(s); }} openOrder={(id) => { setPalette(false); setOrder(id); }} openCustomer={(id) => { setPalette(false); setCustomer(id); }} stationId={stationId} />}
    </DashCtx.Provider>
  );
}

function AlertsPopover({ alerts, onGo }: { alerts: any[] | null; onGo: (s: string) => void }) {
  return (
    <div className="popover" role="dialog" aria-label="Alerts">
      <div className="row between"><strong>Needs attention</strong><span className="small muted">{alerts?.length || 0} items</span></div>
      {!alerts ? <Skeleton h={60} n={2} /> : !alerts.length ? <p className="muted center" style={{ padding: 16 }}>All clear. Nothing needs you right now.</p> : alerts.map((a, i) => (
        <div key={i} className="alertrow"><span className={`sev ${a.severity}`} /><div className="grow"><strong style={{ fontSize: 15 }}>{a.title}</strong><div className="small muted">{a.detail}</div></div><button className="btn sm" onClick={() => onGo(a.section)}>Open</button></div>
      ))}
    </div>
  );
}

export function AlertsPanel({ limit = 5 }: { limit?: number }) {
  const { stationId, tick, go } = useDash();
  const { data } = useData<any[]>('/admin/alerts' + (stationId ? `?station_id=${stationId}` : ''), [stationId, tick]);
  if (!data) return <Skeleton h={64} n={3} />;
  if (!data.length) return <p className="muted" style={{ padding: 12 }}>All clear. Nothing needs you right now.</p>;
  return <div className="col" style={{ gap: 8 }}>{data.slice(0, limit).map((a, i) => <div key={i} className="alertrow"><span className={`sev ${a.severity}`} /><div className="grow"><strong style={{ fontSize: 15 }}>{a.title}</strong><div className="small muted">{a.detail}</div></div><button className="btn sm" onClick={() => go(a.section)}>Open</button></div>)}{data.length > limit && <p className="small muted">+{data.length - limit} more in the bell menu</p>}</div>;
}

/* ---------------- order drawer ---------------- */
export function OrderDrawer({ id, onClose, role }: { id: string; onClose: () => void; role: string }) {
  const { data: o, error, reload } = useData<any>(`/admin/orders/${id}`);
  const toast = useToast();
  const [reason, setReason] = useState('');
  const canAct = role === 'manager' || role === 'owner';
  const dur = (a?: string, b?: string) => (a && b ? Math.round((new Date(b).getTime() - new Date(a).getTime()) / 1000) : null);
  async function refund() { try { await api(`/admin/orders/${id}/refund`, { method: 'POST', body: { reason } }); toast('Recorded'); setReason(''); reload(); } catch (e: any) { toast(e.message, true); } }
  return (
    <Drawer title={o ? `Order ${o.pickup_code}` : 'Order'} onClose={onClose}>
      <ErrorNote error={error} />
      {!o ? <Skeleton h={80} n={4} /> : (
        <div className="col" style={{ gap: 18 }}>
          <div className="row wrap"><Status s={o.status} /><Status s={o.payment_status} /><span className="chip">{o.channel}</span><span className="chip">{o.station_name}</span></div>
          <div className="card flat">
            <div className="label" style={{ marginBottom: 6 }}>Timeline</div>
            <div className="timeline">
              <div className="tl"><strong>Placed</strong> <span className="small muted">{fmtDateTime(o.created_at)}</span></div>
              <div className={`tl ${o.accepted_at ? '' : 'off'}`}><strong>Started</strong> <span className="small muted">{o.accepted_at ? `${fmtTime(o.accepted_at)} · waited ${dur(o.created_at, o.accepted_at)}s${o.accepted_by ? ` · ${o.accepted_by}` : ''}` : 'Not yet'}</span></div>
              <div className={`tl ${o.ready_at ? '' : 'off'}`}><strong>Ready</strong> <span className="small muted">{o.ready_at ? `${fmtTime(o.ready_at)} · made in ${dur(o.accepted_at || o.created_at, o.ready_at)}s${o.ready_by ? ` · ${o.ready_by}` : ''}` : 'Not yet'}</span></div>
              <div className={`tl ${o.picked_up_at ? '' : 'off'}`}><strong>Picked up</strong> <span className="small muted">{o.picked_up_at ? `${fmtTime(o.picked_up_at)} · ${dur(o.ready_at, o.picked_up_at)}s after ready` : 'Not yet'}</span></div>
              {o.cancelled_at && <div className="tl"><strong style={{ color: 'var(--cherry)' }}>Cancelled</strong> <span className="small muted">{fmtTime(o.cancelled_at)} · {o.cancel_reason}</span></div>}
            </div>
          </div>
          <div className="card flat">
            <div className="label" style={{ marginBottom: 6 }}>Items</div>
            {o.items.map((i: any) => <div key={i.id} className="row between small" style={{ padding: '4px 0' }}><span>{i.qty} × {i.name}<span className="muted"> {i.options?.map((x: any) => x.name).join(', ')}</span></span><span className="price">{rs(i.line_total)}</span></div>)}
            {o.note && <p className="small" style={{ marginTop: 6 }}>Note: {o.note}</p>}
            <hr style={{ border: 0, borderTop: '1px solid var(--hairline)', margin: '8px 0' }} />
            {o.discount > 0 && <div className="row between small"><span className="muted">{o.discount_label}</span><span>− {rs(o.discount)}</span></div>}
            <div className="row between"><strong>Total</strong><strong>{rs(o.total)}</strong></div>
          </div>
          <div className="card flat small">
            <div className="label" style={{ marginBottom: 6 }}>Customer and payment</div>
            <div>{o.user_name || o.customer_name || 'Walk-in'} {o.user_phone && <span className="muted">· {o.user_phone}</span>}</div>
            {o.payments.map((p: any, i: number) => <div key={i} className="row between" style={{ marginTop: 4 }}><span>{p.provider} · {p.status}{p.provider_ref ? ` · ${p.provider_ref}` : ''}</span><span>{rs(p.amount)}</span></div>)}
            {o.rating && <div style={{ marginTop: 6 }}>Rated {o.rating} out of 5{o.rating_note ? `: “${o.rating_note}”` : ''}</div>}
          </div>
          {o.timeline.length > 0 && <div className="card flat small"><div className="label" style={{ marginBottom: 6 }}>Audit trail</div>{o.timeline.map((t: any, i: number) => <div key={i} className="row between"><span>{t.action.replace('order.', '')} · {t.actor || 'System'}</span><span className="muted">{fmtTime(t.created_at)}</span></div>)}</div>}
          {canAct && o.payment_status === 'paid' && o.total > 0 && o.status !== 'cancelled' && (
            <div className="card flat col"><div className="label">Refund</div><input placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} /><button className="btn danger" disabled={reason.length < 3} onClick={refund}>Refund {rs(o.total)}</button></div>
          )}
        </div>
      )}
    </Drawer>
  );
}

/* ---------------- customer drawer ---------------- */
export function CustomerDrawer({ id, onClose, openOrder }: { id: string; onClose: () => void; openOrder: (id: string) => void }) {
  const { data: c, error } = useData<any>(`/admin/customers/${id}`);
  return (
    <Drawer title={c?.name || 'Customer'} onClose={onClose}>
      <ErrorNote error={error} />
      {!c ? <Skeleton h={80} n={3} /> : (
        <div className="col" style={{ gap: 16 }}>
          <p className="muted">{c.phone} · joined {new Date(c.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
          <div className="grid g3" style={{ gap: 10 }}>
            <div className="card flat stat"><div className="v">{c.orders}</div><div className="l">Orders</div></div>
            <div className="card flat stat"><div className="v" style={{ fontSize: 24 }}>{rs(c.spent)}</div><div className="l">Spent</div></div>
            <div className="card flat stat"><div className="v">{c.beans}</div><div className="l">Beans</div></div>
          </div>
          <div className="row wrap">{c.pass && <span className="chip hill">Pass · {c.pass.remaining} cups left</span>}{c.active_coupons > 0 && <span className="chip marigold">{c.active_coupons} coupons</span>}{c.rating > 0 && <span className="chip">Avg rating {c.rating}</span>}</div>
          {c.favourites.length > 0 && <div><div className="label" style={{ marginBottom: 6 }}>Usually orders</div>{c.favourites.map((f: any) => <div key={f.name} className="row between small"><span>{f.name}</span><span className="muted">{f.qty} times</span></div>)}</div>}
          <div><div className="label" style={{ marginBottom: 6 }}>Recent orders</div>
            {c.recent_orders.map((o: any) => <button key={o.id} className="row between" style={{ all: 'unset', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--hairline)' }} onClick={() => openOrder(o.id)}><span><strong>{o.pickup_code}</strong> <span className="small muted">{o.station_name} · {fmtDateTime(o.created_at)}</span></span><span className="row"><Status s={o.status} /><span className="price">{rs(o.total)}</span></span></button>)}
          </div>
        </div>
      )}
    </Drawer>
  );
}

/* ---------------- command palette ---------------- */
function Palette({ sections, onClose, go, openOrder, openCustomer, stationId }: { sections: Section[]; onClose: () => void; go: (s: string) => void; openOrder: (id: string) => void; openCustomer: (id: string) => void; stationId: string }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<any>({ orders: [], customers: [], products: [] });
  const [idx, setIdx] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  useEffect(() => { const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, []);
  useEffect(() => {
    if (q.trim().length < 2) { setRes({ orders: [], customers: [], products: [] }); return; }
    const t = setTimeout(() => api(`/admin/search?q=${encodeURIComponent(q.trim())}${stationId ? `&station_id=${stationId}` : ''}`).then(setRes).catch(() => {}), 200);
    return () => clearTimeout(t);
  }, [q]);
  const flat = sections.flatMap((s) => (s.tabs ? s.tabs.map((t) => ({ ...s, key: `${s.key}/${t.id}`, label: `${s.label} › ${t.label}` })) : [s]));
  const secs = flat.filter((s) => !q || `${s.label} ${s.keywords || ''}`.toLowerCase().includes(q.toLowerCase()));
  const items: { label: string; sub?: string; icon: string; run: () => void; group: string }[] = [
    ...res.orders.map((o: any) => ({ group: 'Orders', icon: 'receipt', label: `Order ${o.pickup_code}`, sub: `${o.station_name} · ${fmtDateTime(o.created_at)} · ${rs(o.total)}`, run: () => openOrder(o.id) })),
    ...res.customers.map((c: any) => ({ group: 'Customers', icon: 'user', label: c.name, sub: c.phone, run: () => openCustomer(c.id) })),
    ...res.products.map((p: any) => ({ group: 'Items', icon: 'cup', label: p.name, sub: rs(p.price), run: () => go('menu') })),
    ...secs.map((s) => ({ group: 'Go to', icon: s.icon, label: s.label, run: () => go(s.key) })),
  ];
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(items.length - 1, i + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
    if (e.key === 'Enter') items[idx]?.run();
  };
  let last = '';
  return (
    <div className="palette-bg" onClick={onClose}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Search" onClick={(e) => e.stopPropagation()}>
        <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setIdx(0); }} onKeyDown={onKey} placeholder="Search orders by number, customers by name or phone, or jump to a section" aria-label="Search" />
        <div className="res">
          {!items.length && <p className="muted center" style={{ padding: 24 }}>Nothing found.</p>}
          {items.map((it, i) => { const head = it.group !== last ? <div className="ph2">{it.group}</div> : null; last = it.group; return <div key={i}>{head}<button className={`item ${i === idx ? 'on' : ''}`} onMouseEnter={() => setIdx(i)} onClick={it.run}><Icon name={it.icon} size={18} /><span className="grow"><strong>{it.label}</strong>{it.sub && <span className="small muted" style={{ display: 'block' }}>{it.sub}</span>}</span></button></div>; })}
        </div>
      </div>
    </div>
  );
}
