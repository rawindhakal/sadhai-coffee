'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, fmtDate, fmtDateTime, rs } from '@/lib/api';
import { useAuth, useEvents, useRequireRole } from '@/lib/auth';
import { Empty, ErrorNote, Field, Loading, Modal, Status, Tabs, useData, useToast } from './ui';
import { CustomerShell, PAY_LABEL } from './customer';
import { PayModal } from './pay-modal';
import { useI18n } from '@/lib/i18n';

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
  const [buying, setBuying] = useState(false);
  const [buyErr, setBuyErr] = useState<string | null>(null);
  const [passPay, setPassPay] = useState<{ id: string; amount: number } | null>(null);
  const online: string[] = (cfg.data?.payment_methods || []).filter((m: string) => m === 'fonepay');
  const list = passes.data || [];
  const live = list.filter((p) => p.status === 'active' && p.remaining > 0).sort((a, b) => a.queue_position - b.queue_position);
  const past = list.filter((p) => !live.includes(p));
  const [activeIdx, setActiveIdx] = useState(0);
  const total = live.reduce((a, p) => a + p.remaining, 0);
  const curPass = live[activeIdx] || live[0];

  return (
    <>
      {passPay && <PayModal paymentId={passPay.id} amount={passPay.amount} onPaid={() => { setPassPay(null); passes.reload(); toast('Pass bought'); }} onClose={() => { setPassPay(null); passes.reload(); }} />}
      <div className="card">
        <div className="row between wrap"><div><h3>10 cups. One pass. {rs(cfg.data?.pass.price)}.</h3><p className="muted small">Buy as many as you like. They are used one after another, and each starts its {cfg.data?.pass.valid_days} days with your first cup.</p></div>
          <button className="btn primary" onClick={() => setBuy(true)}>{live.length ? 'Buy another pass' : 'Buy a pass'}</button></div>
        {live.length > 0 && <p style={{ marginTop: 12 }}><strong>{total} cups</strong> in your wallet across {live.length} pass{live.length > 1 ? 'es' : ''}</p>}
      </div>

      {live.length > 1 && (
        <div className="row wrap" style={{ gap: 8, marginTop: 16 }}>
          {live.map((p, i) => (
            <button key={p.id} className={`btn sm ${activeIdx === i ? 'primary' : 'ghost'}`} onClick={() => setActiveIdx(i)}>
              {i === 0 ? 'Using now' : `Pass #${p.queue_position}`} ({p.remaining} cups left)
            </button>
          ))}
        </div>
      )}

      <div className="col" style={{ marginTop: 12 }}>
        {curPass && (
          <div key={curPass.id} className="pass" style={{ opacity: curPass.state === 'using' ? 1 : 0.95 }}>
            <div className="row between wrap"><span className="chip" style={{ background: 'var(--surface)', color: 'var(--ink)' }}>{STATE_LABEL[curPass.state]?.[0] || curPass.state}{curPass.queue_position > 1 ? ` · #${curPass.queue_position}` : ''}</span>
              <button className="btn sm" style={{ background: 'transparent', color: 'inherit', borderColor: 'currentColor', border: '2px solid' }} onClick={() => { navigator.clipboard?.writeText(curPass.code); toast('Pass code copied'); }} aria-label={`Copy pass code ${curPass.code}`}>{curPass.code}</button></div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 44, lineHeight: 1.05, marginTop: 8 }}>{curPass.remaining}<span style={{ fontSize: 18 }}> of {curPass.total_cups} cups left</span></div>
            <div className="row" style={{ gap: 6, margin: '12px 0', flexWrap: 'wrap' }}>{Array.from({ length: curPass.total_cups }).map((_, i) => <span key={i} style={{ width: 16, height: 16, borderRadius: 99, background: i < curPass.used_cups ? 'transparent' : 'var(--on-cherry)', border: '2px solid var(--on-cherry)' }} />)}</div>
            <p className="small">{curPass.starts_on_first_use ? `Starts with your first cup. Use it by ${fmtDate(curPass.expires_at)}.` : `Valid until ${fmtDate(curPass.expires_at)}.`} Show the code at any counter, or choose “10-cup pass” at checkout.</p>
          </div>
        )}
        {live.length > 1 && activeIdx === 0 && (
          <div className="card flat row between wrap" style={{ background: 'var(--surface-sunk)', marginTop: 4 }}>
            <span><strong style={{ marginRight: 8 }}>Wallet queue:</strong>{live.length - 1} more pass{live.length > 2 ? 'es' : ''} queued ({total - live[0].remaining} cups)</span>
            <button className="btn sm ghost" onClick={() => setActiveIdx(1)}>View next pass</button>
          </div>
        )}
        {!live.length && <Empty>No active pass yet.</Empty>}
      </div>
      {past.length > 0 && <><h3 style={{ margin: '24px 0 8px' }}>Past passes</h3><div className="col">{past.map((p) => <div key={p.id} className="card flat row between"><span><strong>{p.code}</strong> <span className="muted small">{rs(p.price_paid)} · {fmtDate(p.purchased_at)}</span></span><Status s={p.status} /></div>)}</div></>}
      {buy && (
        <Modal title="Buy a 10-cup pass" onClose={() => { setBuy(false); setBuyErr(null); }}>
          <p style={{ margin: '0 0 12px' }}>
            Get 10 cups for <strong>{rs(cfg.data?.pass.price)}</strong>. A new pass starts only when you use its first cup, and then lasts {cfg.data?.pass.valid_days} days.
          </p>
          <ErrorNote error={buyErr} />
          <div className="col" style={{ gap: 10, marginTop: 14 }}>
            {online.map((m) => (
              <button key={m} className="btn primary block" disabled={buying} onClick={async () => {
                setBuying(true); setBuyErr(null);
                try { const out = await api('/passes', { method: 'POST', body: { payment_method: m } }); setBuy(false); setPassPay({ id: out.payment.payment_id, amount: out.payment.amount }); setBuying(false); } catch (e: any) { setBuyErr(e.message); setBuying(false); }
              }}>{buying ? 'Opening…' : `Pay ${rs(cfg.data?.pass.price)} with ${PAY_LABEL[m]}`}</button>
            ))}
            <div className="card flat" style={{ background: 'var(--surface-sunk)', padding: 12, marginTop: 4 }}>
              <strong>{online.length ? 'Or pay cash at a counter' : 'Buy it at a counter'}</strong>
              <p className="small muted" style={{ margin: '4px 0 0' }}>Passes are sold for cash at any Sadhai station counter. Tell the barista your phone number and it appears here at once.</p>
            </div>
          </div>
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
      <div>
        <strong>{c.title}</strong>
        <div className="small muted">
          {c.status === 'active' ? `Valid until ${fmtDate(c.expires_at)}` : c.status === 'used' ? 'Used' : 'Expired'}
          {c.min_spend ? ` · Min order ${rs(c.min_spend)}` : ''}
          {(c.max_discount || c.free_max) ? ` · Up to ${rs(c.max_discount || c.free_max)} off 1 drink` : ''}
        </div>
      </div>
      <span className={`chip ${c.status === 'active' ? 'marigold' : ''}`}>{c.pct && c.pct < 100 ? `${c.pct}% off` : 'Free cup'}</span>
    </div>
  ))}</div>;
}

