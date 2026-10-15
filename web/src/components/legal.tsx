import { Logo } from './logo';
import Link from 'next/link';
import { SITE } from '@/lib/site';
import { APP_VERSION } from '@/lib/version';

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <header className="topbar"><div className="container" style={{ maxWidth: 820 }}><Logo /><div className="grow" /><nav className="row small" aria-label="Legal"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/support">Support</Link></nav></div></header>
      <main className="container legal" style={{ maxWidth: 820, padding: '32px 16px 80px' }}>
        <h1>{title}</h1>
        <p className="muted small" style={{ margin: '6px 0 24px' }}>Last updated {SITE.updated} · App version {APP_VERSION}</p>
        {children}
      </main>
    </>
  );
}
