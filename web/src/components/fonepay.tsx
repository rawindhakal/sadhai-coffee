'use client';
import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { api, rs } from '@/lib/api';

/**
 * Fonepay QR. The customer scans it with any mobile-banking or wallet app. While it is on screen we check the payment
 * every few seconds, and call onDone as soon as Fonepay says it is paid or it fails.
 * In test mode there are two buttons that stand in for the bank app, so the whole flow can be tried without real money.
 */
export function FonepayQr({ payment, amount, onDone, size = 220, big = false }: { payment: { payment_id: string; mode: string; qr_message: string; amount?: number }; amount?: number; onDone: (status: 'paid' | 'failed') => void; size?: number; big?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [busy, setBusy] = useState(false);
  const done = useRef(false);
  useEffect(() => { if (canvas.current) QRCode.toCanvas(canvas.current, payment.qr_message, { width: size, margin: 1 }).catch(() => {}); }, [payment.qr_message, size]);
  useEffect(() => {
    const i = setInterval(async () => {
      try {
        const p = await api(`/payments/${payment.payment_id}`);
        if (p.status !== 'pending' && !done.current) { done.current = true; onDone(p.status === 'paid' ? 'paid' : 'failed'); }
      } catch { /* try again on the next tick */ }
    }, 3000);
    return () => clearInterval(i);
  }, [payment.payment_id]);
  async function test(outcome: 'paid' | 'fail') {
    setBusy(true);
    try { await api(`/payments/${payment.payment_id}/confirm`, { method: 'POST', body: { outcome } }); if (!done.current) { done.current = true; onDone(outcome === 'paid' ? 'paid' : 'failed'); } } catch { /* the poll will pick it up */ } finally { setBusy(false); }
  }
  return (
    <div className="col" style={{ alignItems: 'center', gap: 10, margin: '12px 0' }}>
      <div style={{ background: '#fff', padding: 10, borderRadius: 16 }}><canvas ref={canvas} aria-label="Fonepay QR code to pay" /></div>
      <strong style={{ fontSize: big ? 28 : 20 }}>{rs(amount ?? payment.amount)}</strong>
      <p className="muted center" style={{ fontSize: big ? 20 : undefined }}>Open your mobile banking or wallet app, choose Scan, and scan this Fonepay QR. This page updates by itself when you have paid.</p>
      {payment.mode === 'sandbox' && (
        <div className="card flat col" style={{ alignItems: 'center', gap: 8, width: '100%' }}>
          <p className="small muted center">Test mode. No real money moves. These buttons stand in for your banking app.</p>
          <div className="row wrap"><button className="btn primary" disabled={busy} onClick={() => test('paid')}>Pretend I paid</button><button className="btn ghost" disabled={busy} onClick={() => test('fail')}>Pretend it failed</button></div>
        </div>
      )}
    </div>
  );
}
