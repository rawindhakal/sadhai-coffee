'use client';
import { useMemo, useRef, useState } from 'react';

export const compact = (n: number) => (n >= 1e7 ? `${(n / 1e7).toFixed(1)}Cr` : n >= 1e5 ? `${(n / 1e5).toFixed(1)}L` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k` : String(Math.round(n)));

export function Sparkline({ values, color = 'var(--cherry)', w = 84, h = 32 }: { values: number[]; color?: string; w?: number; h?: number }) {
  if (values.length < 2) return null;
  const max = Math.max(...values), min = Math.min(...values), r = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - 3 - ((v - min) / r) * (h - 6)}`).join(' ');
  return <svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden><polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

type Pt = { label: string; value: number; prev?: number };

/** Interactive area chart: hover crosshair with tooltip, optional previous-period overlay. */
export function AreaChart({ data, format, height = 260, color = 'var(--cherry)', showPrev }: { data: Pt[]; format: (n: number) => string; height?: number; color?: string; showPrev?: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const W = 800, H = height, padL = 44, padR = 12, padT = 12, padB = 26;
  const max = useMemo(() => Math.max(1, ...data.map((d) => Math.max(d.value, showPrev ? d.prev || 0 : 0))) * 1.1, [data, showPrev]);
  if (data.length < 2) return <p className="muted center" style={{ padding: 40 }}>Not enough data in this period.</p>;
  const x = (i: number) => padL + (i / (data.length - 1)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - v / max) * (H - padT - padB);
  const line = (key: 'value' | 'prev') => data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y((d as any)[key] || 0).toFixed(1)}`).join(' ');
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const step = Math.ceil(data.length / 7);
  const onMove = (e: React.MouseEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const rel = ((e.clientX - r.left) / r.width) * W;
    setHover(Math.max(0, Math.min(data.length - 1, Math.round(((rel - padL) / (W - padL - padR)) * (data.length - 1)))));
  };
  const hv = hover != null ? data[hover] : null;
  return (
    <div className="chartwrap" ref={ref} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Trend chart" style={{ display: 'block' }}>
        {ticks.map((t, i) => <g key={i}><line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="var(--hairline)" strokeDasharray={i ? '3 4' : ''} /><text x={padL - 8} y={y(t) + 4} fontSize="11" textAnchor="end" fill="var(--ink-muted)">{compact(t)}</text></g>)}
        <path d={`${line('value')} L${x(data.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill={color} opacity="0.12" />
        {showPrev && <path d={line('prev')} fill="none" stroke="var(--ink-muted)" strokeWidth="2" strokeDasharray="5 5" />}
        <path d={line('value')} fill="none" stroke={color} strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
        {data.map((d, i) => i % step === 0 && <text key={i} x={x(i)} y={H - 6} fontSize="11" textAnchor="middle" fill="var(--ink-muted)">{d.label}</text>)}
        {hover != null && <g><line x1={x(hover)} x2={x(hover)} y1={padT} y2={H - padB} stroke="var(--ink-muted)" strokeDasharray="3 3" /><circle cx={x(hover)} cy={y(hv!.value)} r="5" fill={color} stroke="var(--surface-raised)" strokeWidth="2" />{showPrev && hv!.prev != null && <circle cx={x(hover)} cy={y(hv!.prev)} r="4" fill="var(--ink-muted)" />}</g>}
      </svg>
      {hv && <div className="tip" style={{ left: `${(x(hover!) / W) * 100}%`, top: `${(y(hv.value) / H) * 100}%` }}><strong>{hv.label}</strong><br />{format(hv.value)}{showPrev && hv.prev != null && <span style={{ opacity: 0.75 }}> · was {format(hv.prev)}</span>}</div>}
    </div>
  );
}

export function Donut({ parts, format }: { parts: { label: string; value: number; color: string }[]; format: (n: number) => string }) {
  const [on, setOn] = useState<number | null>(null);
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  let acc = 0;
  const R = 52, C = 2 * Math.PI * R;
  return (
    <div className="row" style={{ gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
      <svg width="140" height="140" viewBox="0 0 140 140" role="img" aria-label="Share chart">
        <g transform="rotate(-90 70 70)">
          {parts.map((p, i) => { const len = (p.value / total) * C; const el = <circle key={i} cx="70" cy="70" r={R} fill="none" stroke={p.color} strokeWidth={on === i ? 22 : 18} strokeDasharray={`${Math.max(0, len - 2)} ${C}`} strokeDashoffset={-acc} onMouseEnter={() => setOn(i)} onMouseLeave={() => setOn(null)} style={{ transition: 'stroke-width .15s' }} />; acc += len; return el; })}
        </g>
        <text x="70" y="66" textAnchor="middle" fontSize="12" fill="var(--ink-muted)">{on != null ? parts[on].label : 'Total'}</text>
        <text x="70" y="86" textAnchor="middle" fontSize="18" fontWeight="800" fill="var(--ink)">{format(on != null ? parts[on].value : total)}</text>
      </svg>
      <div className="col" style={{ gap: 6, flex: 1, minWidth: 140 }}>
        {parts.map((p, i) => <div key={i} className="row between small" onMouseEnter={() => setOn(i)} onMouseLeave={() => setOn(null)}><span><i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: p.color, marginRight: 8 }} />{p.label}</span><strong>{Math.round((p.value / total) * 100)}%</strong></div>)}
      </div>
    </div>
  );
}

export function HBars({ rows, format, color = 'var(--cherry)', onPick }: { rows: { label: string; value: number; sub?: string; id?: string }[]; format: (n: number) => string; color?: string; onPick?: (id: string) => void }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="col" style={{ gap: 10 }}>
      {rows.map((r, i) => (
        <button key={i} className="col" style={{ all: 'unset', cursor: onPick && r.id ? 'pointer' : 'default', display: 'flex', flexDirection: 'column', gap: 4 }} onClick={() => r.id && onPick?.(r.id)}>
          <span className="row between small"><span>{r.label}{r.sub && <span className="muted"> · {r.sub}</span>}</span><strong>{format(r.value)}</strong></span>
          <span className="bar" style={{ height: 8 }}><i style={{ width: `${(r.value / max) * 100}%`, background: color }} /></span>
        </button>
      ))}
    </div>
  );
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function Heatmap({ cells }: { cells: { dow: number; hour: number; orders: number }[] }) {
  const [tip, setTip] = useState<string | null>(null);
  const hours = Array.from({ length: 13 }, (_, i) => i + 7);
  const max = Math.max(1, ...cells.map((c) => c.orders));
  const get = (d: number, h: number) => cells.find((c) => c.dow === d && c.hour === h)?.orders || 0;
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: `42px repeat(${hours.length}, 1fr)`, gap: 3 }} role="img" aria-label="Orders by weekday and hour">
        <span />{hours.map((h) => <span key={h} className="small muted center" style={{ fontSize: 11 }}>{h}</span>)}
        {[1, 2, 3, 4, 5, 6, 0].map((d) => (
          <div key={d} style={{ display: 'contents' }}>
            <span className="small muted" style={{ alignSelf: 'center' }}>{DAYS[d]}</span>
            {hours.map((h) => { const v = get(d, h); return <div key={h} className="hmcell" onMouseEnter={() => setTip(`${DAYS[d]} ${h}:00, ${v} orders`)} onMouseLeave={() => setTip(null)} style={{ background: v ? `color-mix(in srgb, var(--cherry) ${Math.max(10, (v / max) * 100)}%, var(--surface-sunk))` : 'var(--surface-sunk)' }} />; })}
          </div>
        ))}
      </div>
      <p className="small muted" style={{ marginTop: 8, minHeight: 20 }}>{tip || 'Hover a square to see the orders. Darker is busier.'}</p>
    </div>
  );
}
