'use client';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, rs, fmtTime } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCart, quickLine } from '@/lib/cart';
import { useI18n, LangToggle } from '@/lib/i18n';
import { Empty, ErrorNote, Loading, useData, useToast } from '@/components/ui';
import { CustomerShell } from '@/components/customer';
import { Icon } from '@/components/icons';
import { ProductCard, ProductRow, nm } from '@/components/menu';

export default function OrderHome() {
  const cart = useCart();
  if (!cart.ready) return <CustomerShell><Loading /></CustomerShell>;
  return <CustomerShell>{cart.station ? <Home /> : <LocationGate />}</CustomerShell>;
}

/* ---------------------------------------------------------------- location */

function walkMinutes(km: number) { return Math.max(1, Math.round(km * 12)); }

function LocationGate() {
  const cart = useCart();
  const { lang, t } = useI18n();
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [state, setState] = useState<'ask' | 'locating' | 'denied' | 'done'>('ask');
  const [q, setQ] = useState('');
  const stations = useData<any[]>(`/stations${pos ? `?lat=${pos.lat}&lng=${pos.lng}` : ''}`, [pos?.lat, pos?.lng]);

  function locate() {
    if (!navigator.geolocation) return setState('denied');
    setState('locating');
    // Free, on-device location from the browser: no paid maps or geocoding service is called.
    navigator.geolocation.getCurrentPosition(
      (p) => { setPos({ lat: p.coords.latitude, lng: p.coords.longitude }); setState('done'); },
      () => setState('denied'), { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }
  useEffect(() => { (navigator as any).permissions?.query({ name: 'geolocation' }).then((r: any) => { if (r.state === 'granted') locate(); }).catch(() => {}); }, []);

  const list = (stations.data || []).filter((s) => !q || `${s.name} ${s.address} ${s.district}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <div className="row between"><div><p className="label">Step 1</p><h2>{t('choose_station')}</h2></div><LangToggle /></div>
      {state === 'ask' && (
        <div className="card col" style={{ marginTop: 16 }}>
          <div className="row"><span className="circle"><span className="dot" style={{ width: 52, height: 52 }}><Icon name="pin" size={26} /></span></span>
            <div><h3>Find your nearest Sadhai counter</h3><p className="muted small">We use your phone’s location only to sort stations by distance. It is not stored.</p></div></div>
          <button className="btn primary lg" onClick={locate}><Icon name="nav" size={20} />Use my location</button>
          <button className="btn ghost" onClick={() => setState('denied')}>Choose a station myself</button>
        </div>
      )}
      {state === 'locating' && <p className="muted" role="status" style={{ marginTop: 16 }}>Finding stations near you…</p>}
      {state === 'denied' && <p className="small muted" style={{ marginTop: 12 }}>Location is off, so here is every station. <button className="btn sm ghost" onClick={locate}>Try again</button></p>}
      {state !== 'ask' && (
        <>
          <div className="searchbar" style={{ margin: '16px 0' }}><Icon name="search" size={20} /><input placeholder="Search by area or station name" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search stations" /></div>
          <ErrorNote error={stations.error} />
          {stations.loading && <Loading />}
          <div className="col">
            {list.map((s, i) => (
              <button key={s.id} className="stationrow" disabled={s.can_order === false} aria-disabled={s.can_order === false} style={s.can_order === false ? { opacity: 0.55, cursor: 'not-allowed' } : undefined} onClick={() => cart.setStation({ id: s.id, name: s.name, name_ne: s.name_ne, address: s.address, open_now: s.open_now, distance_km: s.distance_km })}>
                <span className="pinic"><Icon name="pin" /></span>
                <span className="grow">
                  <span className="row wrap" style={{ gap: 6 }}><strong>{lang === 'ne' && s.name_ne ? s.name_ne : s.name}</strong>{pos && i === 0 && !q && <span className="chip hill">Nearest</span>}{s.operator_type === 'partner' && <span className="chip">Partner cafe</span>}</span>
                  <span className="small muted" style={{ display: 'block' }}>{s.address} · {s.opens.slice(0, 5)}–{s.closes.slice(0, 5)}</span>
                  <span className="small" style={{ display: 'block' }}>{s.distance_km != null ? `${s.distance_km} km · about ${walkMinutes(s.distance_km)} min walk · ` : ''}{s.can_order === false ? (s.open_now ? 'Not taking orders for a moment' : `Closed · opens ${s.opens.slice(0, 5)}`) : `${t('wait')} ~${s.wait_minutes} ${t('min')}`}</span>
                </span>
                <span className={`chip ${s.can_order === false ? '' : 'hill'}`}>{s.can_order === false ? (s.open_now ? 'Paused' : t('closed')) : t('open_now')}</span>
              </button>
            ))}
            {!list.length && !stations.loading && <Empty>No station matches that search.</Empty>}
          </div>
          <p className="small muted" style={{ marginTop: 12 }}>{t('prices_note')}</p>
        </>
      )}
    </>
  );
}

/* -------------------------------------------------------------------- home */

function Home() {
  const cart = useCart();
  const { user } = useAuth();
  const { lang, t } = useI18n();
  const toast = useToast();
  const sid = cart.station!.id;
  const home = useData<any>(`/stations/${sid}/home`, [sid]);
  const coupons = useData<any[]>(user ? '/coupons' : null, [user?.id]);
  const passes = useData<any[]>(user ? '/passes' : null, [user?.id]);
  const inbox = useData<any>(user ? '/notifications' : null, [user?.id]);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('all');
  const merchRef = useRef<HTMLDivElement>(null), allRef = useRef<HTMLDivElement>(null), dropRef = useRef<HTMLDivElement>(null);
  const jump = (r: React.RefObject<HTMLDivElement>) => r.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const d = home.data;
  const products: any[] = useMemo(() => d?.categories.flatMap((c: any) => c.products) || [], [d]);
  const merchCat = d?.categories.find((c: any) => c.name === 'Merch');
  const shop = d?.categories.filter((c: any) => c.name !== 'Merch') || [];
  const activeCoupons = (coupons.data || []).filter((c) => c.status === 'active');
  const firstCup = activeCoupons.find((c) => c.kind === 'first_cup');
  const livePass = (passes.data || []).find((p) => p.status === 'active');
  const drop = d?.drops?.[0];
  const dropProduct = drop && products.find((p) => p.id === drop.product_id);

  const results = q.trim() ? products.filter((p) => `${p.name} ${p.name_ne || ''} ${p.description || ''} ${p.origin || ''}`.toLowerCase().includes(q.trim().toLowerCase())) : null;
  const listed = cat === 'all' ? shop.flatMap((c: any) => c.products) : (d?.categories.find((c: any) => c.id === cat)?.products || []);

  function addNow(p: any) { const l = p && quickLine(p); if (l) { cart.add(l); toast(`${p.name} added`); } else jump(allRef); }

  if (home.loading && !d) return <Loading what="Loading your station" />;
  if (home.error || !d) return <><ErrorNote error={home.error} /><button className="btn" onClick={() => cart.setStation(null)}>Choose another station</button></>;
  const st = d.station;

  // Hero: a live drop beats the brand line.
  const hero = drop
    ? { kicker: `Drop · ${drop.partner || 'Limited'}`, title: lang === 'ne' && drop.name_ne ? drop.name_ne : drop.name, sub: `${rs(drop.price)} · ${drop.remaining.toLocaleString()} cups left`, badge: `${drop.remaining}`, cta: 'Add to cart', act: () => addNow(dropProduct) }
      : { kicker: 'Sadhai Coffee', title: t('tagline'), sub: t('support'), badge: '90s', cta: t('order_ahead'), act: () => jump(allRef) };

  return (
    <>
      {/* location + search */}
      <div className="row between">
        <button className="row" style={{ all: 'unset', cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }} onClick={() => cart.setStation(null)} aria-label="Change station">
          <Icon name="pin" color="var(--cherry)" />
          <span style={{ minWidth: 0 }}><span className="label" style={{ display: 'block' }}>{st.open_now ? t('open_now') : t('closed')} · change</span><strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lang === 'ne' && st.name_ne ? st.name_ne : st.name}</strong></span>
        </button>
        <div className="row"><LangToggle /><Link href="/account" aria-label="Notifications" style={{ position: 'relative', color: 'var(--ink)' }}><Icon name="bell" />{inbox.data?.unread > 0 && <span className="badge" style={{ top: -8, right: -8 }}>{inbox.data.unread}</span>}</Link></div>
      </div>
      {d && d.station.can_order === false && <div className="card flat" role="status" style={{ marginTop: 12, borderColor: 'var(--cherry)' }}><strong>{d.station.open_now ? 'This station is not taking orders for a moment.' : `This station is closed right now. It opens at ${String(d.station.opens).slice(0, 5)}.`}</strong> You can look at the menu, but you cannot order here. <button className="btn sm" style={{ marginLeft: 8 }} onClick={() => cart.setStation(null)}>Choose another station</button></div>}
      <div {...(d && d.station.can_order === false ? ({ inert: '' } as any) : {})} style={d && d.station.can_order === false ? { opacity: 0.6 } : undefined}>
      <div className="searchbar" style={{ margin: '14px 0' }}><Icon name="search" size={20} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search coffee, bites, merch" aria-label="Search items" />{q && <button className="btn ghost sm" onClick={() => setQ('')} aria-label="Clear search"><Icon name="close" size={16} /></button>}</div>

      {results ? (
        <section aria-label="Search results">
          <h3 style={{ marginBottom: 8 }}>{results.length} result{results.length === 1 ? '' : 's'}</h3>
          {results.length ? <div className="card" style={{ padding: 0 }}>{results.map((p) => <ProductRow key={p.id} p={p} />)}</div> : <Empty>Nothing matches “{q}”.</Empty>}
        </section>
      ) : (
        <>
          {/* offers on rounded icons */}
          <nav className="circles" aria-label="Offers">
            {firstCup && <Link href="/offers" className="circle hot"><span className="dot"><Icon name="cup" size={26} /></span><span>Free first cup</span></Link>}
            {drop && <button className="circle hot" onClick={() => jump(dropRef)}><span className="dot"><Icon name="flame" size={26} /></span><span>Drop</span></button>}
            <Link href="/offers" className="circle"><span className="dot"><Icon name="ticket" size={26} />{livePass && <b className="pip">{livePass.remaining}</b>}</span><span>{livePass ? 'My pass' : '10-cup pass'}</span></Link>
            <Link href="/offers" className="circle"><span className="dot"><Icon name="tag" size={26} />{activeCoupons.length > 0 && <b className="pip">{activeCoupons.length}</b>}</span><span>Coupons</span></Link>
            <Link href="/account?tab=friends" className="circle"><span className="dot"><Icon name="gift" size={26} /></span><span>Give a cup</span></Link>
            {merchCat && <button className="circle" onClick={() => jump(merchRef)}><span className="dot"><Icon name="bag" size={26} /></span><span>Merch</span></button>}
          </nav>

          {/* hero */}
          <div className="hero-card" style={{ marginTop: 8 }} ref={dropRef}>
            <div className="sun" aria-hidden><b>{hero.badge}</b></div>
            <p className="label" style={{ color: 'inherit', opacity: 0.85 }}>{hero.kicker}</p>
            <h2>{hero.title}</h2>
            {hero.sub && <p style={{ opacity: 0.9 }}>{hero.sub}</p>}
            <div><button className="btn" style={{ background: 'var(--surface)', color: 'var(--ink)' }} onClick={hero.act}>{hero.cta}</button></div>
            <div className="ridge" aria-hidden />
          </div>

          {/* best sellers */}
          {d.best_sellers.length > 0 && (
            <>
              <div className="sectionhead"><h3>Best sellers</h3><span className="small muted">This month at {st.name.split(',')[0]}</span></div>
              <div className="hscroll">{d.best_sellers.map((p: any) => <ProductCard key={p.id} p={p} />)}</div>
            </>
          )}

          {/* square category boxes */}
          <div className="sectionhead"><h3>Categories</h3></div>
          <div className="catgrid">
            {d.categories.map((c: any) => (
              <button key={c.id} className={`catbox ${cat === c.id ? 'on' : ''}`} onClick={() => { if (c.name === 'Merch') jump(merchRef); else { setCat(cat === c.id ? 'all' : c.id); jump(allRef); } }} aria-pressed={cat === c.id}>
                <Icon name={c.name === 'Merch' ? 'bag' : c.name === 'Bites' ? 'bean' : c.name === 'Signature' ? 'star' : c.name === 'Cold coffee' ? 'drop' : 'cup'} size={30} stroke={1.8} />
                <span><span className="nm" style={{ display: 'block' }}>{nm(c, lang)}</span><span className="ct">{c.products.length} items</span></span>
              </button>
            ))}
          </div>

          {/* merch */}
          {merchCat && (
            <>
              <div ref={merchRef} className="sectionhead"><h3>Merch</h3><span className="small muted">Take Sadhai home</span></div>
              <div className="hscroll">{merchCat.products.map((p: any) => <ProductCard key={p.id} p={p} />)}</div>
            </>
          )}

          {/* all products */}
          <div ref={allRef} className="sectionhead"><h3>Food and beverage</h3><span className="small muted">{t('prices_note')}</span></div>
          <div className="row wrap" style={{ marginBottom: 10 }}>
            <button className={`btn sm ${cat === 'all' ? 'primary' : 'ghost'}`} onClick={() => setCat('all')}>All</button>
            {shop.map((c: any) => <button key={c.id} className={`btn sm ${cat === c.id ? 'primary' : 'ghost'}`} onClick={() => setCat(c.id)}>{nm(c, lang)}</button>)}
          </div>
          <div className="card" style={{ padding: 0 }}>{listed.map((p: any) => <ProductRow key={p.id} p={p} />)}</div>
          {st.operator_type === 'partner' && <p className="small muted center" style={{ marginTop: 16 }}>Served at {st.partner_name}, a Sadhai partner cafe.</p>}
        </>
      )}
      </div>
    </>
  );
}
