'use client';
import { useMemo, useState } from 'react';
import { api, rs } from '@/lib/api';
import { productArt } from '@/lib/art';
import { Empty, Field, Loading, Modal, useData, useToast } from './ui';
import { Seg, Skeleton } from './dash/kit';
import { useDash } from './dash/shell';
import { ImagePicker } from './studio';
import { RecipeDrawer } from './recipes';
import { Icon } from './icons';

/* ============================================================================
   Menu Studio (owner)
   One place for everything about an item: details and photo, price at every
   station, how many cups each station can still make from its stock, the
   options customers choose, and the recipe that drives cost and stock use.
   ============================================================================ */

const TIERS = [
  { id: '', label: 'Custom price' },
  { id: 'hot', label: 'Hot drink tier' },
  { id: 'flavored', label: 'Flavored tier' },
  { id: 'iced', label: 'Iced tier' },
];
const KINDS = [{ id: 'drink', label: 'Drink' }, { id: 'food', label: 'Food' }, { id: 'merch', label: 'Merchandise' }];
const num = (v: any) => (v === '' || v == null ? null : Number(v));

/** Cups a station can still make: null means the item has no recipe, so stock cannot limit it. */
function cupsChip(c: number | null | undefined, available = true) {
  if (c == null) return <span className="chip">No recipe</span>;
  if (!available) return <span className="chip">Paused</span>;
  if (c <= 0) return <span className="chip cherry">Out of stock</span>;
  if (c < 10) return <span className="chip marigold">{c} cups left</span>;
  return <span className="chip hill">{c} cups</span>;
}

