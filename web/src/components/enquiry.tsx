'use client';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api';
import { ErrorNote, Field } from './ui';

/** Partner and investor enquiry form. Consent is required, and a hidden field catches bots. */
export function EnquiryForm({ kind }: { kind: 'partner' | 'investor' }) {
  const [f, setF] = useState({ name: '', email: '', phone: '', org: '', city: '', message: '', extra: '', consent: false, website: '' });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      await api('/enquiries', { method: 'POST', auth: false, body: { kind, name: f.name, email: f.email || undefined, phone: f.phone || undefined, org: f.org || undefined, city: f.city || undefined, message: f.message || undefined, extra: f.extra ? { [kind === 'partner' ? 'cups_per_day' : 'ticket']: f.extra } : undefined, consent: f.consent, website: f.website } });
      setDone(true);
    } catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  }
  if (done) return <div className="card" role="status"><h3>Thank you. We have your message.</h3><p className="muted" style={{ marginTop: 6 }}>{kind === 'partner' ? 'We reply within two working days.' : 'We will be in touch with the next steps.'}</p></div>;
  return (
    <form className="card col" onSubmit={submit} style={{ gap: 14 }} aria-label={kind === 'partner' ? 'Partner enquiry' : 'Investor enquiry'}>
      <div className="grid g2">
        <Field label="Your name"><input required minLength={2} value={f.name} onChange={set('name')} autoComplete="name" /></Field>
        <Field label={kind === 'partner' ? 'Cafe name' : 'Organisation (optional)'}><input value={f.org} onChange={set('org')} required={kind === 'partner'} /></Field>
        <Field label="Email"><input type="email" value={f.email} onChange={set('email')} autoComplete="email" /></Field>
        <Field label="Phone"><input inputMode="tel" value={f.phone} onChange={set('phone')} autoComplete="tel" /></Field>
        <Field label={kind === 'partner' ? 'Town or area' : 'City'}><input value={f.city} onChange={set('city')} /></Field>
        {kind === 'partner' ? <Field label="Cups you sell a day now (roughly)"><input inputMode="numeric" value={f.extra} onChange={set('extra')} /></Field>
          : <Field label="Roughly how much are you considering?"><select value={f.extra} onChange={set('extra')}><option value="">Prefer to discuss</option><option>Under Rs 10 lakh</option><option>Rs 10 to 50 lakh</option><option>Rs 50 lakh to 2 crore</option><option>Over Rs 2 crore</option></select></Field>}
      </div>
      <Field label="Anything you would like us to know"><textarea value={f.message} onChange={set('message')} maxLength={1000} /></Field>
      <input name="website" tabIndex={-1} autoComplete="off" value={f.website} onChange={set('website')} aria-hidden style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }} />
      <label className="row small" style={{ alignItems: 'flex-start' }}><input type="checkbox" style={{ width: 20, minHeight: 20, marginTop: 2 }} checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} required /><span>I agree that Sadhai Coffee may contact me about this. See the <Link href="/privacy" target="_blank">Privacy policy</Link>.</span></label>
      <ErrorNote error={err} />
      <button className="btn primary lg" disabled={busy || !f.consent}>{busy ? 'Sending…' : 'Send'}</button>
    </form>
  );
}
