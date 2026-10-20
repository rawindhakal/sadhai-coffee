import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/logo';
import { APP_VERSION } from '@/lib/version';

export const metadata: Metadata = {
  title: 'Changelog · Sadhai Coffee',
  description: 'Complete release history, platform updates, and feature improvements for Sadhai Coffee web and mobile apps.',
};

interface Release {
  version: string;
  date: string;
  badge?: string;
  highlight: string;
  changes: {
    category: 'Added' | 'Changed' | 'Fixed' | 'Security';
    items: { title: string; desc: string }[];
  }[];
}

const RELEASES: Release[] = [
  {
    version: '1.6.3',
    date: '20 October 2026',
    badge: 'Latest',
    highlight: '10-Cup Pass Wallet, Live Sync, Dedicated Passes Reporting, Station Kiosk QR & Dual Keyboards',
    changes: [
      {
        category: 'Added',
        items: [
          {
            title: 'Dedicated Passes & Wallet Report',
            desc: 'New financial reporting section on owner and manager dashboards tracking passes sold, revenue, cups redeemed, redemption rates, outstanding NPR liabilities, breakage profit from expired cups, station redemption breakdown with reimbursement estimations, and full searchable pass ledger with CSV export.',
          },
          {
            title: 'Kiosk Station QR Code ("Order on Phone")',
            desc: 'Prominent station-unique QR code displayed on the kiosk idle attract screen and top navigation bar, allowing customers to scan with their phone camera and order directly from that station on mobile web.',
          },
          {
            title: 'Kiosk On-Screen QWERTY & Number Keyboards',
            desc: 'Touch-optimized on-screen QWERTY keyboard with shift, backspace, and space for entering customer name on touchscreens without physical keyboards, paired with a large numeric keypad for mobile phone numbers.',
          },
          {
            title: 'Centralized Offers Endpoint (/offers)',
            desc: 'Unified backend endpoint delivering network-wide and station-specific daily offers, limited monthly drops, and pass configurations centrally to both web and mobile apps.',
          },
          {
            title: 'Public Web Changelog Page (/changelog)',
            desc: 'Dedicated release history and update portal keeping customers, partners, and operators informed on all ongoing platform improvements.',
          },
        ],
      },
      {
        category: 'Changed',
        items: [
          {
            title: 'Stacked Wallet UI for 10-Cup Passes',
            desc: 'When multiple passes are purchased, passes are stacked into an organized digital wallet. Customers see total available cups at a glance, the currently active pass on top with its SP code and cup dots, and queued passes stacked neatly behind with one-tap switching.',
          },
          {
            title: 'Active Coupons & Deals Display',
            desc: 'Harmonized My Coupons section across web and mobile showing clear validity dates, discount badges, and checkout auto-application instructions.',
          },
        ],
      },
      {
        category: 'Fixed',
        items: [
          {
            title: 'Live Pass Updating After Checkout',
            desc: 'Implemented state invalidation signal (passEpoch) in CartState so that checking out with a pass immediately updates remaining cup counts across the Cart, Offers screen, and Pass wallet without requiring app restart or manual pull-to-refresh.',
          },
          {
            title: 'Android Pickup Time Display',
            desc: 'Fixed pickup times failing to appear on Android by binding station load events and guaranteeing the pickup window section ("As soon as possible" / "Later today") renders consistently for all active stations.',
          },
        ],
      },
    ],
  },
  {
    version: '1.6.2',
    date: '20 October 2026',
    highlight: 'Simplified Home Page and Unified Web & Mobile Checkout',
    changes: [
      {
        category: 'Changed',
        items: [
          {
            title: 'Simplified Home Page',
            desc: 'Removed unnecessary marketing clutter from the web home page: stripped the simulated 90-second BrewLab timer, profile figures, and redundant partner recruitment banners. Unified data and pricing identically across platforms.',
          },
          {
            title: 'Streamlined Checkout Experience',
            desc: 'Removed promo code input from mobile and web checkout to keep ordering fast and focused on active daily deals and 10-cup passes.',
          },
        ],
      },
    ],
  },
  {
    version: '1.6.1',
    date: '16 October 2026',
    highlight: 'Owner Data Management, Full CRUD User Administration, Menu Studio & Android Production Build',
    changes: [
      {
        category: 'Added',
        items: [
          {
            title: 'Owner Data Backup, Restore & Selective Reset',
            desc: 'One-click full JSON database backup export, password-protected restore with validation, and granular selective reset for testing and audits.',
          },
          {
            title: 'User & Manager Administration Console',
            desc: 'Full CRUD management console for users and outlet managers with role tabs, search filters, credential updates, and safety protections.',
          },
          {
            title: 'Menu Studio & Outlet-Specific Pricing',
            desc: 'Full CRUD for menu categories and products, photo uploading with URL preview, station-level price overrides, and recipe inventory linkage.',
          },
          {
            title: 'Production Android APK Toolchain',
            desc: 'Configured OpenJDK 17 and Android SDK 36 toolchain for release builds with ProGuard obfuscation and resource shrinking.',
          },
        ],
      },
      {
        category: 'Fixed',
        items: [
          {
            title: 'Nginx CORS Preflight Headers',
            desc: 'Configured cross-origin resource sharing headers on sadhaicoffee.com to support direct API calls from mobile apps and local development.',
          },
          {
            title: 'Flutter UI Assertion & Overflow Bugs',
            desc: 'Resolved RoundedRectangleBorder assertion in category boxes and right-side overflow on banner headings.',
          },
        ],
      },
    ],
  },
  {
    version: '1.6.0',
    date: '15 October 2026',
    highlight: 'Modern Home Page, Illustrated Assets & Dynamic CMS',
    changes: [
      {
        category: 'Added',
        items: [
          {
            title: 'New Illustrated Home Page',
            desc: 'Live hero, animated illustrated beans and baristas, 90-second brew simulator, live counters finder with nearest-first geolocation, and dynamic CMS content editor in dashboard.',
          },
        ],
      },
      {
        category: 'Fixed',
        items: [
          {
            title: 'Station Operating Hours Validation',
            desc: 'Station hours now validate cleanly with 24-hour time formats, preventing database crashes on save.',
          },
        ],
      },
    ],
  },
  {
    version: '1.5.0',
    date: '15 October 2026',
    highlight: 'Scheduled Pickup Window & Station Safety Controls',
    changes: [
      {
        category: 'Added',
        items: [
          {
            title: 'Pickup Later Today',
            desc: 'Pre-order coffee for pickup at a specific time later in the day within outlet opening hours.',
          },
          {
            title: 'Station Status Lockdown',
            desc: 'Closed and paused stations are automatically locked with clear notices preventing invalid orders.',
          },
        ],
      },
    ],
  },
  {
    version: '1.4.0',
    date: '15 October 2026',
    highlight: 'Fonepay QR Payment & 4-Digit Pickup Handover Verification',
    changes: [
      {
        category: 'Added',
        items: [
          {
            title: 'Fonepay QR Direct Integration',
            desc: 'Nepal-native QR payment integration supporting all mobile banking and digital wallet apps.',
          },
          {
            title: '4-Digit Handover Verification',
            desc: 'Secure pickup code spoken at the counter before drinks are handed over by the barista.',
          },
        ],
      },
    ],
  },
];

