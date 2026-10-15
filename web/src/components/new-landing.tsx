'use client';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, home, rs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n, LangToggle } from '@/lib/i18n';
import { productArt } from '@/lib/art';
import { HERO_DEFAULTS, PEOPLE_ART, STEP_ART, STORY_ART, pic, useConfig, useSiteContent } from '@/lib/site-content';
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
            <a href="#people">People</a>
            <a href="#terroir">From hill to cup</a>
            <a href="#pass">10-cup pass</a>
            <a href="#stations">Counters</a>
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
/* 90-SECOND BARISTA BREW LAB (Interactive Simulation)                */
/* ------------------------------------------------------------------ */
const BREW_STEPS = [
  {
    range: [0, 20],
    title: 'Precision Burr Grind',
    title_ne: 'ताजा कफी पिस्ने',
    desc: '18g calibrated grind of shade-grown Nepali Arabica from Gulmi.',
    desc_ne: 'गुल्मीको छायाँमा फलेको नेपाली अरेबिका कफी १८ ग्राम पिस्ने।',
    action: 'Burr calibration: 92 clicks',
    icon: 'bean',
  },
  {
    range: [21, 50],
    title: '9-bar espresso pull',
    title_ne: '९-बार कफी निष्कर्षण',
    desc: 'Water at 93°C pushed through at 9 bars. Dense golden crema.',
    desc_ne: '९३ डिग्री पानीबाट गाढा सुनौलो क्रिमा भएको डबल सट।',
    action: '28-second extraction window',
    icon: 'drop',
  },
  {
    range: [51, 75],
    title: 'Microfoam or Chill',
    title_ne: 'दूध फिँज वा चिसो स्न्याप',
    desc: 'Velvety 60°C microfoam milk or flash chilled over crystalline ice.',
    desc_ne: 'नरम माइक्रोफोम वा चिसो बरफमा तयार।',
    action: 'Silky latte or cold brew blend',
    icon: 'flame',
  },
  {
    range: [76, 90],
    title: 'Hand-off Pickup',
    title_ne: '९० सेकेन्डमा हातमा तयार',
    desc: 'Lidded, stamped, and ready with your live order token.',
    desc_ne: 'ढक्कन बन्द गरी तपाईंको पिकअप नम्बरसहित काउन्टरमा तयार।',
    action: 'Ready at counter #42',
    icon: 'check',
  },
];

