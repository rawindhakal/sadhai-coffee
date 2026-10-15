'use client';
import { useEffect, useState } from 'react';
import { api, rs } from '@/lib/api';
import { useSiteContent } from '@/lib/site-content';
import { EnquiryForm } from '@/components/enquiry';
import { Icon } from '@/components/icons';
import { SiteFooter, SiteHeader } from '@/components/sitechrome';

export default function InvestorsPage() {
  const site = useSiteContent();
  const v = site?.investors;
  const [eco, setEco] = useState<any>(null);
  useEffect(() => { api('/site/economics', { auth: false }).then(setEco).catch(() => {}); }, []);
  const total = (v?.use_of_funds || []).reduce((a: number, x: any) => a + x.pct, 0) || 1;
  const COLORS = ['var(--cherry)', 'var(--hill)', 'var(--marigold)', 'var(--roast)', 'var(--mist)'];
  return (
    <>
      <SiteHeader always />
      <main style={{ paddingTop: 64 }}>
        <section className="lsec lsec-sunk"><div className="container lpartner">
          <div><p className="label">Investors</p><h1 className="lh1" style={{ fontSize: 'clamp(34px, 5.5vw, 60px)', maxWidth: '16ch' }}>{v?.headline || 'Invest in Nepal’s everyday specialty coffee'}</h1>
            <p style={{ fontSize: 20, marginTop: 12, maxWidth: 540 }} className="muted">{v?.intro}</p>
            <div className="row wrap" style={{ marginTop: 20 }}><a className="btn primary lg" href="#talk">Talk to us</a>{v?.deck_url && <a className="btn ghost lg" href={v.deck_url} target="_blank" rel="noreferrer">Read the deck</a>}</div></div>
          <img src="/img/scene-farm.svg" alt="Coffee terraces in the Nepali hills" style={{ width: '100%', borderRadius: 20 }} />
        </div></section>

        {v?.metrics?.length > 0 && (
          <section className="lsec container"><p className="label">Where we are</p><h2 className="lh2">The numbers, as reported by management</h2>
            <div className="grid g4" style={{ marginTop: 20 }}>{v.metrics.map((m: any, i: number) => <div key={i} className="card"><div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 36, letterSpacing: '-0.03em', color: 'var(--cherry)' }}>{m.value}</div><strong>{m.label}</strong>{m.note && <p className="small muted">{m.note}</p>}</div>)}</div>
          </section>
        )}

        <section className="lsec container"><p className="label">Why Sadhai</p><h2 className="lh2">A simple idea, built to repeat</h2>
          <div className="grid g3" style={{ marginTop: 20 }}>{(v?.why || []).map((w: string, i: number) => <div key={i} className="card"><span className="lnum" style={{ background: 'var(--cherry)', color: 'var(--on-cherry)' }}>{i + 1}</span><p style={{ marginTop: 10 }}>{w}</p></div>)}</div>
        </section>

        <section className="lsec lsec-sunk"><div className="container">
          <div className="cols c-2">
            <div><p className="label">The model</p><h2 className="lh2">How it makes money</h2><ul className="lticks">{(v?.model || []).map((m: string) => <li key={m}><Icon name="check" size={18} color="var(--hill)" />{m}</li>)}</ul></div>
            <div>
              <p className="label">Unit economics</p><h2 className="lh2">Per cup</h2>
              {eco?.enabled ? (
                <div className="card tablewrap" style={{ marginTop: 12 }}><table><thead><tr><th>Drink</th><th className="num">Price</th><th className="num">Recipe cost</th><th className="num">Margin</th><th className="num">Food cost</th></tr></thead>
                  <tbody>{eco.tiers.map((t: any) => <tr key={t.tier}><td style={{ textTransform: 'capitalize' }}>{t.tier}</td><td className="num">{rs(t.price)}</td><td className="num">{rs(t.cost)}</td><td className="num">{rs(t.margin)}</td><td className="num">{t.food_cost_pct}%</td></tr>)}</tbody></table>
                  <p className="small muted" style={{ marginTop: 8 }}>{eco.note}</p></div>
              ) : <div className="card" style={{ marginTop: 12 }}><p className="muted">Detailed unit economics are shared with serious investors in conversation.</p></div>}
            </div>
          </div>
        </div></section>

        <section className="lsec container">
          <div className="cols c-2">
            <div><p className="label">Roadmap</p><h2 className="lh2">Where we are heading</h2>
              <div className="col" style={{ marginTop: 16, gap: 14 }}>{(v?.roadmap || []).map((r: any, i: number) => <div key={i} className="row" style={{ alignItems: 'flex-start' }}><span className="chip hill" style={{ minWidth: 70, justifyContent: 'center' }}>{r.when}</span><span>{r.what}</span></div>)}</div></div>
            {v?.use_of_funds?.length > 0 && <div><p className="label">Use of funds</p><h2 className="lh2">Where the money goes</h2>
              <div style={{ display: 'flex', height: 22, borderRadius: 99, overflow: 'hidden', margin: '16px 0' }} role="img" aria-label="Use of funds">{v.use_of_funds.map((u: any, i: number) => <span key={i} title={`${u.label} ${u.pct}%`} style={{ width: `${(u.pct / total) * 100}%`, background: COLORS[i % COLORS.length] }} />)}</div>
              <div className="col small" style={{ gap: 6 }}>{v.use_of_funds.map((u: any, i: number) => <div key={i} className="row between"><span><i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: COLORS[i % COLORS.length], marginRight: 8 }} />{u.label}</span><strong>{u.pct}%</strong></div>)}</div></div>}
          </div>
        </section>

        <section className="lsec lsec-sunk"><div className="container" style={{ maxWidth: 820 }}>
          <p className="label">Honest about the risks</p><h2 className="lh2">What could go wrong</h2>
          <ul className="legal" style={{ marginTop: 12 }}>{(v?.risks || []).map((r: string) => <li key={r}>{r}</li>)}</ul>
        </div></section>

        <section id="talk" className="lsec container" style={{ maxWidth: 820 }}>
          <h2 className="lh2">Talk to us</h2><p className="muted" style={{ margin: '6px 0 16px' }}>{v?.contact_note}</p>
          <EnquiryForm kind="investor" />
          <p className="small muted" style={{ marginTop: 16 }}>This page is for information only. It is not an offer to sell, or a request to buy, any shares or securities, and nothing here is financial advice. Figures marked as management’s are unaudited. Any investment is made only under written agreements, and early-stage investments can lose all of their value.</p>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
