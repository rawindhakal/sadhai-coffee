'use client';
import { useEffect, useState } from 'react';
import { api, fmtDateTime, rs } from '@/lib/api';
import { Empty, ErrorNote, Field, Meter, Modal, useData, useToast } from './ui';
import { Seg, Skeleton } from './dash/kit';
import { useDash } from './dash/shell';
import { Icon } from './icons';
import { HeroScene } from './hero';
import { productArt } from '@/lib/art';
import { STEP_ART, STORY_ART, HERO_DEFAULTS } from '@/lib/site-content';

/* ============================================================================
   Settings: business rules, staff and pay rules, and every integration key.
   ============================================================================ */
type F = { key: string; label: string; unit?: string; hint?: string; toggle?: boolean; step?: number };
const RULES: { title: string; note?: string; fields: F[] }[] = [
  { title: 'Drink prices', note: 'One price for every drink of a kind, at every station. Changing one updates every drink in that group straight away.', fields: [{ key: 'price_hot', label: 'Hot coffee', unit: 'Rs' }, { key: 'price_flavored', label: 'Flavored drinks', unit: 'Rs' }, { key: 'price_iced', label: 'Iced drinks', unit: 'Rs' }] },
  { title: '10-cup pass', fields: [{ key: 'pass_price', label: 'Price of a pass', unit: 'Rs' }, { key: 'pass_cups', label: 'Cups in a pass' }, { key: 'pass_valid_days', label: 'Days it lasts once started' }, { key: 'pass_use_by_days', label: 'Days an unstarted pass can wait' }] },
  { title: 'Welcome offers and referrals', fields: [{ key: 'first_cup_days', label: 'Free first cup lasts (days)' }, { key: 'first_cup_max', label: 'Free cup covers up to', unit: 'Rs' }, { key: 'ladder_count', label: 'Coupons after the first cup' }, { key: 'ladder_pct', label: 'Coupon percent off', unit: '%' }, { key: 'ladder_days', label: 'Coupons last (days)' }, { key: 'referral_cap_month', label: 'Referral cups per month' }, { key: 'referral_cup_max', label: 'Referral cup covers up to', unit: 'Rs' }, { key: 'offer_payback_max_days', label: 'Longest allowed payback (days)' }] },
  { title: 'Partner cafes', fields: [{ key: 'partner_share_pct', label: 'Default share of net sales a partner keeps', unit: '%' }] },
  { title: 'Costing and stock', fields: [{ key: 'target_food_cost_pct', label: 'Target food cost', unit: '%', hint: 'Items above this are flagged on Recipes and costing.' }, { key: 'variance_alert_value', label: 'Alert when a stock count is off by', unit: 'Rs' }] },
  { title: 'Staff, shifts and pay', note: 'Nepal’s labour law sets 8 hours a day and 48 hours a week, with overtime at 1.5 times. Ask your accountant before changing these.', fields: [
    { key: 'daily_regular_hours', label: 'Regular hours a day' }, { key: 'weekly_regular_hours', label: 'Regular hours a week' }, { key: 'overtime_multiplier', label: 'Overtime pays', unit: '× the hourly rate', step: 0.1 },
    { key: 'max_weekly_hours', label: 'Most hours the auto-roster plans for one person in a week' }, { key: 'min_rest_hours', label: 'Rest between shifts (hours)' }, { key: 'orders_per_staff_shift', label: 'Orders one person handles in a 6-hour shift', hint: 'Decides how many people a shift needs.' },
    { key: 'checkin_early_minutes', label: 'Staff can start a shift this many minutes early' }, { key: 'checkin_grace_minutes', label: 'Grace for late or early check-in (minutes)', hint: 'Within this, pay is for the scheduled time.' },
    { key: 'ssf_employee_pct', label: 'Social security taken from pay', unit: '%', step: 0.5 }, { key: 'ssf_employer_pct', label: 'Social security paid by the business on top', unit: '%', step: 0.5 }] },
  { title: 'Automatic messages', note: 'Switch each automatic push on or off.', fields: [{ key: 'auto_pass_expiry', label: 'Pass ending soon', toggle: true }, { key: 'auto_pass_low', label: 'Pass nearly used up', toggle: true }, { key: 'auto_winback', label: 'Win-back note for quiet regulars', toggle: true }, { key: 'auto_offers', label: 'New offer of the day', toggle: true }, { key: 'auto_drops', label: 'New monthly drop', toggle: true }, { key: 'auto_shift_reminder', label: 'Shift reminder for staff the evening before', toggle: true }, { key: 'promo_push_daily_cap', label: 'Marketing messages per customer per day' }] },
];