export function MenuStudio() {
  const { data, error, reload } = useData<any>('/owner/menu');
  const toast = useToast();
  const { go } = useDash();
  const [view, setView] = useState<'items' | 'stations'>('items');
  const [cat, setCat] = useState('');
  const [status, setStatus] = useState<'all' | 'on' | 'off' | 'norecipe' | 'nophoto' | 'low'>('all');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<any | null>(null);
  const [cats, setCats] = useState(false);
  const [station, setStation] = useState('');

  const products: any[] = data?.products || [];
  const stationList: any[] = useMemo(() => (products[0]?.stations || []).map((s: any) => ({ id: s.station_id, name: s.station_name, code: s.station_code })), [products]);
  const sid = station || stationList[0]?.id || '';

  const low = (p: any) => p.active && p.stations.some((s: any) => s.available && s.can_make != null && s.can_make < 10);
  const shown = products.filter((p) => {
    if (cat && p.category_id !== cat) return false;
    if (q && !`${p.name} ${p.sku} ${p.category || ''}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (status === 'on') return p.active;
    if (status === 'off') return !p.active;
    if (status === 'norecipe') return p.active && !p.recipe.length;
    if (status === 'nophoto') return p.active && !p.image_url;
    if (status === 'low') return low(p);
    return true;
  });

  if (error) return <p className="err">{error}</p>;
  if (!data) return <div className="col"><Skeleton h={80} /><Skeleton h={300} /></div>;

  const kpi = {
    total: products.length, on: products.filter((p) => p.active).length,
    norecipe: products.filter((p) => p.active && !p.recipe.length).length,
    nophoto: products.filter((p) => p.active && !p.image_url).length, low: products.filter(low).length,
  };
  const blank = { sku: '', name: '', name_ne: '', description: '', description_ne: '', origin: '', price: 150, cost: 0, category_id: data.categories[0]?.id || '', kind: 'drink', price_tier: '', prep_seconds: 90, sort: 0, is_signature: false, is_seasonal: false, pass_eligible: true, active: true, image_url: null, stations: [], option_groups: [], recipe: [] };

  async function quickStation(p: any, s: any, body: { available?: boolean; price_override?: number | null }) {
    try { await api(`/owner/products/${p.id}/stations`, { method: 'PUT', body: [{ station_id: s.station_id, ...body }] }); reload(); } catch (e: any) { toast(e.message, true); }
  }

  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="row between wrap" style={{ gap: 10 }}>
        <div>
          <h3 style={{ margin: 0 }}>Menu and prices</h3>
          <p className="small muted" style={{ margin: '4px 0 0' }}>Prices are all-in: VAT and service included. Each item links to its recipe, its stock and the stations that sell it.</p>
        </div>
        <div className="row wrap">
          <button className="btn" onClick={() => setCats(true)}><Icon name="list" size={18} />Categories</button>
          <button className="btn primary" onClick={() => setEdit({ ...blank })}><Icon name="plus" size={18} />Add item</button>
        </div>
      </div>

      <div className="grid g4">
        <button className="kpi" style={{ textAlign: 'left', font: 'inherit', color: 'inherit', cursor: 'pointer' }} onClick={() => setStatus('on')}><span className="kl">On the menu</span><span className="kv">{kpi.on}</span><span className="small muted">{kpi.total - kpi.on} hidden</span></button>
        <button className="kpi" style={{ textAlign: 'left', font: 'inherit', color: 'inherit', cursor: 'pointer' }} onClick={() => setStatus('norecipe')}><span className="kl">Without a recipe</span><span className="kv" style={{ color: kpi.norecipe ? 'var(--cherry)' : undefined }}>{kpi.norecipe}</span><span className="small muted">{kpi.norecipe ? 'Stock and cost are guesses' : 'All costed'}</span></button>
        <button className="kpi" style={{ textAlign: 'left', font: 'inherit', color: 'inherit', cursor: 'pointer' }} onClick={() => setStatus('nophoto')}><span className="kl">Without a photo</span><span className="kv">{kpi.nophoto}</span><span className="small muted">Built-in art is shown</span></button>
        <button className="kpi" style={{ textAlign: 'left', font: 'inherit', color: 'inherit', cursor: 'pointer' }} onClick={() => setStatus('low')}><span className="kl">Running low somewhere</span><span className="kv" style={{ color: kpi.low ? 'var(--cherry)' : undefined }}>{kpi.low}</span><span className="small muted">Under 10 cups at a station</span></button>
      </div>

      <div className="card col" style={{ gap: 12, padding: 16 }}>
        <div className="row between wrap" style={{ gap: 10 }}>
          <Seg value={view} onChange={setView} options={[{ id: 'items', label: 'By item' }, { id: 'stations', label: 'By station' }]} />
          <div className="row wrap" style={{ gap: 8 }}>
            <select value={cat} onChange={(e) => setCat(e.target.value)} style={{ minWidth: 150 }}>
              <option value="">All categories</option>
              {data.categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value as any)} style={{ minWidth: 150 }}>
              <option value="all">Every item</option><option value="on">On the menu</option><option value="off">Hidden</option>
              <option value="norecipe">No recipe</option><option value="nophoto">No photo</option><option value="low">Low stock</option>
            </select>
            {view === 'stations' && <select value={sid} onChange={(e) => setStation(e.target.value)} style={{ minWidth: 170 }}>{stationList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
          </div>
        </div>
        <input placeholder="Search by name, SKU or category" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {!shown.length ? <Empty>{products.length ? 'No items match these filters.' : 'No items yet. Add your first item.'}</Empty> : view === 'items' ? (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {shown.map((p) => {
            const margin = p.price - p.cost;
            const pct = p.price ? Math.round((p.cost / p.price) * 100) : 0;
            const on = p.stations.filter((s: any) => s.available).length;
            const out = p.stations.filter((s: any) => s.available && s.can_make != null && s.can_make <= 0).length;
            const prices = p.stations.map((s: any) => s.price);
            const varied = prices.length && Math.min(...prices) !== Math.max(...prices);
            return (
              <button key={p.id} className="card col" onClick={() => setEdit(p)} style={{ gap: 10, textAlign: 'left', font: 'inherit', color: 'inherit', cursor: 'pointer', opacity: p.active ? 1 : 0.55, padding: 12 }}>
                <div style={{ height: 120, borderRadius: 12, background: 'var(--surface-sunk)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
                  <img src={productArt(p)} alt="" loading="lazy" style={{ maxHeight: '100%', maxWidth: '100%', objectFit: p.image_url ? 'cover' : 'contain', width: p.image_url ? '100%' : undefined, height: p.image_url ? '100%' : '90%' }} />
                  {!p.active && <span className="chip" style={{ position: 'absolute', top: 8, left: 8 }}>Hidden</span>}
                  {p.is_signature && <span className="chip hill" style={{ position: 'absolute', top: 8, right: 8 }}>Signature</span>}
                </div>
                <div>
                  <div className="row between" style={{ gap: 8 }}><strong>{p.name}</strong><strong>{rs(p.price)}</strong></div>
                  <div className="small muted">{p.category || 'No category'} · {p.sku}{varied ? ' · prices vary by station' : ''}</div>
                </div>
                <div className="row wrap" style={{ gap: 6 }}>
                  {p.recipe.length ? <span className={`chip ${pct > 40 ? 'marigold' : ''}`}>Cost {rs(p.cost)} · {pct}%</span> : <span className="chip cherry">No recipe</span>}
                  <span className="chip">{on}/{p.stations.length} stations</span>
                  {out > 0 && <span className="chip cherry">{out} out of stock</span>}
                </div>
                <div className="small muted">Margin {rs(margin)} per cup{p.sold_count ? ` · ${p.sold_count.toLocaleString()} sold` : ''}</div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="card tablewrap" style={{ padding: 0 }}>
          <table>
            <thead><tr><th>Item</th><th className="num">Base price</th><th className="num">Price here</th><th>Stock here</th><th /></tr></thead>
            <tbody>{shown.filter((p) => p.active).map((p) => {
              const s = p.stations.find((x: any) => x.station_id === sid);
              if (!s) return null;
              const tiered = !!p.price_tier;
              return (
                <tr key={p.id}>
                  <td><strong>{p.name}</strong> <span className="small muted">{p.category}</span></td>
                  <td className="num">{rs(p.price)}</td>
                  <td className="num">
                    <input style={{ width: 90, minHeight: 36, textAlign: 'right' }} type="number" min={0} disabled={tiered} title={tiered ? 'Tier-priced drinks cost the same everywhere' : undefined}
                      key={`${p.id}-${s.price_override}`} defaultValue={s.price_override ?? ''} placeholder={String(p.price)}
                      onBlur={(e) => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== (s.price_override ?? null)) quickStation(p, s, { price_override: v }); }} />
                  </td>
                  <td>{cupsChip(s.can_make, s.available)}</td>
                  <td className="right"><button className={`btn sm ${s.available ? 'ghost' : 'hill'}`} onClick={() => quickStation(p, s, { available: !s.available })}>{s.available ? 'Selling · pause' : 'Paused · resume'}</button></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}

      {view === 'stations' && <p className="small muted">Leave a price blank to use the base price. Cups come from this station's stock and each item's recipe. <button className="btn sm ghost" onClick={() => go('inventory')}>Open inventory</button></p>}

      {edit && <ItemEditor key={edit.id || 'new'} item={edit.id ? products.find((p) => p.id === edit.id) || edit : edit} data={data} onClose={() => setEdit(null)} onChanged={reload} onSaved={(p: any) => { setEdit(p); }} />}
      {cats && <CategoryManager data={data} onClose={() => setCats(false)} onChanged={reload} />}
    </div>
  );
}

/* ------------------------------------------------------------------ item editor */
function ItemEditor({ item, data, onClose, onChanged, onSaved }: { item: any; data: any; onClose: () => void; onChanged: () => void; onSaved: (p: any) => void }) {
  const toast = useToast();
  const isNew = !item.id;
  const [tab, setTab] = useState<'details' | 'stations' | 'options' | 'recipe'>('details');
  const [f, setF] = useState<any>({ ...item, price_tier: item.price_tier || '', origin: item.origin || '', description: item.description || '', description_ne: item.description_ne || '', name_ne: item.name_ne || '' });
  const [busy, setBusy] = useState(false);
  const [recipeOpen, setRecipeOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }));
  const hasRecipe = (item.recipe?.length || 0) > 0;

  async function save() {
    if (!f.name.trim() || (isNew && !f.sku.trim())) return toast('Name and SKU are required', true);
    if (!f.category_id) return toast('Choose a category (add one under Categories first)', true);
    const body: any = {
      category_id: f.category_id, kind: f.kind, name: f.name.trim(), name_ne: f.name_ne, description: f.description, description_ne: f.description_ne, origin: f.origin,
      price: Number(f.price), prep_seconds: Number(f.prep_seconds), sort: Number(f.sort || 0), is_signature: !!f.is_signature, is_seasonal: !!f.is_seasonal, pass_eligible: !!f.pass_eligible, active: !!f.active,
      price_tier: f.price_tier || null, image_url: f.image_url || null,
    };
    if (!hasRecipe) body.cost = Number(f.cost || 0);
    if (isNew) { body.sku = f.sku.trim().toUpperCase(); for (const k of ['name_ne', 'description', 'description_ne', 'origin']) if (!body[k]) delete body[k]; if (!body.image_url) delete body.image_url; if (!body.price_tier) delete body.price_tier; }
    setBusy(true);
    try {
      const out = isNew ? await api('/owner/products', { method: 'POST', body }) : await api(`/owner/products/${item.id}`, { method: 'PATCH', body });
      toast(isNew ? 'Item created. Now set its stations and recipe.' : 'Item saved');
      onChanged();
      if (isNew) onSaved({ ...out, stations: [], option_groups: [], recipe: [] });
    } catch (e: any) { toast(e.message, true); } finally { setBusy(false); }
  }
  async function duplicate() {
    setBusy(true);
    try { await api(`/owner/products/${item.id}/duplicate`, { method: 'POST' }); toast('Copy created (hidden). Find it in the list to finish it.'); onChanged(); onClose(); } catch (e: any) { toast(e.message, true); } finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true);
    try { await api(`/owner/products/${item.id}`, { method: 'DELETE' }); toast('Item deleted'); onChanged(); onClose(); } catch (e: any) { toast(e.message, true); setConfirmDel(false); } finally { setBusy(false); }
  }

  const price = Number(f.price) || 0;
  const cost = hasRecipe ? item.cost : Number(f.cost) || 0;
  const tabs: [typeof tab, string][] = [['details', 'Details and photo'], ['stations', 'Stations and stock'], ['options', 'Options'], ['recipe', 'Recipe']];

  return (
    <>
      <Modal title={isNew ? 'New item' : item.name} onClose={onClose}>
        <div className="col" style={{ gap: 14, minWidth: 0 }}>
          <div className="tabs" role="tablist" style={{ margin: 0 }}>
            {tabs.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} disabled={isNew && id !== 'details'} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{label}</button>)}
          </div>

          {tab === 'details' && (
            <div className="col" style={{ gap: 12 }}>
              <ImagePicker label="Photo" hint="Shown in the app, the web menu and the kiosk. Square pictures look best. Save to publish." slot={f.image_url ? { id: item.id || 'draft', url: f.image_url } : null} fallback={productArt({ sku: f.sku, kind: f.kind })} onChange={(s: any) => set('image_url', s ? s.url : null)} />
              <div className="grid g2">
                <Field label="SKU" hint={isNew ? 'Short unique code, e.g. LAT' : 'Cannot change after creation'}><input value={f.sku} disabled={!isNew} maxLength={20} onChange={(e) => set('sku', e.target.value.toUpperCase())} /></Field>
                <Field label="Category">
                  <select value={f.category_id || ''} onChange={(e) => set('category_id', e.target.value)}>
                    <option value="" disabled>Choose…</option>
                    {data.categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </Field>
              </div>
              <div className="grid g2">
                <Field label="Name"><input value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
                <Field label="Name in Nepali"><input value={f.name_ne} onChange={(e) => set('name_ne', e.target.value)} /></Field>
              </div>
              <Field label="Description"><input value={f.description} onChange={(e) => set('description', e.target.value)} /></Field>
              <Field label="Description in Nepali"><input value={f.description_ne} onChange={(e) => set('description_ne', e.target.value)} /></Field>
              <div className="grid g3">
                <Field label="Type"><select value={f.kind} onChange={(e) => set('kind', e.target.value)}>{KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</select></Field>
                <Field label="Pricing"><select value={f.price_tier} onChange={(e) => set('price_tier', e.target.value)}>{TIERS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></Field>
                <Field label="Base price (Rs, all-in)" hint={f.price_tier ? 'Set by the tier in Settings' : undefined}><input type="number" min={0} disabled={!!f.price_tier} value={f.price} onChange={(e) => set('price', e.target.value)} /></Field>
              </div>
              <div className="grid g3">
                <Field label="Food cost (Rs)" hint={hasRecipe ? 'Worked out from the recipe' : 'No recipe yet, so enter your best estimate'}><input type="number" min={0} disabled={hasRecipe} value={hasRecipe ? item.cost : f.cost} onChange={(e) => set('cost', e.target.value)} /></Field>
                <Field label="Prep time (seconds)"><input type="number" min={10} max={600} value={f.prep_seconds} onChange={(e) => set('prep_seconds', e.target.value)} /></Field>
                <Field label="Origin" hint="e.g. Gulmi, 1,400 m"><input value={f.origin} onChange={(e) => set('origin', e.target.value)} /></Field>
              </div>
              <div className="card flat row between wrap" style={{ gap: 10 }}>
                <span className="small muted">At {rs(price)} with {rs(cost)} food cost</span>
                <strong style={{ color: price && cost / price > 0.4 ? 'var(--cherry)' : undefined }}>Margin {rs(price - cost)} · food cost {price ? Math.round((cost / price) * 100) : 0}%</strong>
              </div>
              <Field label="Position in its category" hint="Lower numbers appear first"><input type="number" value={f.sort} onChange={(e) => set('sort', e.target.value)} /></Field>
              {([['is_signature', 'Signature item'], ['is_seasonal', 'Seasonal'], ['pass_eligible', 'Covered by the 10-cup pass'], ['active', 'On the menu']] as const).map(([k, l]) => (
                <label key={k} className="row" style={{ gap: 8, cursor: 'pointer' }}><input type="checkbox" style={{ width: 20, minHeight: 20 }} checked={!!f[k]} onChange={(e) => set(k, e.target.checked)} />{l}</label>
              ))}
              <div className="row between wrap" style={{ marginTop: 6, gap: 8 }}>
                <div className="row wrap">
                  {!isNew && <button className="btn" onClick={duplicate} disabled={busy}>Duplicate</button>}
                  {!isNew && !confirmDel && <button className="btn danger" onClick={() => setConfirmDel(true)} disabled={busy}>Delete</button>}
                  {confirmDel && <><button className="btn danger" onClick={remove} disabled={busy}>Yes, delete {item.name}</button><button className="btn ghost" onClick={() => setConfirmDel(false)}>Keep it</button></>}
                </div>
                <button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : isNew ? 'Create item' : 'Save changes'}</button>
              </div>
              {confirmDel && <p className="small muted">Items that appear in past orders cannot be erased. Switch off "On the menu" to retire those instead.</p>}
            </div>
          )}

          {tab === 'stations' && <StationsPanel item={item} onChanged={onChanged} />}
          {tab === 'options' && <OptionsPanel key={(item.option_groups || []).flatMap((x: any) => [x.id, ...x.options.map((y: any) => y.id)]).join('|')} item={item} onChanged={onChanged} />}
          {tab === 'recipe' && (
            <div className="col" style={{ gap: 12 }}>
              {hasRecipe ? (
                <div className="card flat tablewrap" style={{ padding: 0 }}>
                  <table><thead><tr><th>Ingredient</th><th className="num">Per cup</th></tr></thead>
                    <tbody>{item.recipe.map((r: any) => <tr key={r.ingredient_id}><td>{r.name}</td><td className="num">{Number(r.qty)} {r.unit}</td></tr>)}</tbody></table>
                </div>
              ) : <Empty>No recipe yet. Without one, the cost is a guess and stock is never used up when this is sold.</Empty>}
              <div className="row between wrap">
                <span className="small muted">{hasRecipe ? `Cost ${rs(item.cost)} per cup. Selling a cup uses these amounts from the station's stock.` : 'Add ingredients to link this item to inventory.'}</span>
                <button className="btn primary" onClick={() => setRecipeOpen(true)}>{hasRecipe ? 'Edit recipe' : 'Build recipe'}</button>
              </div>
            </div>
          )}
        </div>
      </Modal>
      {recipeOpen && <RecipeDrawer id={item.id} canEdit onClose={() => setRecipeOpen(false)} onSaved={onChanged} />}
    </>
  );
}

