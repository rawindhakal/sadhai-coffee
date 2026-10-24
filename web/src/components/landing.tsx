'use client';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, home, rs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { productArt } from '@/lib/art';
import { HERO_DEFAULTS, STEP_ART, STORY_ART, pic, useConfig, useSiteContent } from '@/lib/site-content';
import { Icon } from './icons';
import { HeroScene } from './hero';
import { SiteFooter, SiteHeader } from './sitechrome';

function Reveal({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (typeof IntersectionObserver === 'undefined') { setOn(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setOn(true); io.disconnect(); } }, { threshold: 0.15 });
    io.observe(el); return () => io.disconnect();
  }, []);
  return <div ref={ref} className={`reveal ${on ? 'in' : ''} ${className}`} style={{ transitionDelay: `${delay}ms` }}>{children}</div>;
}

/* ---------------- hero ---------------- */
function Hero({ open, stations, site }: { open: number | null; stations: number; site: any }) {
  const { lang } = useI18n();
  const { user } = useAuth();
  const wrap = useRef<HTMLElement>(null);
  const h = site?.hero;
  const headline = h ? (lang === 'ne' ? h.headline_ne : h.headline_en) : (lang === 'ne' ? 'सधैं राम्रो कफी।' : 'Good coffee, every day.');
  const sub = h ? (lang === 'ne' ? h.sub_ne : h.sub_en) : 'Grown in the hills. Ready in 90 seconds.';
  return (
    <section className="lhero" ref={wrap} aria-label="Sadhai Coffee">
      <HeroScene layers={h?.layers} parallax={h?.parallax !== false} wrapRef={wrap} />
      <div className="lhero-in container">
        <div className="lhero-copy">
          <span className="chip marigold"><span className="livedot" style={{ marginRight: 4 }} />{open == null ? 'Sadhai Coffee' : `${open} of ${stations} counters open now`}</span>
          <h1 className="lh1">{headline}</h1>
          <p className="lsub">{sub}</p>
          <div className="row wrap" style={{ gap: 12, marginTop: 8 }}>
            <Link className="btn primary lg" href="/order">{h?.primary_cta || 'Order ahead'}<Icon name="chevr" size={20} /></Link>
            {user ? <Link className="btn lg" style={{ background: 'var(--surface)' }} href={home(user.role)}>Open my workspace</Link> : <Link className="btn lg" style={{ background: 'var(--surface)' }} href="/register">{h?.secondary_cta || 'Get a free first cup'}</Link>}
          </div>
          <p className="small" style={{ color: 'var(--ink)', opacity: 0.75 }}>{h?.note || 'The price you see is the price you pay.'}</p>
        </div>
        {h?.show_timer !== false && <Timer cup={pic(h?.timer_cup, HERO_DEFAULTS.cup)} />}
      </div>
    </section>
  );
}