export function RulesPanel() {
  const { data, reload } = useData<Record<string, number>>('/owner/settings');
  const toast = useToast();
  const [v, setV] = useState<Record<string, string>>({});
  if (!data) return <Skeleton h={80} n={4} />;
  const changed = Object.keys(v);
  async function save() { try { await api('/owner/settings', { method: 'PUT', body: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, Number(x)])) }); setV({}); reload(); toast('Settings saved'); } catch (e: any) { toast(e.message, true); } }
  return (
    <div className="col" style={{ gap: 16 }}>
      {RULES.map((g) => (
        <div key={g.title} className="panel">
          <div className="ph"><div><h3>{g.title}</h3>{g.note && <p className="small muted" style={{ maxWidth: 640 }}>{g.note}</p>}</div></div>
          <div className="grid g3">{g.fields.map((f) => f.toggle
            ? <label key={f.key} className="row card flat" style={{ justifyContent: 'space-between' }}><span>{f.label}</span><input type="checkbox" role="switch" style={{ width: 24, minHeight: 24 }} checked={(v[f.key] ?? data[f.key]) == 1 || v[f.key] === '1'} onChange={(e) => setV({ ...v, [f.key]: e.target.checked ? '1' : '0' })} /></label>
            : <Field key={f.key} label={f.label} hint={[f.unit, f.hint].filter(Boolean).join(' · ') || undefined}><input type="number" step={f.step || 1} value={v[f.key] ?? data[f.key]} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} /></Field>)}</div>
        </div>
      ))}
      <div className="row" style={{ position: 'sticky', bottom: 12 }}><button className="btn primary lg" disabled={!changed.length} onClick={save}>{changed.length ? `Save ${changed.length} change${changed.length > 1 ? 's' : ''}` : 'No changes'}</button></div>
    </div>
  );
}

