'use client';
import Link from 'next/link';
import { useState } from 'react';
import { api, fmtDate, rs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCart } from '@/lib/cart';
import { Empty, Loading, useData, useToast } from '@/components/ui';
import { CustomerShell } from '@/components/customer';
import { PassTab } from '@/components/account';
import { Icon } from '@/components/icons';

export default function Offers() {
  const { user } = useAuth();
  const cart = useCart();
  const home = useData<any>(cart.station ? `/stations/${cart.station.id}/home` : null, [cart.station?.id]);
  const central = useData<any>(!cart.station ? '/offers' : null);
  const coupons = useData<any[]>(user ? '/coupons' : null, [user?.id]);
  const d = home.data || central.data;
  const active = (coupons.data || []).filter((c) => c.status === 'active');

  return (
    <CustomerShell>
      <h2>Offers</h2>
      <div className="sectionhead"><h3>Promo code</h3></div>
      <PromoBox />

      {d?.drops?.length > 0 && (
        <>
          <div className="sectionhead"><h3>This month’s drop</h3></div>
          {d.drops.map((x: any) => (
            <div key={x.id} className="card"><div className="row between"><div><h3>{x.name}</h3><p className="small muted">{x.partner} · {rs(x.price)}</p></div><span className="chip marigold">{x.remaining.toLocaleString()} left</span></div>
              <div className="bar" style={{ margin: '12px 0 4px' }}><i style={{ width: `${Math.min(100, (x.sold / x.cap) * 100)}%` }} /></div><p className="small muted">{x.sold.toLocaleString()} of {x.cap.toLocaleString()} cups sold. Then gone.</p></div>
          ))}
        </>
      )}

      <div className="sectionhead"><h3>My coupons</h3></div>
      {!user ? <Empty><Link href="/register">Create an account</Link> to get your free first cup.</Empty> : !active.length ? <Empty>No active coupons.</Empty> : (
        <div className="col">{active.map((c) => (
          <div key={c.id} className="card flat row between"><div><strong>{c.title}</strong><div className="small muted">Valid until {fmtDate(c.expires_at)}</div></div><span className="chip marigold">{c.kind === 'pct' ? `${c.pct}% off` : 'Free cup'}</span></div>
        ))}</div>
      )}

      <div className="sectionhead"><h3>10-cup pass</h3></div>
      {user ? <PassTab /> : <Empty><Link href="/login">Sign in</Link> to buy a pass.</Empty>}

      <div className="sectionhead"><h3>Give a cup. Get a cup.</h3></div>
      <Link href="/account?tab=friends" className="card flat row between" style={{ color: 'inherit', textDecoration: 'none' }}><span className="row"><Icon name="gift" color="var(--cherry)" />Share your code with a friend</span><Icon name="nav" size={18} /></Link>
    </CustomerShell>
  );
}

/** Enter a promo code once; it is then offered at checkout. */
function PromoBox() {
  const cart = useCart();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function apply() {
    if (!code.trim()) return;
    setBusy(true); setError(null);
    try {
      const r = await api('/promos/check', { method: 'POST', body: { code: code.trim(), station_id: cart.station?.id } });
      cart.setPromo(r); setCode('');
    } catch (e: any) { setError(e.message); }
    setBusy(false);
  }
  const p = cart.promo;
  return (
    <div className="card flat">
      {p ? (
        <div className="row between">
          <div><strong>{p.code} · {p.pct}% off</strong><div className="small muted">{p.title}{p.min_total ? ` · min Rs ${p.min_total}` : ''}. Applied at checkout.</div></div>
          <button className="btn ghost sm" onClick={() => cart.setPromo(null)}>Remove</button>
        </div>
      ) : (
        <div className="row">
          <input className="grow" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} onKeyDown={(e) => { if (e.key === 'Enter') apply(); }} placeholder="Enter promo code" aria-label="Promo code" autoCapitalize="characters" />
          <button className="btn primary sm" disabled={busy} onClick={apply}>{busy ? '…' : 'Apply'}</button>
        </div>
      )}
      {error && <p className="small" style={{ color: 'var(--cherry)', marginTop: 8 }}>{error}</p>}
    </div>
  );
}
