'use client';
import { useEffect, useMemo, useState } from 'react';
import { api, rs } from '@/lib/api';
import { Empty, ErrorNote, useData, useToast } from './ui';
import { DataTable, Drawer, Kpi, Skeleton } from './dash/kit';
import { fmtQty } from './inventory';

const COLORS = ['#A81F2A', '#2F5D46', '#F2A81D', '#5A3322', '#7C97A6', '#8A5A3E', '#4C8A6A', '#D9731A'];
const r2 = (n: number) => Math.round(n * 100) / 100;
const pill = (pct: number, target: number) => <span className={`chip ${pct > target + 15 ? 'cherry' : pct > target ? 'marigold' : 'hill'}`}>{pct}%</span>;

export function CostingSection({ canEdit }: { canEdit: boolean }) {
  const { data, error, reload } = useData<any>('/admin/costing');
  const [open, setOpen] = useState<string | null>(null);
  if (error) return <ErrorNote error={error} />;
  if (!data) return <div className="col"><Skeleton h={100} /><Skeleton h={300} /></div>;
  const s = data.summary;
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="grid g4">
        <Kpi label="Food cost, last 30 days" value={`${s.actual_food_cost_pct}%`} hint={`target ${data.target_pct}% or lower`} />
        <Kpi label="Gross margin" value={`${s.gross_margin_pct}%`} hint="after recipe cost" />
        <Kpi label="Items above target" value={s.over_target} hint={s.over_target ? 'Review the price or the recipe' : 'All within target'} />
        <Kpi label="Items without a recipe" value={s.without_recipe} hint={s.without_recipe ? 'Their cost is a guess' : 'Everything is costed'} />
      </div>
      <div className="panel">
        <div className="ph"><div><h3>Recipe costing</h3><p className="small muted">Cost comes from each recipe at today’s ingredient prices, including wastage. Click an item to see and change its recipe.</p></div></div>
        <DataTable csvName="costing" rows={data.rows} search={(r: any) => `${r.name} ${r.category}`} onRow={(r: any) => setOpen(r.id)} pageSize={30}
          cols={[
            { key: 'name', label: 'Item', sort: (r: any) => r.name, render: (r: any) => <><strong>{r.name}</strong> {!r.has_recipe && <span className="chip">No recipe</span>}<div className="small muted">{r.category}</div></> },
            { key: 'price', label: 'Price', num: true, sort: (r: any) => r.price, render: (r: any) => rs(r.price) },
            { key: 'cost', label: 'Cost', num: true, sort: (r: any) => r.cost, render: (r: any) => rs(r.cost) },
            { key: 'margin', label: 'Margin', num: true, sort: (r: any) => r.margin, render: (r: any) => rs(r.margin) },
            { key: 'pct', label: 'Food cost', num: true, sort: (r: any) => r.food_cost_pct, render: (r: any) => pill(r.food_cost_pct, data.target_pct) },
            { key: 'sug', label: `Price for ${data.target_pct}%`, num: true, sort: (r: any) => r.suggested_price || 0, render: (r: any) => (r.has_recipe && r.suggested_price ? <span style={{ color: r.over_target ? 'var(--cherry)' : undefined, fontWeight: r.over_target ? 700 : 400 }}>{rs(r.suggested_price)}</span> : '–'), csv: (r: any) => r.suggested_price || '' },
          ]} />
      </div>
      {data.movers.length > 0 && <div className="panel"><div className="ph"><h3>Recent price changes</h3></div><div className="col small" style={{ gap: 4 }}>{data.movers.map((m: any, i: number) => <div key={i} className="row between"><span><strong>{m.name}</strong> <span className="muted">{new Date(m.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span></span><span>{rs(m.before * 1000)} → {rs(m.unit_cost * 1000)} per 1,000 units</span></div>)}</div></div>}
      {open && <RecipeDrawer id={open} canEdit={canEdit} onClose={() => setOpen(null)} onSaved={reload} />}
    </div>
  );
}

export function RecipeDrawer({ id, canEdit, onClose, onSaved }: { id: string; canEdit: boolean; onClose: () => void; onSaved: () => void }) {
  const { data: d, error, reload } = useData<any>(`/admin/recipes/${id}`, []);
  const ings = useData<any[]>('/admin/ingredients');
  const toast = useToast();
  const [edit, setEdit] = useState(false);
  const [lines, setLines] = useState<{ ingredient_id: string; qty: string }[]>([]);
  const [opts, setOpts] = useState<Record<string, { ingredient_id: string; qty: string }[]>>({});
  const [method, setMethod] = useState('');
  const [price, setPrice] = useState('');
  useEffect(() => {
    if (!d) return;
    setLines(d.base_lines.map((l: any) => ({ ingredient_id: l.ingredient_id, qty: String(l.qty) })));
    setOpts(Object.fromEntries(Object.entries(d.option_recipes).map(([k, v]: any) => [k, v.lines.map((l: any) => ({ ingredient_id: l.ingredient_id, qty: String(l.qty) }))])));
    setMethod(d.product.recipe_method || ''); setPrice(String(d.product.price));
  }, [d]);
  const ing = (x: string) => ings.data?.find((i) => i.id === x);
  const live = useMemo(() => {
    // cost of the edited recipe, so the owner sees the effect before saving
    if (!edit || !ings.data) return null;
    return lines.reduce((a, l) => { const i = ing(l.ingredient_id); return a + (i ? Number(l.qty || 0) * Number(i.unit_cost) * (1 + Number(i.waste_pct) / 100) : 0); }, 0);
  }, [edit, lines, ings.data]);
  if (!d) return <Drawer title="Recipe" onClose={onClose} width={640}><ErrorNote error={error} /><Skeleton h={80} n={4} /></Drawer>;
  const cost = live != null ? live : d.cost;
  const p = Number(price) || d.product.price;
  const margin = p - cost, fc = p ? Math.round((cost / p) * 1000) / 10 : 0;
  const total = d.breakdown.reduce((a: number, l: any) => a + l.cost, 0) || 1;
  async function save() {
    try {
      const out = await api(`/owner/recipes/${id}`, { method: 'PUT', body: {
        method, lines: lines.filter((l) => l.ingredient_id && Number(l.qty) > 0).map((l) => ({ ingredient_id: l.ingredient_id, qty: Number(l.qty) })),
        options: Object.entries(opts).map(([option_id, ls]) => ({ option_id, lines: ls.filter((l) => l.ingredient_id && Number(l.qty) !== 0 && l.qty !== '').map((l) => ({ ingredient_id: l.ingredient_id, qty: Number(l.qty) })) })),
      } });
      toast(out.recosted.length ? `Re-costed: now ${rs(out.recosted[0].after)}` : 'Recipe saved'); setEdit(false); reload(); onSaved();
    } catch (e: any) { toast(e.message, true); }
  }
  return (
    <Drawer title={d.product.name} onClose={onClose} width={680}>
      <div className="col" style={{ gap: 16 }}>
        <div className="grid g3" style={{ gap: 10 }}>
          <div className="card flat stat"><div className="v">{rs(r2(cost))}</div><div className="l">Cost per cup</div></div>
          <div className="card flat stat"><div className="v">{rs(p)}</div><div className="l">Price</div></div>
          <div className="card flat stat"><div className="v" style={{ color: fc > d.target_pct ? 'var(--cherry)' : 'var(--hill)' }}>{fc}%</div><div className="l">Food cost (target {d.target_pct}%)</div></div>
        </div>
        <div className="card flat col" style={{ gap: 8 }}>
          <div className="row between"><strong>What if the price were…</strong><span className="small muted">Margin {rs(r2(margin))} a cup</span></div>
          <div className="row"><input type="range" min={Math.max(10, Math.round(cost))} max={Math.round(d.product.price * 2)} step={5} value={Number(price) || d.product.price} onChange={(e) => setPrice(e.target.value)} aria-label="Try a price" /><input type="number" style={{ width: 110 }} value={price} onChange={(e) => setPrice(e.target.value)} aria-label="Price" /></div>
          {d.suggested_price && <p className="small muted">To reach {d.target_pct}% food cost the price would be {rs(d.suggested_price)}.</p>}
        </div>

        {!edit ? (
          <>
            <div>
              <div className="label" style={{ marginBottom: 6 }}>Where the cost goes</div>
              <div style={{ display: 'flex', height: 18, borderRadius: 99, overflow: 'hidden' }} role="img" aria-label="Cost split by ingredient">{d.breakdown.map((l: any, i: number) => <span key={l.ingredient_id} title={`${l.name}: ${rs(r2(l.cost))}`} style={{ width: `${(l.cost / total) * 100}%`, background: COLORS[i % COLORS.length] }} />)}</div>
              <div className="tablewrap" style={{ marginTop: 10 }}><table><thead><tr><th>Ingredient</th><th className="num">Recipe</th><th className="num">Per unit</th><th className="num">Wastage</th><th className="num">Cost</th></tr></thead>
                <tbody>{d.breakdown.map((l: any, i: number) => <tr key={l.ingredient_id}><td><i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: COLORS[i % COLORS.length], marginRight: 8 }} />{l.name}</td><td className="num">{fmtQty(l.qty, l.unit)}</td><td className="num">Rs {l.unit_cost.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td><td className="num">{l.waste_pct ? `${l.waste_pct}%` : '–'}</td><td className="num"><strong>{rs(r2(l.cost))}</strong></td></tr>)}
                  <tr><td colSpan={4}><strong>Total</strong></td><td className="num"><strong>{rs(r2(d.cost))}</strong></td></tr></tbody></table></div>
              {d.breakdown.some((l: any) => l.waste_pct) && <p className="small muted" style={{ marginTop: 6 }}>Example: a 16 g double shot at Rs 2,500 per kg with 10% wastage is 16 × Rs 2.50 × 1.10 = Rs 44.00.</p>}
            </div>
            {d.option_groups.some((g: any) => g.options.some((o: any) => d.option_recipes[o.id]?.lines.length || o.price_delta)) && (
              <div><div className="label" style={{ marginBottom: 6 }}>Options</div>
                <div className="tablewrap"><table><thead><tr><th>Option</th><th className="num">Adds to price</th><th className="num">Adds to cost</th><th className="num">Margin change</th></tr></thead>
                  <tbody>{d.option_groups.flatMap((g: any) => g.options.filter((o: any) => !o.is_default || d.option_recipes[o.id]?.lines.length).map((o: any) => { const c = d.option_recipes[o.id]?.cost || 0; const dm = o.price_delta - c; return <tr key={o.id}><td>{g.name}: <strong>{o.name}</strong><div className="small muted">{(d.option_recipes[o.id]?.lines || []).map((l: any) => `${l.qty > 0 ? '+' : ''}${l.qty} ${l.unit} ${l.name}`).join(', ') || 'No stock change'}</div></td><td className="num">{o.price_delta ? `+${o.price_delta}` : '–'}</td><td className="num">{c ? `${c > 0 ? '+' : ''}${rs(c)}` : '–'}</td><td className="num" style={{ color: dm < 0 ? 'var(--cherry)' : undefined, fontWeight: dm < 0 ? 700 : 400 }}>{rs(r2(dm))}</td></tr>; }))}</tbody></table></div></div>
            )}
            {d.product.recipe_method && <div><div className="label" style={{ marginBottom: 6 }}>Method</div><p>{d.product.recipe_method}</p></div>}
            {canEdit && <button className="btn primary" onClick={() => setEdit(true)}>Edit recipe</button>}
          </>
        ) : (
          <div className="col" style={{ gap: 14 }}>
            <div className="label">Recipe for one regular cup</div>
            {lines.map((l, i) => { const x = ing(l.ingredient_id); return (
              <div key={i} className="grid" style={{ gridTemplateColumns: '2fr 1fr auto', gap: 8, alignItems: 'center' }}>
                <select aria-label="Ingredient" value={l.ingredient_id} onChange={(e) => setLines(lines.map((y, j) => (j === i ? { ...y, ingredient_id: e.target.value } : y)))}><option value="">Choose…</option>{ings.data?.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}</select>
                <input type="number" aria-label={`Amount${x ? ` in ${x.unit}` : ''}`} placeholder={x?.unit} value={l.qty} onChange={(e) => setLines(lines.map((y, j) => (j === i ? { ...y, qty: e.target.value } : y)))} />
                <button className="btn ghost sm" aria-label="Remove ingredient" onClick={() => setLines(lines.filter((_, j) => j !== i))}>×</button>
              </div>); })}
            <button className="btn sm ghost" onClick={() => setLines([...lines, { ingredient_id: '', qty: '' }])}>Add an ingredient</button>
            <div className="card flat row between"><span>Cost of this recipe</span><strong>{rs(r2(cost))}</strong></div>

            {d.option_groups.map((g: any) => g.options.filter((o: any) => !o.is_default).map((o: any) => (
              <div key={o.id} className="card flat col" style={{ gap: 8 }}>
                <strong>{g.name}: {o.name} <span className="muted small">(adds Rs {o.price_delta} to the price)</span></strong>
                <span className="small muted">Use a minus sign to remove an ingredient, for example oat milk replaces milk.</span>
                {(opts[o.id] || []).map((l, i) => <div key={i} className="grid" style={{ gridTemplateColumns: '2fr 1fr auto', gap: 8 }}>
                  <select aria-label="Ingredient" value={l.ingredient_id} onChange={(e) => setOpts({ ...opts, [o.id]: opts[o.id].map((y, j) => (j === i ? { ...y, ingredient_id: e.target.value } : y)) })}><option value="">Choose…</option>{ings.data?.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}</select>
                  <input type="number" aria-label="Change in amount" value={l.qty} onChange={(e) => setOpts({ ...opts, [o.id]: opts[o.id].map((y, j) => (j === i ? { ...y, qty: e.target.value } : y)) })} />
                  <button className="btn ghost sm" aria-label="Remove" onClick={() => setOpts({ ...opts, [o.id]: opts[o.id].filter((_, j) => j !== i) })}>×</button></div>)}
                <button className="btn sm ghost" onClick={() => setOpts({ ...opts, [o.id]: [...(opts[o.id] || []), { ingredient_id: '', qty: '' }] })}>Add a change</button>
              </div>)))}
            <div className="field"><label>Method for the barista</label><textarea value={method} onChange={(e) => setMethod(e.target.value)} maxLength={2000} /></div>
            <div className="row"><button className="btn primary grow" onClick={save} disabled={!lines.some((l) => l.ingredient_id && Number(l.qty) > 0)}>Save and re-cost</button><button className="btn ghost" onClick={() => { setEdit(false); reload(); }}>Cancel</button></div>
          </div>
        )}
      </div>
    </Drawer>
  );
}
