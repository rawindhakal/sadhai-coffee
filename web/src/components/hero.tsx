'use client';
import { useEffect, useRef, useState } from 'react';
import { HERO_DEFAULTS, pic } from '@/lib/site-content';

/** The hills scene. Layers come from the owner's uploads, with the built-in artwork as the fallback. */
export function HeroScene({ layers, parallax = true, wrapRef }: { layers?: any; parallax?: boolean; wrapRef?: React.RefObject<HTMLElement> }) {
  const [p, setP] = useState({ x: 0, y: 0, s: 0 });
  const local = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!parallax) return;
    const onScroll = () => setP((v) => ({ ...v, s: Math.min(1, window.scrollY / 500) }));
    const onMove = (e: MouseEvent) => { const r = (wrapRef?.current || local.current?.parentElement)?.getBoundingClientRect(); if (r) setP((v) => ({ ...v, x: (e.clientX - r.left) / r.width - 0.5, y: (e.clientY - r.top) / r.height - 0.5 })); };
    window.addEventListener('scroll', onScroll, { passive: true }); window.addEventListener('mousemove', onMove);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('mousemove', onMove); };
  }, [parallax]);
  const move = (d: number): React.CSSProperties => (parallax ? { transform: `translate3d(${p.x * -d * 40}px, ${p.y * -d * 18 + p.s * d * 60}px, 0)` } : {});
  return (
    <div className="lscene" aria-hidden ref={local}>
      <img src={pic(layers?.sun, HERO_DEFAULTS.sun)} alt="" style={move(0.3)} className="sun" />
      <img src={pic(layers?.far, HERO_DEFAULTS.far)} alt="" style={move(0.6)} />
      <img src={pic(layers?.mid, HERO_DEFAULTS.mid)} alt="" style={move(1)} />
      <img src={pic(layers?.near, HERO_DEFAULTS.near)} alt="" style={move(1.6)} />
    </div>
  );
}
