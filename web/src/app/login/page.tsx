'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Shell, Field, ErrorNote } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { home } from '@/lib/api';

export default function Login() {
  const { login } = useAuth();
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try { const u = await login(phone, password); router.replace(home(u.role)); } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  }
  return (
    <Shell wide={false}>
      <form className="card col" style={{ maxWidth: 440, margin: '32px auto', gap: 16 }} onSubmit={submit}>
        <h2>Sign in</h2>
        <Field label="Mobile number"><input inputMode="tel" autoComplete="tel" placeholder="98XXXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} required /></Field>
        <Field label="Password"><input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
        <ErrorNote error={error} />
        <button className="btn primary block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="small muted center">New here? <Link href="/register">Create an account</Link></p>
      </form>
    </Shell>
  );
}