const GROUPS: Record<string, { title: string; note: string }> = {
  payments: { title: 'Payments', note: 'eSewa, Khalti and Fonepay. Keys are stored encrypted and are never shown again after saving.' },
  push: { title: 'Push notifications', note: 'Firebase sends to Android and iPhone. Browser push uses a key pair. With neither, push runs in test mode.' },
  app: { title: 'Addresses and app versions', note: 'Where customers reach you and which app versions may still run.' },
  company: { title: 'Company details', note: 'Shown on the privacy policy, terms and support pages.' },
};
export function IntegrationsPanel() {
  const { data, reload, error } = useData<any[]>('/owner/integrations');
  const toast = useToast();
  const [edit, setEdit] = useState<Record<string, string | null>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [result, setResult] = useState<{ title: string; ok?: boolean; message: string } | null>(null);
  if (!data) return <><ErrorNote error={error} /><Skeleton h={80} n={4} /></>;
  const dirty = (g: string) => data.filter((i) => i.group === g && i.key in edit).length;
  async function save(g: string) {
    const values = Object.fromEntries(data.filter((i) => i.group === g && i.key in edit).map((i) => [i.key, edit[i.key]]));
    try { await api('/owner/integrations', { method: 'PUT', body: { values } }); setEdit((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !(k in values)))); setOpen({}); reload(); toast('Saved'); } catch (e: any) { toast(e.message, true); }
  }
  async function test(name: string, title: string) { try { const r = await api(`/owner/integrations/test/${name}`, { method: 'POST', body: {} }); setResult({ title, ok: r.ok, message: r.message }); } catch (e: any) { setResult({ title, ok: false, message: e.message }); } }
  async function vapid() {
    const has = data.find((i) => i.key === 'vapid_public_key')?.is_set;
    if (has && !confirm('Replacing the browser push keys stops push on every browser that turned it on. Replace them?')) return;
    try { await api('/owner/integrations/vapid', { method: 'POST', body: { replace: !!has } }); reload(); toast('New browser push keys saved'); } catch (e: any) { toast(e.message, true); }
  }
  const tests: Record<string, [string, string][]> = { payments: [['esewa', 'Check eSewa'], ['khalti', 'Check Khalti key']], push: [['fcm', 'Check Firebase key'], ['push', 'Send me a test push']] };
  return (
    <div className="col" style={{ gap: 16 }}>
      {Object.entries(GROUPS).map(([g, meta]) => (
        <div key={g} className="panel">
          <div className="ph"><div><h3>{meta.title}</h3><p className="small muted" style={{ maxWidth: 680 }}>{meta.note}</p></div>
            <div className="row wrap">{(tests[g] || []).map(([n, l]) => <button key={n} className="btn sm" onClick={() => test(n, l)}>{l}</button>)}{g === 'push' && <button className="btn sm ghost" onClick={vapid}>Generate browser keys</button>}</div></div>
          <div className="col" style={{ gap: 14 }}>
            {data.filter((i) => i.group === g).map((i) => (
              <div key={i.key} className="grid" style={{ gridTemplateColumns: 'minmax(200px, 1fr) 2fr', gap: 12, alignItems: 'start' }}>
                <div><strong>{i.label}</strong>{i.help && <p className="small muted">{i.help}</p>}<span className={`chip ${i.source === 'dashboard' ? 'hill' : ''}`} style={{ marginTop: 4 }}>{i.source === 'dashboard' ? 'Saved here' : i.source === 'server environment' ? 'Server setting' : 'Default'}</span></div>
                <div>
                  {i.secret ? (
                    open[i.key] || !i.is_set ? (
                      <div className="row">{i.type === 'json' ? <textarea rows={4} placeholder="Paste here" value={(edit[i.key] as string) ?? ''} onChange={(e) => setEdit({ ...edit, [i.key]: e.target.value })} aria-label={i.label} /> : <input type="password" autoComplete="off" placeholder="Paste the key" value={(edit[i.key] as string) ?? ''} onChange={(e) => setEdit({ ...edit, [i.key]: e.target.value })} aria-label={i.label} />}{i.is_set && <button className="btn ghost sm" onClick={() => { setOpen({ ...open, [i.key]: false }); const { [i.key]: _x, ...rest } = edit; setEdit(rest); }}>Cancel</button>}</div>
                    ) : (
                      <div className="row between wrap"><code style={{ background: 'var(--surface-sunk)', padding: '8px 12px', borderRadius: 8 }}>{i.masked}</code><span className="row"><button className="btn sm" onClick={() => setOpen({ ...open, [i.key]: true })}>Change</button><button className="btn sm ghost" onClick={() => setEdit({ ...edit, [i.key]: null })}>{i.key in edit ? 'Will be removed' : 'Remove'}</button></span></div>
                    )
                  ) : i.type === 'enum' ? (
                    <select value={(edit[i.key] as string) ?? i.value} onChange={(e) => setEdit({ ...edit, [i.key]: e.target.value })} aria-label={i.label}>{i.options.map((o: string) => <option key={o}>{o}</option>)}</select>
                  ) : i.type === 'bool' ? (
                    <label className="row"><input type="checkbox" style={{ width: 22, minHeight: 22 }} checked={((edit[i.key] as string) ?? i.value) === '1'} onChange={(e) => setEdit({ ...edit, [i.key]: e.target.checked ? '1' : '0' })} />{((edit[i.key] as string) ?? i.value) === '1' ? 'On' : 'Off'}</label>
                  ) : <input value={(edit[i.key] as string) ?? i.value ?? ''} onChange={(e) => setEdit({ ...edit, [i.key]: e.target.value })} aria-label={i.label} />}
                  {i.updated_at && <p className="small muted" style={{ marginTop: 4 }}>Last changed {fmtDateTime(i.updated_at)}{i.updated_by ? ` by ${i.updated_by}` : ''}</p>}
                </div>
              </div>
            ))}
          </div>
          <div className="row" style={{ marginTop: 16 }}><button className="btn primary" disabled={!dirty(g)} onClick={() => save(g)}>{dirty(g) ? `Save ${dirty(g)} change${dirty(g) > 1 ? 's' : ''}` : 'No changes'}</button></div>
        </div>
      ))}
      {result && <Modal title={result.title} onClose={() => setResult(null)}><p className={result.ok ? 'ok' : 'err'} style={{ fontSize: 16 }}>{result.ok ? 'Looks good. ' : 'Needs attention. '}</p><p>{result.message}</p></Modal>}
    </div>
  );
}

export function SettingsHub() {
  const [tab, setTab] = useState<'rules' | 'keys'>('rules');
  return (
    <div className="col" style={{ gap: 16 }}>
      <Seg value={tab} onChange={setTab} options={[{ id: 'rules', label: 'Prices and rules' }, { id: 'keys', label: 'Integrations and keys' }]} />
      {tab === 'rules' ? <RulesPanel /> : <IntegrationsPanel />}
    </div>
  );
}

/* ============================================================================
   Site editor: hero pictures and text, steps, story, marquee, partner and investor pages, menu pictures.
   ============================================================================ */
