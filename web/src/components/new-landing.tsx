'use client';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, home, rs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n, LangToggle } from '@/lib/i18n';
import { productArt } from '@/lib/art';
import { HERO_DEFAULTS, STEP_ART, STORY_ART, pic, useConfig, useSiteContent } from '@/lib/site-content';
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
          <Logo href="/newhome" />
          <nav className="nh-nav-links hide-sm" aria-label="Main Navigation">
            <a href="#menu">Menu & Pricing</a>
            <a href="#lab">90s Guarantee</a>
            <a href="#terroir">Terroir</a>
            <a href="#pass">10-Cup Pass</a>
            <a href="#stations">Counters</a>
            <Link href="/partners">For Cafes</Link>
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
            className="btn ghost sm"
            style={{ padding: '6px 10px', display: 'none' }}
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
    title: '9-Bar Himalayan Pull',
    title_ne: '९-बार कफी निष्कर्षण',
    desc: '93°C mountain water forced through at 9 bars. Dense golden crema.',
    desc_ne: '९३ डिग्री पानीबाट गाढा सुनौलो क्रिमा भएको डबल सट।',
    action: '28-second extraction window',
    icon: 'drop',
  },
  {
    range: [51, 75],
    title: 'Microfoam or Chill',
    title_ne: 'दूध फिँज वा चिसो स्न्याप',
    desc: 'Velvety 60°C microfoam milk or flash chilled over crystalline ice.',
    desc_ne: 'नरम माइक्रोफोम वा हिमालको चिसो बरफमा तयार।',
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
/* MODERN HERO SECTION                                                */
/* ------------------------------------------------------------------ */
function ModernHero({ openCounters }: { openCounters: number | null }) {
  const { lang, t } = useI18n();
  const { user } = useAuth();

  return (
    <section className="nh-hero">
      <div className="container nh-hero-grid">
        <div className="nh-hero-content">
          <div className="nh-badge-live">
            <span className="nh-pulse-dot" />
            <span>
              {openCounters != null && openCounters > 0
                ? `${openCounters} counters open in Kathmandu right now`
                : 'Counters open daily 6:30 AM – 8:00 PM'}
            </span>
          </div>

          <h1 className="nh-title">
            {lang === 'ne' ? (
              <>
                सधैं राम्रो कफी। <br />
                <span className="nh-title-accent">९० सेकेन्डमा</span> तयार।
              </>
            ) : (
              <>
                Good coffee, every day. <br />
                Ready in <span className="nh-title-accent">90 seconds</span>.
              </>
            )}
          </h1>

          <p className="nh-lead">
            {lang === 'ne'
              ? 'गुल्मी, स्याङ्जा र कास्कीका उच्च पहाडी बारीमा फलेको सिंगल ओरिजिन अरेबिका। हप्ताको हप्ता ताजा भुटेको, बिना कुनै लुकेको शुल्क।'
              : 'Nepali single-origin Arabica, shade-grown at 1,400m in Gulmi, Syangja and Kaski. Roasted weekly in Kathmandu, poured in 90 seconds flat.'}
          </p>

          <div className="nh-hero-actions">
            <Link className="btn primary lg" href="/order">
              {t('order_ahead')}
              <Icon name="chevr" size={20} />
            </Link>
            <a className="btn lg" style={{ background: 'var(--surface-raised)' }} href="#pass">
              10-Cup Pass (Save Rs 100)
            </a>
          </div>

          <div className="nh-trust-strip">
            <div className="nh-trust-item">
              <span className="nh-trust-num">Rs 100</span>
              <span className="nh-trust-lbl">Flat Hot Coffee</span>
            </div>
            <div className="nh-trust-item">
              <span className="nh-trust-num">90s</span>
              <span className="nh-trust-lbl">Average Pickup</span>
            </div>
            <div className="nh-trust-item">
              <span className="nh-trust-num">1,400m</span>
              <span className="nh-trust-lbl">Himalayan Altitude</span>
            </div>
            <div className="nh-trust-item">
              <span className="nh-trust-num">0%</span>
              <span className="nh-trust-lbl">Hidden Fees or VAT</span>
            </div>
          </div>
        </div>

        <BrewLab />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* BRAND MARQUEE RIBBON                                               */
/* ------------------------------------------------------------------ */
function BrandMarquee() {
  const items = [
    'Single Origin Nepal',
    'Gulmi & Syangja Arabica',
    '90-Second Pickup Guarantee',
    'Flat Rs 100 Hot Coffee',
    'No Hidden Charges (VAT Included)',
    'Roasted Weekly by Sevya',
    'सधैं राम्रो कफी',
    'Kathmandu Daily Habit',
  ];

  return (
    <div className="nh-ribbon" aria-hidden="true">
      <div className="nh-ribbon-track">
        {Array.from({ length: 4 }).map((_, loopIdx) => (
          <span key={loopIdx} style={{ display: 'inline-flex', gap: 24, marginRight: 24 }}>
            {items.map((item, idx) => (
              <span key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: 24 }}>
                <span>{item}</span>
                <span style={{ opacity: 0.6 }}>✦</span>
              </span>
            ))}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* RADICAL TRANSPARENCY PRICING & MENU                                */
/* ------------------------------------------------------------------ */
const FEATURED_PRODUCTS = [
  {
    id: '1',
    sku: 'AMR',
    name: 'Americano',
    name_ne: 'अमेरिकानो',
    cat: 'hot',
    price: 100,
    tags: ['Double Shot', 'Dark Cocoa', 'Crisp'],
    desc: 'Two shots of freshly extracted Gulmi Arabica topped with hot mountain water.',
  },
  {
    id: '2',
    sku: 'LAT',
    name: 'Himalayan Latte',
    name_ne: 'लाते',
    cat: 'flavored',
    price: 120,
    tags: ['Velvety Microfoam', 'Single Origin', 'Creamy'],
    desc: 'Espresso poured over silky steamed milk with subtle caramel sweetness.',
  },
  {
    id: '3',
    sku: 'CHL',
    name: 'Chiya Latte',
    name_ne: 'चिया लाते',
    cat: 'signature',
    price: 120,
    tags: ['Signature Drop', 'Ginger & Cardamom', 'Spiced'],
    desc: 'Double shot espresso infused with traditional Himalayan milk tea spices.',
  },
  {
    id: '4',
    sku: 'CLB',
    name: '16-Hour Cold Brew',
    name_ne: 'कोल्ड ब्रु',
    cat: 'iced',
    price: 150,
    tags: ['Steeped 16 Hours', 'Low Acidity', 'Chocolate Notes'],
    desc: 'Slow steeped in chilled water for 16 hours for an extraordinarily smooth finish.',
  },
  {
    id: '5',
    sku: 'GPO',
    name: 'Gulmi Pour-Over',
    name_ne: 'गुल्मी पोर-ओभर',
    cat: 'signature',
    price: 150,
    tags: ['1,400m Terroir', 'Floral Citrus', 'Clean Finish'],
    desc: 'Single estate hand-poured brew capturing the delicate jasmine notes of western hills.',
  },
  {
    id: '6',
    sku: 'SCB',
    name: 'Citrus Spark Cold Brew',
    name_ne: 'सिट्रस स्पार्क',
    cat: 'iced',
    price: 150,
    tags: ['Orange Zest', 'Sparkling', 'Refreshing'],
    desc: 'Cold brew poured over sparkling tonic and fresh orange peel.',
  },
  {
    id: '7',
    sku: 'CRO',
    name: 'Butter Croissant',
    name_ne: 'बटर क्रोसाँ',
    cat: 'bites',
    price: 120,
    tags: ['Baked Daily', 'Flaky & Golden', 'French Butter'],
    desc: 'Crisp layers of French butter pastry baked fresh every morning.',
  },
  {
    id: '8',
    sku: 'MUG',
    name: 'Sadhai Ceramic Mug',
    name_ne: 'सधैं सिरेमिक मग',
    cat: 'bites',
    price: 450,
    tags: ['Thimi Pottery', '300ml', 'Limited Merch'],
    desc: 'Handmade ceramic mug crafted by local artisans in Thimi, Bhaktapur.',
  },
];

function MenuSection({ pricing }: { pricing: { hot: number; flavored: number; iced: number } }) {
  const { lang } = useI18n();
  const [activeCat, setActiveCat] = useState('all');

  const categories = [
    { id: 'all', label: 'All Items', label_ne: 'सबै' },
    { id: 'signature', label: 'Signature', label_ne: 'विशेष' },
    { id: 'hot', label: 'Hot Coffee', label_ne: 'तातो कफी' },
    { id: 'iced', label: 'Iced & Cold Brew', label_ne: 'चिसो कफी' },
    { id: 'bites', label: 'Bakery & Goods', label_ne: 'बेकरी र सामान' },
  ];

  const filtered = useMemo(() => {
    if (activeCat === 'all') return FEATURED_PRODUCTS;
    return FEATURED_PRODUCTS.filter((p) => p.cat === activeCat);
  }, [activeCat]);

  return (
    <section id="menu" className="nh-section sunk">
      <div className="container">
        <Reveal>
          <div className="nh-section-header">
            <span className="nh-eyebrow">Radical Flat Pricing</span>
            <h2 className="nh-heading">One honest price for every drink</h2>
            <p className="nh-subheading">
              No hidden service charges. No extra VAT surprise at checkout. The price written on the board is the price you pay.
            </p>
          </div>
        </Reveal>

        {/* Flat Price Pillars */}
        <Reveal delay={100}>
          <div className="nh-price-strip">
            <div className="nh-price-card">
              <span className="label">Hot Coffee</span>
              <div className="nh-price-tag">{rs(pricing.hot)}</div>
              <p className="small muted">Americano, Espresso, Filter. Double shot included.</p>
            </div>
            <div className="nh-price-card featured">
              <span className="chip marigold" style={{ alignSelf: 'center', marginBottom: 4 }}>
                Most Popular
              </span>
              <span className="label">Specialty & Flavored</span>
              <div className="nh-price-tag">{rs(pricing.flavored)}</div>
              <p className="small muted">Himalayan Latte, Chiya Latte, Cappuccino.</p>
            </div>
            <div className="nh-price-card">
              <span className="label">Iced & Cold Brew</span>
              <div className="nh-price-tag">{rs(pricing.iced)}</div>
              <p className="small muted">16-Hour Cold Brew, Iced Latte, Citrus Spark.</p>
            </div>
          </div>
        </Reveal>

        {/* Category Filters */}
        <div className="nh-tabs" role="tablist">
          {categories.map((c) => (
            <button
              key={c.id}
              role="tab"
              aria-selected={activeCat === c.id}
              className={`nh-tab-btn ${activeCat === c.id ? 'active' : ''}`}
              onClick={() => setActiveCat(c.id)}
            >
              {lang === 'ne' ? c.label_ne : c.label}
            </button>
          ))}
        </div>

        {/* Menu Cards */}
        <div className="nh-menu-grid">
          {filtered.map((product, idx) => (
            <Reveal key={product.id} delay={idx * 60}>
              <div className="nh-product-card">
                <div className="nh-product-media">
                  <img src={productArt(product)} alt={product.name} loading="lazy" />
                </div>
                <div className="nh-product-body">
                  <div className="nh-product-flavor">
                    {product.tags.map((tag, tIdx) => (
                      <span key={tIdx} className="nh-tag">
                        {tag}
                      </span>
                    ))}
                  </div>
                  <h3 style={{ fontSize: 19, marginTop: 4 }}>
                    {lang === 'ne' ? product.name_ne : product.name}
                  </h3>
                  <p className="small muted" style={{ minHeight: 38 }}>
                    {product.desc}
                  </p>
                  <div className="nh-product-foot">
                    <span className="price" style={{ fontSize: 20, color: 'var(--cherry)' }}>
                      {rs(product.price)}
                    </span>
                    <Link className="btn sm primary" href="/order">
                      Order ahead
                    </Link>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        <div className="center" style={{ marginTop: 44 }}>
          <Link className="btn lg primary" href="/order">
            Explore full menu and customize at your nearest counter
            <Icon name="chevr" size={20} />
          </Link>
        </div>
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
/* FROM HILL TO CUP (Terroir, Roasting, Extraction)                   */
/* ------------------------------------------------------------------ */
function TerroirSection() {
  const stories = [
    {
      tag: '01 · Origin & Terroir',
      title: 'Shade-grown at 1,400m',
      desc: 'Nepali farmers in Gulmi, Syangja and Kaski hand-pick ripe red cherries on steep Himalayan terraces under native tree canopy.',
      img: '/img/scene-farm.svg',
      detail: 'Altitude: 1,200m – 1,550m · Varietals: Bourbon & Typica',
    },
    {
      tag: '02 · Precision Roasting',
      title: 'Roasted weekly in Nepal',
      desc: 'Processed and roasted weekly by Sevya Coffee Processing in small calibrated batches to preserve clean citrus acidity and dark chocolate sweetness.',
      img: '/img/scene-roastery.svg',
      detail: 'Batch size: 15kg · Roast profile: Medium city roast',
    },
    {
      tag: '03 · 90s Counter Speed',
      title: 'Calibrated for your day',
      desc: 'Every Sadhai counter is configured with commercial two-group commercial machines and volumetric dosers for zero waiting time.',
      img: '/img/scene-kiosk.svg',
      detail: 'Target wait: Under 90s · Pre-order on phone',
    },
  ];

  return (
    <section id="terroir" className="nh-section container">
      <Reveal>
        <div className="nh-section-header">
          <span className="nh-eyebrow">Himalayan Terroir</span>
          <h2 className="nh-heading">From the steep mid-hills into your cup</h2>
          <p className="nh-subheading">
            Nepal produces some of the most distinctive high-altitude specialty coffees in the world. We bring it directly from local terraces to your morning routine.
          </p>
        </div>
      </Reveal>

      <div className="nh-terroir-grid">
        {stories.map((s, idx) => (
          <Reveal key={idx} delay={idx * 100}>
            <article className="nh-terroir-card">
              <img src={s.img} alt={s.title} className="nh-terroir-img" loading="lazy" />
              <div className="nh-terroir-body">
                <span className="chip hill" style={{ alignSelf: 'flex-start' }}>
                  {s.tag}
                </span>
                <h3 style={{ fontSize: 20 }}>{s.title}</h3>
                <p className="small muted" style={{ lineHeight: 1.5 }}>
                  {s.desc}
                </p>
                <div
                  style={{
                    marginTop: 8,
                    paddingTop: 10,
                    borderTop: '1px solid var(--hairline)',
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--ink-muted)',
                  }}
                >
                  {s.detail}
                </div>
              </div>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* LIVE COUNTER RADAR / STATION FINDER                                */
/* ------------------------------------------------------------------ */
const SAMPLE_STATIONS = [
  {
    id: 'st-1',
    name: 'Jhamsikhel Counter',
    name_ne: 'झम्सीखेल काउन्टर',
    address: 'Near Sanepa Chowk, Lalitpur',
    opens: '06:30',
    closes: '20:00',
    open_now: true,
    wait_minutes: 2,
    distance_km: 0.8,
  },
  {
    id: 'st-2',
    name: 'Durbar Marg Counter',
    name_ne: 'दरबार मार्ग काउन्टर',
    address: 'North Gate, Kathmandu',
    opens: '07:00',
    closes: '20:30',
    open_now: true,
    wait_minutes: 1,
    distance_km: 1.4,
  },
  {
    id: 'st-3',
    name: 'Thamel Hub',
    name_ne: 'ठमेल हब',
    address: 'Mandala Street, Thamel',
    opens: '07:00',
    closes: '21:00',
    open_now: true,
    wait_minutes: 2,
    distance_km: 2.1,
  },
  {
    id: 'st-4',
    name: 'Patan Heritage Counter',
    name_ne: 'पाटन हेरिटेज काउन्टर',
    address: 'Patan Dhoka, Lalitpur',
    opens: '06:30',
    closes: '19:30',
    open_now: true,
    wait_minutes: 1,
    distance_km: 3.2,
  },
];

function StationFinder() {
  const { lang, t } = useI18n();
  const [selectedStation, setSelectedStation] = useState(SAMPLE_STATIONS[0]);
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = useMemo(() => {
    return SAMPLE_STATIONS.filter(
      (s) =>
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.address.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery]);

  return (
    <section id="stations" className="nh-section sunk">
      <div className="container">
        <Reveal>
          <div className="nh-section-header">
            <span className="nh-eyebrow">Counter Radar</span>
            <h2 className="nh-heading">Find your nearest Sadhai station</h2>
            <p className="nh-subheading">
              Strategically placed along morning walk routes, business corridors, and transport nodes across Kathmandu Valley.
            </p>
          </div>
        </Reveal>

        <div className="nh-radar-grid">
          {/* Station list */}
          <div className="col" style={{ gap: 12 }}>
            <div className="searchbar">
              <Icon name="search" size={18} />
              <input
                placeholder="Search by neighborhood or area (e.g. Jhamsikhel, Thamel)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search counters"
              />
            </div>

            {filtered.map((station) => {
              const isSelected = selectedStation.id === station.id;
              return (
                <button
                  key={station.id}
                  className={`nh-station-item ${isSelected ? 'active' : ''}`}
                  onClick={() => setSelectedStation(station)}
                >
                  <div className="row" style={{ gap: 14 }}>
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: '50%',
                        background: isSelected ? 'var(--cherry)' : 'var(--surface-sunk)',
                        color: isSelected ? 'var(--on-cherry)' : 'var(--cherry)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flex: '0 0 auto',
                      }}
                    >
                      <Icon name="pin" size={22} />
                    </div>
                    <div>
                      <strong style={{ fontSize: 16 }}>
                        {lang === 'ne' ? station.name_ne : station.name}
                      </strong>
                      <span className="small muted" style={{ display: 'block' }}>
                        {station.address} · {station.opens}–{station.closes}
                      </span>
                    </div>
                  </div>

                  <div className="col" style={{ alignItems: 'flex-end', gap: 4 }}>
                    <span className="chip hill">
                      <span className="nh-pulse-dot" style={{ width: 6, height: 6, marginRight: 4 }} />
                      Open Now
                    </span>
                    <span className="small muted" style={{ fontSize: 12 }}>
                      ~{station.wait_minutes} min wait
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Station Spotlight Card */}
          <div className="card" style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="row between">
              <div>
                <span className="nh-eyebrow" style={{ marginBottom: 6 }}>
                  Station Spotlight
                </span>
                <h3 style={{ fontSize: 26, margin: 0 }}>
                  {lang === 'ne' ? selectedStation.name_ne : selectedStation.name}
                </h3>
                <p className="small muted" style={{ marginTop: 4 }}>
                  {selectedStation.address}
                </p>
              </div>
              <span className="chip hill" style={{ padding: '6px 14px', fontSize: 13 }}>
                Open today until {selectedStation.closes}
              </span>
            </div>

            <div
              style={{
                background: 'var(--surface-sunk)',
                borderRadius: 'var(--radius-lg)',
                padding: 20,
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 14,
                textAlign: 'center',
              }}
            >
              <div>
                <span className="small muted">Estimated Wait</span>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 800, color: 'var(--cherry)' }}>
                  90 sec
                </div>
              </div>
              <div>
                <span className="small muted">Baristas on duty</span>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 800 }}>
                  2 Baristas
                </div>
              </div>
              <div>
                <span className="small muted">Digital Payment</span>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 800, color: 'var(--hill)' }}>
                  Fonepay QR
                </div>
              </div>
            </div>

            <p className="small muted" style={{ lineHeight: 1.5 }}>
              Walk in, tap your pass, or scan Fonepay at this counter. Your order is calibrated and handed over in under 90 seconds.
            </p>

            <div className="row" style={{ gap: 12 }}>
              <Link className="btn primary lg grow" href="/order">
                Order ahead to this counter
                <Icon name="chevr" size={18} />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* PHONE APP & SPEED MOCKUP                                           */
/* ------------------------------------------------------------------ */
function AppExperience() {
  const playUrl = process.env.NEXT_PUBLIC_PLAY_URL;
  const appleUrl = process.env.NEXT_PUBLIC_APPSTORE_URL;

  return (
    <section className="nh-section container">
      <div className="nh-app-box">
        <Reveal>
          <span className="chip marigold" style={{ fontWeight: 800, marginBottom: 12 }}>
            Zero Wait Mobile Ordering
          </span>
          <h2 className="nh-heading" style={{ color: 'inherit' }}>
            Order while walking. Hand-off in 90s.
          </h2>
          <p style={{ opacity: 0.9, marginTop: 14, fontSize: 17, lineHeight: 1.5, maxWidth: 460 }}>
            Pick your drink on the phone, choose your counter, and walk straight to the pickup bay. Your order code lights up green the moment it is poured.
          </p>

          <ul className="lticks" style={{ margin: '24px 0 32px' }}>
            <li>
              <Icon name="check" size={20} color="var(--marigold)" />
              <span>Real-time counter queues & walking distance calculator</span>
            </li>
            <li>
              <Icon name="check" size={20} color="var(--marigold)" />
              <span>Fonepay, eSewa, pass punch, or cash at counter</span>
            </li>
            <li>
              <Icon name="check" size={20} color="var(--marigold)" />
              <span>Full offline support with lightweight Progressive Web App</span>
            </li>
          </ul>

          <div className="row wrap" style={{ gap: 12 }}>
            <Link className="btn lg primary" href="/order">
              Launch Web App Now
              <Icon name="zap" size={18} />
            </Link>
            <Link className="btn lg" style={{ background: 'var(--surface)', color: 'var(--ink)' }} href="/register">
              Create an Account
            </Link>
          </div>
        </Reveal>

        {/* Realistic smartphone bezel */}
        <Reveal delay={150}>
          <div className="nh-phone-frame">
            <div className="row between" style={{ padding: '0 4px', fontSize: 11, fontWeight: 700 }}>
              <span>9:41</span>
              <span>Sadhai Go</span>
              <span>100%</span>
            </div>

            {/* In-app mockup card */}
            <div
              style={{
                background: 'var(--surface)',
                borderRadius: 'var(--radius-lg)',
                padding: 18,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                border: '1px solid var(--hairline)',
              }}
            >
              <div className="row between">
                <span className="chip hill">Ready for Pickup</span>
                <span className="small muted">Jhamsikhel #02</span>
              </div>

              <div style={{ textAlign: 'center', padding: '12px 0' }}>
                <span className="small muted">Your Pickup Code</span>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 54, fontWeight: 800, color: 'var(--cherry)', lineHeight: 1 }}>
                  #42
                </div>
                <p className="small muted" style={{ marginTop: 6 }}>
                  Americano (Hot) · 2 Shots
                </p>
              </div>

              <div className="bar" style={{ height: 8 }}>
                <i style={{ width: '100%', background: 'var(--hill)' }} />
              </div>

              <div className="row between small" style={{ paddingTop: 6 }}>
                <span>Paid via Fonepay</span>
                <strong>Rs 100.00</strong>
              </div>
            </div>

            <div className="center">
              <span className="chip marigold" style={{ fontSize: 11 }}>
                ⚡ Prepared in 74 seconds
              </span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* CAFE PARTNERSHIP SECTION                                           */
/* ------------------------------------------------------------------ */
function PartnerSection() {
  return (
    <section className="nh-section sunk">
      <div className="container">
        <div className="lpartner">
          <Reveal>
            <span className="nh-eyebrow">For Cafe Owners</span>
            <h2 className="nh-heading" style={{ marginTop: 10 }}>
              Turn unused counter space into a revenue engine
            </h2>
            <p className="nh-subheading" style={{ marginTop: 12 }}>
              Keep your existing cafe and staff. We install our rapid espresso workflow, bring the single-origin Nepali beans, and route thousands of daily commuters directly to your counter.
            </p>

            <ul className="lticks" style={{ margin: '22px 0 28px' }}>
              <li>
                <Icon name="check" size={20} color="var(--cherry)" />
                <span>Zero upfront hardware investment or franchise lock-in fees</span>
              </li>
              <li>
                <Icon name="check" size={20} color="var(--cherry)" />
                <span>Transparent revenue share on net sales, settled automatically</span>
              </li>
              <li>
                <Icon name="check" size={20} color="var(--cherry)" />
                <span>One standard recipe book ensuring consistent barista execution</span>
              </li>
            </ul>

            <Link className="btn lg primary" href="/partners">
              Learn how to partner with Sadhai
              <Icon name="chevr" size={18} />
            </Link>
          </Reveal>

          <Reveal delay={150}>
            <div className="card" style={{ padding: 28, position: 'relative' }}>
              <img
                src="/img/scene-kiosk.svg"
                alt="Sadhai counter partner"
                style={{ width: '100%', borderRadius: 16 }}
              />
              <div
                style={{
                  marginTop: 18,
                  padding: 16,
                  background: 'var(--surface-sunk)',
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <strong style={{ fontSize: 15 }}>Average Partner Yield</strong>
                  <span className="small muted" style={{ display: 'block' }}>
                    120–250 additional cups daily
                  </span>
                </div>
                <span className="chip hill" style={{ fontSize: 13, fontWeight: 700 }}>
                  High ROI
                </span>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* FREQUENTLY ASKED QUESTIONS (Accordion)                             */
/* ------------------------------------------------------------------ */
const FAQS = [
  {
    q: 'How do you guarantee a fresh cup in 90 seconds?',
    a: 'We use volumetric commercial espresso groupheads, freshly roasted weekly batches calibrated to exact burr grind specs, and our streamlined phone order queue so the barista begins grinding the moment your order ping arrives.',
  },
  {
    q: 'Where are the coffee beans cultivated?',
    a: '100% of our coffee is single-origin Nepali Arabica cultivated between 1,200m and 1,550m in the steep mid-hills of Gulmi, Syangja and Kaski. It is shade-grown and selectively picked by hand.',
  },
  {
    q: 'How does the 10-Cup Pass work?',
    a: 'When you purchase a 10-Cup Pass (Rs 900), each cup costs just Rs 90 regardless of whether you order Hot, Flavored, or Iced Cold Brew. The pass is stored digitally on your phone and valid for 30 days across all Sadhai counters.',
  },
  {
    q: 'Are VAT and service charges included in the price?',
    a: 'Yes! We believe in radical price transparency. Every single price displayed includes 13% VAT and 10% Service Charge. There are zero surprise line-items at checkout.',
  },
  {
    q: 'What payment options can I use?',
    a: 'We support Fonepay QR (all Nepali bank apps), eSewa, Sadhai Digital Pass, and cash directly at the counter.',
  },
];

function FaqSection() {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  return (
    <section className="nh-section container">
      <Reveal>
        <div className="nh-section-header">
          <span className="nh-eyebrow">Frequently Asked</span>
          <h2 className="nh-heading">Everything you need to know</h2>
          <p className="nh-subheading">
            Got questions about our beans, pricing transparency, or the 90-second pickup? We have answers.
          </p>
        </div>
      </Reveal>

      <div className="nh-faq-list">
        {FAQS.map((faq, idx) => {
          const isOpen = openIdx === idx;
          return (
            <div key={idx} className="nh-faq-item">
              <div
                className="nh-faq-q"
                onClick={() => setOpenIdx(isOpen ? null : idx)}
                role="button"
                tabIndex={0}
                aria-expanded={isOpen}
              >
                <span>{faq.q}</span>
                <Icon
                  name="chevd"
                  size={20}
                  color="var(--cherry)"
                  stroke={2.5}
                />
              </div>
              {isOpen && <div className="nh-faq-a">{faq.a}</div>}
            </div>
          );
        })}
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
            <Logo href="/newhome" />
            <p className="small muted" style={{ marginTop: 10, maxWidth: 340, lineHeight: 1.5 }}>
              Nepal’s everyday specialty coffee. Grown on Himalayan terraces, roasted weekly in Kathmandu, and ready in 90 seconds.
            </p>
            <div className="row" style={{ gap: 8, marginTop: 14 }}>
              <span className="chip marigold">Nepal Single Origin</span>
              <span className="chip">Est. 2024</span>
            </div>
          </div>

          <div className="col small" style={{ gap: 8 }}>
            <strong>Navigation</strong>
            <a href="#menu">Menu & Pricing</a>
            <a href="#lab">90-Second Guarantee</a>
            <a href="#pass">10-Cup Pass</a>
            <a href="#terroir">Himalayan Terroir</a>
            <a href="#stations">Find Counters</a>
          </div>

          <div className="col small" style={{ gap: 8 }}>
            <strong>Business & Cafe</strong>
            <Link href="/partners">Run Sadhai at Your Cafe</Link>
            <Link href="/investors">Investors</Link>
            <Link href="/support">Help & Support</Link>
            <Link href="/privacy">Privacy Policy</Link>
            <Link href="/terms">Terms of Service</Link>
          </div>

          <div className="col small" style={{ gap: 8 }}>
            <strong>Staff & Ops</strong>
            <Link href="/station">Barista Station Portal</Link>
            <Link href="/manager">Manager Dashboard</Link>
            <Link href="/owner">Owner Console</Link>
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
          <span>All prices in NPR. VAT & Service Charge included. © Sadhai Coffee</span>
          <span>Version {APP_VERSION} · Preview at /newhome</span>
        </div>
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------ */
/* MAIN NEW LANDING EXPORT                                            */
/* ------------------------------------------------------------------ */
export function NewLanding() {
  const site = useSiteContent();
  const cfg = useConfig();
  const [stations, setStations] = useState<any[] | null>(null);

  useEffect(() => {
    api('/stations', { auth: false })
      .then((s) => setStations(s))
      .catch(() => {});
  }, []);

  const openCounters = stations ? stations.filter((s) => s.open_now).length : null;
  const pricing = cfg?.pricing || { hot: 100, flavored: 120, iced: 150 };
  const passPrice = cfg?.pass?.price ?? 900;

  return (
    <div className="nh-page">
      <ModernHeader />
      <main>
        <ModernHero openCounters={openCounters} />
        <BrandMarquee />
        <MenuSection pricing={pricing} />
        <PassSimulator passPrice={passPrice} hotPrice={pricing.hot} />
        <TerroirSection />
        <StationFinder />
        <AppExperience />
        <PartnerSection />
        <FaqSection />
      </main>
      <ModernFooter />
    </div>
  );
}
