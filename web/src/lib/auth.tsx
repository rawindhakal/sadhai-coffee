'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, BASE, home, store, User } from './api';

type Ctx = { user: User | null; ready: boolean; login: (phone: string, password: string) => Promise<User>; register: (b: any) => Promise<User>; logout: () => Promise<void>; setUser: (u: User) => void };
const AuthCtx = createContext<Ctx>(null as any);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => { setUserState(store.get()?.user || null); setReady(true); }, []);

  const finish = (j: any) => { store.set({ access: j.access_token, refresh: j.refresh_token, user: j.user }); setUserState(j.user); return j.user as User; };
  const login = useCallback(async (phone: string, password: string) => finish(await api('/auth/login', { method: 'POST', body: { phone, password }, auth: false })), []);
  const register = useCallback(async (b: any) => finish(await api('/auth/register', { method: 'POST', body: b, auth: false })), []);
  const logout = useCallback(async () => {
    const s = store.get();
    if (s) await api('/auth/logout', { method: 'POST', body: { refresh_token: s.refresh }, auth: false }).catch(() => {});
    store.set(null); setUserState(null);
  }, []);
  const setUser = (u: User) => { const s = store.get(); if (s) store.set({ ...s, user: u }); setUserState(u); };
  return <AuthCtx.Provider value={{ user, ready, login, register, logout, setUser }}>{children}</AuthCtx.Provider>;
}

/** Redirects to /login (or the user's own home) unless the signed-in role is allowed. */
export function useRequireRole(...roles: string[]) {
  const { user, ready } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!ready) return;
    if (!user) router.replace('/login');
    else if (roles.length && !roles.includes(user.role)) router.replace(home(user.role));
  }, [ready, user]);
  return ready && user && (!roles.length || roles.includes(user.role)) ? user : null;
}

/** Subscribes to server-sent events (orders, stock, notifications). Reconnects automatically (EventSource does). */
export function useEvents(handler: (event: string, data: any) => void, events = ['order', 'order_new', 'notification', 'stock', 'stock_low', 'station', 'menu']) {
  const ref = useRef(handler);
  ref.current = handler;
  const { user } = useAuth();
  useEffect(() => {
    if (!user) return;
    let es: EventSource | null = null;
    let closed = false;
    const connect = () => {
      const s = store.get();
      if (!s || closed) return;
      es = new EventSource(`${BASE}/events?access_token=${encodeURIComponent(s.access)}`);
      for (const ev of events) es.addEventListener(ev, (e: any) => { try { ref.current(ev, JSON.parse(e.data)); } catch {} });
      es.onerror = () => { es?.close(); if (!closed) setTimeout(async () => { await api('/me').catch(() => {}); connect(); }, 3000); };
    };
    connect();
    return () => { closed = true; es?.close(); };
  }, [user?.id]);
}