type Slot = { id: string; url: string } | null;
const toBase64 = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = () => rej(new Error('Could not read that file')); r.readAsDataURL(f); });

export function ImagePicker({ label, hint, slot, fallback, onChange, wide }: { label: string; hint?: string; slot: Slot; fallback: string; onChange: (s: Slot) => void; wide?: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    if (f.size > 3 * 1024 * 1024) return toast('That picture is over 3 MB. Use a smaller file.', true);
    setBusy(true);
    try { const out = await api('/owner/media', { method: 'POST', body: { filename: f.name, mime: f.type || 'image/png', data: await toBase64(f) } }); onChange({ id: out.id, url: out.url }); toast('Picture uploaded'); } catch (x: any) { toast(x.message, true); } finally { setBusy(false); }
  }
  return (
    <div className="card flat col" style={{ gap: 8 }}>
      <div className="row between"><strong>{label}</strong>{slot ? <span className="chip hill">Your picture</span> : <span className="chip">Built-in</span>}</div>
      <div style={{ height: wide ? 130 : 96, borderRadius: 12, overflow: 'hidden', background: 'repeating-conic-gradient(var(--surface-sunk) 0% 25%, var(--surface) 0% 50%) 50% / 16px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img src={slot?.url || fallback} alt={`${label}, ${slot ? 'your upload' : 'built-in'}`} style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} />
      </div>
      {hint && <p className="small muted">{hint}</p>}
      <div className="row wrap">
        <label className="btn sm primary" style={{ cursor: 'pointer' }}>{busy ? 'Uploading…' : slot ? 'Replace' : 'Upload'}<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={pick} style={{ display: 'none' }} disabled={busy} /></label>
        {slot && <button className="btn sm ghost" onClick={() => onChange(null)}>Use built-in</button>}
      </div>
    </div>
  );
}

function StringList({ label, items, onChange, max = 8, placeholder }: { label: string; items: string[]; onChange: (v: string[]) => void; max?: number; placeholder?: string }) {
  return (
    <div className="col" style={{ gap: 6 }}><strong>{label}</strong>
      {items.map((t, i) => <div key={i} className="row"><input value={t} placeholder={placeholder} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} aria-label={`${label} ${i + 1}`} /><button className="btn ghost sm" aria-label="Remove" onClick={() => onChange(items.filter((_, j) => j !== i))}>×</button></div>)}
      {items.length < max && <button className="btn sm ghost" onClick={() => onChange([...items, ''])}>Add</button>}
    </div>
  );
}
function ObjList({ label, items, fields, onChange, make, max = 8 }: { label: string; items: any[]; fields: { k: string; label: string; type?: string; wide?: boolean }[]; onChange: (v: any[]) => void; make: () => any; max?: number }) {
  return (
    <div className="col" style={{ gap: 8 }}><strong>{label}</strong>
      {items.map((it, i) => <div key={i} className="card flat col" style={{ gap: 8 }}><div className="grid g2">{fields.map((f) => <Field key={f.k} label={f.label}>{f.wide ? <textarea value={it[f.k] ?? ''} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, [f.k]: e.target.value } : x)))} /> : <input type={f.type || 'text'} value={it[f.k] ?? ''} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, [f.k]: f.type === 'number' ? Number(e.target.value) : e.target.value } : x)))} />}</Field>)}</div><button className="btn ghost sm" onClick={() => onChange(items.filter((_, j) => j !== i))}>Remove</button></div>)}
      {items.length < max && <button className="btn sm ghost" onClick={() => onChange([...items, make()])}>Add</button>}
    </div>
  );
}

