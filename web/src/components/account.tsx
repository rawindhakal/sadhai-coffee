'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, fmtDate, fmtDateTime, rs } from '@/lib/api';
import { useAuth, useEvents, useRequireRole } from '@/lib/auth';
import { Empty, ErrorNote, Field, Loading, Modal, Status, Tabs, useData, useToast } from './ui';
import { CustomerShell, PAY_LABEL, startRedirect } from './customer';
import { useI18n } from '@/lib/i18n';
import { disableWebPush, enableWebPush, pushState } from '@/lib/push';

export function AccountView() {
  const user = useRequireRole('customer');
  const [tab, setTab] = useState<'pass' | 'coupons' | 'friends' | 'orders' | 'inbox' | 'profile'>('inbox');
  useEffect(() => { const t = new URLSearchParams(location.search).get('tab'); if (t) setTab(t as any); }, []);
  const inbox = useData<any>(user ? '/notifications' : null);
  useEvents((ev) => { if (ev === 'notification') inbox.reload(); });
  if (!user) return <CustomerShell><Loading /></CustomerShell>;
  return (
    <CustomerShell>
      <div className="row between"><h2>Hello, {user.name.split(' ')[0]}</h2><span className="chip marigold">{user.beans || 0} beans</span></div>
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'pass', label: 'Pass' }, { id: 'coupons', label: 'Coupons' }, { id: 'friends', label: 'Give a cup' }, { id: 'orders', label: 'Orders' },
        { id: 'inbox', label: 'Inbox', badge: inbox.data?.unread }, { id: 'profile', label: 'Profile' },
      ]} />
      {tab === 'pass' && <PassTab />}
      {tab === 'coupons' && <CouponsTab />}
      {tab === 'friends' && <ReferralTab />}
      {tab === 'orders' && <OrdersTab />}
      {tab === 'inbox' && <Inbox data={inbox.data} reload={inbox.reload} />}
      {tab === 'profile' && <Profile />}
    </CustomerShell>
  );
}

const STATE_LABEL: Record<string, [string, string]> = { using: ['Using now', 'hill'], next: ['Up next', 'marigold'], used: ['Used up', ''], expired: ['Expired', ''] };

/** Pass wallet: every pass has its own code, and passes are used one after another. */
export function PassTab() {
  const passes = useData<any[]>('/passes');
  const cfg = useData<any>('/config');
  const toast = useToast();
  const [buy, setBuy] = useState(false);
  const [busy, setBusy] = useState(false);
  const list = passes.data || [];
  const live = list.filter((p) => p.status === 'active' && p.remaining > 0).sort((a, b) => a.queue_position - b.queue_position);
  const past = list.filter((p) => !live.includes(p));
  async function purchase(method: string) {
    setBusy(true);
    try {
      const out = await api('/passes', { method: 'POST', body: { payment_method: method } });
      if (out.payment?.mode === 'redirect') { startRedirect(out.payment); return; }
      await api(`/payments/${out.payment.payment_id}/confirm`, { method: 'POST', body: {} });
      toast(`Pass ${out.pass.code} is ready`); setBuy(false); passes.reload();
    } catch (e: any) { toast(e.message, true); } finally { setBusy(false); }
  }
  const total = live.reduce((a, p) => a + p.remaining, 0);
  return (
    <>
      <div className="card">
        <div className="row between wrap"><div><h3>10 cups. One pass. {rs(cfg.data?.pass.price)}.</h3><p className="muted small">Buy as many as you like. They are used one after another, and each starts its {cfg.data?.pass.valid_days} days with your first cup.</p></div>
          <button className="btn primary" onClick={() => setBuy(true)}>{live.length ? 'Buy another pass' : 'Buy a pass'}</button></div>
        {live.length > 0 && <p style={{ marginTop: 12 }}><strong>{total} cups</strong> across {live.length} pass{live.length > 1 ? 'es' : ''}</p>}
      </div>
      <div className="col" style={{ marginTop: 16 }}>
        {live.map((p) => (
          <div key={p.id} className="pass" style={{ opacity: p.state === 'using' ? 1 : 0.92 }}>
            <div className="row between wrap"><span className="chip" style={{ background: 'var(--surface)', color: 'var(--ink)' }}>{STATE_LABEL[p.state]?.[0] || p.state}{p.queue_position > 1 ? ` · #${p.queue_position}` : ''}</span>
              <button className="btn sm" style={{ background: 'transparent', color: 'inherit', borderColor: 'currentColor', border: '2px solid' }} onClick={() => { navigator.clipboard?.writeText(p.code); toast('Pass code copied'); }} aria-label={`Copy pass code ${p.code}`}>{p.code}</button></div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 44, lineHeight: 1.05, marginTop: 8 }}>{p.remaining}<span style={{ fontSize: 18 }}> of {p.total_cups} cups left</span></div>
            <div className="row" style={{ gap: 6, margin: '12px 0', flexWrap: 'wrap' }}>{Array.from({ length: p.total_cups }).map((_, i) => <span key={i} style={{ width: 16, height: 16, borderRadius: 99, background: i < p.used_cups ? 'transparent' : 'var(--on-cherry)', border: '2px solid var(--on-cherry)' }} />)}</div>
            <p className="small">{p.starts_on_first_use ? `Starts with your first cup. Use it by ${fmtDate(p.expires_at)}.` : `Valid until ${fmtDate(p.expires_at)}.`} Show the code at any counter, or choose “10-cup pass” at checkout.</p>
          </div>
        ))}
        {!live.length && <Empty>No active pass yet.</Empty>}
      </div>
      {past.length > 0 && <><h3 style={{ margin: '24px 0 8px' }}>Past passes</h3><div className="col">{past.map((p) => <div key={p.id} className="card flat row between"><span><strong>{p.code}</strong> <span className="muted small">{rs(p.price_paid)} · {fmtDate(p.purchased_at)}</span></span><Status s={p.status} /></div>)}</div></>}
      {buy && (
        <Modal title="Buy a 10-cup pass" onClose={() => setBuy(false)}>
          <p className="muted">Pay {rs(cfg.data?.pass.price)} with:</p>
          <div className="col" style={{ marginTop: 12 }}>{['esewa', 'khalti', 'fonepay'].map((m) => <button key={m} className="btn block" disabled={busy} onClick={() => purchase(m)}>{PAY_LABEL[m]}</button>)}</div>
          <p className="small muted" style={{ marginTop: 12 }}>Prefer cash? Buy it at any station counter. A new pass never starts until you use its first cup.</p>
        </Modal>
      )}
    </>
  );
}

