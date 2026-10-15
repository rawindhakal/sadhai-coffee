'use client';
import { useEffect, useMemo, useState } from 'react';
import { api, fmtDate, fmtDateTime, rs } from '@/lib/api';
import { Empty, ErrorNote, Field, Loading, Meter, Modal, Stat, Status, useData, useToast } from './ui';
import { DataTable, Kpi, Seg, Skeleton } from './dash/kit';
import { useDash } from './dash/shell';

export const fmtQty = (q: number, unit: string) => {
  const n = Number(q) || 0;
  if (unit === 'g' && Math.abs(n) >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)} kg`;
  if (unit === 'ml' && Math.abs(n) >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)} L`;
  return `${Math.round(n * 10) / 10} ${unit}`;
};
const money = (n: number, d = 2) => `Rs ${Number(n).toLocaleString('en-IN', { maximumFractionDigits: d })}`;
const STATUS_CHIP: Record<string, string> = { requested: 'marigold', dispatched: 'roast', received: 'hill', cancelled: 'cherry', ordered: 'marigold', draft: '', };

/* ================================ Ingredient prices ================================ */
export function IngredientsTab({ canEdit }: { canEdit: boolean }) {
  const { data, reload, error } = useData<any[]>('/central/stock');
  const sup = useData<any[]>(canEdit ? '/central/suppliers' : null);
  const toast = useToast();
  const [edit, setEdit] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [hist, setHist] = useState<any[] | null>(null);
  if (!canEdit) return <Empty>Ingredient prices are managed by the owner and the warehouse manager.</Empty>;
  if (!data) return <><ErrorNote error={error} /><Skeleton h={50} n={6} /></>;
  const blank = { name: '', unit: 'g', category: 'ingredient', pack_unit: 'kg', pack_size: 1000, pack_price: 0, waste_pct: 0, supplier_id: '', central_reorder: 0, central_par: 0 };
  async function save() {
    const b = { ...edit, pack_size: Number(edit.pack_size), pack_price: Number(edit.pack_price), waste_pct: Number(edit.waste_pct), central_reorder: Number(edit.central_reorder), central_par: Number(edit.central_par), supplier_id: edit.supplier_id || null };
    try {
      if (edit.id) { const out = await api(`/central/ingredients/${edit.id}`, { method: 'PATCH', body: b }); setResult(out.affected_products); }
      else await api('/central/ingredients', { method: 'POST', body: b });
      setEdit(null); reload(); toast('Saved');
    } catch (e: any) { toast(e.message, true); }
  }
  const unitCost = edit ? (Number(edit.pack_size) > 0 ? Number(edit.pack_price) / Number(edit.pack_size) : 0) : 0;
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="panel">
        <div className="ph"><div><h3>Ingredients and prices</h3><p className="small muted">Change a price and every recipe that uses it is re-costed straight away. Wastage is added to both the cost and the stock a sale uses.</p></div><button className="btn primary sm" onClick={() => setEdit(blank)}>Add ingredient</button></div>
        <DataTable csvName="ingredients" rows={data} search={(r: any) => `${r.name} ${r.supplier_name || ''} ${r.category}`} onRow={(r: any) => setEdit({ ...r, supplier_id: r.supplier_id || '' })}
          cols={[
            { key: 'name', label: 'Item', sort: (r: any) => r.name, render: (r: any) => <><strong>{r.name}</strong><div className="small muted">{r.category}</div></> },
            { key: 'pack', label: 'Bought as', render: (r: any) => `${r.pack_size.toLocaleString()} ${r.unit} per ${r.pack_unit}`, csv: (r: any) => `${r.pack_size} ${r.unit} per ${r.pack_unit}` },
            { key: 'price', label: 'Pack price', num: true, sort: (r: any) => r.pack_price, render: (r: any) => money(r.pack_price, 0) },
            { key: 'unit', label: `Cost per unit`, num: true, sort: (r: any) => r.unit_cost, render: (r: any) => `${money(r.unit_cost, 3)} / ${r.unit}` },
            { key: 'waste', label: 'Wastage', num: true, sort: (r: any) => r.waste_pct, render: (r: any) => (r.waste_pct ? `${r.waste_pct}%` : '–') },
            { key: 'eff', label: 'Effective cost', num: true, sort: (r: any) => r.effective_unit_cost, render: (r: any) => `${money(r.effective_unit_cost, 3)} / ${r.unit}` },
            { key: 'sup', label: 'Supplier', sort: (r: any) => r.supplier_name || '', render: (r: any) => r.supplier_name || '–' },
          ]} />
      </div>
      {result && (
        <Modal title="Recipes re-costed" onClose={() => setResult(null)}>
          {!result.length ? <p className="muted">No drink or item uses this ingredient, so no costs moved.</p> : (
            <div className="col" style={{ gap: 6 }}>{result.map((p: any) => { const was = Math.round((p.before / p.price) * 100), now = Math.round((p.after / p.price) * 100); return <div key={p.id} className="row between"><span><strong>{p.name}</strong> <span className="small muted">price {rs(p.price)}</span></span><span>{rs(p.before)} → <strong style={{ color: p.after > p.before ? 'var(--cherry)' : 'var(--hill)' }}>{rs(p.after)}</strong> <span className="small muted">({was}% → {now}%)</span></span></div>; })}</div>
          )}
        </Modal>
      )}
      {edit && (
        <Modal title={edit.id ? edit.name : 'New ingredient'} onClose={() => { setEdit(null); setHist(null); }}>
          <div className="col">
            <Field label="Name"><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <div className="grid g3"><Field label="Used in recipes as"><select value={edit.unit} disabled={!!edit.id} onChange={(e) => setEdit({ ...edit, unit: e.target.value })}><option value="g">grams</option><option value="ml">millilitres</option><option value="pcs">pieces</option></select></Field>
              <Field label="Type"><select value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })}><option value="ingredient">Ingredient</option><option value="packaging">Packaging</option><option value="retail">Retail</option></select></Field>
              <Field label="Supplier"><select value={edit.supplier_id} onChange={(e) => setEdit({ ...edit, supplier_id: e.target.value })}><option value="">None</option>{sup.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field></div>
            <div className="grid g3"><Field label="Bought by the" hint="kg, L, box…"><input value={edit.pack_unit} onChange={(e) => setEdit({ ...edit, pack_unit: e.target.value })} /></Field>
              <Field label={`${edit.unit} in one pack`}><input type="number" value={edit.pack_size} onChange={(e) => setEdit({ ...edit, pack_size: e.target.value })} /></Field>
              <Field label="Price of one pack (Rs)"><input type="number" value={edit.pack_price} onChange={(e) => setEdit({ ...edit, pack_price: e.target.value })} /></Field></div>
            <div className="grid g3"><Field label="Allowed wastage (%)" hint="Added to cost and stock use"><input type="number" min={0} max={60} value={edit.waste_pct} onChange={(e) => setEdit({ ...edit, waste_pct: e.target.value })} /></Field>
              <Field label="Reorder central stock at"><input type="number" value={edit.central_reorder} onChange={(e) => setEdit({ ...edit, central_reorder: e.target.value })} /></Field>
              <Field label="Top up central stock to"><input type="number" value={edit.central_par} onChange={(e) => setEdit({ ...edit, central_par: e.target.value })} /></Field></div>
            <div className="card flat small">That is <strong>{money(unitCost, 4)}</strong> per {edit.unit}, or <strong>{money(unitCost * (1 + Number(edit.waste_pct || 0) / 100), 4)}</strong> once {edit.waste_pct || 0}% wastage is counted.</div>
            <div className="row"><button className="btn primary grow" onClick={save} disabled={edit.name.length < 2}>Save</button>{edit.id && <button className="btn ghost" onClick={async () => setHist(await api(`/central/ingredients/${edit.id}/history`))}>Price history</button>}</div>
            {hist && <div className="small col" style={{ gap: 4 }}>{hist.map((h: any) => <div key={h.id} className="row between"><span>{fmtDate(h.created_at)} · {h.source}{h.by ? ` · ${h.by}` : ''}</span><span>{money(h.pack_price, 0)} per pack · {h.waste_pct}% waste</span></div>)}</div>}
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ================================ Central stock ================================ */
export function CentralStockTab({ goPurchase }: { goPurchase: () => void }) {
  const { data, reload, error } = useData<any[]>('/central/stock');
  const val = useData<any>('/central/valuation');
  const toast = useToast();
  const [adj, setAdj] = useState<any>(null);
  const [cat, setCat] = useState('all');
  if (!data) return <><ErrorNote error={error} /><Skeleton h={50} n={6} /></>;
  const rows = data.filter((r) => cat === 'all' || r.category === cat);
  async function save() {
    try { await api(`/central/stock/${adj.id}/adjust`, { method: 'POST', body: { reason: adj.reason, ...(adj.mode === 'set' ? { qty: Number(adj.amt) } : { delta: adj.reason === 'waste' ? -Math.abs(Number(adj.amt)) : Number(adj.amt) }) } }); setAdj(null); reload(); toast('Central stock updated'); } catch (e: any) { toast(e.message, true); }
  }
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="grid g4">
        <Kpi label="Central store value" value={rs(val.data?.central)} hint="at standard cost" />
        <Kpi label="Stations hold" value={rs(val.data?.stations_total)} hint="stock at the counters" />
        <Kpi label="Total inventory" value={rs(val.data?.total)} />
        <Kpi label="Low in the central store" value={data.filter((r) => r.low).length} hint={data.filter((r) => r.low).length ? 'Time to order' : 'All good'} onClick={goPurchase} />
      </div>
      <div className="panel">
        <div className="ph"><h3>Central store</h3><Seg value={cat} onChange={setCat} options={[{ id: 'all', label: 'All' }, { id: 'ingredient', label: 'Ingredients' }, { id: 'packaging', label: 'Packaging' }, { id: 'retail', label: 'Retail' }]} /></div>
        <DataTable csvName="central-stock" rows={rows} search={(r: any) => r.name} pageSize={30}
          cols={[
            { key: 'name', label: 'Item', sort: (r: any) => r.name, render: (r: any) => <><strong>{r.name}</strong> {r.low && <span className="chip cherry">Low</span>}<div className="small muted">{r.supplier_name || 'No supplier'}</div></> },
            { key: 'qty', label: 'In the central store', num: true, sort: (r: any) => r.central_qty, render: (r: any) => <div style={{ minWidth: 150 }}><strong>{fmtQty(r.central_qty, r.unit)}</strong>{r.central_par > 0 && <Meter pct={Math.round((r.central_qty / r.central_par) * 100)} label={`${r.name} against top-up level`} />}</div>, csv: (r: any) => r.central_qty },
            { key: 'reorder', label: 'Reorder at', num: true, render: (r: any) => (r.central_reorder ? fmtQty(r.central_reorder, r.unit) : '–') },
            { key: 'order', label: 'On order', num: true, sort: (r: any) => r.on_order, render: (r: any) => (r.on_order ? fmtQty(r.on_order, r.unit) : '–') },
            { key: 'st', label: 'At stations', num: true, sort: (r: any) => r.stations_qty, render: (r: any) => fmtQty(r.stations_qty, r.unit) },
            { key: 'val', label: 'Value', num: true, sort: (r: any) => r.value, render: (r: any) => rs(r.value) },
            { key: 'act', label: '', render: (r: any) => <button className="btn sm" onClick={(e) => { e.stopPropagation(); setAdj({ ...r, mode: 'delta', reason: 'adjust', amt: '' }); }}>Adjust</button> },
          ]} />
      </div>
      {adj && (
        <Modal title={`${adj.name} · ${fmtQty(adj.central_qty, adj.unit)} in store`} onClose={() => setAdj(null)}>
          <div className="row wrap" style={{ marginBottom: 12 }}><Seg value={adj.reason} onChange={(v: string) => setAdj({ ...adj, reason: v, mode: v === 'waste' ? 'delta' : adj.mode })} options={[{ id: 'adjust', label: 'Correct the count' }, { id: 'waste', label: 'Wasted or damaged' }]} />
            {adj.reason === 'adjust' && <Seg value={adj.mode} onChange={(v: string) => setAdj({ ...adj, mode: v })} options={[{ id: 'delta', label: 'Add or remove' }, { id: 'set', label: 'Set the total' }]} />}</div>
          <Field label={`${adj.mode === 'set' ? 'New total' : 'Amount'} (${adj.unit})`}><input type="number" value={adj.amt} onChange={(e) => setAdj({ ...adj, amt: e.target.value })} autoFocus /></Field>
          <button className="btn primary block" style={{ marginTop: 16 }} disabled={adj.amt === ''} onClick={save}>Save</button>
        </Modal>
      )}
    </div>
  );
}