export function SiteEditor() {
  const site = useData<any>('/owner/site');
  const toast = useToast();
  const [tab, setTab] = useState<'hero' | 'steps' | 'story' | 'marquee' | 'partners' | 'investors' | 'menu'>('hero');
  const [draft, setDraft] = useState<any>({});
  useEffect(() => { if (site.data) setDraft(JSON.parse(JSON.stringify(site.data.content))); }, [site.data]);
  if (!site.data || !draft.hero) return <Skeleton h={90} n={4} />;
  const ids = (o: any): any => (Array.isArray(o) ? o.map(ids) : o && typeof o === 'object' ? ('id' in o && 'url' in o ? o.id : Object.fromEntries(Object.entries(o).map(([k, v]) => [k, ids(v)]))) : o);
  async function save(section: string) {
    const body = ids(draft[section]);
    if (section === 'investors' && body.show_unit_economics && !site.data.content.investors.show_unit_economics && !confirm('This publishes your per-cup cost and margin to everyone who opens the investor page. Publish it?')) return;
    try { await api(`/owner/site/${section}`, { method: 'PUT', body }); toast('Saved. The website, kiosk and apps show it now.'); site.reload(); } catch (e: any) { toast(e.message, true); }
  }
  async function reset(section: string) { if (!confirm('Go back to the built-in content for this part?')) return; try { await api(`/owner/site/${section}`, { method: 'DELETE' }); toast('Back to the built-in content'); site.reload(); } catch (e: any) { toast(e.message, true); } }
  const set = (section: string, v: any) => setDraft({ ...draft, [section]: v });
  const Footer = ({ s }: { s: string }) => <div className="row" style={{ marginTop: 16 }}><button className="btn primary" onClick={() => save(s)}>Save</button><button className="btn ghost" onClick={() => reset(s)}>Reset to built-in</button></div>;
  const h = draft.hero;
  return (
    <div className="col" style={{ gap: 16 }}>
      <Seg value={tab} onChange={setTab} options={[{ id: 'hero', label: 'Hero' }, { id: 'steps', label: 'How it works' }, { id: 'story', label: 'Our story' }, { id: 'marquee', label: 'Banner text' }, { id: 'partners', label: 'Partner page' }, { id: 'investors', label: 'Investor page' }, { id: 'menu', label: 'Menu pictures' }]} />
      <p className="small muted">Changes go live on the website, the kiosk and the apps as soon as you save. The Sadhai logo is fixed and cannot be changed here, so it stays the same everywhere.</p>

      {tab === 'hero' && (
        <div className="cols c-21">
          <div className="panel">
            <div className="ph"><h3>Hero pictures</h3></div>
            <div className="grid g2">
              <ImagePicker label="Sun and sky" hint="Sits behind everything. Wide, transparent PNG or SVG works best." slot={h.layers.sun} fallback={HERO_DEFAULTS.sun} onChange={(s) => set('hero', { ...h, layers: { ...h.layers, sun: s } })} />
              <ImagePicker label="Far mountains" hint="Moves slowly." slot={h.layers.far} fallback={HERO_DEFAULTS.far} onChange={(s) => set('hero', { ...h, layers: { ...h.layers, far: s } })} />
              <ImagePicker label="Middle hills" slot={h.layers.mid} fallback={HERO_DEFAULTS.mid} onChange={(s) => set('hero', { ...h, layers: { ...h.layers, mid: s } })} />
              <ImagePicker label="Front hills" hint="Moves fastest. Keep the bottom edge solid." slot={h.layers.near} fallback={HERO_DEFAULTS.near} onChange={(s) => set('hero', { ...h, layers: { ...h.layers, near: s } })} />
              <ImagePicker label="Cup in the timer ring" slot={h.timer_cup} fallback={HERO_DEFAULTS.cup} onChange={(s) => set('hero', { ...h, timer_cup: s })} />
            </div>
            <div className="grid g2" style={{ marginTop: 16 }}>
              <Field label="Headline (English)"><input value={h.headline_en} maxLength={80} onChange={(e) => set('hero', { ...h, headline_en: e.target.value })} /></Field>
              <Field label="Headline (Nepali)"><input value={h.headline_ne} maxLength={120} onChange={(e) => set('hero', { ...h, headline_ne: e.target.value })} /></Field>
              <Field label="Line under it (English)"><input value={h.sub_en} maxLength={140} onChange={(e) => set('hero', { ...h, sub_en: e.target.value })} /></Field>
              <Field label="Line under it (Nepali)"><input value={h.sub_ne} maxLength={200} onChange={(e) => set('hero', { ...h, sub_ne: e.target.value })} /></Field>
              <Field label="Main button"><input value={h.primary_cta} maxLength={30} onChange={(e) => set('hero', { ...h, primary_cta: e.target.value })} /></Field>
              <Field label="Second button"><input value={h.secondary_cta} maxLength={30} onChange={(e) => set('hero', { ...h, secondary_cta: e.target.value })} /></Field>
              <Field label="Small note"><input value={h.note} maxLength={100} onChange={(e) => set('hero', { ...h, note: e.target.value })} /></Field>
            </div>
            <div className="row wrap" style={{ marginTop: 12 }}>
              <label className="row"><input type="checkbox" style={{ width: 22, minHeight: 22 }} checked={h.show_timer} onChange={(e) => set('hero', { ...h, show_timer: e.target.checked })} />Show the 90-second ring</label>
              <label className="row"><input type="checkbox" style={{ width: 22, minHeight: 22 }} checked={h.parallax} onChange={(e) => set('hero', { ...h, parallax: e.target.checked })} />Move the hills with the mouse and scroll</label>
            </div>
            <Footer s="hero" />
          </div>
          <div className="panel">
            <div className="ph"><h3>Preview</h3></div>
            <div style={{ position: 'relative', height: 280, overflow: 'hidden', borderRadius: 16, background: 'linear-gradient(var(--surface), var(--surface-sunk))' }}>
              <HeroScene layers={h.layers} parallax={false} />
              <div style={{ position: 'absolute', left: 16, top: 16, right: 16 }}><div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 30, lineHeight: 1, letterSpacing: '-0.03em', maxWidth: 260 }}>{h.headline_en}</div><div className="small" style={{ marginTop: 6 }}>{h.sub_en}</div></div>
            </div>
            <p className="small muted" style={{ marginTop: 8 }}>The same hills appear on the home page, the kiosk idle screen and the apps.</p>
          </div>
        </div>
      )}

      {tab === 'steps' && <div className="panel"><div className="ph"><h3>How it works</h3></div><div className="col" style={{ gap: 16 }}>{draft.steps.map((s: any, i: number) => (
        <div key={i} className="card flat grid g2"><div className="col"><Field label={`Step ${i + 1} title (English)`}><input value={s.title_en} onChange={(e) => set('steps', draft.steps.map((x: any, j: number) => (j === i ? { ...x, title_en: e.target.value } : x)))} /></Field><Field label="Title (Nepali)"><input value={s.title_ne} onChange={(e) => set('steps', draft.steps.map((x: any, j: number) => (j === i ? { ...x, title_ne: e.target.value } : x)))} /></Field><Field label="Text"><textarea value={s.text} onChange={(e) => set('steps', draft.steps.map((x: any, j: number) => (j === i ? { ...x, text: e.target.value } : x)))} /></Field></div>
          <ImagePicker label="Picture" slot={s.art} fallback={STEP_ART[i]} wide onChange={(a) => set('steps', draft.steps.map((x: any, j: number) => (j === i ? { ...x, art: a } : x)))} /></div>))}</div><Footer s="steps" /></div>}

      {tab === 'story' && <div className="panel"><div className="ph"><h3>From hill to cup</h3></div><div className="col" style={{ gap: 16 }}>{draft.story.map((s: any, i: number) => (
        <div key={i} className="card flat grid g2"><div className="col"><Field label="Label"><input value={s.tag} onChange={(e) => set('story', draft.story.map((x: any, j: number) => (j === i ? { ...x, tag: e.target.value } : x)))} /></Field><Field label="Heading"><input value={s.title} onChange={(e) => set('story', draft.story.map((x: any, j: number) => (j === i ? { ...x, title: e.target.value } : x)))} /></Field><Field label="Text"><textarea value={s.text} onChange={(e) => set('story', draft.story.map((x: any, j: number) => (j === i ? { ...x, text: e.target.value } : x)))} /></Field></div>
          <ImagePicker label="Picture" slot={s.art} fallback={STORY_ART[i]} wide onChange={(a) => set('story', draft.story.map((x: any, j: number) => (j === i ? { ...x, art: a } : x)))} /></div>))}</div><Footer s="story" /></div>}

      {tab === 'marquee' && <div className="panel"><div className="ph"><h3>Scrolling banner</h3></div><Field label="Text" hint="Separate phrases with a dot (·)."><textarea value={draft.marquee} onChange={(e) => set('marquee', e.target.value)} maxLength={300} /></Field><Footer s="marquee" /></div>}

      {tab === 'partners' && <div className="panel"><div className="ph"><div><h3>Partner cafe page</h3><p className="small muted">Shown at /partners. The earnings calculator uses your live prices and the default partner share.</p></div></div>
        <div className="col" style={{ gap: 16 }}>
          <Field label="Headline"><input value={draft.partners.headline} onChange={(e) => set('partners', { ...draft.partners, headline: e.target.value })} /></Field>
          <Field label="Introduction"><textarea value={draft.partners.intro} onChange={(e) => set('partners', { ...draft.partners, intro: e.target.value })} /></Field>
          <StringList label="What we look for" items={draft.partners.requirements} onChange={(v) => set('partners', { ...draft.partners, requirements: v })} />
          <ObjList label="How to join" items={draft.partners.steps} fields={[{ k: 'title', label: 'Step' }, { k: 'text', label: 'Detail', wide: true }]} make={() => ({ title: '', text: '' })} onChange={(v) => set('partners', { ...draft.partners, steps: v })} />
          <ObjList label="Questions and answers" items={draft.partners.faqs} max={12} fields={[{ k: 'q', label: 'Question' }, { k: 'a', label: 'Answer', wide: true }]} make={() => ({ q: '', a: '' })} onChange={(v) => set('partners', { ...draft.partners, faqs: v })} />
          <Field label="Note above the form"><input value={draft.partners.contact_note} onChange={(e) => set('partners', { ...draft.partners, contact_note: e.target.value })} /></Field>
        </div><Footer s="partners" /></div>}

      {tab === 'investors' && <div className="panel"><div className="ph"><div><h3>Investor page</h3><p className="small muted">Shown at /investors. Only publish numbers you can stand behind. Nothing is invented for you: the numbers section stays empty until you add figures.</p></div></div>
        <div className="col" style={{ gap: 16 }}>
          <Field label="Headline"><input value={draft.investors.headline} onChange={(e) => set('investors', { ...draft.investors, headline: e.target.value })} /></Field>
          <Field label="Introduction"><textarea value={draft.investors.intro} onChange={(e) => set('investors', { ...draft.investors, intro: e.target.value })} /></Field>
          <ObjList label="Headline numbers (reported by management)" items={draft.investors.metrics} fields={[{ k: 'label', label: 'Label' }, { k: 'value', label: 'Value' }, { k: 'note', label: 'Note, such as the date' }]} make={() => ({ label: '', value: '', note: '' })} onChange={(v) => set('investors', { ...draft.investors, metrics: v })} />
          <StringList label="Why Sadhai" items={draft.investors.why} max={6} onChange={(v) => set('investors', { ...draft.investors, why: v })} />
          <StringList label="The model" items={draft.investors.model} max={6} onChange={(v) => set('investors', { ...draft.investors, model: v })} />
          <ObjList label="Roadmap" items={draft.investors.roadmap} fields={[{ k: 'when', label: 'When' }, { k: 'what', label: 'What' }]} make={() => ({ when: '', what: '' })} onChange={(v) => set('investors', { ...draft.investors, roadmap: v })} />
          <ObjList label="Use of funds (percent)" items={draft.investors.use_of_funds} fields={[{ k: 'label', label: 'Item' }, { k: 'pct', label: 'Percent', type: 'number' }]} make={() => ({ label: '', pct: 0 })} onChange={(v) => set('investors', { ...draft.investors, use_of_funds: v })} />
          <StringList label="Risks" items={draft.investors.risks} max={10} onChange={(v) => set('investors', { ...draft.investors, risks: v })} />
          <Field label="Link to your deck or data room (https)"><input value={draft.investors.deck_url} onChange={(e) => set('investors', { ...draft.investors, deck_url: e.target.value })} /></Field>
          <label className="row card flat"><input type="checkbox" style={{ width: 22, minHeight: 22 }} checked={draft.investors.show_unit_economics} onChange={(e) => set('investors', { ...draft.investors, show_unit_economics: e.target.checked })} /><span><strong>Show per-cup economics</strong><span className="small muted" style={{ display: 'block' }}>Publishes the average price, recipe cost and margin of each drink kind from your live recipes. Off by default.</span></span></label>
          <Field label="Note above the form"><input value={draft.investors.contact_note} onChange={(e) => set('investors', { ...draft.investors, contact_note: e.target.value })} /></Field>
        </div><Footer s="investors" /></div>}

      {tab === 'menu' && <MenuPictures />}
    </div>
  );
}

