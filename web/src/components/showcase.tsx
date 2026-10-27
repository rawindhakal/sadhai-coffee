'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useState } from 'react';
import { rs } from '@/lib/api';

const Coffee3D = dynamic(() => import('./coffee3d'), { ssr: false, loading: () => <div className="c3d" aria-hidden /> });

const DRINKS = [
  { id: 'hot', name: 'Hot coffee', liquid: '#8a5233', iced: false },
  { id: 'flavored', name: 'Flavoured', liquid: '#c98150', iced: false },
  { id: 'iced', name: 'Iced', liquid: '#a8693f', iced: true },
] as const;

/** The 3D coffee with a menu under it: pick a drink, the cup changes, and the order button carries its price. Sales start here. */
export function Showcase({ pricing, fallback }: { pricing: { hot: number; flavored: number; iced: number }; fallback: React.ReactNode }) {
  const [pick, setPick] = useState<(typeof DRINKS)[number]>(DRINKS[0]);
  const [failed, setFailed] = useState(false);
  if (failed) return <>{fallback}</>;
  return (
    <div className="showcase">
      <Coffee3D look={{ liquid: pick.liquid, iced: pick.iced }} onFail={() => setFailed(true)} />
      <div className="picks" role="group" aria-label="Try a drink">
        {DRINKS.map((d) => <button key={d.id} className="pick" aria-pressed={pick.id === d.id} onClick={() => setPick(d)}><i style={{ background: d.liquid }} />{d.name} · {rs(pricing[d.id])}</button>)}
      </div>
      <Link className="btn primary lg" href="/order">Order {pick.id === 'iced' ? 'an' : 'a'} {pick.name.toLowerCase()} · {rs(pricing[pick.id])}</Link>
      <span className="hint">Drag to turn it. Double click to scatter the beans.</span>
    </div>
  );
}
