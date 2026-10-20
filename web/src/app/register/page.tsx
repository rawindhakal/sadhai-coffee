'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Shell, Field, ErrorNote } from '@/components/ui';
import { useAuth } from '@/lib/auth';

function Form() {
  const { register } = useAuth();
  const router = useRouter();
  const sp = useSearchParams();
  const [f, setF] = useState({ name: '', phone: '', password: '', referral_code: sp.get('ref') || '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [agree, setAgree] = useState(false);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try { await register({ ...f, referral_code: f.referral_code || undefined }); router.replace('/order'); } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  }
  return (
    <form className="card col" style={{ maxWidth: 440, margin: '32px auto', gap: 16 }} onSubmit={submit}>
      <h2>Create your account</h2>
      <p className="muted">Create an account, then order ahead in the app.</p>
      <Field label="Name"><input value={f.name} onChange={set('name')} autoComplete="name" required minLength={2} /></Field>
      <Field label="Mobile number"><input inputMode="tel" placeholder="98XXXXXXXX" value={f.phone} onChange={set('phone')} autoComplete="tel" required /></Field>
      <Field label="Password" hint="At least 6 characters"><input type="password" value={f.password} onChange={set('password')} autoComplete="new-password" required minLength={6} /></Field>
      <Field label="Referral code (optional)"><input value={f.referral_code} onChange={(e) => setF({ ...f, referral_code: e.target.value.toUpperCase() })} /></Field>
      <label className="row small" style={{ alignItems: 'flex-start' }}><input type="checkbox" style={{ width: 20, minHeight: 20, marginTop: 2 }} checked={agree} onChange={(e) => setAgree(e.target.checked)} required /><span>I agree to the <a href="/terms" target="_blank">Terms of use</a> and have read the <a href="/privacy" target="_blank">Privacy policy</a>.</span></label>
      <ErrorNote error={error} />
      <button className="btn primary block" disabled={busy || !agree}>{busy ? 'Creating…' : 'Create account'}</button>
      <p className="small muted center">Already have an account? <Link href="/login">Sign in</Link></p>
    </form>
  );
}
export default function Register() { return <Shell wide={false}><Suspense><Form /></Suspense></Shell>; }
