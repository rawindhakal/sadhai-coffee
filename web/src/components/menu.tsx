'use client';
import { useState } from 'react';
import { rs } from '@/lib/api';
import { useCart, quickLine, Line } from '@/lib/cart';
import { useI18n } from '@/lib/i18n';
import { Icon } from './icons';
import { productArt } from '@/lib/art';
import { Modal, useToast } from './ui';

export const nm = (o: any, lang: string) => (lang === 'ne' && o.name_ne ? o.name_ne : o.name);

export function Thumb({ p }: { p: any }) {
  const cls = p.kind === 'merch' ? 'merch' : p.is_signature ? 'hill' : '';
  return (
    <div className={`thumb ${cls}`}>
      <img src={productArt(p)} alt="" loading="lazy" style={{ height: '88%', width: 'auto', objectFit: 'contain' }} />
      {p.offer && <span className="tag-deal">Today</span>}
      {p.drop && <span className="tag-deal">{p.drop.remaining} left</span>}
    </div>
  );
}

/** Vertical product card with a one-tap add. Opens the options sheet when a required choice has no default. */
export function ProductCard({ p }: { p: any }) {
  const { lang, t } = useI18n();
  const cart = useCart();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const ok = p.available;
  const inCart = cart.lines.filter((l) => l.product.id === p.id).reduce((a, l) => a + l.qty, 0);
  function quick(e: React.MouseEvent) {
    e.stopPropagation();
    const l = quickLine(p);
    if (!l) return setOpen(true);
    cart.add(l); toast(`${p.name} added`);
  }
  return (
    <>
      <div className={`pcard ${ok ? '' : 'sold'}`} role="group" aria-label={p.name}>
        <button style={{ all: 'unset', cursor: ok ? 'pointer' : 'not-allowed', display: 'block' }} disabled={!ok} onClick={() => setOpen(true)} aria-label={`Customise ${p.name}`}><Thumb p={p} /></button>
        <div className="body">
          <span className="nm">{nm(p, lang)}</span>
          {p.origin && <span className="small muted">{p.origin}</span>}
          <div className="row between" style={{ marginTop: 'auto' }}>
            <span><span className="price">{rs(p.price)}</span>{p.price < p.list_price && <span className="small muted" style={{ textDecoration: 'line-through', marginLeft: 6 }}>{rs(p.list_price)}</span>}</span>
          </div>
          {ok ? (
            <button className={`btn sm add ${inCart ? 'hill' : 'primary'}`} onClick={quick} aria-label={`Add ${p.name} to cart`}><Icon name={inCart ? 'check' : 'plus'} size={16} />{inCart ? `${inCart} in cart` : t('add')}</button>
          ) : <span className="chip add">{t('sold_out')}</span>}
        </div>
      </div>
      {open && <ItemModal p={p} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Horizontal list row used in "all products". */
export function ProductRow({ p }: { p: any }) {
  const { lang, t } = useI18n();
  const cart = useCart();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const qty = cart.lines.filter((l) => l.product.id === p.id).reduce((a, l) => a + l.qty, 0);
  const single = cart.lines.filter((l) => l.product.id === p.id);
  function quick() { const l = quickLine(p); if (!l) return setOpen(true); cart.add(l); toast(`${p.name} added`); }
  return (
    <div className="row" style={{ padding: 14, borderBottom: '1px solid var(--hairline)', opacity: p.available ? 1 : 0.55, alignItems: 'flex-start' }}>
      <button style={{ all: 'unset', cursor: p.available ? 'pointer' : 'not-allowed', flex: 1, minWidth: 0 }} disabled={!p.available} onClick={() => setOpen(true)}>
        <div className="row wrap" style={{ gap: 6 }}>
          <strong>{nm(p, lang)}</strong>
          {p.offer && <span className="chip marigold">Today</span>}
          {p.drop && <span className="chip marigold">{p.drop.remaining} left</span>}
          {p.is_signature && !p.drop && <span className="chip hill">Signature</span>}
          {p.origin && <span className="chip">{p.origin}</span>}
          {!p.available && <span className="chip">{t('sold_out')}</span>}
        </div>
        <p className="small muted">{lang === 'ne' && p.description_ne ? p.description_ne : p.description}</p>
        <span className="price">{rs(p.price)}</span>{p.price < p.list_price && <span className="small muted" style={{ textDecoration: 'line-through', marginLeft: 6 }}>{rs(p.list_price)}</span>}
      </button>
      {p.available && (
        single.length === 1 && single[0].option_ids.length === quickLine(p)?.option_ids.length && qty > 0 && quickLine(p)?.key === single[0].key ? (
          <div className="stepper" role="group" aria-label={`${p.name} quantity`}>
            <button aria-label="Fewer" onClick={() => cart.setQty(single[0].key, single[0].qty - 1)}><Icon name="minus" size={18} /></button><b>{qty}</b>
            <button aria-label="More" onClick={() => cart.setQty(single[0].key, single[0].qty + 1)}><Icon name="plus" size={18} /></button>
          </div>
        ) : <button className="btn primary sm" onClick={quick} aria-label={`Add ${p.name}`}><Icon name="plus" size={16} />{qty ? `${qty}` : t('add')}</button>
      )}
      {open && <ItemModal p={p} onClose={() => setOpen(false)} />}
    </div>
  );
}

export function ItemModal({ p, onClose }: { p: any; onClose: () => void }) {
  const { lang } = useI18n();
  const cart = useCart();
  const toast = useToast();
  const [sel, setSel] = useState<Record<string, string[]>>(() => Object.fromEntries(p.option_groups.map((g: any) => [g.id, g.options.filter((o: any) => o.is_default).map((o: any) => o.id)])));
  const [qty, setQty] = useState(1);
  const ids = Object.values(sel).flat();
  const opts = p.option_groups.flatMap((g: any) => g.options).filter((o: any) => ids.includes(o.id));
  const unit = p.price + opts.reduce((a: number, o: any) => a + o.price_delta, 0);
  const missing = p.option_groups.some((g: any) => g.required && !(sel[g.id] || []).length);
  const toggle = (g: any, o: any) => setSel((s) => {
    const cur = s[g.id] || [];
    if (g.multi) return { ...s, [g.id]: cur.includes(o.id) ? cur.filter((x) => x !== o.id) : [...cur, o.id] };
    return { ...s, [g.id]: g.required ? [o.id] : cur.includes(o.id) ? [] : [o.id] };
  });
  function add() {
    const l: Line = { key: `${p.id}|${[...ids].sort().join(',')}`, product: { id: p.id, name: p.name, name_ne: p.name_ne, kind: p.kind }, qty, option_ids: ids, optionNames: opts.map((o: any) => o.name), unit };
    cart.add(l); toast(`${p.name} added`); onClose();
  }
  return (
    <Modal title={nm(p, lang)} onClose={onClose}>
      <p className="muted">{lang === 'ne' && p.description_ne ? p.description_ne : p.description}</p>
      {p.offer && <p className="chip marigold" style={{ marginTop: 8 }}>{p.offer.title}</p>}
      {p.option_groups.map((g: any) => (
        <fieldset key={g.id} style={{ border: 0, padding: 0, margin: '16px 0 0' }}>
          <legend className="label" style={{ marginBottom: 8 }}>{nm(g, lang)}{g.required ? ' · required' : ''}</legend>
          <div className="row wrap">
            {g.options.map((o: any) => { const on = (sel[g.id] || []).includes(o.id); return <button key={o.id} type="button" aria-pressed={on} className={`btn sm ${on ? 'primary' : 'ghost'}`} onClick={() => toggle(g, o)}>{nm(o, lang)}{o.price_delta ? ` +${o.price_delta}` : ''}</button>; })}
          </div>
        </fieldset>
      ))}
      <div className="row between" style={{ marginTop: 24 }}>
        <div className="stepper"><button aria-label="Fewer" onClick={() => setQty(Math.max(1, qty - 1))}><Icon name="minus" size={18} /></button><b>{qty}</b><button aria-label="More" onClick={() => setQty(Math.min(10, qty + 1))}><Icon name="plus" size={18} /></button></div>
        <button className="btn primary" disabled={missing} onClick={add}>Add to cart · {rs(unit * qty)}</button>
      </div>
    </Modal>
  );
}
