'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { api, rs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PromoBox } from '@/components/promo-box';
import { useCart } from '@/lib/cart';
import { useI18n } from '@/lib/i18n';
import { useConfig } from '@/lib/site-content';
import { Empty, ErrorNote, Field, useData } from '@/components/ui';
import { CustomerShell, PAY_LABEL } from '@/components/customer';
import { PayModal } from '@/components/pay-modal';
import { StaticQr } from '@/components/static-qr';
import { Icon } from '@/components/icons';

export default function Cart() {
  const cart = useCart();
  const { user } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const coupons = useData<any[]>(user ? '/coupons' : null, [user?.id]);
  const passes = useData<any[]>(user ? '/passes' : null, [user?.id]);
  const [offer, setOffer] = useState<{ type: 'none' | 'coupon' | 'pass' | 'promo'; id?: string }>({ type: 'none' });
  const config = useConfig();
  const rules = config?.order_flow?.web;
  const methods: string[] = (rules?.payment_methods || config?.payment_methods || ['cash']).filter((m: string) => m !== 'pass');
  const [method, setMethod] = useState<string>('cash');
  const [note, setNote] = useState('');
  useEffect(() => { if (methods.length && !methods.includes(method)) setMethod(methods[0]); }, [methods.join()]);
  const [quote, setQuote] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Pickup now, or later today. The station says what is possible and whether it is open at all.
  const times = useData<any>(cart.station ? `/stations/${cart.station.id}/pickup-times` : null, [cart.station?.id]);
  const [when, setWhen] = useState<'now' | 'later'>('now');
  const [at, setAt] = useState('');
  const w = times.data?.preorder;
  const slots: string[] = useMemo(() => {
    if (!w) return [];
    const out: string[] = [];
    for (let t = new Date(w.earliest).getTime(); t <= new Date(w.latest).getTime() && out.length < 200; t += 5 * 60000) out.push(new Date(t).toISOString());
    return out;
  }, [w?.earliest, w?.latest]);
  useEffect(() => { if (when === 'later' && slots.length && !slots.includes(at)) setAt(slots.find((s) => new Date(s).getTime() >= Date.now() + 29 * 60000) || slots[0]); if (when === 'later' && !slots.length && times.data) setWhen('now'); }, [when, slots.join()]);
  const closed = times.data && !times.data.can_order;
  const fmtAt = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kathmandu' });

  const payload = useMemo(() => cart.station ? ({
    station_id: cart.station.id, items: cart.lines.map((l) => ({ product_id: l.product.id, qty: l.qty, option_ids: l.option_ids })),
    payment_method: offer.type === 'pass' ? 'pass' : method, channel: 'web',
    coupon_id: offer.type === 'coupon' ? offer.id : undefined, promo_code: offer.type === 'promo' && cart.promo ? cart.promo.code : undefined, note: note || undefined,
    scheduled_for: when === 'later' && at ? at : undefined,
  }) : null, [cart.station?.id, cart.lines, cart.promo?.code, method, offer, note, when, at]);

  useEffect(() => {
    if (!user || !payload || !cart.lines.length) { setQuote(null); return; }
    let live = true;
    api('/orders/quote', { method: 'POST', body: payload }).then((q) => { if (live) { setQuote(q); setError(null); } }).catch((e) => { if (live) { setQuote(null); setError(e.message); } });
    return () => { live = false; };
  }, [JSON.stringify(payload), user?.id]);

  // A promo applied on the Offers tab is selected here automatically.
  useEffect(() => { if (cart.promo) setOffer({ type: 'promo' }); else setOffer((o) => (o.type === 'promo' ? { type: 'none' } : o)); }, [cart.promo?.code]);

  const activePass = passes.data?.some((p) => p.status === 'active' && p.remaining > 0) ? { remaining: passes.data![0].total_remaining } : null;
  const active = (coupons.data || []).filter((c) => c.status === 'active');

  const [paying, setPaying] = useState<{ id: string; amount: number; order: string } | null>(null);
  const [shopQr, setShopQr] = useState<any>(null);
  const shopWindow = shopQr && config?.static_qr && (
    <div className="modal-bg" style={{ zIndex: 80 }}><div className="modal" role="dialog" aria-modal="true" aria-label="Pay by the shop QR" style={{ maxWidth: 400 }}>
      <StaticQr info={config.static_qr} amount={shopQr.total} code={shopQr.pickup_code} />
      <button className="btn primary block" style={{ marginTop: 14 }} onClick={() => router.push(`/order/${shopQr.id}`)}>I have paid, show my order</button>
    </div></div>
  );
  const payWindow = shopWindow || paying && <PayModal paymentId={paying.id} amount={paying.amount} onPaid={() => router.push(`/order/${paying.order}`)} onClose={() => router.push(`/order/${paying.order}`)} />;
  async function place() {
    setBusy(true); setError(null);
    try {
      const out = await api('/orders', { method: 'POST', body: payload });
      passes.reload();
      coupons.reload();
      cart.clear();
      // Online payment: the QR opens in a window on this page, so nobody is sent away.
      if (out.order.payment_method === 'qr_static' && out.order.payment_status === 'unpaid') { setShopQr(out.order); return; }
      if (out.payment?.payment_id) { setPaying({ id: out.payment.payment_id, amount: out.order.total, order: out.order.id }); return; }
      router.push(`/order/${out.order.id}`);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  if (!cart.ready) return <CustomerShell><p className="muted">Loading…</p></CustomerShell>;
  if (!cart.lines.length) {
    return <CustomerShell>{payWindow}<div className="card center col" style={{ padding: 40, alignItems: 'center' }}><Icon name="cart" size={44} color="var(--cherry)" stroke={1.6} /><h3>Your cart is empty</h3><p className="muted">Add a coffee in one tap from the home screen.</p><Link className="btn primary" href="/order">Browse the menu</Link></div></CustomerShell>;
  }
  return (
    <CustomerShell>
      {payWindow}
      <div className="row between"><h2>{t('cart')}</h2><button className="btn ghost sm" onClick={cart.clear}>Clear</button></div>
      {cart.station && <p className="small muted" style={{ margin: '4px 0 12px' }}>Pickup at <strong>{cart.station.name}</strong> · <Link href="/order">change</Link></p>}

      <div className="card" style={{ padding: 0 }}>
        {cart.lines.map((l) => (
          <div key={l.key} className="row" style={{ padding: 14, borderBottom: '1px solid var(--hairline)', alignItems: 'flex-start' }}>
            <div className="grow"><strong>{l.product.name}</strong><div className="small muted">{l.optionNames.join(', ') || ' '}</div><div className="price">{rs(l.unit * l.qty)}</div></div>
            <div className="stepper" role="group" aria-label={`${l.product.name} quantity`}>
              <button aria-label={l.qty === 1 ? 'Remove' : 'Fewer'} onClick={() => cart.setQty(l.key, l.qty - 1)}><Icon name={l.qty === 1 ? 'close' : 'minus'} size={18} /></button><b>{l.qty}</b>
              <button aria-label="More" onClick={() => cart.setQty(l.key, l.qty + 1)}><Icon name="plus" size={18} /></button>
            </div>
          </div>
        ))}
      </div>

      {!user ? (
        <div className="card col" style={{ marginTop: 16 }}><h3>Sign in to order</h3><p className="muted">Your cart is saved. Sign in or join to place your order.</p><div className="row"><Link className="btn primary" href="/login">Sign in</Link><Link className="btn ghost" href="/register">Create an account</Link></div></div>
      ) : (
        <>
          <h4 style={{ margin: '20px 0 8px' }}>{t('offer')}</h4>
          <div className="card flat col" style={{ gap: 8 }}>
            <Radio on={offer.type === 'none'} label={t('none')} onClick={() => setOffer({ type: 'none' })} />
            {active.map((c) => (
              <Radio
                key={c.id}
                on={offer.type === 'coupon' && offer.id === c.id}
                label={c.title}
                hint={`${c.min_spend ? `min ${rs(c.min_spend)} · ` : ''}until ${new Date(c.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}
                onClick={() => setOffer({ type: 'coupon', id: c.id })}
              />
            ))}
            {cart.promo && <Radio on={offer.type === 'promo'} label={`Promo ${cart.promo.code}`} hint={`${cart.promo.pct}% off${cart.promo.min_total ? ` · min ${rs(cart.promo.min_total)}` : ''}`} onClick={() => setOffer({ type: 'promo' })} />}
            {activePass && rules?.payment_methods?.includes('pass') !== false && <Radio on={offer.type === 'pass'} label={t('pass')} hint={`${activePass.remaining} cups left`} onClick={() => setOffer({ type: 'pass' })} />}
          </div>
          <div style={{ marginTop: 8 }}><PromoBox /></div>
          {closed && <div className="card flat" role="alert" style={{ marginTop: 16, borderColor: 'var(--cherry)' }}><strong>{times.data.open_now ? 'This station is not taking orders for a moment.' : `This station is closed. It opens at ${String(times.data.opens).slice(0, 5)}.`}</strong> <button className="btn sm" style={{ marginLeft: 8 }} onClick={() => router.push('/order')}>Choose another station</button></div>}
          {rules && !rules.enabled && <div className="card flat" role="alert" style={{ marginTop: 16, borderColor: 'var(--cherry)' }}><strong>Online ordering is paused right now.</strong> Please order at the counter.</div>}
          {!closed && w && rules?.pickup_later !== false && (
            <>
              <h4 style={{ margin: '20px 0 8px' }}>Pickup time</h4>
              <div className="row wrap">
                <button className={`btn sm ${when === 'now' ? 'primary' : 'ghost'}`} aria-pressed={when === 'now'} onClick={() => setWhen('now')}>As soon as possible</button>
                <button className={`btn sm ${when === 'later' ? 'primary' : 'ghost'}`} aria-pressed={when === 'later'} onClick={() => setWhen('later')}>Later today</button>
                {when === 'later' && <select aria-label="Pickup time" value={at} onChange={(e) => setAt(e.target.value)} style={{ width: 'auto', minHeight: 40 }}>{slots.map((s) => <option key={s} value={s}>{fmtAt(s)}</option>)}</select>}
              </div>
              <p className="small muted" style={{ marginTop: 6 }}>{when === 'later' ? `We start making it a few minutes before ${at ? fmtAt(at) : 'then'}. You can pick from ${w.min_minutes} minutes ahead until the station closes. Once you place it, it cannot be cancelled.` : 'Ready in about 90 seconds once the barista starts.'}</p>
            </>
          )}
          {offer.type !== 'pass' && (
            <>
              <h4 style={{ margin: '20px 0 8px' }}>{t('pay_with')}</h4>
              <div className="row wrap" style={{ gap: 8 }}>
                {methods.map((m) => (
                  <button key={m} type="button" className={`btn sm ${method === m ? 'primary' : 'ghost'}`} aria-pressed={method === m} onClick={() => setMethod(m)}>{PAY_LABEL[m]}</button>
                ))}
              </div>
            </>
          )}
          {rules?.notes !== false && <div style={{ marginTop: 16 }}><Field label="Note for the barista (optional)"><input maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} /></Field></div>}
          <div className="card flat" style={{ marginTop: 16 }}>
            <div className="row between"><span>Subtotal</span><span>{rs(quote?.subtotal ?? cart.total)}</span></div>
            {quote?.discount > 0 && <div className="row between" style={{ color: 'var(--hill)' }}><span>{quote.discount_label}</span><span>− {rs(quote.discount)}</span></div>}
            <div className="row between" style={{ marginTop: 6 }}><strong>{t('total')}</strong><strong style={{ fontSize: 24 }}>{rs(quote?.total ?? cart.total)}</strong></div>
            <p className="small muted">{t('prices_note')}</p>
          </div>
          <ErrorNote error={error} />
          <button className="btn primary lg block" style={{ marginTop: 16 }} disabled={busy || !quote || !!closed} onClick={place}>{busy ? 'Placing…' : `${t('place_order')} · ${rs(quote?.total ?? 0)}`}</button>
        </>
      )}
    </CustomerShell>
  );
}

function Radio({ on, label, hint, onClick }: { on: boolean; label: string; hint?: string; onClick: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={on} onClick={onClick} className="row" style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
      <span style={{ width: 22, height: 22, borderRadius: 99, border: `2px solid ${on ? 'var(--cherry)' : 'var(--ink-muted)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{on && <span style={{ width: 10, height: 10, borderRadius: 99, background: 'var(--cherry)' }} />}</span>
      <span className="grow">{label}</span>{hint && <span className="small muted">{hint}</span>}
    </button>
  );
}
