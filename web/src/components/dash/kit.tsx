'use client';
import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../icons';
import { Sparkline } from './charts';

export function pctDelta(cur: number, prev: number) { if (!prev) return cur ? 100 : 0; return Math.round(((cur - prev) / prev) * 1000) / 10; }

export function Delta({ value, invert }: { value: number | null; invert?: boolean }) {
  if (value == null) return null;
  const good = invert ? value < 0 : value > 0;
  const cls = value === 0 ? 'flat' : good ? 'up' : 'down';
  return <span className={`delta ${cls}`}><Icon name={value >= 0 ? 'up' : 'dn'} size={14} stroke={2.4} />{Math.abs(value)}%</span>;
}

export function Kpi({ label, value, delta, invert, spark, hint, onClick }: { label: string; value: React.ReactNode; delta?: number | null; invert?: boolean; spark?: number[]; hint?: string; onClick?: () => void }) {
  const Tag: any = onClick ? 'button' : 'div';
  return (
    <Tag className="kpi" onClick={onClick} style={onClick ? { textAlign: 'left', font: 'inherit', color: 'inherit', cursor: 'pointer' } : undefined}>
      <span className="kl">{label}</span><span className="kv">{value}</span>
      <span className="row small" style={{ gap: 6 }}>{delta != null && <Delta value={delta} invert={invert} />}<span className="muted">{hint || (delta != null ? 'vs previous period' : '')}</span></span>
      {spark && <Sparkline values={spark} />}
    </Tag>
  );
}

export function Skeleton({ h = 120, n = 1 }: { h?: number; n?: number }) {
  return <div className="col">{Array.from({ length: n }).map((_, i) => <div key={i} className="skel" style={{ height: h }} />)}</div>;
}

export function Seg({ options, value, onChange }: { options: { id: any; label: string }[]; value: any; onChange: (v: any) => void }) {
  return <div className="seg" role="tablist">{options.map((o) => <button key={String(o.id)} role="tab" aria-selected={value === o.id} className={value === o.id ? 'on' : ''} onClick={() => onChange(o.id)}>{o.label}</button>)}</div>;
}

export function Drawer({ title, onClose, children, width }: { title: string; onClose: () => void; children: React.ReactNode; width?: number }) {
  useEffect(() => { const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose]);
  return (
    <div className="drawer-bg" onClick={onClose}>
      <aside className="drawer" style={width ? { width } : undefined} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="row between" style={{ marginBottom: 16 }}><h3>{title}</h3><button className="iconbtn" onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button></div>
        {children}
      </aside>
    </div>
  );
}

export type Col<T> = { key: string; label: string; num?: boolean; sort?: (r: T) => number | string; render: (r: T) => React.ReactNode; csv?: (r: T) => string | number; hideSm?: boolean };

/** Searchable, sortable table with CSV export and row click. */
export function DataTable<T extends { id?: string }>({ rows, cols, search, onRow, empty = 'Nothing to show.', csvName, pageSize = 25, toolbar }: { rows: T[]; cols: Col<T>[]; search?: (r: T) => string; onRow?: (r: T) => void; empty?: string; csvName?: string; pageSize?: number; toolbar?: React.ReactNode }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ k: string; dir: 1 | -1 } | null>(null);
  const [page, setPage] = useState(0);
  const view = useMemo(() => {
    let r = q && search ? rows.filter((x) => search(x).toLowerCase().includes(q.toLowerCase())) : rows;
    if (sort) { const c = cols.find((c) => c.key === sort.k); if (c?.sort) r = [...r].sort((a, b) => { const x = c.sort!(a), y = c.sort!(b); return (x > y ? 1 : x < y ? -1 : 0) * sort.dir; }); }
    return r;
  }, [rows, q, sort]);
  useEffect(() => setPage(0), [q, sort, rows.length]);
  const pages = Math.max(1, Math.ceil(view.length / pageSize));
  const shown = view.slice(page * pageSize, page * pageSize + pageSize);
  function csv() {
    const head = cols.map((c) => c.label).join(',');
    const body = view.map((r) => cols.map((c) => JSON.stringify(c.csv ? c.csv(r) : (c.sort ? c.sort(r) : '') ?? '')).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([`${head}\n${body}`], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = `${csvName || 'sadhai'}.csv`; a.click(); URL.revokeObjectURL(url);
  }
  return (
    <div>
      <div className="row wrap" style={{ marginBottom: 12 }}>
        {search && <div className="searchbar" style={{ minHeight: 40, flex: '1 1 220px', maxWidth: 360 }}><Icon name="search" size={18} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search this list" aria-label="Search this list" style={{ minHeight: 36 }} /></div>}
        {toolbar}<div className="grow" />
        <span className="small muted">{view.length.toLocaleString()} rows</span>
        {csvName && <button className="btn sm ghost" onClick={csv}><Icon name="down" size={16} />Export CSV</button>}
      </div>
      <div className="tablewrap"><table>
        <thead><tr>{cols.map((c) => <th key={c.key} className={`${c.num ? 'num' : ''} ${c.sort ? 'sortable' : ''}`} onClick={() => c.sort && setSort(sort?.k === c.key ? { k: c.key, dir: (sort.dir * -1) as 1 | -1 } : { k: c.key, dir: -1 })} aria-sort={sort?.k === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>{c.label}{sort?.k === c.key ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}</th>)}</tr></thead>
        <tbody>{shown.map((r, i) => <tr key={r.id || i} onClick={() => onRow?.(r)} style={onRow ? { cursor: 'pointer' } : undefined} className={onRow ? 'rowhover' : ''}>{cols.map((c) => <td key={c.key} className={c.num ? 'num' : ''}>{c.render(r)}</td>)}</tr>)}</tbody>
      </table></div>
      {!view.length && <p className="muted center" style={{ padding: 24 }}>{empty}</p>}
      {pages > 1 && <div className="row between" style={{ marginTop: 12 }}><button className="btn sm ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button><span className="small muted">Page {page + 1} of {pages}</span><button className="btn sm ghost" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Next</button></div>}
    </div>
  );
}