/** A 90-second ring that loops: the brand promise as an object you can poke. */
function Timer({ cup }: { cup: string }) {
  const [sec, setSec] = useState(0);
  const [hover, setHover] = useState(false);
  useEffect(() => { const i = setInterval(() => setSec((s) => (s + (hover ? 3 : 1)) % 91), 100); return () => clearInterval(i); }, [hover]);
  const C = 2 * Math.PI * 78;
  return (
    <div className="ltimer" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} role="img" aria-label="Your coffee in 90 seconds">
      <svg viewBox="0 0 200 200" width="100%"><circle cx="100" cy="100" r="78" fill="var(--surface)" stroke="var(--hairline)" strokeWidth="10" /><circle cx="100" cy="100" r="78" fill="none" stroke="var(--cherry)" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(sec / 90) * C} ${C}`} transform="rotate(-90 100 100)" /></svg>
      <img src={cup} alt="" className="lcup" />
      <div className="lt-num"><b>{sec}</b><span>of 90 seconds</span></div>
    </div>
  );
}

/* ---------------- how it works ---------------- */
const ICONS = ['pin', 'cart', 'clock'];
function HowItWorks({ steps }: { steps: any[] }) {
  const [i, setI] = useState(0);
  const { lang } = useI18n();
  useEffect(() => { const t = setInterval(() => setI((n) => (n + 1) % 3), 5200); return () => clearInterval(t); }, []);
  return (
    <section id="how" className="lsec container">
      <Reveal><p className="label">How it works</p><h2 className="lh2">From your phone to your cup in three steps</h2></Reveal>
      <div className="lhow">
        <div className="col" style={{ gap: 12 }}>
          {steps.map((s, k) => (
            <button key={k} className={`lstep ${i === k ? 'on' : ''}`} onClick={() => setI(k)} aria-pressed={i === k}>
              <span className="lnum">{k + 1}</span>
              <span className="grow"><strong style={{ fontSize: 18 }}>{lang === 'ne' && s.title_ne ? s.title_ne : s.title_en}</strong>{i === k && <span className="muted" style={{ display: 'block', marginTop: 4 }}>{s.text}</span>}</span>
              <Icon name={ICONS[k]} size={24} />
            </button>
          ))}
        </div>
        <div className="lart"><img key={i} src={pic(steps[i]?.art, STEP_ART[i])} alt="" /></div>
      </div>
    </section>
  );
}

/* ---------------- menu showcase ---------------- */
const FALLBACK = (p: any) => [
  { id: '1', sku: 'AMR', name: 'Americano', price: p.hot, cat: 'Hot coffee', description: 'Two shots, hot water.' }, { id: '2', sku: 'CHL', name: 'Chiya latte', price: p.flavored, cat: 'Signature', description: 'Espresso with milk tea spices.' },
  { id: '3', sku: 'CLB', name: 'Cold brew', price: p.iced, cat: 'Cold coffee', description: 'Steeped 16 hours.' }, { id: '4', sku: 'GPO', name: 'Gulmi pour-over', price: p.hot, cat: 'Signature', description: 'Single origin, 1,400 m.' },
  { id: '5', sku: 'CRO', name: 'Butter croissant', price: 120, cat: 'Bites', description: 'Baked this morning.' }, { id: '6', sku: 'MUG', name: 'Sadhai mug', price: 450, cat: 'Merch', description: 'Ceramic, 300 ml.' },
];
function Showcase({ cats, pricing }: { cats: { name: string; products: any[] }[] | null; pricing: any }) {
  const data = useMemo(() => cats && cats.length ? cats.map((c) => ({ name: c.name, items: c.products })) : (() => { const f = FALLBACK(pricing); return [...new Set(f.map((x) => x.cat))].map((n) => ({ name: n, items: f.filter((x) => x.cat === n) })); })(), [cats, pricing]);
  const [tab, setTab] = useState(0);
  const cur = data[Math.min(tab, data.length - 1)];
  return (
    <section id="menu" className="lsec lsec-sunk">
      <div className="container">
        <Reveal><p className="label">The menu</p><h2 className="lh2">{`Hot Rs ${pricing.hot}. Flavored Rs ${pricing.flavored}. Iced Rs ${pricing.iced}.`}</h2><p className="muted" style={{ marginTop: 6 }}>One price for every drink of a kind, at every counter. VAT and service are included.</p></Reveal>
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
function Story({ cards }: { cards: any[] }) {
  return (
    <section id="story" className="lsec container">
      <Reveal><p className="label">From hill to cup</p><h2 className="lh2">Grown in Nepal. Roasted in Nepal.</h2></Reveal>
      <div className="grid g3" style={{ marginTop: 20 }}>
        {cards.map((c, i) => <Reveal key={i} delay={i * 120}><article className="lcard"><img src={pic(c.art, STORY_ART[i])} alt="" loading="lazy" /><div><span className="chip hill">{c.tag}</span><h3 style={{ margin: '8px 0 4px' }}>{c.title}</h3><p className="muted">{c.text}</p></div></article></Reveal>)}
      </div>
    </section>
  );
}

/* ---------------- 10-cup pass you can punch ---------------- */
function PassPlay({ price, hot }: { price: number; hot: number }) {
  const [used, setUsed] = useState(3);
  const per = price / 10;
  return (
    <section id="pass" className="lsec container">
      <div className="lpass">
        <Reveal>
          <p className="label" style={{ color: 'inherit', opacity: 0.8 }}>10-cup pass</p>
          <h2 className="lh2" style={{ color: 'inherit' }}>10 cups. One pass. {rs(price)}.</h2>
          <p style={{ maxWidth: 460, opacity: 0.92, marginTop: 8 }}>That is {rs(per)} a cup for any drink, against {rs(hot)} for a hot coffee and more for flavored and iced. Thirty days from your first cup, at any counter. Buy several and use them one after another. Tap the cups to try it.</p>
          <div className="row wrap" style={{ marginTop: 16 }}><span className="chip marigold">Save {rs(hot * 10 - price)} on hot coffee</span><span className="chip" style={{ background: 'transparent', color: 'inherit', borderColor: 'currentColor' }}>{10 - used} cups left</span></div>
          <Link className="btn" style={{ background: 'var(--surface)', color: 'var(--ink)', marginTop: 18 }} href="/offers">Get a pass</Link>
        </Reveal>
        <div className="lpunch" role="group" aria-label="Pass cups">
          {Array.from({ length: 10 }).map((_, k) => <button key={k} className={k < used ? 'used' : ''} aria-label={`Cup ${k + 1}, ${k < used ? 'used' : 'available'}`} aria-pressed={k < used} onClick={() => setUsed(k < used ? k : k + 1)}><img src="/img/cup-hot.svg" alt="" /></button>)}
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

function Partners({ intro }: { intro: string }) {
  return (
    <section id="partners" className="lsec lsec-roast">
      <div className="container lpartner">
        <Reveal><p className="label" style={{ color: 'inherit', opacity: 0.8 }}>For cafes</p><h2 className="lh2" style={{ color: 'inherit' }}>Run Sadhai at your cafe</h2>
          <p style={{ maxWidth: 520, opacity: 0.92, marginTop: 8 }}>{intro}</p>
          <ul className="lticks"><li><Icon name="check" size={18} />A revenue share on net sales, paid on a clear statement</li><li><Icon name="check" size={18} />Cash stays with you, digital payments settle through us, netted for you</li><li><Icon name="check" size={18} />One standard recipe and one price, so every counter tastes the same</li></ul>
          <Link className="btn" style={{ background: 'var(--surface)', color: 'var(--ink)' }} href="/partners">See how it works</Link></Reveal>
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
  const site = useSiteContent();
  const cfg = useConfig();
  const [stations, setStations] = useState<any[] | null>(null);
  const [homeData, setHomeData] = useState<any>(null);
  useEffect(() => {
    api('/stations', { auth: false }).then((s) => { setStations(s); const first = s.find((x: any) => x.open_now) || s[0]; if (first) api(`/stations/${first.id}/home`, { auth: false }).then(setHomeData).catch(() => {}); }).catch(() => {});
  }, []);
  const open = stations ? stations.filter((s) => s.open_now).length : null;
  const pricing = cfg?.pricing || { hot: 100, flavored: 120, iced: 150 };
  const marquee = site?.marquee || 'Good coffee, every day · सधैं राम्रो कफी · Grown in the hills · Ready in 90 seconds · Prices include VAT and service';
  return (
    <>
      <SiteHeader />
      <main>
        <Hero open={open} stations={stations?.length || 0} site={site} />
        <div className="lmarquee" aria-hidden><div>{Array.from({ length: 2 }).map((_, k) => <span key={k}>{marquee} · </span>)}</div></div>
        <HowItWorks steps={site?.steps || [{ title_en: 'Pick a counter', text: 'Share your location (free, on your phone) and we sort the nearest counters by walking time.' }, { title_en: 'Order and pay', text: 'Add a coffee in one tap. Pay with eSewa, your pass, or cash at the counter.' }, { title_en: 'Walk in, 90 seconds', text: 'Your pickup number lights up when it is ready.' }]} />
        <Showcase cats={homeData?.categories || null} pricing={pricing} />
        <Story cards={site?.story || [{ tag: 'Grown', title: 'In the hills of Gulmi, Syangja and Kaski', text: 'Nepali farmers pick cherries by hand on mid-hill terraces.' }, { tag: 'Roasted', title: 'By Sevya Coffee Processing', text: 'Roasted weekly in Nepal.' }, { tag: 'Poured', title: 'At a counter near you', text: 'One promise: 90 seconds.' }]} />
        <PassPlay price={cfg?.pass?.price ?? 900} hot={pricing.hot} />
        <DropBanner drop={homeData?.drops?.[0]} />
        <Partners intro={site?.partners?.intro || 'Keep your counter and your team. We bring the app, the beans and the customers.'} />
        <Download />
      </main>
      <SiteFooter />
    </>
  );
}
