'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useCart } from '@/lib/cart';

/** Enter a promo code once; it is then offered at checkout. */
export function PromoBox() {
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