export function CouponsTab() {
  const { data, error } = useData<any[]>('/coupons');
  if (!data) return <><ErrorNote error={error} /><Loading /></>;
  if (!data.length) return <Empty>No coupons yet.</Empty>;
  return <div className="col">{data.map((c) => (
    <div key={c.id} className="card flat row between" style={{ opacity: c.status === 'active' ? 1 : 0.55 }}>
      <div><strong>{c.title}</strong><div className="small muted">{c.status === 'active' ? `Valid until ${fmtDate(c.expires_at)}` : c.status === 'used' ? 'Used' : 'Expired'}</div></div>
      <span className={`chip ${c.status === 'active' ? 'marigold' : ''}`}>{c.kind === 'pct' ? `${c.pct}% off` : 'Free cup'}</span>
    </div>
  ))}</div>;
}

export function ReferralTab() {
  const { data } = useData<any>('/referrals');
  const toast = useToast();
  if (!data) return <Loading />;
  const link = typeof window !== 'undefined' ? `${location.origin}/register?ref=${data.code}` : '';
  return (
    <>
      <div className="card center">
        <h3>Give a cup. Get a cup.</h3>
        <p className="muted" style={{ margin: '8px 0' }}>Share your code. When your friend finishes their first cup, you both get one.</p>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 40, letterSpacing: '0.02em', color: 'var(--cherry)' }}>{data.code}</div>
        <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
          <button className="btn primary" onClick={() => { navigator.clipboard?.writeText(link); toast('Link copied'); }}>Copy invite link</button>
          {typeof navigator !== 'undefined' && (navigator as any).share && <button className="btn ghost" onClick={() => (navigator as any).share({ title: 'Sadhai Coffee', text: `Your first Americano is free. Use my code ${data.code}.`, url: link })}>Share</button>}
        </div>
        <p className="small muted" style={{ marginTop: 12 }}>One free cup per friend, up to {data.cap} a month. {data.rewarded_this_month} used this month.</p>
      </div>
      {data.friends.length > 0 && <div className="col" style={{ marginTop: 16 }}>{data.friends.map((f: any, i: number) => <div key={i} className="card flat row between"><span>{f.name}</span><span className={`chip ${f.status === 'rewarded' ? 'hill' : ''}`}>{f.status === 'rewarded' ? 'First cup done' : 'Waiting for first cup'}</span></div>)}</div>}
    </>
  );
}

export function OrdersTab({ onAgain }: { onAgain?: (id: string) => void }) {
  const { data, error } = useData<any[]>('/orders');
  if (!data) return <><ErrorNote error={error} /><Loading /></>;
  if (!data.length) return <Empty>No orders yet. <Link href="/order">Order ahead</Link>.</Empty>;
  return <div className="col">{data.map((o) => (
    <div key={o.id} className="card flat">
      <Link href={`/order/${o.id}`} style={{ color: 'inherit', textDecoration: 'none', display: 'block' }}>
        <div className="row between"><strong>{o.pickup_code} · {o.station_name}</strong><Status s={o.status} /></div>
        <div className="small muted">{o.summary}</div>
        <div className="row between small" style={{ marginTop: 4 }}><span className="muted">{fmtDateTime(o.created_at)}</span><span className="price">{rs(o.total)}</span></div>
      </Link>
      {onAgain && o.status === 'picked_up' && <button className="btn sm" style={{ marginTop: 8 }} onClick={() => onAgain(o.id)}>Order again</button>}
    </div>
  ))}</div>;
}

