'use client';
import { Logo } from './logo';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useCart } from '@/lib/cart';
import { LangToggle } from '@/lib/i18n';
import { rs } from '@/lib/api';
import { Icon } from './icons';

export const PAY_LABEL: Record<string, string> = { cash: 'Cash at counter', fonepay: 'Fonepay', esewa: 'eSewa', khalti: 'Khalti', pass: '10-cup pass' };
export { LangToggle };

const TABS = [
  { href: '/order', label: 'Home', icon: 'home' },
  { href: '/offers', label: 'Offers', icon: 'tag' },
  { href: '/cart', label: 'Cart', icon: 'cart' },
  { href: '/orders', label: 'Orders', icon: 'receipt' },
  { href: '/account', label: 'Account', icon: 'user' },
];

/** Mobile-first customer frame: content column plus a bottom bar where the cart is the centre action. */
export function CustomerShell({ children, bare }: { children: React.ReactNode; bare?: boolean }) {
  const path = usePathname();
  const { count, total } = useCart();
  const { user } = useAuth();
  return (
    <>
      {!bare && (
        <header className="topbar"><div className="container" style={{ maxWidth: 760 }}>
          <Logo /><div className="grow" />
          {!user && <Link className="btn primary sm" href="/login">Sign in</Link>}
        </div></header>
      )}
      <main className="container" style={{ maxWidth: 760, paddingTop: 16, paddingBottom: 120 }}>{children}</main>
      {path !== '/cart' && count > 0 && (
        <Link href="/cart" className="cartstrip" aria-label={`View cart, ${count} items, ${rs(total)}`}>
          <span className="row"><span className="cartcount">{count}</span><strong>View cart</strong></span><strong>{rs(total)}</strong>
        </Link>
      )}
      <nav className="bottomnav" aria-label="Customer">
        {TABS.map((t) => {
          const on = path === t.href || (t.href !== '/order' && path.startsWith(t.href + '/')) || (t.href === '/order' && path.startsWith('/order/'));
          const isCart = t.href === '/cart';
          return (
            <Link key={t.href} href={t.href} className={`${on ? 'on' : ''} ${isCart ? 'cartbtn' : ''}`} aria-current={on ? 'page' : undefined}>
              <span className="ico">{isCart ? <><Icon name="cart" size={24} />{count > 0 && <b className="badge">{count}</b>}</> : <Icon name={t.icon} />}</span>
              <span>{t.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
