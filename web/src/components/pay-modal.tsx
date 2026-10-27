'use client';
import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { api, rs } from '@/lib/api';
import { PAY_LABEL } from './customer';

/**
 * Pay-by-QR window. It sits on top of the page the customer is already on, so nobody is sent away.
 * It shows the QR, says what is happening (waiting, paid, not paid), and closes itself a moment after the money arrives.
 * `onPaid` is where the page checks the order; `onClose` is when the person leaves it without paying (the payment stays open for 15 minutes).
 */
export function PayModal({ paymentId, amount, onPaid, onClose, onCancel, onManual, big = false }: {
  paymentId: string; amount: number; onPaid: (p: any) => void; onClose: () => void; onCancel?: () => void; onManual?: () => void; big?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [p, setP] = useState<any>(null);
  const [err, setErr] = useState('');
  const [left, setLeft] = useState(900);
  const settled = useRef(false);
  const size = big ? 320 : 240;

  useEffect(() => {
    let live = true;
    const look = async () => {
      try {
        const x = await api(`/payments/${paymentId}`);
        if (!live) return;
        setP(x); setErr('');
        if (x.status === 'paid' && !settled.current) { settled.current = true; setTimeout(() => onPaid(x), 1600); }
      } catch (e: any) { if (live) setErr(e.message); }
    };
    look();
    const i = setInterval(() => { if (!settled.current) look(); }, 2500);
    return () => { live = false; clearInterval(i); };
  }, [paymentId]);

  useEffect(() => {
    if (!p?.qr?.value || !canvas.current) return;
    QRCode.toCanvas(canvas.current, p.qr.value, { width: size, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#1c1917', light: '#ffffff' } }).catch(() => {});
  }, [p?.qr?.value, p?.status, size]);

  useEffect(() => {
    if (!p?.expires_at) return;
    const tick = () => setLeft(Math.max(0, Math.round((new Date(p.expires_at).getTime() - Date.now()) / 1000)));
    tick(); const i = setInterval(tick, 1000); return () => clearInterval(i);
  }, [p?.expires_at]);

  const status: 'loading' | 'waiting' | 'paid' | 'failed' = !p ? 'loading' : p.status === 'paid' ? 'paid' : p.status === 'pending' ? 'waiting' : 'failed';
  const label = PAY_LABEL[p?.provider] || 'your wallet';
  const bank = p?.qr?.kind === 'bank';
  const manual = !!p?.qr?.manual;
  const mmss = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  return (
    <div className="modal-bg" style={{ zIndex: 80 }} onClick={status === 'waiting' ? undefined : onClose}>
      <div className="modal paymodal" role="dialog" aria-modal="true" aria-label="Pay by QR" onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center', maxWidth: big ? 560 : 400 }}>
        <ol className="paysteps" aria-hidden>
          <li className={status !== 'paid' ? 'on' : 'done'}>Scan</li>
          <li className={status === 'paid' ? 'done' : ''}>Confirm in your app</li>
          <li className={status === 'paid' ? 'on' : ''}>Done</li>
        </ol>
        {status === 'paid' ? (
          <div className="col" style={{ alignItems: 'center', gap: 8, padding: '18px 0' }} aria-live="polite">
            <svg width="84" height="84" viewBox="0 0 84 84" aria-hidden><circle cx="42" cy="42" r="38" fill="var(--hill)" /><path d="M24 43l12 12 24-26" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" className="tick" /></svg>
            <h2 style={{ margin: 0 }}>Paid {rs(amount)}</h2>
            <p className="muted">Your order is going to the barista.</p>
          </div>
        ) : status === 'failed' ? (
          <div className="col" style={{ alignItems: 'center', gap: 8, padding: '18px 0' }} aria-live="polite">
            <h2 style={{ margin: 0 }}>Payment not completed</h2>
            <p className="muted">Nothing was charged. You can try again or pay with cash.</p>
            <button className="btn primary" onClick={onClose}>Close</button>
          </div>
        ) : (
          <>
            <h3 style={{ margin: '4px 0 2px' }}>{bank ? 'Scan with any bank or wallet app' : `Pay with ${label}`}</h3>
            <strong style={{ fontSize: big ? 34 : 24 }}>{rs(amount)}</strong>
            <div style={{ background: '#fff', padding: 12, borderRadius: 18, display: 'inline-block', margin: '12px 0', minWidth: size + 24, minHeight: size + 24, boxShadow: '0 6px 24px rgba(42,24,16,.12)' }}>
              {p?.qr ? <canvas ref={canvas} aria-label={`QR code to pay ${rs(amount)}`} /> : <div className="muted" style={{ width: size, height: size, display: 'grid', placeItems: 'center' }}>{err || 'Making your QR…'}</div>}
            </div>
            <p className="pulse muted" style={{ fontSize: big ? 20 : undefined, margin: '0 0 4px' }} aria-live="polite">Waiting for your payment… <b>{mmss}</b></p>
            <p className="small muted" style={{ margin: 0 }}>{manual ? 'Open your banking or wallet app, scan and pay. The barista confirms it, then your order starts.' : bank ? 'Open your banking or wallet app, scan, and confirm.' : `Scan with your phone camera to open ${label}.`} This window closes by itself once you have paid.</p>
            {err && p && <p className="small err">{err}</p>}
            {p?.qr?.note && <p className="small err">The real QR could not be made ({p.qr.note}). This QR opens the payment page instead.</p>}
            {manual && onManual && <button className="btn primary" style={{ marginTop: 10 }} onClick={onManual}>Payment received</button>}
            <div className="row" style={{ justifyContent: 'center', marginTop: 14, gap: 8 }}>
              {p?.qr?.kind === 'link' && <a className="btn primary" href={p.qr.value} target="_blank" rel="noopener noreferrer">Open {label}</a>}
              <button className="btn ghost" onClick={onCancel || onClose}>{onCancel ? 'Cancel order' : 'Close'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
