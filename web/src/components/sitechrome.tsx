'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { home } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { LangToggle, useI18n } from '@/lib/i18n';
import { APP_VERSION } from '@/lib/version';
import { Logo } from './logo';

/** Header and footer shared by the home, partner, investor and legal pages. */
export function SiteHeader({ always = false }: { always?: boolean }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const [scrolled, setScrolled] = useState(always);
  useEffect(() => { const on = () => setScrolled(always || window.scrollY > 24); on(); window.addEventListener('scroll', on, { passive: true }); return () => window.removeEventListener('scroll', on); }, [always]);
  return (
    <header className={`lnav ${scrolled ? 'solid' : ''}`}>
      <div className="container row" style={{ minHeight: 64 }}>
        <Logo />
        <nav className="lnavlinks hide-sm" aria-label="Page"><Link href="/#how">How it works</Link><Link href="/#menu">Menu</Link><Link href="/#pass">Pass</Link><Link href="/partners">For cafes</Link><Link href="/investors">Investors</Link></nav>
        <div className="grow" /><LangToggle />
        {user ? <Link className="btn primary sm" href={home(user.role)}>Open app</Link> : <><Link className="btn ghost sm hide-sm" href="/login">Sign in</Link><Link className="btn primary sm" href="/order">{t('order_ahead')}</Link></>}
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="lfoot"><div className="container">
      <div className="row between wrap" style={{ gap: 24, alignItems: 'flex-start' }}>
        <div><Logo /><p className="small muted" style={{ marginTop: 8, maxWidth: 320 }}>Nepal’s everyday specialty coffee. Grown in the hills, roasted in Nepal, ready in 90 seconds.</p></div>
        <div className="col small" style={{ gap: 6 }}><strong>Company</strong><Link href="/#story">Our story</Link><Link href="/partners">Run Sadhai at your cafe</Link><Link href="/investors">Investors</Link><Link href="/support">Support</Link></div>
        <div className="col small" style={{ gap: 6 }}><strong>Legal</strong><Link href="/privacy">Privacy policy</Link><Link href="/terms">Terms of use</Link><Link href="/delete-account">Delete your account</Link></div>
        <div className="col small" style={{ gap: 6 }}><strong>Staff</strong><Link href="/station">Station</Link><Link href="/manager">Manager</Link><Link href="/owner">Owner</Link><Link href="/help">Help and workflows</Link></div>
      </div>
      <p className="small muted" style={{ marginTop: 24 }}>Prices in NPR. VAT and service included. · Version {APP_VERSION}</p>
    </div></footer>
  );
}
