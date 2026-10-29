'use client';
import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { rs } from '@/lib/api';

/**
 * The shop's own QR. The customer scans it, types the amount, pays, and shows the confirmation to the barista, who checks it arrived
 * (or the owner checks it centrally) before the coffee is handed over.
 */
export function StaticQr({ info, amount, code, big = false }: { info: { title: string; text: string | null; image_url: string | null }; amount: number; code?: string; big?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const size = big ? 300 : 230;
  useEffect(() => { if (info.text && canvas.current) QRCode.toCanvas(canvas.current, info.text, { width: size, margin: 1, errorCorrectionLevel: 'M' }).catch(() => {}); }, [info.text, size]);
  return (
    <div className="col" style={{ alignItems: 'center', gap: 8, textAlign: 'center' }}>
      <div style={{ background: '#fff', padding: 12, borderRadius: 18, boxShadow: '0 6px 24px rgba(42,24,16,.12)' }}>
        {info.text ? <canvas ref={canvas} aria-label={`Shop QR for ${info.title}`} /> : <img src={info.image_url!} alt={`Shop QR for ${info.title}`} style={{ width: size, height: size, objectFit: 'contain', display: 'block' }} />}
      </div>
      <strong style={{ fontSize: big ? 22 : 17 }}>{info.title}</strong>
      <p style={{ margin: 0, fontSize: big ? 22 : undefined }}>Scan, pay <b>{rs(amount)}</b>{code ? <>, and write <b>{code}</b> in the remark if your app asks</> : null}.</p>
      <p className="small muted" style={{ margin: 0, fontSize: big ? 18 : undefined }}>Show the payment confirmation to the barista. They check it arrived, then your coffee is handed over.</p>
    </div>
  );
}