export function ReferralTab() {
  const { data, reload } = useData<any>('/referrals');
  const toast = useToast();
  if (!data) return <Loading />;
  const link = typeof window !== 'undefined' ? `${location.origin}/register?ref=${data.code}` : '';
  const rewardLabel = (data.reward_pct ?? 50) >= 100
    ? `a free cup (up to ${rs(data.cup_max || 180)})`
    : `${data.reward_pct ?? 50}% off a cup (up to ${rs(data.cup_max || 180)})`;

  return (
    <>
      <div className="card center">
        <h3>Give a cup. Get a cup.</h3>
        {!data.enabled ? (
          <p className="muted" style={{ margin: '8px 0' }}>The referral program is currently paused. Existing referral rewards in your Coupons wallet remain valid until their expiry date.</p>
        ) : (
          <>
            <p className="muted" style={{ margin: '8px 0' }}>
              Share your code. When your friend completes their first full-price paid order of at least <strong>{rs(data.min_spend || 180)}</strong>, you both unlock <strong>{rewardLabel}</strong>.
            </p>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 40, letterSpacing: '0.02em', color: 'var(--cherry)' }}>{data.code}</div>
            <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
              <button className="btn primary" onClick={() => { navigator.clipboard?.writeText(link); toast('Invite link copied'); }}>Copy invite link</button>
              <button className="btn ghost" onClick={() => { navigator.clipboard?.writeText(data.code); toast('Code copied'); }}>Copy code</button>
              {typeof navigator !== 'undefined' && (navigator as any).share && (
                <button className="btn ghost" onClick={() => (navigator as any).share({ title: 'Sadhai Coffee', text: `Join Sadhai Coffee with my code ${data.code} and get ${rewardLabel}!`, url: link })}>Share</button>
              )}
            </div>
            <p className="small muted" style={{ marginTop: 12 }}>
              Up to {data.cap} rewards a month ({data.rewarded_this_month} earned this month · {data.rewarded_lifetime || 0} lifetime). Valid on 1 drink base price, min order {rs(data.min_spend || 180)}.
            </p>
          </>
        )}
      </div>
      {data.friends.length > 0 && (
        <div className="col" style={{ marginTop: 16 }}>
          {data.friends.map((f: any, i: number) => (
            <div key={i} className="card flat row between">
              <span><strong>{f.name}</strong></span>
              <span className={`chip ${f.status === 'rewarded' ? 'hill' : ''}`}>
                {f.status === 'rewarded' ? 'Qualifying order completed' : `Waiting for 1st paid order (≥ ${rs(data.min_spend || 180)})`}
              </span>
            </div>
          ))}
        </div>
      )}
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
      <h4>Your data</h4>
      <div className="row wrap"><button type="button" className="btn sm" onClick={async () => { const d = await api('/me/export'); const u = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = u; a.download = 'sadhai-my-data.json'; a.click(); URL.revokeObjectURL(u); }}>Download my data</button><a className="btn sm ghost" href="/privacy">Privacy policy</a><a className="btn sm ghost" href="/terms">Terms</a><a className="btn sm danger" href="/delete-account">Delete my account</a></div>
    </form>
  );
}