function MenuPictures() {
  const { data, reload } = useData<any>('/owner/menu');
  const toast = useToast();
  if (!data) return <Skeleton h={60} n={4} />;
  async function set(p: any, s: Slot) { try { await api(`/owner/products/${p.id}`, { method: 'PATCH', body: { image_url: s ? s.url : null } }); reload(); } catch (e: any) { toast(e.message, true); } }
  return (
    <div className="panel"><div className="ph"><div><h3>Menu pictures</h3><p className="small muted">A picture for each item, shown in the app, the web menu and the kiosk. Without one, the built-in illustration is used.</p></div></div>
      <div className="grid g3">{data.products.filter((p: any) => p.active).map((p: any) => <ImagePicker key={p.id} label={p.name} slot={p.image_url ? { id: p.id, url: p.image_url } : null} fallback={productArt(p)} onChange={(s) => set(p, s)} />)}</div>
    </div>
  );
}

/* ============================================================================
   Enquiries from the partner and investor pages
   ============================================================================ */
export function EnquiriesSection() {
  const [kind, setKind] = useState('');
  const { data, reload } = useData<any[]>(`/owner/enquiries${kind ? `?kind=${kind}` : ''}`, [kind]);
  const toast = useToast();
  async function patch(id: string, body: any) { try { await api(`/owner/enquiries/${id}`, { method: 'PATCH', body }); reload(); } catch (e: any) { toast(e.message, true); } }
  return (
    <div className="panel">
      <div className="ph"><div><h3>Partner and investor enquiries</h3><p className="small muted">Everything sent from the /partners and /investors pages. Follow up, then move each one along.</p></div><Seg value={kind} onChange={setKind} options={[{ id: '', label: 'All' }, { id: 'partner', label: 'Cafes' }, { id: 'investor', label: 'Investors' }]} /></div>
      {!data ? <Skeleton h={80} n={3} /> : !data.length ? <Empty>No enquiries yet. Share /partners and /investors.</Empty> : (
        <div className="col" style={{ gap: 12 }}>{data.map((e) => (
          <div key={e.id} className="card flat col" style={{ gap: 8 }}>
            <div className="row between wrap"><div><strong>{e.name}</strong> <span className={`chip ${e.kind === 'partner' ? 'hill' : 'marigold'}`}>{e.kind}</span> {e.status === 'new' && <span className="chip cherry">New</span>}<div className="small muted">{[e.org, e.city].filter(Boolean).join(' · ')} · {fmtDateTime(e.created_at)}</div></div>
              <select aria-label="Status" value={e.status} onChange={(ev) => patch(e.id, { status: ev.target.value })} style={{ width: 'auto', minHeight: 38 }}>{['new', 'contacted', 'meeting', 'won', 'closed'].map((s) => <option key={s}>{s}</option>)}</select></div>
            {e.message && <p>{e.message}</p>}
            {Object.keys(e.extra || {}).length > 0 && <p className="small muted">{Object.entries(e.extra).map(([k, v]) => `${k.replace('_', ' ')}: ${v}`).join(' · ')}</p>}
            <div className="row wrap small">{e.email && <a className="btn sm" href={`mailto:${e.email}`}>{e.email}</a>}{e.phone && <a className="btn sm" href={`tel:${e.phone}`}>{e.phone}</a>}<input placeholder="Add a note" defaultValue={e.note || ''} onBlur={(ev) => ev.target.value !== (e.note || '') && patch(e.id, { note: ev.target.value })} style={{ flex: 1, minWidth: 160, minHeight: 38 }} aria-label="Note" /></div>
          </div>))}</div>
      )}
    </div>
  );
}