export function Inbox({ data, reload }: any) {
  if (!data) return <Loading />;
  return (
    <>
      {data.unread > 0 && <button className="btn ghost sm" onClick={async () => { await api('/notifications/read', { method: 'POST', body: {} }); reload(); }}>Mark all read</button>}
      <div className="col" style={{ marginTop: 12 }}>
        {!data.items.length && <Empty>Nothing yet.</Empty>}
        {data.items.map((n: any) => <div key={n.id} className="card flat" style={{ borderLeft: 0, background: n.read ? undefined : 'var(--surface-sunk)' }}><strong>{n.title}</strong><div className="small muted">{n.body}</div><div className="small muted">{fmtDateTime(n.created_at)}</div></div>)}
      </div>
    </>
  );
}

export function Profile() {
  const { user, setUser, logout } = useAuth();
  const { lang, setLang } = useI18n();
  const toast = useToast();
  const [name, setName] = useState(user!.name);
  const [cur, setCur] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault(); setErr(null);
    try { const u = await api('/me', { method: 'PATCH', body: { name, lang, ...(pw ? { current_password: cur, new_password: pw } : {}) } }); setUser({ ...user!, ...u }); setCur(''); setPw(''); toast('Saved'); } catch (e: any) { setErr(e.message); }
  }
  return (
    <form className="card col" onSubmit={save} style={{ gap: 16 }}>
      <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Mobile number"><input value={user!.phone} disabled /></Field>
      <Field label="Language"><select value={lang} onChange={(e) => setLang(e.target.value as any)}><option value="en">English</option><option value="ne">नेपाली</option></select></Field>
      <h4>Change password</h4>
      <Field label="Current password"><input type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" /></Field>
      <Field label="New password"><input type="password" minLength={6} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></Field>
      <ErrorNote error={err} />
      <div className="row"><button className="btn primary">Save</button><button type="button" className="btn ghost" onClick={() => logout().then(() => (location.href = '/'))}>Sign out</button></div>
      <hr style={{ border: 0, borderTop: '1px solid var(--hairline)', width: '100%' }} />
      <Notifications />
      <hr style={{ border: 0, borderTop: '1px solid var(--hairline)', width: '100%' }} />
      <h4>Your data</h4>
      <div className="row wrap"><button type="button" className="btn sm" onClick={async () => { const d = await api('/me/export'); const u = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = u; a.download = 'sadhai-my-data.json'; a.click(); URL.revokeObjectURL(u); }}>Download my data</button><a className="btn sm ghost" href="/privacy">Privacy policy</a><a className="btn sm ghost" href="/terms">Terms</a><a className="btn sm danger" href="/delete-account">Delete my account</a></div>
    </form>
  );
}

/** Push on this browser, and the choice to hear about offers. Order updates always come through. */
function Notifications() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [state, setState] = useState<string>('off');
  const [busy, setBusy] = useState(false);
  useEffect(() => { pushState().then(setState); }, []);
  async function toggle() {
    setBusy(true);
    try { if (state === 'on') await disableWebPush(); else await enableWebPush(); setState(await pushState()); toast(state === 'on' ? 'Notifications are off on this browser' : 'Notifications are on'); } catch (e: any) { toast(e.message, true); } finally { setBusy(false); }
  }
  async function offers(v: boolean) { try { const u = await api('/me', { method: 'PATCH', body: { notif_offers: v } }); setUser({ ...user!, ...u }); } catch (e: any) { toast(e.message, true); } }
  return (
    <div className="col" style={{ gap: 10 }}>
      <h4>Notifications</h4>
      <div className="row between wrap"><span className="small">Tell me when my coffee is ready{state === 'unsupported' ? ' (not supported in this browser)' : state === 'blocked' ? ' (blocked in your browser settings)' : ''}</span>
        <button type="button" className={`btn sm ${state === 'on' ? 'ghost' : 'primary'}`} disabled={busy || state === 'unsupported' || state === 'blocked'} onClick={toggle}>{state === 'on' ? 'Turn off on this browser' : 'Turn on'}</button></div>
      <label className="row small"><input type="checkbox" style={{ width: 20, minHeight: 20 }} checked={(user as any)?.notif_offers !== false} onChange={(e) => offers(e.target.checked)} />Send me offers and news (one a day at most)</label>
      <p className="small muted">Order and pass messages are always sent, because you need them.</p>
    </div>
  );
}
