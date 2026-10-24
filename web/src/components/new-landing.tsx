'use client';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, home, rs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n, LangToggle } from '@/lib/i18n';
import { productArt } from '@/lib/art';
import { pic, useConfig, useSiteContent } from '@/lib/site-content';
import { Icon } from './icons';
import { Logo } from './logo';
import { APP_VERSION } from '@/lib/version';

/* ------------------------------------------------------------------ */
/* REVEAL ON SCROLL                                                   */
/* ------------------------------------------------------------------ */
function Reveal({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setOn(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setOn(true);
          io.disconnect();
        }
      },
      { threshold: 0.12 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`reveal ${on ? 'in' : ''} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* MODERN HEADER                                                      */
/* ------------------------------------------------------------------ */
function ModernHeader() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className={`nh-header ${scrolled ? 'scrolled' : ''}`}>
      <div className="container row between" style={{ minHeight: 68 }}>
        <div className="row" style={{ gap: 20 }}>
          <Logo href="/" />
          <nav className={`nh-nav-links ${mobileOpen ? 'open' : ''}`} aria-label="Main Navigation" onClick={() => setMobileOpen(false)}>
            <a href="#menu">Menu and prices</a>
            <a href="#pass">10-cup pass</a>
            <a href="#stations">Counters</a>
            <Link href="/order">Order ahead</Link>
            <Link href="/partners">For cafes</Link>
          </nav>
        </div>

        <div className="row" style={{ gap: 12 }}>
          <LangToggle />
          {user ? (
            <Link className="btn primary sm" href={home(user.role)}>
              Open app
            </Link>
          ) : (
            <>
              <Link className="btn ghost sm hide-sm" href="/login">
                Sign in
              </Link>
              <Link className="btn primary sm" href="/order">
                {t('order_ahead')} <Icon name="chevr" size={16} />
              </Link>
            </>
          )}

          {/* Mobile hamburger */}
          <button
            className="btn ghost sm nh-burger"
            style={{ padding: '6px 10px' }}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            <Icon name={mobileOpen ? 'close' : 'menu'} size={20} />
          </button>
        </div>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* HERO                                                               */
/* ------------------------------------------------------------------ */
const nextOpening = (stations: any[] | null) => {
  const times = (stations || []).map((s) => String(s.opens).slice(0, 5)).sort();
  return times[0] || '07:00';
};

function Beans({ className = '' }: { className?: string }) {
  return <img className={`hp-beans ${className}`} src="/img/beans-scatter.svg" alt="" aria-hidden="true" loading="lazy" />;
}

function HeroArt({ site, pricing }: { site: any; pricing: { hot: number } }) {
  const portrait = pic(site?.hero?.portrait, '/img/person-barista.svg');
  const custom = !!site?.hero?.portrait?.url;
  return (
    <div className="hp-art">
      <img className="hp-bean b1" src="/img/bean.svg" alt="" aria-hidden="true" />
      <img className="hp-bean b2" src="/img/bean.svg" alt="" aria-hidden="true" />
      <img className="hp-bean b3" src="/img/bean.svg" alt="" aria-hidden="true" />
      <img className="hp-bean b4" src="/img/bean.svg" alt="" aria-hidden="true" />
      <div className="hp-arch">
        <img src={portrait} alt={custom ? 'The Sadhai team' : 'A Sadhai barista with a fresh cup'} style={custom ? { objectFit: 'cover' } : undefined} />
      </div>
      <div className="hp-float hp-float-order" aria-hidden="true">
        <span className="hp-dot" />
        <span><strong>A27 is ready</strong><small>Say your 4-digit code at the counter</small></span>
      </div>
      <div className="hp-float hp-float-price" aria-hidden="true">
        <img src="/img/cup-hot.svg" alt="" width={34} height={34} />
        <span><strong>{rs(pricing.hot)}</strong><small>Any hot coffee</small></span>
      </div>
    </div>
  );
}

function ModernHero({ stations, site, pricing }: { stations: any[] | null; site: any; pricing: { hot: number; flavored: number; iced: number } }) {
  const { lang, t } = useI18n();
  const h = site?.hero;
  const open = stations ? stations.filter((s) => s.open_now).length : null;
  const badge = open == null ? 'Counters across Kathmandu' : open > 0 ? `${open} of ${stations!.length} counters open now` : `Counters are closed now. First opens at ${nextOpening(stations)}`;
  const headline = lang === 'ne' ? h?.headline_ne || 'सधैं राम्रो कफी।' : h?.headline_en || 'Good coffee, every day.';
  const sub = lang === 'ne' ? h?.sub_ne || 'पहाडमा फलेको, ९० सेकेन्डमा तयार।' : h?.sub_en || 'Grown in the hills. Ready in 90 seconds.';
  return (
    <section className="nh-hero hp-hero">
      <Beans className="hp-hero-beans" />
      <div className="container nh-hero-grid hp-hero-grid">
        <div className="nh-hero-content">
          <div className="nh-badge-live"><span className="nh-pulse-dot" /><span>{badge}</span></div>
          <h1 className="nh-title">{headline}</h1>
          <p className="nh-lead">{sub} {lang === 'ne' ? '' : 'Nepali Arabica from Gulmi, Syangja and Kaski, roasted weekly in Nepal.'}</p>
          <div className="nh-hero-actions">
            <Link className="btn primary lg" href="/order">{h?.primary_cta || t('order_ahead')}<Icon name="chevr" size={20} /></Link>
            <Link className="btn lg" style={{ background: 'var(--surface-raised)' }} href="/register">{h?.secondary_cta || 'Create an account'}</Link>
          </div>
          <div className="nh-trust-strip">
            <div className="nh-trust-item"><span className="nh-trust-num">{rs(pricing.hot)}</span><span className="nh-trust-lbl">Any hot coffee</span></div>
            <div className="nh-trust-item"><span className="nh-trust-num">90 sec</span><span className="nh-trust-lbl">From order to cup</span></div>
            <div className="nh-trust-item"><span className="nh-trust-num">VAT in</span><span className="nh-trust-lbl">The price is the price</span></div>
            <div className="nh-trust-item"><span className="nh-trust-num">Cash or pass</span><span className="nh-trust-lbl">Pay at the counter</span></div>
          </div>
        </div>
        <HeroArt site={site} pricing={pricing} />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* RIBBON                                                             */
/* ------------------------------------------------------------------ */
function BrandMarquee({ site }: { site: any }) {
  const raw: string = site?.marquee || 'Good coffee, every day · सधैं राम्रो कफी · Grown in the hills · Ready in 90 seconds · Prices include VAT and service';
  const items = raw.split('·').map((x) => x.trim()).filter(Boolean);
  return (
    <div className="nh-ribbon" aria-hidden="true">
      <div className="nh-ribbon-track">
        {Array.from({ length: 4 }).map((_, loopIdx) => (
          <span key={loopIdx} style={{ display: 'inline-flex', gap: 24, marginRight: 24 }}>
            {items.map((item, idx) => (
              <span key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: 24 }}><span>{item}</span><img src="/img/bean.svg" alt="" width={14} height={18} style={{ opacity: 0.8 }} /></span>
            ))}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* PRICING AND LIVE MENU                                              */
/* ------------------------------------------------------------------ */
function MenuSection({ pricing, stations }: { pricing: { hot: number; flavored: number; iced: number }; stations: any[] | null }) {
  const { lang } = useI18n();
  const [activeCat, setActiveCat] = useState('all');
  const [menu, setMenu] = useState<any | null>(null);
  const station = (stations || []).find((s) => s.can_order) || (stations || [])[0];
  useEffect(() => {
    if (!station) return;
    api(`/stations/${station.id}/home`, { auth: false }).then(setMenu).catch(() => {});
  }, [station?.id]);
  const cats: any[] = (menu?.categories || []).filter((c: any) => c.products.some((p: any) => p.available));
  const products = useMemo(() => {
    const list = activeCat === 'all' ? cats.flatMap((c) => c.products) : cats.find((c) => c.id === activeCat)?.products || [];
    return list.filter((p: any) => p.available).slice(0, 12);
  }, [menu, activeCat]);
  return (
    <section id="menu" className="nh-section sunk">
      <div className="container">
        <Reveal>
          <div className="nh-section-header">
            <span className="nh-eyebrow">One price for every drink</span>
            <h2 className="nh-heading">Hot {rs(pricing.hot)}. Flavored {rs(pricing.flavored)}. Iced {rs(pricing.iced)}.</h2>
            <p className="nh-subheading">The same at every counter, with VAT and service included. The price on the board is the price you pay.</p>
          </div>
        </Reveal>
        <Reveal delay={100}>
          <div className="nh-price-strip">
            <div className="nh-price-card"><span className="label">Hot coffee</span><div className="nh-price-tag">{rs(pricing.hot)}</div><p className="small muted">Americano, espresso, cappuccino and more.</p></div>
            <div className="nh-price-card featured"><span className="chip marigold" style={{ alignSelf: 'center', marginBottom: 4 }}>Customer favourite</span><span className="label">Flavored</span><div className="nh-price-tag">{rs(pricing.flavored)}</div><p className="small muted">Chiya latte, mocha and signature drinks.</p></div>
            <div className="nh-price-card"><span className="label">Iced</span><div className="nh-price-tag">{rs(pricing.iced)}</div><p className="small muted">Iced latte, cold brew and cold drinks.</p></div>
          </div>
        </Reveal>
        {cats.length > 0 && (
          <div className="nh-tabs" role="tablist">
            {[{ id: 'all', name: 'Everything', name_ne: 'सबै' }, ...cats].map((c: any) => (
              <button key={c.id} role="tab" aria-selected={activeCat === c.id} className={`nh-tab-btn ${activeCat === c.id ? 'active' : ''}`} onClick={() => setActiveCat(c.id)}>{lang === 'ne' && c.name_ne ? c.name_ne : c.name}</button>
            ))}
          </div>
        )}
        <div className="nh-menu-grid">
          {products.map((p: any, idx: number) => (
            <Reveal key={p.id} delay={idx * 40}>
              <div className="nh-product-card">
                <div className="nh-product-media"><img src={productArt(p)} alt="" loading="lazy" /></div>
                <div className="nh-product-body">
                  {p.offer && <div className="nh-product-flavor"><span className="nh-tag">Offer today</span></div>}
                  <h3 style={{ fontSize: 19, marginTop: 4 }}>{lang === 'ne' && p.name_ne ? p.name_ne : p.name}</h3>
                  <p className="small muted" style={{ minHeight: 38 }}>{p.description || ''}</p>
                  <div className="nh-product-foot">
                    <span className="price" style={{ fontSize: 20, color: 'var(--cherry)' }}>{rs(p.price)}</span>
                    <Link className="btn sm primary" href="/order">Order ahead</Link>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
        {!menu && <p className="muted center" style={{ marginTop: 24 }}>Loading the menu…</p>}
        <div className="center" style={{ marginTop: 40 }}>
          {station && <p className="small muted" style={{ marginBottom: 12 }}>Menu shown for {station.name}. Items can differ slightly by counter.</p>}
          <Link className="btn lg primary" href="/order">See the full menu and order<Icon name="chevr" size={20} /></Link>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 10-CUP DIGITAL PASS                                                */
/* ------------------------------------------------------------------ */
function PassSection({ passPrice, hotPrice }: { passPrice: number; hotPrice: number }) {
  const perCup = Math.round(passPrice / 10);
  const singleSavings = hotPrice * 10 - passPrice;

  return (
    <section id="pass" className="nh-section container">
      <div className="nh-pass-hero" style={{ maxWidth: 840, margin: '0 auto', textAlign: 'center' }}>
        <Reveal>
          <span
            className="chip marigold"
            style={{ fontWeight: 800, padding: '6px 16px', marginBottom: 14 }}
          >
            Digital 10-Cup Punch Pass
          </span>
          <h2 className="nh-heading" style={{ color: 'var(--on-cherry)', marginBottom: 8 }}>
            10 cups. Any drink. {rs(passPrice)}.
          </h2>
          <p style={{ opacity: 0.94, margin: '0 auto', fontSize: 17, lineHeight: 1.6, maxWidth: 560 }}>
            That is just {rs(perCup)} per cup for ANY coffee—including hot, flavored, or 16-hour cold brew.
            Valid for 30 days across all counters in Nepal.
          </p>

          <div className="row wrap center" style={{ gap: 10, marginTop: 20, justifyContent: 'center' }}>
            <span className="chip" style={{ background: 'rgba(255, 248, 238, 0.2)', color: 'var(--on-cherry)', border: 0 }}>
              10 cups included
            </span>
            <span className="chip marigold">
              Save {rs(singleSavings)} vs single orders
            </span>
            <span className="chip" style={{ background: 'rgba(255, 248, 238, 0.2)', color: 'var(--on-cherry)', border: 0 }}>
              Valid at all counters
            </span>
          </div>

          <div style={{ marginTop: 28 }}>
            <Link
              className="btn lg"
              style={{ background: 'var(--surface)', color: 'var(--ink)', fontWeight: 700 }}
              href="/offers"
            >
              Get a 10-cup pass now
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* COUNTERS (live)                                                    */
/* ------------------------------------------------------------------ */
function StationFinder({ stations, onNearest, locating }: { stations: any[] | null; onNearest: () => void; locating: boolean }) {
  const list = stations ? [...stations].sort((a, b) => Number(!!b.can_order) - Number(!!a.can_order) || (a.distance_km ?? 1e9) - (b.distance_km ?? 1e9)) : null;
  return (
    <section id="stations" className="nh-section">
      <div className="container">
        <Reveal>
          <div className="nh-section-header">
            <span className="nh-eyebrow">Find your counter</span>
            <h2 className="nh-heading">Counters along your daily route</h2>
            <p className="nh-subheading">Hospital gates, campus entrances, bus stops and neighbourhood cafes. Open or closed, wait time and hours, live.</p>
            <button className="btn" style={{ marginTop: 14 }} onClick={onNearest} disabled={locating}><Icon name="pin" size={18} />{locating ? 'Finding you…' : 'Show the nearest first'}</button>
          </div>
        </Reveal>
        {!list ? <p className="muted center">Loading counters…</p> : (
          <div className="hp-stations">
            {list.map((s, i) => (
              <Reveal key={s.id} delay={i * 60}>
                <div className={`hp-station ${s.can_order ? '' : 'off'}`}>
                  <div className="row between" style={{ alignItems: 'flex-start' }}>
                    <div>
                      <h3 style={{ fontSize: 19 }}>{s.name}</h3>
                      <p className="small muted">{s.address}</p>
                    </div>
                    <span className={`chip ${s.can_order ? 'hill' : ''}`}>{s.can_order ? 'Open now' : s.open_now ? 'Paused' : 'Closed'}</span>
                  </div>
                  <div className="row wrap" style={{ gap: 6, margin: '10px 0' }}>
                    <span className="chip">{String(s.opens).slice(0, 5)}–{String(s.closes).slice(0, 5)}</span>
                    {s.can_order && <span className="chip">About {s.wait_minutes} min wait</span>}
                    {s.distance_km != null && <span className="chip marigold">{s.distance_km} km away</span>}
                    {s.operator_type === 'partner' && <span className="chip">Partner cafe</span>}
                  </div>
                  {s.can_order ? <Link className="btn sm primary" href="/order">Order from here</Link> : <span className="small muted">{s.open_now ? 'Not taking orders for a moment.' : `Opens at ${String(s.opens).slice(0, 5)}.`}</span>}
                </div>
              </Reveal>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* MODERN FOOTER                                                      */
/* ------------------------------------------------------------------ */
function ModernFooter() {
  return (
    <footer className="lfoot">
      <div className="container">
        <div className="row between wrap" style={{ gap: 32, alignItems: 'flex-start' }}>
          <div>
            <Logo href="/" />
            <p className="small muted" style={{ marginTop: 10, maxWidth: 340, lineHeight: 1.5 }}>
              Nepal’s everyday specialty coffee. Grown in the hills, roasted weekly in Nepal, ready in 90 seconds.
            </p>
            <div className="row" style={{ gap: 8, marginTop: 14 }}>
              <span className="chip marigold">Nepali Arabica</span>
            </div>
          </div>

          <div className="col small" style={{ gap: 8 }}>
            <strong>Explore</strong>
            <a href="#menu">Menu and prices</a>
            <a href="#pass">10-cup pass</a>
            <a href="#stations">Find a counter</a>
            <Link href="/order">Order ahead</Link>
            <Link href="/changelog">Changelog & Updates</Link>
          </div>

          <div className="col small" style={{ gap: 8 }}>
            <strong>For business</strong>
            <Link href="/partners">Run Sadhai at your cafe</Link>
            <Link href="/investors">Investors</Link>
            <Link href="/support">Help and support</Link>
            <Link href="/privacy">Privacy policy</Link>
            <Link href="/terms">Terms of use</Link>
          </div>

          <div className="col small" style={{ gap: 8 }}>
            <strong>Staff</strong>
            <Link href="/station">Station</Link>
            <Link href="/manager">Manager</Link>
            <Link href="/owner">Owner</Link>
          </div>
        </div>

        <div
          className="row between wrap"
          style={{
            marginTop: 36,
            paddingTop: 20,
            borderTop: '1px solid var(--hairline)',
            fontSize: 13,
            color: 'var(--ink-muted)',
          }}
        >
          <span>All prices in NPR. VAT and service included. © Sadhai Coffee</span>
          <Link href="/changelog" style={{ color: 'inherit' }}>Version {APP_VERSION} (Changelog)</Link>
        </div>
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------ */
/* THE HOME PAGE                                                      */
/* ------------------------------------------------------------------ */
export function NewLanding() {
  const site = useSiteContent();
  const cfg = useConfig();
  const [stations, setStations] = useState<any[] | null>(null);
  const [locating, setLocating] = useState(false);

  const load = (pos?: { lat: number; lng: number }) =>
    api(`/stations${pos ? `?lat=${pos.lat}&lng=${pos.lng}` : ''}`, { auth: false }).then(setStations).catch(() => {});
  useEffect(() => { load(); }, []);
  const nearest = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition((p) => { load({ lat: p.coords.latitude, lng: p.coords.longitude }).finally(() => setLocating(false)); }, () => setLocating(false), { timeout: 8000 });
  };

  const pricing = cfg?.pricing || { hot: 100, flavored: 120, iced: 150 };
  const passPrice = cfg?.pass?.price ?? 900;

  return (
    <div className="nh-page">
      <ModernHeader />
      <main>
        <ModernHero stations={stations} site={site} pricing={pricing} />
        <BrandMarquee site={site} />
        <MenuSection pricing={pricing} stations={stations} />
        <PassSection passPrice={passPrice} hotPrice={pricing.hot} />
        <StationFinder stations={stations} onNearest={nearest} locating={locating} />
      </main>
      <ModernFooter />
    </div>
  );
}
