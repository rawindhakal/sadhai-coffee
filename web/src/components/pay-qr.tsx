'use client';
import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { api, rs } from '@/lib/api';
import { PAY_LABEL } from './customer';

/**
 * A QR code for an eSewa or Fonepay payment. The customer scans it with their phone, which opens the gateway's page there.
 * We look at the payment every few seconds and call onDone as soon as it is paid or has failed.
 */
export function PayQr({ payment, amount, onDone, size = 240, big = false }: { payment: { payment_id: string; provider: string; pay_url: string }; amount: number; onDone: (status: 'paid' | 'failed') => void; size?: number; big?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const done = useRef(false);
  useEffect(() => { if (canvas.current) QRCode.toCanvas(canvas.current, payment.pay_url, { width: size, margin: 1 }).catch(() => {}); }, [payment.pay_url, size]);
  useEffect(() => {
    const i = setInterval(async () => {
      try {
        const p = await api(`/payments/${payment.payment_id}`);
        if (p.status !== 'pending' && !done.current) { done.current = true; onDone(p.status === 'paid' ? 'paid' : 'failed'); }
      } catch { /* keep waiting */ }
    }, 3000);
    return () => clearInterval(i);
  }, [payment.payment_id]);
  return (
    <div className="col" style={{ alignItems: 'center', gap: 10, margin: '12px 0' }}>
      <div style={{ background: '#fff', padding: 10, borderRadius: 16 }}><canvas ref={canvas} aria-label={`QR code to pay with ${PAY_LABEL[payment.provider]}`} /></div>
      <strong style={{ fontSize: big ? 30 : 20 }}>{rs(amount)}</strong>
      <p className="muted center" style={{ fontSize: big ? 20 : undefined }}>Scan with your phone camera to pay with {PAY_LABEL[payment.provider]}. This screen updates by itself when you have paid.</p>
    </div>
  );
}