/* ================================ Purchasing ================================ */
export function PurchasesTab() {
  const pos = useData<any[]>('/central/purchases');
  const sug = useData<any[]>('/central/suggestions');
  const sup = useData<any[]>('/central/suppliers');
  const ings = useData<any[]>('/central/stock');
  const toast = useToast();
  const [form, setForm] = useState<any>(null);
  const [recv, setRecv] = useState<any>(null);
  const [supForm, setSupForm] = useState<any>(null);
  async function create() {
    try { await api('/central/purchases', { method: 'POST', body: { supplier_id: form.supplier_id || undefined, note: form.note || undefined, lines: form.lines.filter((l: any) => l.ingredient_id && Number(l.packs) > 0).map((l: any) => ({ ingredient_id: l.ingredient_id, packs: Number(l.packs), pack_price: l.pack_price === '' ? undefined : Number(l.pack_price) })) } }); setForm(null); pos.reload(); sug.reload(); toast('Purchase order created'); } catch (e: any) { toast(e.message, true); }
  }
  async function receive() {
    try { await api(`/central/purchases/${recv.id}/receive`, { method: 'POST', body: { invoice_no: recv.invoice || undefined, update_standard_cost: recv.update, lines: recv.lines.map((l: any) => ({ line_id: l.id, qty_received: Number(l.got), unit_cost: Number(l.cost) })) } }); setRecv(null); pos.reload(); sug.reload(); toast('Stock received into the central store'); } catch (e: any) { toast(e.message, true); }
  }
  function fromSuggestions() {
    const by = new Map<string, any[]>();
    for (const s of sug.data || []) { const k = s.supplier_id || ''; by.set(k, [...(by.get(k) || []), s]); }
    const first = [...by.entries()][0];
    if (!first) return;
    setForm({ supplier_id: first[0], note: 'Top-up to par', lines: first[1].map((s) => ({ ingredient_id: s.ingredient_id, packs: s.suggested_packs, pack_price: '' })) });
  }
  const ingOf = (id: string) => ings.data?.find((i) => i.id === id);
  return (
    <div className="col" style={{ gap: 16 }}>
      {sug.data && sug.data.length > 0 && (
        <div className="panel"><div className="ph"><h3>Suggested purchases</h3><button className="btn primary sm" onClick={fromSuggestions}>Start an order from these</button></div>
          <div className="tablewrap"><table><thead><tr><th>Item</th><th className="num">In store</th><th className="num">On order</th><th className="num">Suggested</th><th className="num">About</th><th>Supplier</th></tr></thead>
            <tbody>{sug.data.map((s) => <tr key={s.ingredient_id}><td><strong>{s.name}</strong></td><td className="num">{fmtQty(s.central_qty, s.unit)}</td><td className="num">{s.on_order ? fmtQty(s.on_order, s.unit) : '–'}</td><td className="num">{s.suggested_packs} × {s.pack_unit}</td><td className="num">{rs(s.estimated_cost)}</td><td>{s.supplier_name || '–'}</td></tr>)}</tbody></table></div></div>
      )}
      <div className="panel">
        <div className="ph"><h3>Purchase orders</h3><div className="row"><button className="btn sm ghost" onClick={() => setSupForm({ name: '', phone: '' })}>Suppliers</button><button className="btn primary sm" onClick={() => setForm({ supplier_id: '', note: '', lines: [{ ingredient_id: '', packs: 1, pack_price: '' }] })}>New purchase</button></div></div>
        {!pos.data ? <Skeleton h={50} n={3} /> : !pos.data.length ? <Empty>No purchases yet.</Empty> : (
          <div className="col" style={{ gap: 10 }}>{pos.data.map((p) => (
            <div key={p.id} className="card flat">
              <div className="row between wrap"><div><strong>PO-{p.number}</strong> <span className={`chip ${STATUS_CHIP[p.status]}`}>{p.status}</span> <span className="muted small">{p.supplier_name || 'No supplier'} · {fmtDate(p.created_at)}{p.invoice_no ? ` · invoice ${p.invoice_no}` : ''}</span></div>
                <div className="row"><strong>{rs(p.total)}</strong>{p.status === 'ordered' && <><button className="btn sm primary" onClick={() => setRecv({ id: p.id, number: p.number, invoice: '', update: false, lines: p.lines.map((l: any) => ({ id: l.id, name: l.name, unit: l.unit, std: l.standard_cost, ordered: l.qty_ordered, got: l.qty_ordered - l.qty_received, cost: l.unit_cost })) })}>Receive</button><button className="btn sm ghost" onClick={async () => { try { await api(`/central/purchases/${p.id}/cancel`, { method: 'POST' }); pos.reload(); } catch (e: any) { toast(e.message, true); } }}>Cancel</button></>}</div></div>
              <div className="small muted" style={{ marginTop: 6 }}>{p.lines.map((l: any) => `${fmtQty(l.qty_ordered, l.unit)} ${l.name}${l.qty_received ? ` (${fmtQty(l.qty_received, l.unit)} in)` : ''}`).join(' · ')}</div>
            </div>))}</div>
        )}
      </div>
      {form && (
        <Modal title="New purchase order" onClose={() => setForm(null)}>
          <div className="col">
            <Field label="Supplier"><select value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}><option value="">Choose…</option>{sup.data?.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
            {form.lines.map((l: any, i: number) => { const ing = ingOf(l.ingredient_id); return (
              <div key={i} className="grid" style={{ gridTemplateColumns: '2fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
                <Field label={i ? '' : 'Item'}><select value={l.ingredient_id} onChange={(e) => { const x = ingOf(e.target.value); const lines = [...form.lines]; lines[i] = { ...l, ingredient_id: e.target.value, pack_price: x ? String(x.pack_price) : '' }; setForm({ ...form, lines }); }}><option value="">Choose…</option>{ings.data?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
                <Field label={i ? '' : `Packs${ing ? ` (${ing.pack_unit})` : ''}`}><input type="number" min={0} value={l.packs} onChange={(e) => { const lines = [...form.lines]; lines[i] = { ...l, packs: e.target.value }; setForm({ ...form, lines }); }} /></Field>
                <Field label={i ? '' : 'Rs per pack'}><input type="number" min={0} value={l.pack_price} onChange={(e) => { const lines = [...form.lines]; lines[i] = { ...l, pack_price: e.target.value }; setForm({ ...form, lines }); }} /></Field>
                <button className="btn ghost sm" aria-label="Remove line" onClick={() => setForm({ ...form, lines: form.lines.filter((_: any, j: number) => j !== i) })}>×</button>
              </div>); })}
            <button className="btn sm ghost" onClick={() => setForm({ ...form, lines: [...form.lines, { ingredient_id: '', packs: 1, pack_price: '' }] })}>Add a line</button>
            <div className="card flat row between"><span>Order total</span><strong>{rs(form.lines.reduce((a: number, l: any) => a + Number(l.packs || 0) * Number(l.pack_price || 0), 0))}</strong></div>
            <button className="btn primary" disabled={!form.lines.some((l: any) => l.ingredient_id && Number(l.packs) > 0)} onClick={create}>Place order</button>
          </div>
        </Modal>
      )}
      {recv && (
        <Modal title={`Receive PO-${recv.number}`} onClose={() => setRecv(null)}>
          <div className="col">
            {recv.lines.map((l: any, i: number) => { const varPct = l.std ? Math.round(((Number(l.cost) - l.std) / l.std) * 1000) / 10 : 0; return (
              <div key={l.id} className="card flat col" style={{ gap: 6 }}>
                <strong>{l.name}</strong><span className="small muted">Ordered {fmtQty(l.ordered, l.unit)}</span>
                <div className="grid g2"><Field label={`Received (${l.unit})`}><input type="number" value={l.got} onChange={(e) => { const lines = [...recv.lines]; lines[i] = { ...l, got: e.target.value }; setRecv({ ...recv, lines }); }} /></Field>
                  <Field label={`Price per ${l.unit} (Rs)`} hint={varPct ? `${varPct > 0 ? '+' : ''}${varPct}% against the standard ${money(l.std, 3)}` : 'Matches the standard cost'}><input type="number" step="0.001" value={l.cost} onChange={(e) => { const lines = [...recv.lines]; lines[i] = { ...l, cost: e.target.value }; setRecv({ ...recv, lines }); }} /></Field></div>
              </div>); })}
            <Field label="Supplier invoice number"><input value={recv.invoice} onChange={(e) => setRecv({ ...recv, invoice: e.target.value })} /></Field>
            <label className="row small"><input type="checkbox" style={{ width: 20, minHeight: 20 }} checked={recv.update} onChange={(e) => setRecv({ ...recv, update: e.target.checked })} />Make these prices the new standard cost (re-costs the recipes)</label>
            <button className="btn primary" onClick={receive}>Book into the central store</button>
          </div>
        </Modal>
      )}
      {supForm && (
        <Modal title="Suppliers" onClose={() => setSupForm(null)}>
          <div className="col">{sup.data?.map((s) => <div key={s.id} className="row between small"><span><strong>{s.name}</strong> <span className="muted">{s.phone} · {s.items} items</span></span><button className="btn sm ghost" onClick={async () => { await api(`/central/suppliers/${s.id}`, { method: 'PATCH', body: { active: !s.active } }); sup.reload(); }}>{s.active ? 'Pause' : 'Resume'}</button></div>)}
            <hr style={{ border: 0, borderTop: '1px solid var(--hairline)' }} />
            <Field label="New supplier"><input value={supForm.name} onChange={(e) => setSupForm({ ...supForm, name: e.target.value })} /></Field><Field label="Phone"><input value={supForm.phone} onChange={(e) => setSupForm({ ...supForm, phone: e.target.value })} /></Field>
            <button className="btn primary" disabled={supForm.name.length < 2} onClick={async () => { try { await api('/central/suppliers', { method: 'POST', body: supForm }); setSupForm({ name: '', phone: '' }); sup.reload(); } catch (e: any) { toast(e.message, true); } }}>Add supplier</button></div>
        </Modal>
      )}
    </div>
  );
}

/* ================================ Transfers (central -> stations) ================================ */
export function TransfersPanel({ mode, stationId }: { mode: 'warehouse' | 'station'; stationId?: string }) {
  const url = mode === 'warehouse' ? '/central/transfers' : `/transfers${stationId ? `?station_id=${stationId}` : ''}`;
  const list = useData<any[]>(url, [url]);
  const stations = useData<any[]>(mode === 'warehouse' ? '/admin/stations' : null);
  const ings = useData<any[]>(mode === 'warehouse' ? '/central/stock' : '/admin/ingredients');
  const toast = useToast();
  const [send, setSend] = useState<any>(null);
  const [recv, setRecv] = useState<any>(null);
  const [req, setReq] = useState<any>(null);
  const sid = stationId || '';
  async function suggest(station: string, setter: (l: any[]) => void) {
    try { const s = await api(`/transfers/suggest?station_id=${station}`); setter(s.map((x: any) => ({ ingredient_id: x.ingredient_id, qty: x.suggested_qty }))); if (!s.length) toast('This station is at its par levels'); } catch (e: any) { toast(e.message, true); }
  }
  async function dispatchNow() {
    try { await api('/central/transfers', { method: 'POST', body: { station_id: send.station_id || undefined, request_id: send.request_id || undefined, lines: send.lines.filter((l: any) => l.ingredient_id && Number(l.qty) > 0).map((l: any) => ({ ingredient_id: l.ingredient_id, qty: Number(l.qty) })) } }); setSend(null); list.reload(); toast('Stock dispatched'); } catch (e: any) { toast(e.message, true); }
  }
  async function receive() {
    try { await api(`/transfers/${recv.id}/receive`, { method: 'POST', body: { note: recv.note || undefined, lines: recv.lines.map((l: any) => ({ ingredient_id: l.ingredient_id, qty_received: Number(l.got) })) } }); setRecv(null); list.reload(); toast('Stock received'); } catch (e: any) { toast(e.message, true); }
  }
  async function request() {
    try { await api('/transfers/request', { method: 'POST', body: { station_id: sid || undefined, note: req.note || undefined, lines: req.lines.filter((l: any) => l.ingredient_id && Number(l.qty) > 0).map((l: any) => ({ ingredient_id: l.ingredient_id, qty: Number(l.qty) })) } }); setReq(null); list.reload(); toast('Request sent to the warehouse'); } catch (e: any) { toast(e.message, true); }
  }
  const nameOf = (id: string) => ings.data?.find((i) => i.id === id);
  const LineEditor = ({ st, setSt }: any) => (
    <>
      {st.lines.map((l: any, i: number) => { const ing = nameOf(l.ingredient_id); return (
        <div key={i} className="grid" style={{ gridTemplateColumns: '2fr 1fr auto', gap: 8, alignItems: 'end' }}>
          <Field label={i ? '' : 'Item'}><select value={l.ingredient_id} onChange={(e) => { const lines = [...st.lines]; lines[i] = { ...l, ingredient_id: e.target.value }; setSt({ ...st, lines }); }}><option value="">Choose…</option>{ings.data?.map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
          <Field label={i ? '' : `Amount${ing ? ` (${ing.unit})` : ''}`}><input type="number" min={0} value={l.qty} onChange={(e) => { const lines = [...st.lines]; lines[i] = { ...l, qty: e.target.value }; setSt({ ...st, lines }); }} /></Field>
          <button className="btn ghost sm" aria-label="Remove line" onClick={() => setSt({ ...st, lines: st.lines.filter((_: any, j: number) => j !== i) })}>×</button>
        </div>); })}
      <button className="btn sm ghost" onClick={() => setSt({ ...st, lines: [...st.lines, { ingredient_id: '', qty: '' }] })}>Add a line</button>
    </>
  );
  return (
    <div className="panel">
      <div className="ph"><div><h3>{mode === 'warehouse' ? 'Stock going to the stations' : 'Deliveries and requests'}</h3><p className="small muted">{mode === 'warehouse' ? 'Dispatch deducts the central store. The station confirms what arrived, and any shortage is recorded.' : 'Ask the warehouse for stock, then confirm what really arrives.'}</p></div>
        {mode === 'warehouse' ? <button className="btn primary sm" onClick={() => setSend({ station_id: stations.data?.[0]?.id || '', lines: [{ ingredient_id: '', qty: '' }] })}>Send stock</button> : <button className="btn primary sm" onClick={() => setReq({ note: '', lines: [{ ingredient_id: '', qty: '' }] })}>Request stock</button>}</div>
      {!list.data ? <Skeleton h={60} n={3} /> : !list.data.length ? <Empty>No transfers yet.</Empty> : (
        <div className="col" style={{ gap: 10 }}>{list.data.map((t) => (
          <div key={t.id} className="card flat">
            <div className="row between wrap"><div><strong>TR-{t.number}</strong> <span className={`chip ${STATUS_CHIP[t.status]}`}>{t.status}</span> <span className="muted small">{t.station_name} · {fmtDateTime(t.created_at)}{t.requested_by_name ? ` · asked by ${t.requested_by_name}` : ''}</span></div>
              <div className="row">{t.value > 0 && <strong>{rs(t.value)}</strong>}
                {mode === 'warehouse' && t.status === 'requested' && <button className="btn sm primary" onClick={() => setSend({ station_id: t.station_id, request_id: t.id, lines: t.lines.map((l: any) => ({ ingredient_id: l.ingredient_id, qty: l.qty_requested })) })}>Dispatch</button>}
                {mode === 'warehouse' && ['requested', 'dispatched'].includes(t.status) && <button className="btn sm ghost" onClick={async () => { try { await api(`/central/transfers/${t.id}/cancel`, { method: 'POST' }); list.reload(); } catch (e: any) { toast(e.message, true); } }}>Cancel</button>}
                {mode === 'station' && t.status === 'dispatched' && <button className="btn sm primary" onClick={() => setRecv({ id: t.id, number: t.number, note: '', lines: t.lines.filter((l: any) => l.qty_sent > 0).map((l: any) => ({ ingredient_id: l.ingredient_id, name: l.name, unit: l.unit, sent: l.qty_sent, got: l.qty_sent })) })}>Receive</button>}
                {mode === 'station' && t.status === 'requested' && <button className="btn sm ghost" onClick={async () => { try { await api(`/transfers/${t.id}/cancel`, { method: 'POST' }); list.reload(); } catch (e: any) { toast(e.message, true); } }}>Cancel</button>}</div></div>
            <div className="small muted" style={{ marginTop: 6 }}>{t.lines.map((l: any) => `${fmtQty(t.status === 'requested' ? l.qty_requested : l.qty_sent, l.unit)} ${l.name}${l.qty_received != null && l.qty_received < l.qty_sent ? ` (only ${fmtQty(l.qty_received, l.unit)} arrived)` : ''}`).join(' · ')}</div>
            {t.shortage_value > 0 && <p className="small err" style={{ marginTop: 4 }}>Short delivery: Rs {t.shortage_value} at cost{t.receive_note ? ` · “${t.receive_note}”` : ''}</p>}
          </div>))}</div>
      )}
      {send && (
        <Modal title={send.request_id ? 'Dispatch the request' : 'Send stock to a station'} onClose={() => setSend(null)}>
          <div className="col">
            <Field label="Station"><select value={send.station_id} disabled={!!send.request_id} onChange={(e) => setSend({ ...send, station_id: e.target.value })}>{stations.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
            {!send.request_id && <button className="btn sm" onClick={() => suggest(send.station_id, (lines) => setSend({ ...send, lines: lines.length ? lines : send.lines }))}>Fill up to par levels</button>}
            <LineEditor st={send} setSt={setSend} />
            <button className="btn primary" onClick={dispatchNow}>Dispatch from the central store</button>
          </div>
        </Modal>
      )}
      {req && (
        <Modal title="Request stock from the warehouse" onClose={() => setReq(null)}>
          <div className="col">
            <button className="btn sm" onClick={() => sid || mode === 'station' ? suggest(sid, (lines) => setReq({ ...req, lines: lines.length ? lines : req.lines })) : toast('Choose a station first', true)}>Fill up to par levels</button>
            <LineEditor st={req} setSt={setReq} />
            <Field label="Note"><input value={req.note} onChange={(e) => setReq({ ...req, note: e.target.value })} /></Field>
            <button className="btn primary" onClick={request}>Send request</button>
          </div>
        </Modal>
      )}
      {recv && (
        <Modal title={`Receive TR-${recv.number}`} onClose={() => setRecv(null)}>
          <div className="col">
            <p className="muted small">Check what is in the box. If something is short or damaged, type the amount that really arrived.</p>
            {recv.lines.map((l: any, i: number) => <div key={l.ingredient_id} className="grid" style={{ gridTemplateColumns: '2fr 1fr', gap: 8, alignItems: 'end' }}><div><strong>{l.name}</strong><div className="small muted">Sent {fmtQty(l.sent, l.unit)}</div></div><Field label={`Arrived (${l.unit})`}><input type="number" value={l.got} onChange={(e) => { const lines = [...recv.lines]; lines[i] = { ...l, got: e.target.value }; setRecv({ ...recv, lines }); }} /></Field></div>)}
            <Field label="Note (optional)"><input value={recv.note} onChange={(e) => setRecv({ ...recv, note: e.target.value })} placeholder="Box was damaged" /></Field>
            <button className="btn primary" onClick={receive}>Confirm and add to station stock</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ================================ Shelf counts and variance ================================ */
export function CountPanel({ stationId, role }: { stationId?: string; role: string }) {
  const hist = useData<any[]>('/transfers/counts', []);
  const [open, setOpen] = useState<any>(null);
  const toast = useToast();
  async function start() {
    try {
      const rows = role === 'station' ? await api('/station/inventory') : (await api(`/admin/inventory?station_id=${stationId}`))[0]?.items || [];
      setOpen({ items: rows.map((r: any) => ({ id: r.id, name: r.name, unit: r.unit, expected: r.qty, counted: '' })), note: '' });
    } catch (e: any) { toast(e.message, true); }
  }
  async function submit() {
    try {
      const counts = open.items.filter((i: any) => i.counted !== '').map((i: any) => ({ ingredient_id: i.id, counted: Number(i.counted) }));
      const out = await api('/transfers/counts', { method: 'POST', body: { station_id: stationId || undefined, note: open.note || undefined, counts } });
      setOpen(null); hist.reload(); toast(out.variance_value === 0 ? 'Count matches the system' : `Difference recorded: ${rs(out.variance_value)}`);
    } catch (e: any) { toast(e.message, true); }
  }
  const ready = role === 'station' || !!stationId;
  return (
    <div className="panel">
      <div className="ph"><div><h3>Shelf counts</h3><p className="small muted">Count what is really on the shelf. The difference from the system is logged at cost, so loss and waste are visible.</p></div>
        <button className="btn primary sm" disabled={!ready} onClick={start} title={ready ? '' : 'Choose one station at the top first'}>Count the shelves</button></div>
      {!hist.data ? <Skeleton h={40} n={2} /> : !hist.data.length ? <Empty>No counts yet.</Empty> : <div className="tablewrap"><table><thead><tr><th>When</th><th>Station</th><th>Counted by</th><th className="num">Difference at cost</th></tr></thead>
        <tbody>{hist.data.map((c) => <tr key={c.id}><td>{fmtDateTime(c.created_at)}</td><td>{c.station_name}</td><td>{c.counted_by}</td><td className="num" style={{ color: c.variance_value < 0 ? 'var(--cherry)' : undefined, fontWeight: c.variance_value ? 700 : 400 }}>{c.variance_value ? rs(Math.round(c.variance_value)) : 'Matches'}</td></tr>)}</tbody></table></div>}
      {open && (
        <Modal title="Count the shelves" onClose={() => setOpen(null)}>
          <p className="muted small">Only fill in what you counted. Leave the rest blank.</p>
          <div className="col" style={{ gap: 8, maxHeight: '50vh', overflow: 'auto' }}>{open.items.map((r: any, i: number) => <div key={r.id} className="grid" style={{ gridTemplateColumns: '2fr 1fr', gap: 8, alignItems: 'center' }}><span><strong>{r.name}</strong><span className="small muted"> system: {fmtQty(r.expected, r.unit)}</span></span><input type="number" aria-label={`Counted ${r.name}`} placeholder={r.unit} value={r.counted} onChange={(e) => { const items = [...open.items]; items[i] = { ...r, counted: e.target.value }; setOpen({ ...open, items }); }} /></div>)}</div>
          <Field label="Note"><input value={open.note} onChange={(e) => setOpen({ ...open, note: e.target.value })} /></Field>
          <button className="btn primary block" style={{ marginTop: 12 }} onClick={submit} disabled={!open.items.some((i: any) => i.counted !== '')}>Save the count</button>
        </Modal>
      )}
    </div>
  );
}

export function VariancePanel({ days }: { days: number }) {
  const from = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);
  const { data } = useData<any>(`/transfers/variance?from=${from}`, [days]);
  if (!data) return <Skeleton h={80} n={2} />;
  const loss = data.by_station.reduce((a: number, s: any) => a + s.loss, 0);
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="grid g3"><Kpi label="Loss found in counts" value={rs(Math.abs(loss))} hint={`last ${days} days, at cost`} /><Kpi label="Counts done" value={data.by_station.reduce((a: number, s: any) => a + s.counts, 0)} /><Kpi label="Waste logged" value={rs(data.waste.reduce((a: number, w: any) => a + w.value, 0))} hint="at cost" /></div>
      <div className="cols c-2">
        <div className="panel"><div className="ph"><h3>By station</h3></div><div className="tablewrap"><table><thead><tr><th>Station</th><th className="num">Counts</th><th className="num">Net difference</th><th className="num">Loss</th></tr></thead><tbody>{data.by_station.map((s: any) => <tr key={s.id}><td>{s.name}</td><td className="num">{s.counts}</td><td className="num">{rs(s.variance_value)}</td><td className="num" style={{ color: s.loss < 0 ? 'var(--cherry)' : undefined, fontWeight: s.loss < 0 ? 700 : 400 }}>{rs(s.loss)}</td></tr>)}</tbody></table></div></div>
        <div className="panel"><div className="ph"><h3>By ingredient</h3></div>{!data.by_ingredient.length ? <Empty>No count differences yet.</Empty> : <div className="tablewrap"><table><thead><tr><th>Item</th><th className="num">Quantity</th><th className="num">At cost</th></tr></thead><tbody>{data.by_ingredient.map((s: any) => <tr key={s.name}><td>{s.name}</td><td className="num">{fmtQty(s.variance, s.unit)}</td><td className="num" style={{ color: s.variance_value < 0 ? 'var(--cherry)' : undefined }}>{rs(s.variance_value)}</td></tr>)}</tbody></table></div>}</div>
      </div>
    </div>
  );
}

/* ================================ Whole network at a glance ================================ */
export function MatrixTab({ onPick }: { onPick?: (stationId: string) => void }) {
  const { data, error } = useData<any>('/central/matrix');
  const [cat, setCat] = useState('all');
  if (!data) return <><ErrorNote error={error} /><Skeleton h={50} n={6} /></>;
  const rows = data.ingredients.filter((i: any) => cat === 'all' || i.category === cat);
  return (
    <div className="panel">
      <div className="ph"><div><h3>Stock across the network</h3><p className="small muted">Every ingredient at the central store and at every station. Red means at or below its reorder level.</p></div><Seg value={cat} onChange={setCat} options={[{ id: 'all', label: 'All' }, { id: 'ingredient', label: 'Ingredients' }, { id: 'packaging', label: 'Packaging' }, { id: 'retail', label: 'Retail' }]} /></div>
      <div className="tablewrap"><table>
        <thead><tr><th>Item</th><th className="num">Central</th>{data.stations.map((s: any) => <th key={s.id} className="num"><button style={{ all: 'unset', cursor: onPick ? 'pointer' : 'default' }} onClick={() => onPick?.(s.id)}>{s.code}</button></th>)}</tr></thead>
        <tbody>{rows.map((i: any) => (
          <tr key={i.id}><td><strong>{i.name}</strong></td>
            <td className="num" style={{ color: i.central_reorder > 0 && i.central_qty <= i.central_reorder ? 'var(--cherry)' : undefined, fontWeight: 700 }}>{fmtQty(i.central_qty, i.unit)}</td>
            {i.stations.map((c: any) => <td key={c.station_id} className="num" style={{ color: c.low ? 'var(--cherry)' : undefined, fontWeight: c.low ? 700 : 400, background: c.low ? 'color-mix(in srgb, var(--cherry) 10%, transparent)' : undefined }}>{c.reorder_level || c.qty ? fmtQty(c.qty, i.unit) : '–'}</td>)}</tr>))}</tbody>
      </table></div>
    </div>
  );
}

/* ================================ Owner / warehouse hub ================================ */
export function InventoryHub({ days }: { days: number }) {
  const { stationId } = useDash();
  const [tab, setTab] = useState<'network' | 'central' | 'purchases' | 'transfers' | 'counts' | 'prices'>('network');
  return (
    <div className="col" style={{ gap: 16 }}>
      <div><Seg value={tab} onChange={setTab} options={[{ id: 'network', label: 'All stations' }, { id: 'central', label: 'Central store' }, { id: 'purchases', label: 'Purchasing' }, { id: 'transfers', label: 'To stations' }, { id: 'counts', label: 'Counts and loss' }, { id: 'prices', label: 'Ingredients and prices' }]} /></div>
      {tab === 'network' && <MatrixTab />}
      {tab === 'central' && <CentralStockTab goPurchase={() => setTab('purchases')} />}
      {tab === 'purchases' && <PurchasesTab />}
      {tab === 'transfers' && <TransfersPanel mode="warehouse" />}
      {tab === 'counts' && <><VariancePanel days={days} /><CountPanel role="owner" stationId={stationId} /></>}
      {tab === 'prices' && <IngredientsTab canEdit />}
    </div>
  );
}
