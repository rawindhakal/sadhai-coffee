'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { rs } from '@/lib/api';

/* ---------- toast ---------- */
const ToastCtx = createContext<(m: string, bad?: boolean) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [t, setT] = useState<{ m: string; bad?: boolean } | null>(null);
  const show = useCallback((m: string, bad?: boolean) => { setT({ m, bad }); setTimeout(() => setT(null), 3500); }, []);
  return <ToastCtx.Provider value={show}>{children}{t && <div className={`toast ${t.bad ? 'bad' : ''}`} role="status">{t.m}</div>}</ToastCtx.Provider>;
}

/* ---------- shell ---------- */
export type NavItem = { href: string; label: string };
export function Shell({ nav, children, wide = true }: { nav?: NavItem[]; children: React.ReactNode; wide?: boolean }) {
  const { user, logout } = useAuth();
  const path = usePathname();
  const router = useRouter();
  return (
    <>
      <header className="topbar">
        <div className="container">
          <Link href="/" className="brand"><img src="/mark-cherry.svg" alt="" />sadhai</Link>
          <nav className="nav grow" aria-label="Main">
            {nav?.map((n) => <Link key={n.href} href={n.href} className={path === n.href || (n.href !== '/' && path.startsWith(n.href + '/')) ? 'active' : ''}>{n.label}</Link>)}
          </nav>
          {user ? (
            <div className="row">
              <span className="small muted hide-sm">{user.name}</span>
              <button className="btn ghost sm" onClick={async () => { await logout(); router.replace('/'); }}>Sign out</button>
            </div>
          ) : <Link className="btn primary sm" href="/login">Sign in</Link>}
        </div>
      </header>
      <main className="container page" style={wide ? undefined : { maxWidth: 760 }}>{children}</main>
    </>
  );
}

export function Tabs({ tabs, value, onChange }: { tabs: { id: any; label: string; badge?: number }[]; value: any; onChange: (v: any) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} className={`tab ${value === t.id ? 'active' : ''}`} onClick={() => onChange(t.id)}>
          {t.label}{t.badge ? ` (${t.badge})` : ''}
        </button>
      ))}
    </div>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => { const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose]);
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="row between" style={{ marginBottom: 16 }}><h3>{title}</h3><button className="btn ghost sm" onClick={onClose}>Close</button></div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return <div className="field"><label>{label}</label>{children}{hint && <span className="small muted">{hint}</span>}</div>;
}

export function Stat({ label, value, delta, tone }: { label: string; value: React.ReactNode; delta?: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="card flat stat">
      <div className="v">{value}</div><div className="l">{label}</div>
      {delta && <div className="d" style={{ color: tone === 'bad' ? 'var(--cherry)' : tone === 'good' ? 'var(--hill)' : 'var(--ink-muted)' }}>{delta}</div>}
    </div>
  );
}

const STATUS: Record<string, [string, string]> = {
  awaiting_payment: ['Awaiting payment', 'marigold'], placed: ['Received', ''], preparing: ['Making', 'roast'], ready: ['Ready', 'hill'], picked_up: ['Picked up', ''], cancelled: ['Cancelled', 'cherry'],
  paid: ['Paid', 'hill'], unpaid: ['Pay at counter', 'marigold'], refunded: ['Refunded', 'cherry'], active: ['Active', 'hill'], used: ['Used', ''], expired: ['Expired', ''],
};
export const Status = ({ s }: { s: string }) => { const [l, c] = STATUS[s] || [s, '']; return <span className={`chip ${c}`}>{l}</span>; };

export function Loading({ what = 'Loading' }: { what?: string }) { return <p className="muted" role="status">{what}…</p>; }
export function Empty({ children }: { children: React.ReactNode }) { return <div className="card flat center muted">{children}</div>; }
export function ErrorNote({ error }: { error?: string | null }) { return error ? <p className="err" role="alert">{error}</p> : null; }

/* ---------- data hook ---------- */
import { api } from '@/lib/api';
export function useData<T = any>(path: string | null, deps: any[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  const load = useCallback(async () => {
    if (!path) return;
    try { setData(await api<T>(path)); setError(null); } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }, [path]);
  useEffect(() => { setLoading(!!path); load(); }, [load, ...deps]);
  return { data, error, loading, reload: load, setData };
}

/* ---------- charts (dependency-free SVG) ---------- */
export function BarChart({ data, x, y, height = 160, format = (v: number) => String(v) }: { data: any[]; x: string; y: string; height?: number; format?: (v: number) => string }) {
  if (!data.length) return <Empty>No data in this period.</Empty>;
  const max = Math.max(...data.map((d) => d[y]), 1);
  const w = 100 / data.length;
  return (
    <svg viewBox={`0 0 ${data.length * 20} ${height}`} width="100%" height={height} preserveAspectRatio="none" role="img" aria-label={`${y} by ${x}`}>
      {data.map((d, i) => {
        const h = Math.max(1, (d[y] / max) * (height - 28));
        return (
          <g key={i}>
            <rect x={i * 20 + 3} y={height - 20 - h} width={14} height={h} rx={3} fill="var(--cherry)"><title>{`${d[x]}: ${format(d[y])}`}</title></rect>
          </g>
        );
      })}
      {data.length <= 24 && data.map((d, i) => <text key={i} x={i * 20 + 10} y={height - 5} fontSize="8" textAnchor="middle" fill="var(--ink-muted)">{String(d[x]).slice(-5)}</text>)}
    </svg>
  );
}

export function LineChart({ data, x, y, height = 180, format = (v: number) => rs(v) }: { data: any[]; x: string; y: string; height?: number; format?: (v: number) => string }) {
  if (data.length < 2) return <Empty>Not enough data yet.</Empty>;
  const max = Math.max(...data.map((d) => d[y]), 1);
  const W = 600, H = height, pad = 24;
  const pts = data.map((d, i) => [pad + (i / (data.length - 1)) * (W - pad * 2), H - 24 - (d[y] / max) * (H - 48)]);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${y} over time`}>
      <path d={`${path} L${pts[pts.length - 1][0]},${H - 24} L${pts[0][0]},${H - 24} Z`} fill="var(--cherry)" opacity="0.1" />
      <path d={path} fill="none" stroke="var(--cherry)" strokeWidth="2.5" strokeLinejoin="round" />
      {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="3" fill="var(--cherry)"><title>{`${data[i][x]}: ${format(data[i][y])}`}</title></circle>)}
      <text x={pad} y={H - 6} fontSize="11" fill="var(--ink-muted)">{String(data[0][x]).slice(0, 10)}</text>
      <text x={W - pad} y={H - 6} fontSize="11" textAnchor="end" fill="var(--ink-muted)">{String(data[data.length - 1][x]).slice(0, 10)}</text>
      <text x={pad} y={14} fontSize="11" fill="var(--ink-muted)">{format(max)}</text>
    </svg>
  );
}

export function Meter({ pct, label }: { pct: number; label?: string }) {
  const tone = pct >= 100 ? '' : pct >= 60 ? 'warn' : 'bad';
  return <div><div className={`bar ${tone}`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}><i style={{ width: `${Math.min(100, pct)}%` }} /></div></div>;
}
