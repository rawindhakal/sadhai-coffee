'use client';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, home, rs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { LangToggle, useI18n } from '@/lib/i18n';
import { productArt } from '@/lib/art';
import { Icon } from './icons';
import { APP_VERSION } from '@/lib/version';

function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (typeof IntersectionObserver === 'undefined') { setOn(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setOn(true); io.disconnect(); } }, { threshold: 0.15 });
    io.observe(el); return () => io.disconnect();
  }, []);
  return { ref, cls: `reveal ${on ? 'in' : ''}` };
}
function Reveal({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  const { ref, cls } = useReveal();
  return <div ref={ref} className={`${cls} ${className}`} style={{ transitionDelay: `${delay}ms` }}>{children}</div>;
}

/* ---------------- hero with parallax hills ---------------- */
function Hero({ open, stations }: { open: number | null; stations: number }) {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const wrap = useRef<HTMLDivElement>(null);
  const [p, setP] = useState({ x: 0, y: 0, s: 0 });
  useEffect(() => {
    const onScroll = () => setP((v) => ({ ...v, s: Math.min(1, window.scrollY / 500) }));
    window.addEventListener('scroll', onScroll, { passive: true }); return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const onMove = (e: React.MouseEvent) => {
    const r = wrap.current!.getBoundingClientRect();
    setP((v) => ({ ...v, x: (e.clientX - r.left) / r.width - 0.5, y: (e.clientY - r.top) / r.height - 0.5 }));
  };
  const layer = (depth: number): React.CSSProperties => ({ transform: `translate3d(${p.x * -depth * 40}px, ${p.y * -depth * 18 + p.s * depth * 60}px, 0)` });
  return (
    <section className="lhero" ref={wrap} onMouseMove={onMove} aria-label="Sadhai Coffee">
      <div className="lscene" aria-hidden>
        <img src="/img/hero-sun.svg" alt="" style={layer(0.3)} className="sun" />
        <img src="/img/hero-far.svg" alt="" style={layer(0.6)} />
        <img src="/img/hero-mid.svg" alt="" style={layer(1)} />
        <img src="/img/hero-near.svg" alt="" style={layer(1.6)} />
      </div>
      <div className="lhero-in container">
        <div className="lhero-copy">
          <span className="chip marigold"><span className="livedot" style={{ marginRight: 4 }} />{open == null ? 'Sadhai Coffee' : `${open} of ${stations} counters open now`}</span>
          <h1 className="lh1">{t('tagline')}</h1>
          <p className="lsub">{t('support')}</p>
          <div className="row wrap" style={{ gap: 12, marginTop: 8 }}>
            <Link className="btn primary lg" href="/order">{t('order_ahead')}<Icon name="chevr" size={20} /></Link>
            {user ? <Link className="btn lg" style={{ background: 'var(--surface)' }} href={home(user.role)}>Open my workspace</Link> : <Link className="btn lg" style={{ background: 'var(--surface)' }} href="/register">Get a free first cup</Link>}
          </div>
          <p className="small" style={{ color: 'var(--ink)', opacity: 0.75 }}>{lang === 'ne' ? 'सबै कर समावेश, थप केही छैन।' : 'The price you see is the price you pay.'}</p>
        </div>
        <Timer />
      </div>
    </section>
  );
}

/** A 90-second ring that loops: the brand promise as an object you can poke. */
function Timer() {
  const [sec, setSec] = useState(0);
  const [hover, setHover] = useState(false);
  useEffect(() => { const i = setInterval(() => setSec((s) => (s + (hover ? 3 : 1)) % 91), 100); return () => clearInterval(i); }, [hover]);
  const C = 2 * Math.PI * 78;
  return (
    <div className="ltimer" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} role="img" aria-label="Your coffee in 90 seconds">
      <svg viewBox="0 0 200 200" width="100%">
        <circle cx="100" cy="100" r="78" fill="var(--surface)" stroke="var(--hairline)" strokeWidth="10" />
        <circle cx="100" cy="100" r="78" fill="none" stroke="var(--cherry)" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(sec / 90) * C} ${C}`} transform="rotate(-90 100 100)" />
      </svg>
      <img src="/img/cup-hot.svg" alt="" className="lcup" />
      <div className="lt-num"><b>{sec}</b><span>of 90 seconds</span></div>
    </div>
  );
}

/* ---------------- how it works ---------------- */
const STEPS = [
  { icon: 'pin', title: 'Pick a counter', text: 'Share your location (free, on your phone) and we sort the nearest counters by walking time. Hospitals, campuses, bus stops, market corners.', art: 'scene-kiosk', ne: 'नजिकको काउन्टर छान्नुहोस्' },
  { icon: 'cart', title: 'Order and pay', text: 'Add a coffee in one tap. Pay with eSewa, Khalti, Fonepay, your 10-cup pass, or cash at the counter. The price includes VAT and service.', art: 'scene-roastery', ne: 'अर्डर र भुक्तानी' },
  { icon: 'clock', title: 'Walk in, 90 seconds', text: 'Your pickup number lights up when it is ready. Fresh Nepali beans roasted by Sevya, poured while you walk up.', art: 'scene-farm', ne: 'भित्र आउनुहोस्, ९० सेकेन्ड' },
];
function HowItWorks() {
  const [i, setI] = useState(0);
  const { lang } = useI18n();
  useEffect(() => { const t = setInterval(() => setI((n) => (n + 1) % 3), 5200); return () => clearInterval(t); }, []);
  return (
    <section id="how" className="lsec container">
      <Reveal><p className="label">How it works</p><h2 className="lh2">From your phone to your cup in three steps</h2></Reveal>
      <div className="lhow">
        <div className="col" style={{ gap: 12 }}>
          {STEPS.map((s, k) => (
            <button key={s.title} className={`lstep ${i === k ? 'on' : ''}`} onClick={() => setI(k)} aria-pressed={i === k}>
              <span className="lnum">{k + 1}</span>
              <span className="grow"><strong style={{ fontSize: 18 }}>{lang === 'ne' ? s.ne : s.title}</strong>{i === k && <span className="muted" style={{ display: 'block', marginTop: 4 }}>{s.text}</span>}</span>
              <Icon name={s.icon} size={24} />
            </button>
          ))}
        </div>
        <div className="lart"><img key={i} src={`/img/${STEPS[i].art}.svg`} alt="" /></div>
      </div>
    </section>
  );
}

/* ---------------- menu showcase ---------------- */
const FALLBACK = [
  { id: '1', sku: 'AMR', name: 'Americano', price: 130, cat: 'Hot coffee', description: 'Two shots, hot water.' }, { id: '2', sku: 'CHL', name: 'Chiya latte', price: 180, cat: 'Signature', description: 'Espresso with milk tea spices.' },
  { id: '3', sku: 'CLB', name: 'Cold brew', price: 190, cat: 'Cold coffee', description: 'Steeped 16 hours.' }, { id: '4', sku: 'GPO', name: 'Gulmi pour-over', price: 220, cat: 'Signature', description: 'Single origin, 1,400 m.' },
  { id: '5', sku: 'CRO', name: 'Butter croissant', price: 120, cat: 'Bites', description: 'Baked this morning.' }, { id: '6', sku: 'MUG', name: 'Sadhai mug', price: 450, cat: 'Merch', description: 'Ceramic, 300 ml.' },
];
function Showcase({ cats }: { cats: { name: string; products: any[] }[] | null }) {
  const data = useMemo(() => cats && cats.length ? cats.map((c) => ({ name: c.name, items: c.products })) : [...new Set(FALLBACK.map((f) => f.cat))].map((n) => ({ name: n, items: FALLBACK.filter((f) => f.cat === n) })), [cats]);
  const [tab, setTab] = useState(0);
  const cur = data[Math.min(tab, data.length - 1)];
  return (
    <section id="menu" className="lsec lsec-sunk">
      <div className="container">
        <Reveal><p className="label">The menu</p><h2 className="lh2">Nine lines. All-in prices.</h2></Reveal>
        <div className="seg" style={{ margin: '16px 0', maxWidth: '100%', overflowX: 'auto' }} role="tablist">{data.map((d, k) => <button key={d.name} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{d.name}</button>)}</div>
        <div className="lmenu">{cur.items.slice(0, 6).map((p: any) => <Tilt key={p.id}><Link href="/order" className="lprod"><img src={productArt(p)} alt="" loading="lazy" /><strong>{p.name}</strong><span className="small muted">{p.description}</span><span className="price">{rs(p.price)}</span></Link></Tilt>)}</div>
        <div className="center" style={{ marginTop: 24 }}><Link className="btn primary" href="/order">See the full menu at your counter</Link></div>
      </div>
    </section>
  );
}
function Tilt({ children }: { children: React.ReactNode }) {
  const [s, setS] = useState('');
  return <div style={{ transform: s, transition: 'transform .15s', willChange: 'transform' }} onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5; setS(`perspective(600px) rotateY(${x * 10}deg) rotateX(${-y * 10}deg) translateY(-4px)`); }} onMouseLeave={() => setS('')}>{children}</div>;
}

/* ---------------- hill to cup ---------------- */
function Story() {
  const cards = [
    { art: 'scene-farm', k: 'Grown', title: 'In the hills of Gulmi, Syangja and Kaski', text: 'Nepali farmers pick cherries by hand on mid-hill terraces. We name the district on the bag.' },
    { art: 'scene-roastery', k: 'Roasted', title: 'By Sevya Coffee Processing', text: 'Roasted weekly in Nepal, planned from what you actually order, so beans stay fresh.' },
    { art: 'scene-kiosk', k: 'Poured', title: 'At a counter near you', text: 'A pickup counter in a cafe, a hospital gate or a bus stand. Small team, one promise: 90 seconds.' },
  ];
  return (
    <section id="story" className="lsec container">
      <Reveal><p className="label">From hill to cup</p><h2 className="lh2">Grown in Nepal. Roasted in Nepal.</h2></Reveal>
      <div className="grid g3" style={{ marginTop: 20 }}>
        {cards.map((c, i) => <Reveal key={c.k} delay={i * 120}><article className="lcard"><img src={`/img/${c.art}.svg`} alt="" loading="lazy" /><div><span className="chip hill">{c.k}</span><h3 style={{ margin: '8px 0 4px' }}>{c.title}</h3><p className="muted">{c.text}</p></div></article></Reveal>)}
      </div>
    </section>
  );
}

/* ---------------- 10-cup pass you can punch ---------------- */
function PassPlay({ price }: { price: number }) {
  const [used, setUsed] = useState(3);
  const per = price / 10;
  return (
    <section id="pass" className="lsec container">
      <div className="lpass">
        <Reveal>
          <p className="label" style={{ color: 'inherit', opacity: 0.8 }}>10-cup pass</p>
          <h2 className="lh2" style={{ color: 'inherit' }}>10 cups. One pass. {rs(price)}.</h2>
          <p style={{ maxWidth: 440, opacity: 0.92, marginTop: 8 }}>Thirty days from your first cup, at any Sadhai counter. Buy several and use them one after another. That is {rs(per)} a cup, against {rs(130)} for an Americano. Tap the cups to try it.</p>
          <div className="row wrap" style={{ marginTop: 16 }}><span className="chip marigold">You save {rs(130 * 10 - price)}</span><span className="chip" style={{ background: 'transparent', color: 'inherit', borderColor: 'currentColor' }}>{10 - used} cups left</span></div>
          <Link className="btn" style={{ background: 'var(--surface)', color: 'var(--ink)', marginTop: 18 }} href="/offers">Get a pass</Link>
        </Reveal>
        <div className="lpunch" role="group" aria-label="Pass cups">
          {Array.from({ length: 10 }).map((_, k) => (
            <button key={k} className={k < used ? 'used' : ''} aria-label={`Cup ${k + 1}, ${k < used ? 'used' : 'available'}`} aria-pressed={k < used} onClick={() => setUsed(k < used ? k : k + 1)}><img src="/img/cup-hot.svg" alt="" /></button>
          ))}
        </div>
      </div>
    </section>
  );
}

function DropBanner({ drop }: { drop: any }) {
  if (!drop) return null;
  const pct = Math.min(100, (drop.sold / drop.cap) * 100);
  return (
    <section className="container" style={{ marginBottom: 56 }}>
      <Reveal><div className="ldrop">
        <img src="/img/chiya.svg" alt="" />
        <div className="grow"><span className="chip marigold">Monthly drop · {drop.partner || 'Limited'}</span><h3 style={{ fontSize: 28, margin: '8px 0 4px' }}>{drop.name}</h3><p className="muted">{rs(drop.price)} · {drop.remaining.toLocaleString()} cups left, then gone.</p>
          <div className="bar" style={{ height: 12, margin: '12px 0' }}><i style={{ width: `${pct}%`, background: 'var(--marigold)' }} /></div><Link className="btn primary" href="/order">Order the drop</Link></div>
      </div></Reveal>
    </section>
  );
}

function Partners() {
  return (
    <section id="partners" className="lsec lsec-roast">
      <div className="container lpartner">
        <Reveal><p className="label" style={{ color: 'inherit', opacity: 0.8 }}>For cafes</p><h2 className="lh2" style={{ color: 'inherit' }}>Run Sadhai at your cafe</h2>
          <p style={{ maxWidth: 520, opacity: 0.92, marginTop: 8 }}>Keep your counter and your team. We bring the app, the beans and the customers. You keep a share of every sale, hold your own cash, and see every order, count and statement in real time.</p>
          <ul className="lticks"><li><Icon name="check" size={18} />A revenue share on net sales, paid on a clear statement</li><li><Icon name="check" size={18} />Cash stays with you, digital payments settle through us, netted for you</li><li><Icon name="check" size={18} />A live dashboard and daily cash count, so both sides can trust the numbers</li></ul>
          <a className="btn" style={{ background: 'var(--surface)', color: 'var(--ink)' }} href="/support#partner">Talk to us</a></Reveal>
        <Reveal delay={150}><img src="/img/scene-kiosk.svg" alt="" style={{ width: '100%', borderRadius: 20 }} /></Reveal>
      </div>
    </section>
  );
}

function Download() {
  const play = process.env.NEXT_PUBLIC_PLAY_URL, apple = process.env.NEXT_PUBLIC_APPSTORE_URL;
  const Badge = ({ href, top, name }: { href?: string; top: string; name: string }) => href
    ? <a className="lbadge" href={href}><span>{top}</span><strong>{name}</strong></a>
    : <span className="lbadge off" aria-disabled="true"><span>{top}</span><strong>{name}</strong><em>Coming soon</em></span>;
  return (
    <section id="app" className="lsec container center">
      <Reveal><img src="/app-icon.svg" alt="Sadhai Coffee app icon" width={96} height={96} style={{ borderRadius: 22, boxShadow: 'var(--shadow-card)' }} /><h2 className="lh2" style={{ marginTop: 16 }}>Take Sadhai with you</h2><p className="muted" style={{ margin: '8px auto 16px', maxWidth: 480 }}>Order ahead, hold your pass and get your pickup number on your phone.</p>
        <div className="row wrap" style={{ justifyContent: 'center' }}><Badge href={play} top="Get it on" name="Google Play" /><Badge href={apple} top="Download on the" name="App Store" /><Link className="lbadge" href="/order"><span>Use it now on the</span><strong>Web app</strong></Link></div></Reveal>
    </section>
  );
}

export function Landing() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [stations, setStations] = useState<any[] | null>(null);
  const [homeData, setHomeData] = useState<any>(null);
  const [price, setPrice] = useState(1200);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    api('/stations', { auth: false }).then((s) => { setStations(s); const first = s.find((x: any) => x.open_now) || s[0]; if (first) api(`/stations/${first.id}/home`, { auth: false }).then(setHomeData).catch(() => {}); }).catch(() => {});
    api('/config', { auth: false }).then((c) => setPrice(c.pass.price)).catch(() => {});
    const on = () => setScrolled(window.scrollY > 24); on(); window.addEventListener('scroll', on, { passive: true }); return () => window.removeEventListener('scroll', on);
  }, []);
  const open = stations ? stations.filter((s) => s.open_now).length : null;
  return (
    <>
      <header className={`lnav ${scrolled ? 'solid' : ''}`}>
        <div className="container row" style={{ minHeight: 64 }}>
          <Link href="/" className="brand"><img src="/mark-cherry.svg" alt="" />sadhai</Link>
          <nav className="lnavlinks hide-sm" aria-label="Page"><a href="#how">How it works</a><a href="#menu">Menu</a><a href="#pass">Pass</a><a href="#partners">For cafes</a></nav>
          <div className="grow" /><LangToggle />
          {user ? <Link className="btn primary sm" href={home(user.role)}>Open app</Link> : <><Link className="btn ghost sm hide-sm" href="/login">Sign in</Link><Link className="btn primary sm" href="/order">{t('order_ahead')}</Link></>}
        </div>
      </header>
      <main>
        <Hero open={open} stations={stations?.length || 0} />
        <div className="lmarquee" aria-hidden><div>{Array.from({ length: 2 }).map((_, k) => <span key={k}>Good coffee, every day · सधैं राम्रो कफी · Grown in the hills · Ready in 90 seconds · Prices include VAT and service · </span>)}</div></div>
        <HowItWorks />
        <Showcase cats={homeData?.categories || null} />
        <Story />
        <PassPlay price={price} />
        <DropBanner drop={homeData?.drops?.[0]} />
        <Partners />
        <Download />
      </main>
      <footer className="lfoot"><div className="container">
        <div className="row between wrap" style={{ gap: 24, alignItems: 'flex-start' }}>
          <div><Link href="/" className="brand"><img src="/mark-cherry.svg" alt="" />sadhai</Link><p className="small muted" style={{ marginTop: 8, maxWidth: 320 }}>Nepal’s everyday specialty coffee. Grown in the hills, roasted in Nepal, ready in 90 seconds.</p></div>
          <div className="col small" style={{ gap: 6 }}><strong>Company</strong><a href="#story">Our story</a><a href="/support#partner">Partner with us</a><a href="/support">Support</a></div>
          <div className="col small" style={{ gap: 6 }}><strong>Legal</strong><a href="/privacy">Privacy policy</a><a href="/terms">Terms of use</a><a href="/delete-account">Delete your account</a></div>
          <div className="col small" style={{ gap: 6 }}><strong>Staff</strong><a href="/station">Station</a><a href="/manager">Manager</a><a href="/owner">Owner</a></div>
        </div>
        <p className="small muted" style={{ marginTop: 24 }}>Prices in NPR. VAT and service included. · Version {APP_VERSION}</p>
      </div></footer>
    </>
  );
}
