'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { LegalPage } from '@/components/legal';
import { SITE } from '@/lib/site';
import { ErrorNote, Field } from '@/components/ui';

export default function DeleteAccount() {
  const { user, logout } = useAuth();
  const [pw, setPw] = useState('');
  const [sure, setSure] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  async function del() {
    setErr(null);
    try { await api('/me', { method: 'DELETE', body: { password: pw } }); await logout(); setDone(true); } catch (e: any) { setErr(e.message); }
  }
  return (
    <LegalPage title="Delete your account">
      {done ? <div className="card"><h3>Your account has been deleted</h3><p>Your name, phone, email and messages are gone. Thank you for drinking Sadhai.</p></div> : (
        <>
          <p>You can delete your Sadhai account at any time. This is what happens:</p>
          <ul>
            <li>Your name, phone number, email, notification token and in-app messages are erased.</li>
            <li>Unused coupons and any pass with cups left expire. They cannot be restored or refunded after deletion.</li>
            <li>Order and payment records stay, with your identity removed, because tax and accounting law requires us to keep them.</li>
            <li>You can sign up again later with the same number. It will be a new account.</li>
          </ul>
          {user?.role === 'customer' ? (
            <div className="card col" style={{ marginTop: 16, maxWidth: 440 }}>
              <h3>Delete the account for {user.phone}</h3>
              <Field label="Confirm with your password"><input type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
              <label className="row small"><input type="checkbox" style={{ width: 20, minHeight: 20 }} checked={sure} onChange={(e) => setSure(e.target.checked)} />I understand this cannot be undone.</label>
              <ErrorNote error={err} />
              <button className="btn danger" disabled={!pw || !sure} onClick={del}>Delete my account</button>
            </div>
          ) : (
            <div className="card" style={{ marginTop: 16 }}>
              <h3>Sign in to delete your account</h3>
              <p className="muted">You can also do this in the app under Account, Profile. If you cannot sign in, email <a href={`mailto:${SITE.privacyEmail}?subject=Delete%20my%20account`}>{SITE.privacyEmail}</a> from the address on your account or tell us your registered mobile number, and we will delete it within 30 days.</p>
              <a className="btn primary" href="/login">Sign in</a>
            </div>
          )}
        </>
      )}
    </LegalPage>
  );
}
