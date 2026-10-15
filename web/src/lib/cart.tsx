'use client';
import { createContext, useContext, useEffect, useState } from 'react';

export type Line = { key: string; product: any; qty: number; option_ids: string[]; optionNames: string[]; unit: number };
type Station = { id: string; name: string; name_ne?: string; address?: string; open_now?: boolean; distance_km?: number | null; lat?: number; lng?: number };
type Ctx = {
  station: Station | null; setStation: (s: Station | null) => void;
  lines: Line[]; add: (l: Line) => void; setQty: (key: string, qty: number) => void; remove: (key: string) => void; clear: () => void;
  count: number; total: number; ready: boolean;
};
const CartCtx = createContext<Ctx>(null as any);
export const useCart = () => useContext(CartCtx);
const KEY = 'sadhai.cart.v2';

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [station, setStationState] = useState<Station | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try { const j = JSON.parse(localStorage.getItem(KEY) || 'null'); if (j) { setStationState(j.station); setLines(j.lines || []); } } catch {}
    setReady(true);
  }, []);
  useEffect(() => { if (ready) try { localStorage.setItem(KEY, JSON.stringify({ station, lines })); } catch {} }, [station, lines, ready]);

  const setStation = (s: Station | null) => { if (s?.id !== station?.id) setLines([]); setStationState(s); };
  const add = (l: Line) => setLines((cur) => { const ex = cur.find((x) => x.key === l.key); return ex ? cur.map((x) => (x === ex ? { ...x, qty: Math.min(10, x.qty + l.qty) } : x)) : [...cur, l]; });
  const setQty = (key: string, qty: number) => setLines((cur) => (qty <= 0 ? cur.filter((x) => x.key !== key) : cur.map((x) => (x.key === key ? { ...x, qty: Math.min(10, qty) } : x))));
  const remove = (key: string) => setLines((cur) => cur.filter((x) => x.key !== key));
  const clear = () => setLines([]);
  const count = lines.reduce((a, l) => a + l.qty, 0);
  const total = lines.reduce((a, l) => a + l.qty * l.unit, 0);
  return <CartCtx.Provider value={{ station, setStation, lines, add, setQty, remove, clear, count, total, ready }}>{children}</CartCtx.Provider>;
}

/** Default selection for a product (used for one-tap add). Returns null when a required choice has no default. */
export function quickLine(p: any): Line | null {
  const ids: string[] = []; const names: string[] = []; let delta = 0;
  for (const g of p.option_groups || []) {
    const defs = g.options.filter((o: any) => o.is_default);
    if (g.required && !defs.length) return null;
    for (const o of defs) { ids.push(o.id); names.push(o.name); delta += o.price_delta; }
  }
  return { key: `${p.id}|${[...ids].sort().join(',')}`, product: { id: p.id, name: p.name, name_ne: p.name_ne, kind: p.kind }, qty: 1, option_ids: ids, optionNames: names, unit: p.price + delta };
}