/* ------------------------------------------------------------- stations and stock */
function StationsPanel({ item, onChanged }: { item: any; onChanged: () => void }) {
  const toast = useToast();
  const stock = useData<any[]>(`/owner/products/${item.id}/stock`);
  const [rows, setRows] = useState<any[]>(() => item.stations.map((s: any) => ({ ...s, price_override: s.price_override ?? '' })));
  const [busy, setBusy] = useState(false);
  const [add, setAdd] = useState<Record<string, string>>({});
  const tiered = !!item.price_tier;
  const upd = (i: number, patch: any) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  async function save() {
    setBusy(true);
    try {
      await api(`/owner/products/${item.id}/stations`, { method: 'PUT', body: rows.map((r) => ({ station_id: r.station_id, available: r.available, ...(tiered ? {} : { price_override: num(r.price_override) }) })) });
      toast('Stations updated'); onChanged();
    } catch (e: any) { toast(e.message, true); } finally { setBusy(false); }
  }
  async function restock(sid: string, iid: string) {
    const key = `${sid}:${iid}`; const delta = Number(add[key]);
    if (!delta) return;
    try { await api(`/admin/inventory/${sid}/${iid}`, { method: 'POST', body: { delta, reason: delta > 0 ? 'restock' : 'adjust' } }); setAdd((a) => ({ ...a, [key]: '' })); stock.reload(); onChanged(); toast('Stock updated'); } catch (e: any) { toast(e.message, true); }
  }
  const byStation = new Map<string, any[]>();
  (stock.data || []).forEach((r) => byStation.set(r.station_id, [...(byStation.get(r.station_id) || []), r]));

  if (!rows.length) return <Empty>No active stations yet.</Empty>;
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="card flat tablewrap" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Station</th><th className="num">Price (Rs)</th><th>Stock</th><th>Selling</th></tr></thead>
          <tbody>{rows.map((r, i) => (
            <tr key={r.station_id}>
              <td><strong>{r.station_name}</strong> <span className="small muted">{r.station_code}</span></td>
              <td className="num"><input style={{ width: 90, minHeight: 36, textAlign: 'right' }} type="number" min={0} disabled={tiered} value={r.price_override} placeholder={String(item.price)} onChange={(e) => upd(i, { price_override: e.target.value })} /></td>
              <td>{cupsChip(item.stations.find((s: any) => s.station_id === r.station_id)?.can_make, r.available)}</td>
              <td><label className="row" style={{ gap: 6, cursor: 'pointer' }}><input type="checkbox" style={{ width: 20, minHeight: 20 }} checked={r.available} onChange={(e) => upd(i, { available: e.target.checked })} />{r.available ? 'On' : 'Paused'}</label></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className="row between wrap" style={{ gap: 8 }}>
        <div className="row wrap">
          {!tiered && <button className="btn sm" onClick={() => setRows((r) => r.map((x) => ({ ...x, price_override: '' })))}>Use base price everywhere</button>}
          <button className="btn sm" onClick={() => setRows((r) => r.map((x) => ({ ...x, available: true })))}>Turn on everywhere</button>
        </div>
        <button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save stations'}</button>
      </div>
      {tiered && <p className="small muted">This is a tier-priced drink, so it costs the same at every station. Change the tier price under Settings.</p>}

      <h4 style={{ margin: '8px 0 0' }}>Stock behind this item</h4>
      <p className="small muted" style={{ margin: 0 }}>Each cup uses the amounts below. Add stock here or use a negative number to record waste. Full control is under Inventory.</p>
      {!item.recipe.length ? <Empty>No recipe, so no stock is linked yet. Build the recipe first.</Empty> : !stock.data ? <Loading /> : (
        <div className="card flat tablewrap" style={{ padding: 0 }}>
          <table>
            <thead><tr><th>Station</th><th>Ingredient</th><th className="num">Per cup</th><th className="num">On hand</th><th className="num">Cups</th><th>Add or remove</th></tr></thead>
            <tbody>{[...byStation.entries()].flatMap(([sid, list]) => list.map((r, i) => (
              <tr key={`${sid}:${r.ingredient_id}`}>
                <td>{i === 0 ? <strong>{r.station_name}</strong> : ''}</td>
                <td>{r.ingredient}</td>
                <td className="num">{r.per_cup} {r.unit}</td>
                <td className="num" style={{ color: r.on_hand <= r.reorder_level ? 'var(--cherry)' : undefined, fontWeight: r.on_hand <= r.reorder_level ? 700 : 400 }}>{Math.round(r.on_hand * 100) / 100} {r.unit}</td>
                <td className="num">{r.cups}</td>
                <td><div className="row" style={{ gap: 6 }}>
                  <input style={{ width: 80, minHeight: 34 }} type="number" placeholder="± qty" value={add[`${sid}:${r.ingredient_id}`] || ''} onChange={(e) => setAdd((a) => ({ ...a, [`${sid}:${r.ingredient_id}`]: e.target.value }))} />
                  <button className="btn sm" onClick={() => restock(sid, r.ingredient_id)} disabled={!Number(add[`${sid}:${r.ingredient_id}`])}>Update</button>
                </div></td>
              </tr>
            )))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------ options */
function OptionsPanel({ item, onChanged }: { item: any; onChanged: () => void }) {
  const toast = useToast();
  const [groups, setGroups] = useState<any[]>(() => JSON.parse(JSON.stringify(item.option_groups || [])));
  const [busy, setBusy] = useState(false);
  const g = (i: number, patch: any) => setGroups((a) => a.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const o = (i: number, k: number, patch: any) => setGroups((a) => a.map((x, j) => (j === i ? { ...x, options: x.options.map((y: any, m: number) => (m === k ? { ...y, ...patch } : y)) } : x)));

  async function save() {
    if (groups.some((x) => !x.name.trim() || !x.options.length || x.options.some((y: any) => !y.name.trim()))) return toast('Every group and choice needs a name, and every group at least one choice', true);
    setBusy(true);
    try {
      await api(`/owner/products/${item.id}/options`, { method: 'PUT', body: groups.map((x) => ({ id: x.id, name: x.name.trim(), name_ne: x.name_ne || null, required: !!x.required, multi: !!x.multi, options: x.options.map((y: any) => ({ id: y.id, name: y.name.trim(), name_ne: y.name_ne || null, price_delta: Math.round(Number(y.price_delta) || 0), is_default: !!y.is_default })) })) });
      toast('Options saved'); onChanged();
    } catch (e: any) { toast(e.message, true); } finally { setBusy(false); }
  }
  return (
    <div className="col" style={{ gap: 12 }}>
      <p className="small muted" style={{ margin: 0 }}>Choices customers make, such as size or milk. Extra price is added to the item price. Set what a choice uses from stock (e.g. oat milk) in the recipe editor.</p>
      {!groups.length && <Empty>No options. Customers just order the item as it is.</Empty>}
      {groups.map((x, i) => (
        <div key={x.id || i} className="card flat col" style={{ gap: 10 }}>
          <div className="row wrap" style={{ gap: 8 }}>
            <input style={{ flex: 1, minWidth: 140 }} placeholder="Group name, e.g. Milk" value={x.name} onChange={(e) => g(i, { name: e.target.value })} />
            <input style={{ flex: 1, minWidth: 120 }} placeholder="In Nepali (optional)" value={x.name_ne || ''} onChange={(e) => g(i, { name_ne: e.target.value })} />
            <label className="row" style={{ gap: 6 }}><input type="checkbox" style={{ width: 18, minHeight: 18 }} checked={!!x.required} onChange={(e) => g(i, { required: e.target.checked })} />Required</label>
            <label className="row" style={{ gap: 6 }}><input type="checkbox" style={{ width: 18, minHeight: 18 }} checked={!!x.multi} onChange={(e) => g(i, { multi: e.target.checked })} />Pick several</label>
            <button className="btn sm danger" onClick={() => setGroups((a) => a.filter((_, j) => j !== i))}>Remove group</button>
          </div>
          {x.options.map((y: any, k: number) => (
            <div key={y.id || k} className="row wrap" style={{ gap: 8, paddingLeft: 12 }}>
              <input style={{ flex: 1, minWidth: 120 }} placeholder="Choice, e.g. Oat milk" value={y.name} onChange={(e) => o(i, k, { name: e.target.value })} />
              <input style={{ width: 110 }} type="number" placeholder="Extra Rs" value={y.price_delta} onChange={(e) => o(i, k, { price_delta: e.target.value })} />
              <label className="row" style={{ gap: 6 }}><input type="checkbox" style={{ width: 18, minHeight: 18 }} checked={!!y.is_default} onChange={(e) => setGroups((a) => a.map((gx, j) => (j === i ? { ...gx, options: gx.options.map((oy: any, m: number) => (m === k ? { ...oy, is_default: e.target.checked } : (!gx.multi && e.target.checked ? { ...oy, is_default: false } : oy))) } : gx)))} />Default</label>
              <button className="btn sm ghost" onClick={() => g(i, { options: x.options.filter((_: any, m: number) => m !== k) })} aria-label="Remove choice"><Icon name="close" size={14} /></button>
            </div>
          ))}
          <div style={{ paddingLeft: 12 }}><button className="btn sm" onClick={() => g(i, { options: [...x.options, { name: '', price_delta: 0, is_default: false }] })}>Add choice</button></div>
        </div>
      ))}
      <div className="row between wrap">
        <button className="btn" onClick={() => setGroups((a) => [...a, { name: '', required: false, multi: false, options: [{ name: '', price_delta: 0, is_default: true }] }])}><Icon name="plus" size={18} />Add option group</button>
        <button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save options'}</button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- categories */
function CategoryManager({ data, onClose, onChanged }: { data: any; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [nameNe, setNameNe] = useState('');
  async function run(fn: () => Promise<any>, ok: string) { try { await fn(); toast(ok); onChanged(); } catch (e: any) { toast(e.message, true); } }
  const list: any[] = data.categories;
  async function move(i: number, d: -1 | 1) {
    const ids = list.map((c) => c.id); const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    run(() => api('/owner/menu/order', { method: 'PUT', body: { categories: ids } }), 'Order saved');
  }
  return (
    <Modal title="Categories" onClose={onClose}>
      <div className="col" style={{ gap: 10 }}>
        {list.map((c, i) => (
          <div key={c.id} className="row wrap" style={{ gap: 8 }}>
            <div className="row" style={{ gap: 2 }}>
              <button className="iconbtn" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><Icon name="up" size={16} /></button>
              <button className="iconbtn" aria-label="Move down" disabled={i === list.length - 1} onClick={() => move(i, 1)}><Icon name="dn" size={16} /></button>
            </div>
            <input style={{ flex: 1, minWidth: 130 }} defaultValue={c.name} onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && run(() => api(`/owner/categories/${c.id}`, { method: 'PATCH', body: { name: e.target.value.trim() } }), 'Renamed')} />
            <input style={{ flex: 1, minWidth: 110 }} placeholder="In Nepali" defaultValue={c.name_ne || ''} onBlur={(e) => e.target.value !== (c.name_ne || '') && run(() => api(`/owner/categories/${c.id}`, { method: 'PATCH', body: { name_ne: e.target.value.trim() || null } }), 'Saved')} />
            <span className="chip">{c.product_count} item{c.product_count === 1 ? '' : 's'}</span>
            <button className="btn sm danger" onClick={() => run(() => api(`/owner/categories/${c.id}`, { method: 'DELETE' }), 'Category deleted')}>Delete</button>
          </div>
        ))}
        {!list.length && <Empty>No categories yet.</Empty>}
        <div className="row wrap" style={{ gap: 8, borderTop: '1px solid var(--hairline)', paddingTop: 12 }}>
          <input style={{ flex: 1, minWidth: 130 }} placeholder="New category, e.g. Cold drinks" value={name} onChange={(e) => setName(e.target.value)} />
          <input style={{ flex: 1, minWidth: 110 }} placeholder="In Nepali (optional)" value={nameNe} onChange={(e) => setNameNe(e.target.value)} />
          <button className="btn primary" disabled={name.trim().length < 2} onClick={() => run(async () => { await api('/owner/categories', { method: 'POST', body: { name: name.trim(), name_ne: nameNe.trim() || undefined, sort: list.length } }); setName(''); setNameNe(''); }, 'Category added')}>Add</button>
        </div>
      </div>
    </Modal>
  );
}