export default function ChangelogPage() {
  return (
    <>
      <header className="topbar">
        <div className="container" style={{ maxWidth: 860, display: 'flex', alignItems: 'center', gap: 16 }}>
          <Logo />
          <span className="chip marigold" style={{ fontSize: 13 }}>v{APP_VERSION}</span>
          <div className="grow" />
          <nav className="row small" style={{ gap: 16 }}>
            <Link href="/order">Menu</Link>
            <Link href="/offers">Offers</Link>
            <Link href="/downloads/sadhai-coffee.apk" className="btn sm primary">Get Android App</Link>
          </nav>
        </div>
      </header>

      <main className="container" style={{ maxWidth: 860, padding: '40px 16px 120px' }}>
        <div className="row between wrap" style={{ alignItems: 'flex-start', marginBottom: 32 }}>
          <div>
            <h1 style={{ fontSize: 'clamp(32px, 5vw, 44px)', lineHeight: 1.1 }}>Product Changelog</h1>
            <p className="muted" style={{ fontSize: 18, marginTop: 8 }}>
              All notable updates, new features, and improvements across the Sadhai platform.
            </p>
          </div>
          <a
            href="https://github.com/rawindhakal/sadhai-coffee"
            target="_blank"
            rel="noopener noreferrer"
            className="btn ghost sm"
            style={{ marginTop: 8 }}
          >
            GitHub Repository ↗
          </a>
        </div>

        <div className="col" style={{ gap: 40 }}>
          {RELEASES.map((rel) => (
            <article key={rel.version} className="card" style={{ padding: '28px 32px', borderRadius: 24 }}>
              <div className="row between wrap" style={{ marginBottom: 12, alignItems: 'center' }}>
                <div className="row" style={{ gap: 12, alignItems: 'center' }}>
                  <h2 style={{ fontSize: 28, margin: 0 }}>v{rel.version}</h2>
                  {rel.badge && <span className="chip hill" style={{ fontWeight: 700 }}>{rel.badge}</span>}
                </div>
                <time className="small muted" style={{ fontSize: 14 }}>{rel.date}</time>
              </div>

              <p style={{ fontSize: 17, fontWeight: 600, color: 'var(--cherry)', marginBottom: 20 }}>
                {rel.highlight}
              </p>

              <div className="col" style={{ gap: 20 }}>
                {rel.changes.map((group, gIdx) => (
                  <div key={gIdx}>
                    <h3
                      style={{
                        fontSize: 14,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        color: group.category === 'Added' ? 'var(--hill)' : group.category === 'Fixed' ? 'var(--cherry)' : 'var(--ink-muted)',
                        marginBottom: 10,
                      }}
                    >
                      {group.category}
                    </h3>
                    <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {group.items.map((it, iIdx) => (
                        <li key={iIdx} style={{ lineHeight: 1.5 }}>
                          <strong>{it.title}:</strong> <span style={{ color: 'var(--ink-muted)' }}>{it.desc}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </main>
    </>
  );
}
