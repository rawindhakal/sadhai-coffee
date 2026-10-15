'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { api, rs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { productArt } from '@/lib/art';
import { Icon } from './icons';

type Line = { key: string; product: any; qty: number; option_ids: string[]; names: string[]; unit: number };
const T: Record<string, [string, string]> = {
  touch: ['Touch to order', 'अर्डर गर्न छुनुहोस्'], who: ['Who is this order for?', 'यो अर्डर कसको नाममा?'], name: ['Your name', 'तपाईंको नाम'], phone: ['Mobile number', 'मोबाइल नम्बर'],
  consent: ['You may use my name and number to call my order and send updates.', 'मेरो अर्डर बोलाउन र जानकारी पठाउन मेरो नाम र नम्बर प्रयोग गर्न सक्नुहुन्छ।'],
  next: ['Continue', 'अगाडि'], review: ['Review order', 'अर्डर हेर्नुहोस्'], pay: ['How will you pay?', 'भुक्तानी कसरी गर्ने?'], counter: ['Pay at the counter', 'काउन्टरमा तिर्ने'],
  passopt: ['Use my 10-cup pass', 'मेरो १०-कप पास प्रयोग गर्ने'], scan: ['Pay with eSewa, Khalti or Fonepay', 'eSewa, Khalti वा Fonepay बाट तिर्ने'], place: ['Place order', 'अर्डर गर्नुहोस्'],
  done: ['Your number', 'तपाईंको नम्बर'], again: ['New order', 'नयाँ अर्डर'], total: ['Total', 'जम्मा'], back: ['Back', 'पछाडि'], cart: ['View order', 'अर्डर हेर्नुहोस्'],
};