function BrewLab() {
  const { lang } = useI18n();
  const [sec, setSec] = useState(12);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (!playing) return;
    const interval = setInterval(() => {
      setSec((prev) => (prev >= 90 ? 0 : prev + 1));
    }, 400);
    return () => clearInterval(interval);
  }, [playing]);

  const activeStepIdx = useMemo(() => {
    const idx = BREW_STEPS.findIndex((s) => sec >= s.range[0] && sec <= s.range[1]);
    return idx === -1 ? 0 : idx;
  }, [sec]);

  const activeStep = BREW_STEPS[activeStepIdx];
  const radius = 68;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (sec / 90) * circumference;

  return (
    <div className="nh-lab-card" id="lab">
      <div className="nh-lab-header">
        <div>
          <span className="nh-eyebrow">The 90-Second Promise</span>
          <h3 style={{ marginTop: 6, fontSize: 22 }}>How your cup is made</h3>
        </div>
        <button
          className="btn ghost sm"
          onClick={() => setPlaying(!playing)}
          style={{ minHeight: 34, padding: '4px 12px' }}
        >
          <Icon name={playing ? 'clock' : 'zap'} size={16} />
          {playing ? 'Pause' : 'Resume'}
        </button>
      </div>

      <div className="nh-lab-display">
        <div className="nh-timer-circle">
          <svg viewBox="0 0 160 160">
            <circle
              cx="80"
              cy="80"
              r={radius}
              fill="none"
              stroke="var(--hairline)"
              strokeWidth="10"
            />
            <circle
              cx="80"
              cy="80"
              r={radius}
              fill="none"
              stroke="var(--cherry)"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              style={{ transition: 'stroke-dashoffset 0.3s ease' }}
            />
          </svg>
          <div className="nh-timer-center">
            <span className="nh-timer-sec">{sec}</span>
            <span className="nh-timer-unit">of 90 SEC</span>
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="chip hill" style={{ marginBottom: 6 }}>
            {activeStep.action}
          </div>
          <h4 style={{ fontSize: 18, color: 'var(--cherry)', marginBottom: 4 }}>
            {lang === 'ne' ? activeStep.title_ne : activeStep.title}
          </h4>
          <p className="small muted" style={{ lineHeight: 1.4 }}>
            {lang === 'ne' ? activeStep.desc_ne : activeStep.desc}
          </p>
        </div>
      </div>

      <div className="nh-step-pills">
        {BREW_STEPS.map((step, idx) => {
          const isActive = idx === activeStepIdx;
          return (
            <button
              key={idx}
              className={`nh-step-pill ${isActive ? 'active' : ''}`}
              onClick={() => {
                setSec(step.range[0]);
                setPlaying(false);
              }}
              aria-label={`Jump to ${step.title}`}
            >
              <span className="nh-step-num">{idx + 1}</span>
              <div className="grow">
                <strong style={{ fontSize: 14 }}>
                  {lang === 'ne' ? step.title_ne : step.title}
                </strong>
                <span className="small muted" style={{ display: 'block', fontSize: 12 }}>
                  {step.range[0]}s – {step.range[1]}s
                </span>
              </div>
              <Icon name={step.icon} size={18} color={isActive ? 'var(--cherry)' : 'var(--ink-muted)'} />
            </button>
          );
        })}
      </div>
    </div>
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
            <Link className="btn lg" style={{ background: 'var(--surface-raised)' }} href="/register">{h?.secondary_cta || 'Get a free first cup'}</Link>
          </div>
          <div className="nh-trust-strip">
            <div className="nh-trust-item"><span className="nh-trust-num">{rs(pricing.hot)}</span><span className="nh-trust-lbl">Any hot coffee</span></div>
            <div className="nh-trust-item"><span className="nh-trust-num">90 sec</span><span className="nh-trust-lbl">From order to cup</span></div>
            <div className="nh-trust-item"><span className="nh-trust-num">VAT in</span><span className="nh-trust-lbl">The price is the price</span></div>
            <div className="nh-trust-item"><span className="nh-trust-num">Fonepay</span><span className="nh-trust-lbl">Scan to pay</span></div>
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
            <div className="nh-price-card featured"><span className="chip marigold" style={{ alignSelf: 'center', marginBottom: 4 }}>Customer favourite</span><span className="label">Flavored</span><div className="nh-price-tag">{rs(pricing.flavored)}</div><p className="small muted">Chiya latte, mocha and the signature drinks.</p></div>
            <div className="nh-price-card"><span className="label">Iced</span><div className="nh-price-tag">{rs(pricing.iced)}</div><p className="small muted">Iced latte, cold brew and other cold drinks.</p></div>
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
/* PEOPLE                                                             */
/* ------------------------------------------------------------------ */
function PeopleSection({ site }: { site: any }) {
  const people: any[] = site?.people || [];
  return (
    <section id="people" className="nh-section hp-people-sec">
      <Beans className="hp-people-beans" />
      <div className="container">
        <Reveal>
          <div className="nh-section-header">
            <span className="nh-eyebrow">The people of Sadhai</span>
            <h2 className="nh-heading">Every cup passes through a pair of hands</h2>
            <p className="nh-subheading">From the farmer who picks the cherry to the barista who hands it over, and the neighbours who stop by on the way.</p>
          </div>
        </Reveal>
        <div className="hp-people">
          {people.map((p, i) => (
            <Reveal key={i} delay={i * 90}>
              <figure className="hp-person">
                <div className="hp-portrait"><img src={pic(p.art, PEOPLE_ART[i])} alt="" loading="lazy" /></div>
                <figcaption>
                  <span className="hp-role">{p.role}</span>
                  <strong>{p.title}</strong>
                  <p className="small muted">{p.text}</p>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* THE 90-SECOND PROMISE                                              */
/* ------------------------------------------------------------------ */
function LabSection() {
  return (
    <section id="lab" className="nh-section">
      <div className="container hp-lab">
        <Reveal>
          <div>
            <span className="nh-eyebrow">The 90-second promise</span>
            <h2 className="nh-heading" style={{ textAlign: 'left' }}>Watch a cup come together</h2>
            <p className="nh-subheading" style={{ textAlign: 'left', margin: 0 }}>Order on your phone and the barista starts the moment it arrives. Grind, pull, pour, hand over. Tap a step to see what happens and when.</p>
            <ul className="lticks" style={{ marginTop: 16 }}>
              <li><Icon name="check" size={18} />Your order reaches the counter as soon as you pay</li>
              <li><Icon name="check" size={18} />One standard recipe, so every counter tastes the same</li>
              <li><Icon name="check" size={18} />A 4-digit code keeps your cup yours</li>
            </ul>
          </div>
        </Reveal>
        <Reveal delay={120}><BrewLab /></Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 10-CUP DIGITAL PUNCH PASS SIMULATOR (Gamified)                     */
/* ------------------------------------------------------------------ */
function PassSimulator({ passPrice, hotPrice }: { passPrice: number; hotPrice: number }) {
  const [punches, setPunches] = useState(3);
  const [cupsPerWeek, setCupsPerWeek] = useState(5);

  const perCup = Math.round(passPrice / 10);
  const singleSavings = hotPrice * 10 - passPrice;
  const yearlyCups = cupsPerWeek * 52;
  const yearlyPassSavings = Math.round((yearlyCups / 10) * singleSavings);

  const togglePunch = (idx: number) => {
    if (idx < punches) {
      setPunches(idx);
    } else {
      setPunches(idx + 1);
    }
  };

  return (
    <section id="pass" className="nh-section container">
      <div className="nh-pass-hero">
        <Reveal>
          <span
            className="chip marigold"
            style={{ fontWeight: 800, padding: '4px 14px', marginBottom: 12 }}
          >
            Digital 10-Cup Punch Pass
          </span>
          <h2 className="nh-heading" style={{ color: 'var(--on-cherry)' }}>
            10 cups. Any drink. {rs(passPrice)}.
          </h2>
          <p style={{ opacity: 0.92, marginTop: 12, fontSize: 17, lineHeight: 1.5, maxWidth: 480 }}>
            That is just {rs(perCup)} per cup for ANY coffee—including hot, flavored, or 16-hour cold brew.
            Valid for 30 days across all counters in Nepal.
          </p>

          <div className="row wrap" style={{ gap: 10, marginTop: 18 }}>
            <span className="chip" style={{ background: 'rgba(255, 248, 238, 0.2)', color: 'var(--on-cherry)', border: 0 }}>
              {10 - punches} cups remaining
            </span>
            <span className="chip marigold">
              Save {rs(singleSavings)} vs single orders
            </span>
          </div>

          {/* Calculator widget */}
          <div
            style={{
              background: 'rgba(0, 0, 0, 0.18)',
              borderRadius: 'var(--radius-lg)',
              padding: '16px 20px',
              marginTop: 22,
              maxWidth: 460,
            }}
          >
            <div className="row between small" style={{ fontWeight: 700, marginBottom: 8 }}>
              <span>Your coffee habit: {cupsPerWeek} cups / week</span>
              <span style={{ color: 'var(--marigold)' }}>Save {rs(yearlyPassSavings)} / year</span>
            </div>
            <input
              type="range"
              min="2"
              max="14"
              value={cupsPerWeek}
              onChange={(e) => setCupsPerWeek(Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--marigold)', cursor: 'pointer' }}
              aria-label="Cups per week"
            />
          </div>

          <div style={{ marginTop: 24 }}>
            <Link
              className="btn lg"
              style={{ background: 'var(--surface)', color: 'var(--ink)', fontWeight: 700 }}
              href="/offers"
            >
              Get a 10-cup pass now
            </Link>
          </div>
        </Reveal>

        {/* 10 Punch slots */}
        <Reveal delay={150}>
          <div style={{ textAlign: 'center' }}>
            <p className="small" style={{ opacity: 0.85, marginBottom: 14 }}>
              Tap any cup to punch or unpunch your card:
            </p>
            <div className="nh-punch-grid">
              {Array.from({ length: 10 }).map((_, idx) => {
                const isPunched = idx < punches;
                return (
                  <button
                    key={idx}
                    className={`nh-punch-slot ${isPunched ? 'punched' : ''}`}
                    onClick={() => togglePunch(idx)}
                    aria-label={`Cup slot ${idx + 1}, ${isPunched ? 'punched' : 'available'}`}
                    aria-pressed={isPunched}
                  >
                    <img src="/img/cup-hot.svg" alt="" width={36} height={36} />
                    <span
                      style={{
                        position: 'absolute',
                        bottom: 4,
                        right: 6,
                        fontSize: 10,
                        fontWeight: 800,
                        opacity: isPunched ? 0.7 : 0.4,
                      }}
                    >
                      #{idx + 1}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* FROM HILL TO CUP                                                   */
/* ------------------------------------------------------------------ */
function TerroirSection({ site }: { site: any }) {
  const story: any[] = site?.story || [];
  return (
    <section id="terroir" className="nh-section sunk hp-terroir">
      <Beans className="hp-terroir-beans" />
      <div className="container">
        <Reveal>
          <div className="nh-section-header">
            <span className="nh-eyebrow">From hill to cup</span>
            <h2 className="nh-heading">Grown in Nepal. Roasted in Nepal.</h2>
            <p className="nh-subheading">Arabica from the mid-hills of Gulmi, Syangja and Kaski, roasted every week by Sevya Coffee Processing.</p>
          </div>
        </Reveal>
        <div className="hp-facts">
          <div><strong>16 g</strong><span>of coffee in every double shot</span></div>
          <div><strong>Weekly</strong><span>roasting, planned from what you order</span></div>
          <div><strong>3 districts</strong><span>named on the bag: Gulmi, Syangja, Kaski</span></div>
        </div>
        <div className="grid g3" style={{ marginTop: 28 }}>
          {story.map((s, i) => (
            <Reveal key={i} delay={i * 100}>
              <article className="lcard">
                <img src={pic(s.art, STORY_ART[i])} alt="" loading="lazy" />
                <div><span className="chip hill">{s.tag}</span><h3 style={{ margin: '8px 0 4px' }}>{s.title}</h3><p className="muted">{s.text}</p></div>
              </article>
            </Reveal>
          ))}
        </div>
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
/* THE APP                                                            */
/* ------------------------------------------------------------------ */
function AppExperience({ passPrice }: { passPrice: number }) {
  return (
    <section id="app" className="nh-section sunk">
      <div className="container hp-app">
        <Reveal>
          <div className="hp-app-art">
            <img src="/img/person-commuter.svg" alt="" loading="lazy" />
            <div className="hp-ticket" aria-hidden="true">
              <span className="label">Your pickup code</span>
              <strong>4 2 7 1</strong>
              <small>Say it at the counter</small>
            </div>
          </div>
        </Reveal>
        <Reveal delay={120}>
          <div>
            <span className="nh-eyebrow">Order ahead</span>
            <h2 className="nh-heading" style={{ textAlign: 'left' }}>Order while you walk. Pick up without waiting.</h2>
            <ul className="lticks">
              <li><Icon name="check" size={18} />Choose a counter and see if it is open and how long the wait is</li>
              <li><Icon name="check" size={18} />Pay with a Fonepay QR, a 10-cup pass ({rs(passPrice)}) or cash at pickup</li>
              <li><Icon name="check" size={18} />Pick a time later today, or ask for it now</li>
              <li><Icon name="check" size={18} />A 4-digit code makes sure the right person collects the cup</li>
            </ul>
            <div className="row wrap" style={{ marginTop: 18 }}>
              <Link className="btn primary lg" href="/order">Open the web app</Link>
              <Link className="btn lg" style={{ background: 'var(--surface-raised)' }} href="/register">Create an account</Link>
            </div>
            <p className="small muted" style={{ marginTop: 10 }}>Android and iPhone apps are coming. The web app works on any phone today.</p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* FOR CAFES                                                          */
/* ------------------------------------------------------------------ */
function PartnerSection({ share }: { share: number | null }) {
  return (
    <section id="partners" className="nh-section hp-partner">
      <div className="container hp-app">
        <Reveal>
          <div>
            <span className="nh-eyebrow" style={{ color: 'inherit', opacity: 0.85 }}>For cafe owners</span>
            <h2 className="nh-heading" style={{ textAlign: 'left', color: 'inherit' }}>Run Sadhai at your cafe</h2>
            <p style={{ opacity: 0.92, maxWidth: 520, marginTop: 8 }}>Keep your counter and your team. We bring the beans, the app and the customers.</p>
            <ul className="lticks" style={{ color: 'inherit' }}>
              <li><Icon name="check" size={18} />A share of net sales{share ? ` (we start at ${share}%)` : ''}, paid against a clear statement</li>
              <li><Icon name="check" size={18} />Cash stays with you. Fonepay money settles through us, netted for you</li>
              <li><Icon name="check" size={18} />Your own dashboard: sales, orders, stock and ratings for your cafe</li>
              <li><Icon name="check" size={18} />One standard recipe and one price, so every counter tastes the same</li>
            </ul>
            <Link className="btn" style={{ background: 'var(--surface)', color: 'var(--ink)', marginTop: 8 }} href="/partners">See how it works</Link>
          </div>
        </Reveal>
        <Reveal delay={120}>
          <div className="hp-app-art hp-partner-art"><img src="/img/person-owner.svg" alt="" loading="lazy" /></div>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* FAQ                                                                */
/* ------------------------------------------------------------------ */
function FaqSection({ passPrice }: { passPrice: number }) {
  const [open, setOpen] = useState<number | null>(0);
  const faqs = [
    { q: 'How fast is it?', a: 'We aim for 90 seconds from the moment the barista starts. Order ahead and it is often ready as you arrive.' },
    { q: 'Where does the coffee come from?', a: 'Arabica grown in Gulmi, Syangja and Kaski, roasted every week in Nepal by Sevya Coffee Processing.' },
    { q: 'What does the 10-cup pass cost?', a: `${rs(passPrice)} for 10 cups of any drink. It starts with your first cup and lasts 30 days. You can buy several and use them one after another.` },
    { q: 'Are VAT and service charge included?', a: 'Yes. The price on the board and in the app is the price you pay.' },
    { q: 'How can I pay?', a: 'Online payment is by Fonepay QR, from any mobile-banking or wallet app. You can also use your pass, or pay cash at pickup.' },
    { q: 'Can I order for later?', a: 'Yes. Choose "Later today" in your cart and pick a time from 15 minutes ahead until the counter closes. Closed counters cannot take orders.' },
    { q: 'Can I cancel an order?', a: 'Only while it is waiting for payment. Once it is placed it goes straight to the barista. If a counter cannot make it, they cancel and refund you.' },
    { q: 'How do I collect my order?', a: 'Say your pickup number and the 4-digit code shown in the app. The code makes sure the right person takes the cup.' },
  ];
  return (
    <section id="faq" className="nh-section">
      <div className="container" style={{ maxWidth: 820 }}>
        <Reveal><div className="nh-section-header"><span className="nh-eyebrow">Questions</span><h2 className="nh-heading">Good to know</h2></div></Reveal>
        <div className="col" style={{ gap: 10 }}>
          {faqs.map((f, i) => (
            <div key={i} className="card flat">
              <button className="row between" style={{ all: 'unset', cursor: 'pointer', display: 'flex', width: '100%', gap: 12, fontWeight: 700 }} aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
                <span>{f.q}</span><Icon name={open === i ? 'minus' : 'plus'} size={18} />
              </button>
              {open === i && <p className="muted" style={{ marginTop: 8 }}>{f.a}</p>}
            </div>
          ))}
        </div>
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
            <a href="#lab">The 90-second promise</a>
            <a href="#pass">10-cup pass</a>
            <a href="#terroir">From hill to cup</a>
            <a href="#stations">Find a counter</a>
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
          <span>Version {APP_VERSION}</span>
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
        <PeopleSection site={site} />
        <LabSection />
        <PassSimulator passPrice={passPrice} hotPrice={pricing.hot} />
        <TerroirSection site={site} />
        <StationFinder stations={stations} onNearest={nearest} locating={locating} />
        <AppExperience passPrice={passPrice} />
        <PartnerSection share={cfg?.partner_share_pct ?? null} />
        <FaqSection passPrice={passPrice} />
      </main>
      <ModernFooter />
    </div>
  );
}
