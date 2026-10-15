export const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4747';
const KEY = 'sadhai.auth';

export type User = { id: string; name: string; phone: string; email?: string; role: 'customer' | 'station' | 'manager' | 'owner'; station_id?: string | null; lang: 'en' | 'ne'; referral_code?: string; beans?: number };
type Stored = { access: string; refresh: string; user: User };

export const store = {
  get(): Stored | null { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } },
  set(s: Stored | null) { try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); } catch {} },
};

export class ApiError extends Error { status: number; code?: string; constructor(m: string, s: number, c?: string) { super(m); this.status = s; this.code = c; } }

let refreshing: Promise<boolean> | null = null;
async function refresh(): Promise<boolean> {
  const s = store.get();
  if (!s) return false;
  refreshing ||= (async () => {
    try {
      const r = await fetch(`${BASE}/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: s.refresh }) });
      if (!r.ok) { store.set(null); return false; }
      const j = await r.json();
      store.set({ access: j.access_token, refresh: j.refresh_token, user: j.user });
      return true;
    } catch { return false; } finally { setTimeout(() => (refreshing = null), 0); }
  })();
  return refreshing;
}

export async function api<T = any>(path: string, opts: { method?: string; body?: any; auth?: boolean } = {}, retry = true): Promise<T> {
  const s = store.get();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.auth !== false && s) headers.Authorization = `Bearer ${s.access}`;
  let r: Response;
  try {
    r = await fetch(`${BASE}${path}`, { method: opts.method || 'GET', headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
  } catch { throw new ApiError('Cannot reach the server. Check your connection.', 0); }
  if (r.status === 401 && retry && s && (await refresh())) return api<T>(path, opts, false);
  if (r.status === 204) return undefined as T;
  const text = await r.text();
  let j: any; try { j = JSON.parse(text); } catch { j = text; }
  if (!r.ok) {
    if (r.status === 401) { store.set(null); if (typeof window !== 'undefined' && !location.pathname.startsWith('/login')) location.href = '/login'; }
    throw new ApiError(j?.error || 'Something went wrong', r.status, j?.code);
  }
  return j as T;
}

export const rs = (n: number | null | undefined) => `Rs ${Number(n || 0).toLocaleString('en-IN')}`;
export const fmtTime = (d: string) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kathmandu' });
export const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Kathmandu' });
export const fmtDateTime = (d: string) => `${fmtDate(d)}, ${fmtTime(d)}`;
export const ago = (d: string) => { const s = Math.max(0, (Date.now() - new Date(d).getTime()) / 1000); return s < 60 ? `${Math.floor(s)}s` : s < 3600 ? `${Math.floor(s / 60)}m` : `${Math.floor(s / 3600)}h`; };
export const home = (role: string) => ({ customer: '/order', station: '/station', manager: '/manager', owner: '/owner' } as any)[role] || '/';