export function Kiosk() {
  const { user, ready, login, logout } = useAuth();
  const { lang, setLang } = useI18n();
  const router = useRouter();
  const t = (k: string) => T[k]?.[lang === 'ne' ? 1 : 0] ?? k;
  const [stationId, setStationId] = useState<string | null>(null);
  const [stations, setStations] = useState<any[]>([]);
  const [home, setHome] = useState<any>(null);
  const [screen, setScreen] = useState<'idle' | 'who' | 'menu' | 'review' | 'pay' | 'done'>('idle');
  const [guest, setGuest] = useState({ name: '', phone: '', consent: false });
  const [cart, setCart] = useState<Line[]>([]);
  const [cat, setCat] = useState('');
  const [picking, setPicking] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [warn, setWarn] = useState(false);
  const last = useRef(Date.now());

  // Kiosk always uses the light brand theme, big and calm.
  useEffect(() => { const prev = document.documentElement.dataset.theme; document.documentElement.dataset.theme = 'light'; return () => { if (prev) document.documentElement.dataset.theme = prev; else delete document.documentElement.dataset.theme; }; }, []);

  const staff = user && ['station', 'manager', 'owner'].includes(user.role) ? user : null;
  useEffect(() => {
    if (!staff) return;
    if (staff.role === 'station') { setStationId(staff.station_id || null); return; }
    api('/admin/stations').then((s) => { setStations(s); const saved = localStorage.getItem('sadhai.kiosk.station'); if (saved && s.some((x: any) => x.id === saved)) setStationId(saved); }).catch(() => {});
  }, [staff?.id]);
  const loadHome = () => stationId && api(`/stations/${stationId}/home`, { auth: false }).then((h) => { setHome(h); setCat((c) => c || h.categories[0]?.id || ''); }).catch(() => {});
  useEffect(() => { loadHome(); const i = setInterval(loadHome, 60000); return () => clearInterval(i); }, [stationId]);

  // reset after inactivity (not on the attract screen)
  useEffect(() => {
    const bump = () => { last.current = Date.now(); setWarn(false); };
    ['pointerdown', 'keydown'].forEach((e) => window.addEventListener(e, bump));
    const i = setInterval(() => {
      if (screen === 'idle' || screen === 'done') return;
      const idle = Date.now() - last.current;
      if (idle > 60000) reset(); else if (idle > 45000) setWarn(true);
    }, 1000);
    return () => { ['pointerdown', 'keydown'].forEach((e) => window.removeEventListener(e, bump)); clearInterval(i); };
  }, [screen]);

  function reset() { setScreen('idle'); setGuest({ name: '', phone: '', consent: false }); setCart([]); setResult(null); setError(null); setWarn(false); setPicking(null); }
  const count = cart.reduce((a, l) => a + l.qty, 0), total = cart.reduce((a, l) => a + l.qty * l.unit, 0);
  const products = useMemo(() => home?.categories.flatMap((c: any) => c.products) || [], [home]);

  /* ---------- staff sign-in (one time, when the tablet is set up) ---------- */
  if (!ready) return <div className="k-full center"><p>Loading…</p></div>;
  if (!staff) return <SetUp onLogin={login} />;
  if (!stationId) {
    return (
      <div className="k-full"><div className="k-card">
        <h2>Which station is this kiosk for?</h2>
        <div className="col" style={{ marginTop: 16 }}>{stations.map((s) => <button key={s.id} className="btn lg" onClick={() => { localStorage.setItem('sadhai.kiosk.station', s.id); setStationId(s.id); }}>{s.name}</button>)}</div>
        <button className="btn ghost" style={{ marginTop: 16 }} onClick={() => logout()}>Sign out</button>
      </div></div>
    );
  }
  if (!home) return <div className="k-full center"><p>Loading the menu…</p></div>;

  const offers: any[] = home.offers || [];

  async function place(method: 'counter' | 'pass' | 'online', passCode?: string, provider?: string) {
    setBusy(true); setError(null);
    try {
      const body: any = {
        items: cart.map((l) => ({ product_id: l.product.id, qty: l.qty, option_ids: l.option_ids })), customer_name: guest.name.trim(), customer_phone: guest.phone,
        payment: method === 'online' ? provider : method, pass_code: method === 'pass' ? passCode : undefined, consent: true,
        station_id: staff!.role === 'station' ? undefined : stationId,
      };
      const out = await api('/kiosk/orders', { method: 'POST', body });
      setResult(out); setScreen('done');
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="k-full">
      <KioskTop name={home.station.name} lang={lang} setLang={setLang} onExit={() => router.push('/station')} onSignOut={() => logout()} user={staff} showBack={screen !== 'idle' && screen !== 'done'} onHome={reset} />

      {screen === 'idle' && (
        <button className="k-idle" onClick={() => { setScreen('who'); last.current = Date.now(); }} aria-label={t('touch')}>
          <div className="k-hills" aria-hidden><img src="/img/hero-sun.svg" alt="" /><img src="/img/hero-far.svg" alt="" /><img src="/img/hero-mid.svg" alt="" /><img src="/img/hero-near.svg" alt="" /></div>
          <div className="k-idle-in">
            <h1>{lang === 'ne' ? 'सधैं राम्रो कफी।' : 'Good coffee, every day.'}</h1>
            <p className="k-sub">{lang === 'ne' ? 'पहाडमा फलेको, ९० सेकेन्डमा तयार।' : 'Grown in the hills. Ready in 90 seconds.'}</p>
            {offers[0] && <div className="k-offer"><strong>{offers[0].title}</strong><span>{offers[0].blurb}</span></div>}
            <span className="k-touch">{t('touch')}</span>
            <p className="small" style={{ opacity: 0.8 }}>Prices in NPR. VAT and service included.</p>
          </div>
        </button>
      )}

      {screen === 'who' && <Who t={t} guest={guest} setGuest={setGuest} onNext={() => { setScreen('menu'); }} privacy />}

      {screen === 'menu' && (
        <div className="k-menu">
          <nav className="k-cats" aria-label="Categories">{home.categories.map((c: any) => <button key={c.id} className={cat === c.id ? 'on' : ''} onClick={() => setCat(c.id)}>{c.name}</button>)}</nav>
          <div className="k-grid">
            {(home.categories.find((c: any) => c.id === cat)?.products || []).map((p: any) => (
              <button key={p.id} className="k-prod" disabled={!p.available} onClick={() => setPicking(p)}>
                <img src={productArt(p)} alt="" />
                <strong>{p.name}</strong>
                <span className="k-price">{rs(p.price)}{p.price < p.list_price && <s> {rs(p.list_price)}</s>}</span>
                {p.offer && <em className="k-deal">Today</em>}{!p.available && <em className="k-deal off">Finished</em>}
              </button>
            ))}
          </div>
          {count > 0 && <button className="k-cartbar" onClick={() => setScreen('review')}><span><b>{count}</b> item{count > 1 ? 's' : ''}</span><span>{t('cart')} · {rs(total)}</span><Icon name="chevr" size={26} /></button>}
        </div>
      )}
      {picking && <KItem p={picking} onClose={() => setPicking(null)} onAdd={(l: Line) => { setCart((c) => { const ex = c.find((x) => x.key === l.key); return ex ? c.map((x) => (x === ex ? { ...x, qty: Math.min(10, x.qty + l.qty) } : x)) : [...c, l]; }); setPicking(null); }} />}

      {screen === 'review' && (
        <div className="k-card wide">
          <h2>{t('review')}</h2>
          <p className="muted">{guest.name} · {guest.phone}</p>
          <div className="col" style={{ margin: '16px 0' }}>
            {cart.map((l) => (
              <div key={l.key} className="row k-line"><div className="grow"><strong>{l.product.name}</strong><div className="small muted">{l.names.join(', ')}</div></div>
                <div className="stepper k-step"><button aria-label="Fewer" onClick={() => setCart((c) => c.map((x) => (x === l ? { ...x, qty: x.qty - 1 } : x)).filter((x) => x.qty > 0))}><Icon name="minus" size={22} /></button><b>{l.qty}</b><button aria-label="More" onClick={() => setCart((c) => c.map((x) => (x === l ? { ...x, qty: Math.min(10, x.qty + 1) } : x)))}><Icon name="plus" size={22} /></button></div>
                <span className="price" style={{ minWidth: 90, textAlign: 'right', fontSize: 20 }}>{rs(l.unit * l.qty)}</span></div>
            ))}
          </div>
          <div className="row between"><strong style={{ fontSize: 24 }}>{t('total')}</strong><strong style={{ fontSize: 34 }}>{rs(total)}</strong></div>
          <div className="row" style={{ marginTop: 20 }}><button className="btn ghost lg" onClick={() => setScreen('menu')}>{t('back')}</button><button className="btn primary lg grow" disabled={!cart.length} onClick={() => setScreen('pay')}>{t('next')}</button></div>
        </div>
      )}

      {screen === 'pay' && <Pay t={t} total={total} busy={busy} error={error} guest={guest} stationId={stationId} staffRole={staff.role} onBack={() => setScreen('review')} onPlace={place} />}
      {screen === 'done' && result && <Done t={t} result={result} guest={guest} onNew={reset} />}
      {warn && <div className="k-warn" role="alert">Are you still there? This order will clear in a few seconds. Touch the screen to keep going.</div>}
    </div>
  );
}

function KioskTop({ name, lang, setLang, onExit, onSignOut, user, showBack, onHome }: any) {
  const [taps, setTaps] = useState(0);
  const [pw, setPw] = useState('');
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState('');
  const { login } = useAuth();
  useEffect(() => { if (!taps) return; const t = setTimeout(() => setTaps(0), 2500); return () => clearTimeout(t); }, [taps]);
  async function unlock() { try { await login(user.phone, pw); onExit(); } catch (e: any) { setErr(e.message); } }
  return (
    <header className="k-top">
      <button className="k-logo" onClick={() => { const n = taps + 1; setTaps(n); if (n >= 5) { setOpen(true); setTaps(0); } }} aria-label="Sadhai Coffee"><img src="/mark-cherry.svg" alt="" />sadhai</button>
      <span className="k-station">{name}</span><div className="grow" />
      {showBack && <button className="btn ghost" onClick={onHome}>Start over</button>}
      <button className="btn ghost" onClick={() => setLang(lang === 'en' ? 'ne' : 'en')}>{lang === 'en' ? 'नेपाली' : 'English'}</button>
      {open && (
        <div className="modal-bg" onClick={() => setOpen(false)}><div className="modal" onClick={(e) => e.stopPropagation()}>
          <h3>Staff only</h3><p className="muted small">Enter your password to leave kiosk mode.</p>
          <input type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && unlock()} aria-label="Staff password" style={{ margin: '12px 0' }} />
          {err && <p className="err">{err}</p>}
          <div className="row"><button className="btn primary grow" onClick={unlock}>Open station screen</button><button className="btn ghost" onClick={onSignOut}>Sign out</button></div>
        </div></div>
      )}
    </header>
  );
}

