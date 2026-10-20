'use client';
import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { api, rs } from '@/lib/api';

const PROVIDER_META: Record<string, { name: string; color: string; hint: string }> = {
  fonepay: {
    name: 'Fonepay Dynamic QR',
    color: '#D71920',
    hint: 'Open any mobile banking app, eSewa, or Khalti, choose Scan & Pay, and scan this Fonepay QR.',
  },
  esewa: {
    name: 'eSewa Dynamic QR',
    color: '#41A124',
    hint: 'Scan with the eSewa app or tap Open eSewa Checkout below. This page updates automatically when paid.',
  },
  khalti: {
    name: 'Khalti Dynamic QR',
    color: '#5C2D91',
    hint: 'Scan with the Khalti app or tap Open Khalti Checkout below. This page updates automatically when paid.',
  },
};

export function FonepayQr({
  payment,
  amount,
  onDone,
  size = 220,
  big = false,
}: {
  payment: { payment_id: string; provider?: string; mode: string; qr_message: string; pay_url?: string | null; amount?: number };
  amount?: number;
  onDone: (status: 'paid' | 'failed') => void;
  size?: number;
  big?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [busy, setBusy] = useState(false);
  const done = useRef(false);
  const provKey = (payment.provider || 'fonepay').toLowerCase();
  const meta = PROVIDER_META[provKey] || PROVIDER_META.fonepay;

  useEffect(() => {
    if (canvas.current && payment.qr_message) {
      QRCode.toCanvas(canvas.current, payment.qr_message, { width: size, margin: 1 }).catch(() => {});
    }
  }, [payment.qr_message, size]);

  useEffect(() => {
    const i = setInterval(async () => {
      try {
        const p = await api(`/payments/${payment.payment_id}`);
        if (p.status !== 'pending' && !done.current) {
          done.current = true;
          onDone(p.status === 'paid' ? 'paid' : 'failed');
        }
      } catch { /* try again on the next tick */ }
    }, 3000);
    return () => clearInterval(i);
  }, [payment.payment_id]);

  async function test(outcome: 'paid' | 'fail') {
    setBusy(true);
    try {
      await api(`/payments/${payment.payment_id}/confirm`, { method: 'POST', body: { outcome } });
      if (!done.current) {
        done.current = true;
        onDone(outcome === 'paid' ? 'paid' : 'failed');
      }
    } catch { /* the poll will pick it up */ } finally {
      setBusy(false);
    }
  }

  return (
    <div className="col" style={{ alignItems: 'center', gap: 10, margin: '12px 0' }}>
      <span
        className="chip"
        style={{ background: meta.color, color: '#fff', fontWeight: 700, padding: '4px 12px', borderRadius: 999 }}
      >
        {meta.name}
      </span>
      <div style={{ background: '#fff', padding: 12, borderRadius: 16, border: `2px solid ${meta.color}33` }}>
        <canvas ref={canvas} aria-label={`${meta.name} code to pay`} />
      </div>
      <strong style={{ fontSize: big ? 28 : 20 }}>{rs(amount ?? payment.amount)}</strong>
      <p className="muted center" style={{ fontSize: big ? 20 : undefined, maxWidth: 380 }}>
        {meta.hint}
      </p>
      {payment.pay_url && payment.mode !== 'sandbox' && (
        <a
          href={payment.pay_url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn sm ghost"
          style={{ borderColor: meta.color, color: meta.color }}
        >
          Open {provKey === 'esewa' ? 'eSewa' : provKey === 'khalti' ? 'Khalti' : 'Payment'} Checkout ↗
        </a>
      )}
      {payment.mode === 'sandbox' && (
        <div className="card flat col" style={{ alignItems: 'center', gap: 8, width: '100%' }}>
          <p className="small muted center">
            Sandbox mode ({meta.name}). No real money moves. These buttons stand in for your banking/wallet app.
          </p>
          <div className="row wrap">
            <button className="btn primary" disabled={busy} onClick={() => test('paid')}>
              Pretend I paid
            </button>
            <button className="btn ghost" disabled={busy} onClick={() => test('fail')}>
              Pretend it failed
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
