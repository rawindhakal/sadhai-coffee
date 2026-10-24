'use client';
import { useState } from 'react';
import { rs } from '@/lib/api';
import { useConfig, useSiteContent } from '@/lib/site-content';
import { EnquiryForm } from '@/components/enquiry';
import { Icon } from '@/components/icons';
import { SiteFooter, SiteHeader } from '@/components/sitechrome';

const GET = [
  ['cart', 'The Sadhai app and kiosk', 'Customers order ahead and at a self-order screen. You do not build or pay for anything.'],
  ['box', 'Central supply', 'We buy beans, milk, syrups, cups and bites and send them to your counter. You confirm what arrives.'],
  ['cup', 'Standard recipes', 'Every drink is made the same way at every counter, with a recipe card for your team.'],
  ['users', 'Staff tools', 'Rosters, duties, check-in and hours for your team, if you want them.'],
  ['chart', 'A live dashboard', 'Sales, orders, stock and cash counts as they happen, and one clear statement every month.'],
  ['mega', 'Customers sent to you', 'Offers, passes and referrals bring regulars through your door.'],
];

export default function PartnersPage() {
  const site = useSiteContent();
  const cfg = useConfig();
  const p = site?.partners;
  const price = cfg?.pricing || { hot: 100, flavored: 120, iced: 150 };
  const share = cfg?.partner_share_pct ?? 35;
  const [cups, setCups] = useState(120);
  const [hot, setHot] = useState(55);
  const [iced, setIced] = useState(25);
  const [days, setDays] = useState(26);
  const flavored = Math.max(0, 100 - hot - iced);
  const avg = (hot * price.hot + flavored * price.flavored + iced * price.iced) / 100;
  const monthly = cups * avg * days;
  const yours = (monthly * share) / 100;
  const [open, setOpen] = useState<number | null>(0);
  return (
    <>
      <SiteHeader always />
      <main style={{ paddingTop: 64 }}>
        <section className="lsec lsec-sunk"><div className="container lpartner">
          <div><p className="label">For cafes</p><h1 className="lh1" style={{ fontSize: 'clamp(36px, 6vw, 64px)', maxWidth: '14ch' }}>{p?.headline || 'Run Sadhai at your cafe'}</h1>
            <p style={{ fontSize: 20, marginTop: 12, maxWidth: 520 }} className="muted">{p?.intro}</p>
            <div className="row wrap" style={{ marginTop: 20 }}><a className="btn primary lg" href="#apply">Apply to join</a><a className="btn ghost lg" href="#calc">See what it could earn</a></div></div>
          <img src="/img/scene-kiosk.svg" alt="A Sadhai counter with the cherry fascia and pickup screen" style={{ width: '100%', borderRadius: 20 }} />
        </div></section>

        <section className="lsec container">
          <p className="label">What you get</p><h2 className="lh2">We bring everything except your counter and your team</h2>
          <div className="grid g3" style={{ marginTop: 20 }}>{GET.map(([ic, t, d]) => <div key={t} className="card"><Icon name={ic} size={28} color="var(--cherry)" /><h3 style={{ margin: '10px 0 4px' }}>{t}</h3><p className="muted">{d}</p></div>)}</div>
        </section>

        <section id="calc" className="lsec lsec-sunk"><div className="container">
          <p className="label">An illustration</p><h2 className="lh2">What your share could look like</h2>
          <p className="muted" style={{ marginTop: 6, maxWidth: 640 }}>Move the sliders to match your cafe. This uses today’s standard prices and a {share}% share of net sales. It is an illustration, not a promise of income, and your terms are agreed in writing.</p>
          <div className="cols c-2" style={{ marginTop: 20 }}>
            <div className="card col" style={{ gap: 18 }}>
              <label className="col" style={{ gap: 6 }}><span className="row between"><strong>Sadhai drinks sold a day</strong><span>{cups}</span></span><input type="range" min={30} max={400} step={10} value={cups} onChange={(e) => setCups(+e.target.value)} aria-label="Drinks a day" /></label>
              <label className="col" style={{ gap: 6 }}><span className="row between"><strong>Hot coffee ({rs(price.hot)})</strong><span>{hot}%</span></span><input type="range" min={0} max={100 - iced} value={hot} onChange={(e) => setHot(+e.target.value)} aria-label="Share of hot coffee" /></label>
              <label className="col" style={{ gap: 6 }}><span className="row between"><strong>Iced ({rs(price.iced)})</strong><span>{iced}%</span></span><input type="range" min={0} max={100 - hot} value={iced} onChange={(e) => setIced(+e.target.value)} aria-label="Share of iced drinks" /></label>
              <div className="row between small muted"><span>Flavored ({rs(price.flavored)}): {flavored}%</span><span>Average {rs(Math.round(avg))} a cup</span></div>
              <label className="col" style={{ gap: 6 }}><span className="row between"><strong>Days open a month</strong><span>{days}</span></span><input type="range" min={15} max={31} value={days} onChange={(e) => setDays(+e.target.value)} aria-label="Days open a month" /></label>
            </div>
            <div className="card col" style={{ gap: 14, justifyContent: 'center' }}>
              <div><p className="label">Sadhai sales through your counter, a month</p><div className="kv" style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 40, letterSpacing: '-0.03em' }}>{rs(Math.round(monthly))}</div></div>
              <div><p className="label">Your share ({share}%), a month</p><div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 52, letterSpacing: '-0.03em', color: 'var(--hill)' }}>{rs(Math.round(yours))}</div><p className="small muted">About {rs(Math.round(yours / (cups * days)))} on every cup, before your own costs of staff, rent and power.</p></div>
              <p className="small muted">Your own food and drinks you sell yourself are not included.</p>
            </div>
          </div>
        </div></section>

        <section className="lsec container">
          <p className="label">Standards that make it Sadhai</p><h2 className="lh2">The same cup at every counter</h2>
          <div className="grid g3" style={{ marginTop: 20 }}>
            <div className="card"><h3>Standard recipes</h3><p className="muted" style={{ marginTop: 6 }}>Every drink follows the Sadhai recipe card: a 16 g double shot, set milk amounts, set syrups. Recipes are changed centrally, never at the counter.</p></div>
            <div className="card"><h3>One price</h3><p className="muted" style={{ marginTop: 6 }}>Hot coffee {rs(price.hot)}, flavored {rs(price.flavored)}, iced {rs(price.iced)}, all taxes included, the same everywhere.</p></div>
            <div className="card"><h3>90 seconds</h3><p className="muted" style={{ marginTop: 6 }}>Orders are timed. Late orders, cash differences and short deliveries show on a scorecard that both sides can see.</p></div>
          </div>
        </section>

        <section className="lsec lsec-sunk"><div className="container">
          <p className="label">How to join</p><h2 className="lh2">Live in about two weeks</h2>
          <ol className="grid g4" style={{ listStyle: 'none', padding: 0, marginTop: 20 }}>{(p?.steps || []).map((s: any, i: number) => <li key={i} className="card"><span className="lnum" style={{ background: 'var(--cherry)', color: 'var(--on-cherry)' }}>{i + 1}</span><h3 style={{ margin: '10px 0 4px' }}>{s.title}</h3><p className="muted small">{s.text}</p></li>)}</ol>
          <div className="cols c-2" style={{ marginTop: 28 }}>
            <div><h3>What we look for</h3><ul className="lticks">{(p?.requirements || []).map((r: string) => <li key={r}><Icon name="check" size={18} color="var(--hill)" />{r}</li>)}</ul></div>
            <div><h3>Questions</h3>{(p?.faqs || []).map((f: any, i: number) => (
              <div key={i} style={{ borderBottom: '1px solid var(--hairline)' }}>
                <button className="row between" style={{ all: 'unset', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', width: '100%', padding: '12px 0', fontWeight: 700, gap: 12 }} aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>{f.q}<Icon name={open === i ? 'minus' : 'plus'} size={18} /></button>
                {open === i && <p className="muted" style={{ paddingBottom: 12 }}>{f.a}</p>}
              </div>))}</div>
          </div>
        </div></section>

        <section id="apply" className="lsec container" style={{ maxWidth: 820 }}>
          <h2 className="lh2">Apply to join</h2><p className="muted" style={{ margin: '6px 0 16px' }}>{p?.contact_note}</p>
          <EnquiryForm kind="partner" />
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