function SetUp({ onLogin }: { onLogin: (p: string, pw: string) => Promise<any> }) {
  const [phone, setPhone] = useState(''); const [pw, setPw] = useState(''); const [err, setErr] = useState('');
  return (
    <div className="k-full"><form className="k-card" onSubmit={async (e) => { e.preventDefault(); try { await onLogin(phone, pw); } catch (x: any) { setErr(x.message); } }}>
      <img src="/mark-cherry.svg" alt="" width={56} /><h2 style={{ margin: '12px 0' }}>Set up this kiosk</h2>
      <p className="muted">Sign in with the station account once. The tablet then stays signed in and only takes orders for that station.</p>
      <div className="col" style={{ marginTop: 16 }}><input placeholder="Station mobile number" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} aria-label="Mobile number" /><input type="password" placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} aria-label="Password" />{err && <p className="err">{err}</p>}<button className="btn primary lg">Set up</button></div>
    </form></div>
  );
}

/** Name and phone, with a big keypad so it works on a kiosk with no physical keyboard. */
function Who({ t, guest, setGuest, onNext, privacy }: any) {
  const digits = guest.phone.replace(/\D/g, '');
  const okPhone = /^(977)?9[78]\d{8}$/.test(digits);
  const okName = guest.name.trim().length >= 2;
  const press = (k: string) => setGuest({ ...guest, phone: k === '⌫' ? guest.phone.slice(0, -1) : (guest.phone + k).slice(0, 10) });
  return (
    <div className="k-card wide">
      <h2>{t('who')}</h2>
      <div className="k-form">
        <div className="col">
          <label className="k-label" htmlFor="kn">{t('name')}</label>
          <input id="kn" className="k-input" autoFocus autoComplete="off" maxLength={40} value={guest.name} onChange={(e) => setGuest({ ...guest, name: e.target.value })} />
          <label className="k-label" htmlFor="kp">{t('phone')}</label>
          <input id="kp" className="k-input" inputMode="none" readOnly value={guest.phone} placeholder="98XXXXXXXX" aria-label="Mobile number, use the keypad" />
          <label className="row small" style={{ alignItems: 'flex-start', gap: 12, marginTop: 8 }}><input type="checkbox" style={{ width: 28, minHeight: 28, flex: '0 0 auto' }} checked={guest.consent} onChange={(e) => setGuest({ ...guest, consent: e.target.checked })} /><span>{t('consent')} {privacy && <Link href="/privacy" target="_blank">Privacy policy</Link>}</span></label>
        </div>
        <div className="k-keypad" role="group" aria-label="Number pad">{['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'C'].map((k) => <button key={k} className="k-key" onClick={() => (k === 'C' ? setGuest({ ...guest, phone: '' }) : press(k))} aria-label={k === '⌫' ? 'Delete' : k === 'C' ? 'Clear' : k}>{k}</button>)}</div>
      </div>
      <button className="btn primary lg block" style={{ marginTop: 20 }} disabled={!okName || !okPhone || !guest.consent} onClick={onNext}>{t('next')}</button>
    </div>
  );
}

function KItem({ p, onClose, onAdd }: { p: any; onClose: () => void; onAdd: (l: Line) => void }) {
  const [sel, setSel] = useState<Record<string, string[]>>(() => Object.fromEntries(p.option_groups.map((g: any) => [g.id, g.options.filter((o: any) => o.is_default).map((o: any) => o.id)])));
  const [qty, setQty] = useState(1);
  const ids = Object.values(sel).flat();
  const opts = p.option_groups.flatMap((g: any) => g.options).filter((o: any) => ids.includes(o.id));
  const unit = p.price + opts.reduce((a: number, o: any) => a + o.price_delta, 0);
  const missing = p.option_groups.some((g: any) => g.required && !(sel[g.id] || []).length);
  const toggle = (g: any, o: any) => setSel((s) => { const cur = s[g.id] || []; if (g.multi) return { ...s, [g.id]: cur.includes(o.id) ? cur.filter((x) => x !== o.id) : [...cur, o.id] }; return { ...s, [g.id]: g.required ? [o.id] : cur.includes(o.id) ? [] : [o.id] }; });
  return (
    <div className="modal-bg" onClick={onClose}><div className="modal k-modal" role="dialog" aria-modal="true" aria-label={p.name} onClick={(e) => e.stopPropagation()}>
      <div className="row"><img src={productArt(p)} alt="" width={96} /><div><h2>{p.name}</h2><p className="muted">{p.description}</p></div></div>
      {p.option_groups.map((g: any) => <div key={g.id} style={{ marginTop: 16 }}><p className="label">{g.name}{g.required ? ' · required' : ''}</p><div className="row wrap" style={{ marginTop: 8 }}>{g.options.map((o: any) => { const on = (sel[g.id] || []).includes(o.id); return <button key={o.id} aria-pressed={on} className={`btn lg ${on ? 'primary' : 'ghost'}`} onClick={() => toggle(g, o)}>{o.name}{o.price_delta ? ` +${o.price_delta}` : ''}</button>; })}</div></div>)}
      <div className="row between" style={{ marginTop: 24 }}>
        <div className="stepper k-step"><button aria-label="Fewer" onClick={() => setQty(Math.max(1, qty - 1))}><Icon name="minus" size={22} /></button><b>{qty}</b><button aria-label="More" onClick={() => setQty(Math.min(10, qty + 1))}><Icon name="plus" size={22} /></button></div>
        <div className="row"><button className="btn ghost lg" onClick={onClose}>Cancel</button><button className="btn primary lg" disabled={missing} onClick={() => onAdd({ key: `${p.id}|${[...ids].sort().join(',')}`, product: { id: p.id, name: p.name }, qty, option_ids: ids, names: opts.map((o: any) => o.name), unit })}>Add · {rs(unit * qty)}</button></div>
      </div>
    </div></div>
  );
}

function Pay({ t, total, busy, error, guest, onBack, onPlace }: any) {
  const [mode, setMode] = useState<'' | 'pass' | 'online'>('');
  const [code, setCode] = useState('');
  const [check, setCheck] = useState<any>(null);
  const [cerr, setCerr] = useState('');
  async function verify() {
    setCerr(''); setCheck(null);
    try { setCheck(await api(`/kiosk/pass-check?code=${encodeURIComponent(code.trim())}&phone=${encodeURIComponent(guest.phone)}`)); } catch (e: any) { setCerr(e.message); }
  }
  return (
    <div className="k-card wide">
      <h2>{t('pay')}</h2>
      <div className="col" style={{ marginTop: 16 }}>
        <button className="k-opt" disabled={busy} onClick={() => onPlace('counter')}><Icon name="coin" size={30} /><span><strong>{t('counter')}</strong><small>Pay {rs(total)} when you pick up your coffee</small></span></button>
        <button className={`k-opt ${mode === 'online' ? 'on' : ''}`} disabled={busy} onClick={() => setMode(mode === 'online' ? '' : 'online')}><Icon name="cart" size={30} /><span><strong>{t('scan')}</strong><small>Pay now on your phone</small></span></button>
        {mode === 'online' && <div className="row wrap">{['esewa', 'khalti', 'fonepay'].map((p) => <button key={p} className="btn lg grow" disabled={busy} onClick={() => onPlace('online', undefined, p)}>{p === 'esewa' ? 'eSewa' : p === 'khalti' ? 'Khalti' : 'Fonepay'}</button>)}</div>}
        <button className={`k-opt ${mode === 'pass' ? 'on' : ''}`} disabled={busy} onClick={() => setMode(mode === 'pass' ? '' : 'pass')}><Icon name="ticket" size={30} /><span><strong>{t('passopt')}</strong><small>Enter your pass code (SP-XXXX-XXXX)</small></span></button>
        {mode === 'pass' && (
          <div className="card flat col">
            <input className="k-input" value={code} placeholder="SP-XXXX-XXXX" autoCapitalize="characters" onChange={(e) => { setCode(e.target.value.toUpperCase()); setCheck(null); }} aria-label="Pass code" />
            {cerr && <p className="err">{cerr}</p>}
            {check && <p className="ok">{check.remaining} cups left across {check.passes} pass{check.passes > 1 ? 'es' : ''}, {guest.name.split(' ')[0]}.</p>}
            <div className="row"><button className="btn lg" disabled={code.length < 8} onClick={verify}>Check pass</button><button className="btn primary lg grow" disabled={busy || !check} onClick={() => onPlace('pass', code.trim())}>{t('place')}</button></div>
          </div>
        )}
      </div>
      {error && <p className="err" role="alert" style={{ marginTop: 12 }}>{error}</p>}
      <button className="btn ghost lg" style={{ marginTop: 16 }} onClick={onBack}>{t('back')}</button>
    </div>
  );
}

function Done({ t, result, guest, onNew }: { t: (k: string) => string; result: any; guest: any; onNew: () => void }) {
  const [o, setO] = useState<any>(result.order);
  const [left, setLeft] = useState(25);
  const pay = result.payment;
  const awaiting = o.status === 'awaiting_payment';
  const qr = useRef<HTMLCanvasElement>(null);
  useEffect(() => { if (pay?.mode === 'redirect' && qr.current) QRCode.toCanvas(qr.current, pay.start_url || pay.url, { width: 220, margin: 1 }).catch(() => {}); }, []);
  useEffect(() => { if (!awaiting) return; const i = setInterval(() => api(`/kiosk/orders/${o.id}`).then((x) => setO({ ...o, ...x })).catch(() => {}), 2000); return () => clearInterval(i); }, [awaiting]);
  useEffect(() => { if (awaiting) return; setLeft(25); const i = setInterval(() => setLeft((n) => { if (n <= 1) { onNew(); return 0; } return n - 1; }), 1000); return () => clearInterval(i); }, [awaiting]);
  async function sandboxPay(outcome: 'paid' | 'fail') { await api(`/payments/${pay.payment_id}/confirm`, { method: 'POST', body: { outcome } }).catch(() => {}); const x = await api(`/kiosk/orders/${o.id}`); setO({ ...o, ...x }); }
  return (
    <div className="k-card wide center">
      {o.status === 'cancelled' ? <><h2>That payment did not go through</h2><p className="muted">You were not charged. Please start again.</p></> : awaiting ? (
        <>
          <h2>Finish paying to send your order</h2>
          {pay?.mode === 'sandbox' && <div className="col" style={{ alignItems: 'center', margin: '16px 0' }}><p className="muted">Test payments are on. No real money moves.</p><div className="row"><button className="btn primary lg" onClick={() => sandboxPay('paid')}>Confirm payment</button><button className="btn ghost lg" onClick={() => sandboxPay('fail')}>Fail it</button></div></div>}
          {pay?.mode === 'redirect' && <div className="col" style={{ alignItems: 'center', margin: '16px 0' }}><canvas ref={qr} aria-label="QR code to pay" /><p className="muted">Scan with your phone to pay {rs(o.total)}</p></div>}
        </>
      ) : (
        <>
          <p className="label">{t('done')}</p>
          <div className="pickup" style={{ fontSize: 'clamp(96px, 22vw, 200px)' }} aria-live="polite">{o.pickup_code}</div>
          <h2>Thank you, {guest.name.split(' ')[0]}.</h2>
          <p className="muted" style={{ fontSize: 20 }}>{o.payment_status === 'unpaid' ? `Pay ${rs(o.total)} at the counter when your number is called.` : o.payment_method === 'pass' ? 'Paid with your pass.' : 'Paid. See you at the counter.'}</p>
          <p className="muted">Your coffee in 90 seconds.</p>
        </>
      )}
      <button className="btn primary lg" style={{ marginTop: 24 }} onClick={onNew}>{t('again')}{!awaiting && o.status !== 'cancelled' ? ` (${left})` : ''}</button>
    </div>
  );
}
