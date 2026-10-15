'use client';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { api, fmtTime, rs } from '@/lib/api';
import { useEvents, useRequireRole } from '@/lib/auth';
import { ErrorNote, Loading, Status, useData, useToast } from '@/components/ui';
import { FonepayQr } from '@/components/fonepay';
import { CustomerShell, PAY_LABEL } from '@/components/customer';

const STEPS = ['placed', 'preparing', 'ready', 'picked_up'];

export default function Tracking() {
  const user = useRequireRole('customer', 'owner', 'manager', 'station');
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const { data: o, error, reload } = useData<any>(user ? `/orders/${id}` : null);
  const [rating, setRating] = useState(0);
  const [qr, setQr] = useState<any>(null);
  useEvents((ev, d) => { if (ev === 'order' && d.id === id) reload(); });

  if (!user) return <CustomerShell><Loading /></CustomerShell>;
  if (error) return <CustomerShell><ErrorNote error={error} /></CustomerShell>;
  if (!o) return <CustomerShell><Loading what="Loading your order" /></CustomerShell>;
  const step = STEPS.indexOf(o.status);

  async function pay() { try { setQr(await api(`/payments/${o.payment_id}`)); } catch (e: any) { toast(e.message, true); } }
  async function cancel() {
    if (!confirm('Cancel this order?')) return;
    try { await api(`/orders/${id}/cancel`, { method: 'POST', body: {} }); toast('Order cancelled'); reload(); } catch (e: any) { toast(e.message, true); }
  }
  async function rate(n: number) { setRating(n); try { await api(`/orders/${id}/rate`, { method: 'POST', body: { rating: n } }); toast('Thank you'); reload(); } catch (e: any) { toast(e.message, true); } }

  return (
    <CustomerShell>
      <div className="card center" style={{ padding: 32 }}>
        <p className="label">Pickup number</p>
        <div className="pickup" aria-live="polite">{o.pickup_code}</div>
        <div style={{ margin: '12px 0' }}><Status s={o.status} /></div>
        {o.status === 'ready' && <h3 style={{ color: 'var(--hill)' }}>{o.pickup_code} is ready. See you at the counter.</h3>}
        {o.handover_code && ['placed', 'preparing', 'ready'].includes(o.status) && (
          <div className="card flat" style={{ marginTop: 16, display: 'inline-block', padding: '12px 28px' }}>
            <p className="label">Your pickup code</p>
            <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: 8, fontFamily: 'var(--font-display)' }} aria-label={`Pickup code ${o.handover_code.split('').join(' ')}`}>{o.handover_code}</div>
            <p className="small muted">Say this code at the counter to collect your coffee.</p>
          </div>
        )}
        {['placed', 'preparing'].includes(o.status) && <p className="muted">{o.ahead > 0 ? `${o.ahead} order${o.ahead > 1 ? 's' : ''} ahead of you · about ${Math.ceil(o.eta_seconds / 60)} min` : 'Your coffee in 90 seconds.'}</p>}
        {o.status === 'awaiting_payment' && <p className="muted">Finish the payment to send your order to the barista.</p>}
        {o.status !== 'cancelled' && <div className="steps" style={{ marginTop: 20 }} aria-hidden>{STEPS.map((s, i) => <i key={s} className={i <= step ? 'on' : ''} />)}</div>}
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
        <p className="small muted" style={{ marginTop: 4 }}>{PAY_LABEL[o.payment_method]} · <Status s={o.status === 'awaiting_payment' ? 'awaiting_payment' : o.payment_status} />{o.payment_method === 'cash' && o.payment_status === 'unpaid' ? ' Pay when you pick up.' : ''}</p>
      </div>
      {o.status === 'awaiting_payment' && !qr && <button className="btn primary block" style={{ marginTop: 16 }} onClick={pay}>Pay with Fonepay QR</button>}
      {o.status === 'awaiting_payment' && qr && <div className="card" style={{ marginTop: 16 }}><FonepayQr payment={{ payment_id: qr.id, mode: qr.mode || 'qr', qr_message: qr.qr_message, amount: qr.amount }} onDone={() => { setQr(null); reload(); }} /></div>}
      {['placed', 'awaiting_payment'].includes(o.status) && <button className="btn danger block" style={{ marginTop: 16 }} onClick={cancel}>Cancel order</button>}
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
