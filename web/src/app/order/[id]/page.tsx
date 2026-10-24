'use client';
import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, fmtTime, rs } from '@/lib/api';
import { useEvents, useRequireRole } from '@/lib/auth';
import { ErrorNote, Loading, Status, useData, useToast } from '@/components/ui';
import { CustomerShell, PAY_LABEL } from '@/components/customer';

const STEPS = ['placed', 'preparing', 'ready', 'picked_up'];

export default function Tracking() {
  const user = useRequireRole('customer', 'owner', 'manager', 'station');
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const { data: o, error, reload } = useData<any>(user ? `/orders/${id}` : null);
  const [rating, setRating] = useState(0);
  const pay = useSearchParams().get('pay');
  useEvents((ev, d) => { if (ev === 'order' && d.id === id) reload(); });

  // While the order waits for its payment, look again every few seconds: eSewa and Fonepay may confirm in another tab.
  const waiting = o?.status === 'awaiting_payment';
  useEffect(() => { if (!waiting) return; const t = setInterval(reload, 4000); return () => clearInterval(t); }, [waiting]);

  if (!user) return <CustomerShell><Loading /></CustomerShell>;
  if (error) return <CustomerShell><ErrorNote error={error} /></CustomerShell>;
  if (!o) return <CustomerShell><Loading what="Loading your order" /></CustomerShell>;
  const step = STEPS.indexOf(o.status);

  async function cancel() {
    if (!confirm('Cancel this order? You have not been charged.')) return;
    try { await api(`/orders/${id}/cancel`, { method: 'POST', body: {} }); toast('Order cancelled'); reload(); } catch (e: any) { toast(e.message, true); }
  }
  async function rate(n: number) { setRating(n); try { await api(`/orders/${id}/rate`, { method: 'POST', body: { rating: n } }); toast('Thank you'); reload(); } catch (e: any) { toast(e.message, true); } }

  return (
    <CustomerShell>
      {pay === 'ok' && o.status !== 'awaiting_payment' && <div className="card flat" role="status" style={{ marginBottom: 16, borderColor: 'var(--hill)' }}><strong>Payment received.</strong> Your order is with the barista. You can close the payment tab and go back to the app if you came from there.</div>}
      {pay === 'failed' && <div className="card flat" role="alert" style={{ marginBottom: 16, borderColor: 'var(--cherry)' }}><strong>The payment was not completed.</strong> {o.status === 'cancelled' ? 'The order was cancelled and you were not charged.' : 'You can try again below.'}</div>}
      {pay === 'pending' && waiting && <div className="card flat" role="status" style={{ marginBottom: 16, borderColor: 'var(--marigold)' }}><strong>We are waiting for the payment to be confirmed.</strong> This page updates by itself.</div>}
      <div className="card center" style={{ padding: 32 }}>
        <p className="label">Pickup number</p>
        <div className="pickup" aria-live="polite">{o.pickup_code}</div>
        <div style={{ margin: '12px 0' }}><Status s={o.status} /></div>
        {o.scheduled_for && !['picked_up', 'cancelled'].includes(o.status) && <p style={{ fontWeight: 600 }}>Pickup at {fmtTime(o.scheduled_for)}</p>}
        {o.status === 'ready' && <h3 style={{ color: 'var(--hill)' }}>{o.pickup_code} is ready. See you at the counter.</h3>}
        {o.handover_code && ['placed', 'preparing', 'ready'].includes(o.status) && (
          <div className="card flat" style={{ marginTop: 16, display: 'inline-block', padding: '12px 28px' }}>
            <p className="label">Your pickup code</p>
            <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: 8, fontFamily: 'var(--font-display)' }} aria-label={`Pickup code ${o.handover_code.split('').join(' ')}`}>{o.handover_code}</div>
            <p className="small muted">Say this code at the counter to collect your coffee.</p>
          </div>
        )}
        {['placed', 'preparing'].includes(o.status) && o.scheduled_for && !o.released_at && <p className="muted">We start making it a few minutes before your pickup time.</p>}
        {['placed', 'preparing'].includes(o.status) && !(o.scheduled_for && !o.released_at) && <p className="muted">{o.ahead > 0 ? `${o.ahead} order${o.ahead > 1 ? 's' : ''} ahead of you · about ${Math.ceil(o.eta_seconds / 60)} min` : 'Your coffee in 90 seconds.'}</p>}
        {o.status !== 'cancelled' && <div className="steps" style={{ marginTop: 20 }} aria-hidden>{STEPS.map((s, i) => <i key={s} className={i <= step ? 'on' : ''} />)}</div>}
        {waiting && (
          <div className="col" style={{ alignItems: 'center', gap: 10, marginTop: 8 }}>
            <p className="muted">Pay {rs(o.total)} with {PAY_LABEL[o.payment_method] || 'your wallet'} to send this order to the barista.</p>
            <a className="btn primary lg" href={o.pay_url}>Pay {rs(o.total)} with {PAY_LABEL[o.payment_method]}</a>
            <button className="btn ghost sm" onClick={cancel}>Cancel this order</button>
          </div>
        )}
        {o.status === 'cancelled' && <p className="err">{o.cancel_reason || 'Cancelled'}{o.payment_status === 'refunded' ? ' · Refund on its way' : ''}</p>}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>{o.station_name}</h3>
        <p className="small muted">{o.station_address} · placed {fmtTime(o.created_at)}</p>
        <div className="col" style={{ marginTop: 12, gap: 6 }}>
          {o.items.map((i: any) => <div key={i.id} className="row between"><span>{i.qty} × {i.name}<span className="small muted"> {i.options?.map((x: any) => x.name).join(', ')}</span></span><span className="price">{rs(i.line_total)}</span></div>)}
        </div>
        <hr style={{ border: 0, borderTop: '1px solid var(--hairline)', margin: '12px 0' }} />
        {o.discount > 0 && <div className="row between"><span className="muted">{o.discount_label}</span><span>− {rs(o.discount)}</span></div>}
        <div className="row between"><strong>Total</strong><strong>{rs(o.total)}</strong></div>
        <p className="small muted" style={{ marginTop: 4 }}>{PAY_LABEL[o.payment_method] || 'Cash at counter'}{['esewa', 'fonepay'].includes(o.payment_method) && o.payment_status === 'unpaid' ? '' : <> · <Status s={o.payment_status} /></>}{o.payment_method === 'cash' && o.payment_status === 'unpaid' ? ' Pay in cash when you pick up.' : ''}</p>
      </div>
      {['placed', 'preparing', 'ready'].includes(o.status) && <p className="small muted center" style={{ marginTop: 16 }}>Your order has gone to the barista, so it cannot be cancelled. Something wrong? Ask at the counter.</p>}
      {o.status === 'picked_up' && (
        <div className="card center" style={{ marginTop: 16 }}>
          <h3>{o.rating ? 'Thank you for rating' : 'How was your coffee?'}</h3>
          <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
            {[1, 2, 3, 4, 5].map((n) => <button key={n} className={`btn sm ${(o.rating || rating) >= n ? 'primary' : 'ghost'}`} disabled={!!o.rating} onClick={() => rate(n)} aria-label={`${n} out of 5`}>{n}</button>)}
          </div>
        </div>
      )}
    </CustomerShell>
  );
}