/* ============================================================================
   Setup checklist: shown to the owner on the overview until everything is done
   ============================================================================ */
export function SetupChecklist() {
  const { data } = useData<any>('/owner/setup');
  const { go } = useDash();
  const [hide, setHide] = useState(false);
  useEffect(() => { try { setHide(localStorage.getItem('sadhai.setup.hide') === '1'); } catch {} }, []);
  if (!data || hide) return null;
  if (data.done === data.total) return null;
  return (
    <div className="panel" style={{ borderColor: 'var(--cherry)', borderWidth: 2 }}>
      <div className="ph"><div><h3>Get Sadhai ready: {data.done} of {data.total} done</h3><p className="small muted">Work down the list. Each step opens the right screen.</p></div><button className="btn ghost sm" onClick={() => { setHide(true); try { localStorage.setItem('sadhai.setup.hide', '1'); } catch {} }}>Hide for now</button></div>
      <Meter pct={Math.round((data.done / data.total) * 100)} label="Setup progress" />
      <div className="col" style={{ gap: 8, marginTop: 14 }}>{data.steps.map((s: any) => (
        <div key={s.key} className="row" style={{ alignItems: 'center', gap: 12, opacity: s.done ? 0.65 : 1 }}>
          <span style={{ width: 26, height: 26, borderRadius: 99, border: `2px solid ${s.done ? 'var(--hill)' : 'var(--ink-muted)'}`, background: s.done ? 'var(--hill)' : 'transparent', color: 'var(--on-hill)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>{s.done && <Icon name="check" size={16} stroke={3} />}</span>
          <span className="grow"><strong>{s.title}</strong><span className="small muted" style={{ display: 'block' }}>{s.detail}</span></span>
          {!s.done && <button className="btn sm primary" onClick={() => go(s.section)}>Do this</button>}
        </div>))}</div>
    </div>
  );
}
