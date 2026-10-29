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
    version: '2.1.1',
    date: '29 October 2026',
    badge: 'Latest',
    highlight: 'Fonepay works with just the merchant code and secret key',
    changes: [{ category: 'Added', items: [{ title: 'Fonepay web payment', desc: 'The QR opens Fonepay’s payment page on the live server (clientapi.fonepay.com) and the order starts when Fonepay confirms. The QR service with its own login is still available.' }] }],
  },
  {
    version: '2.1.0',
    date: '29 October 2026',
    highlight: 'Payments rebuilt: Fonepay dynamic QR only',
    changes: [
      { category: 'Changed', items: [
        { title: 'One way to pay online', desc: 'Every order gets its own Fonepay QR for the exact amount. The order starts the moment Fonepay says it is paid.' },
        { title: 'Check connection', desc: 'Settings, Payments shows exactly what Fonepay answered, so a wrong login or environment is easy to see.' },
      ] },
      { category: 'Changed', items: [{ title: 'Older payment options removed', desc: 'eSewa, NepalPay, the web payment redirect and the printed-QR fallback are gone.' }] },
    ],
  },
  {
    version: '2.0.3',
    date: '29 October 2026',
    highlight: 'Fonepay and NepalPay QR from your merchant and terminal ID',
    changes: [{ category: 'Added', items: [{ title: 'QR with no QR login', desc: 'The kiosk and counter build a Fonepay-format QR for the exact amount from the merchant ID and terminal ID. The barista presses Payment received once it is paid.' }] }],
  },
  {
    version: '2.0.2',
    date: '27 October 2026',
    highlight: 'Real dynamic QR for Fonepay and NepalPay',
    changes: [{ category: 'Added', items: [
      { title: 'Real dynamic QR', desc: 'Fonepay and NepalPay now show their own QR for the exact amount, and the order starts by itself when it is paid. Needs the QR user name and password from the gateway.' },
      { title: 'Your printed QR', desc: 'Without those, the kiosk and counter can make a QR for the exact amount from the shop QR. The barista presses Payment received.' },
    ] }],
  },
  {
    version: '2.0.1',
    date: '27 October 2026',
    highlight: 'NepalPay QR needs only a merchant code and secret key',
    changes: [{ category: 'Fixed', items: [{ title: 'NepalPay QR', desc: 'It now works with just the merchant code and secret key you were given, on the website, app, kiosk and counter.' }] }],
  },
  {
    version: '2.0.0',
    date: '27 October 2026',
    highlight: 'Pay by QR in a window, NepalPay QR, one set of ordering rules',
    changes: [
      {
        category: 'Added',
        items: [
          { title: 'NepalPay QR', desc: 'Customers scan a QR with any NepalPay bank or wallet app and pay the exact amount.' },
          { title: 'Real Fonepay QR', desc: 'Fonepay now shows a real QR for the exact amount when its QR service is set up.' },
          { title: 'Pay window', desc: 'The QR opens as a window on the same page, with a clear status. It closes by itself once you have paid, and the order goes to the barista.' },
          { title: 'Order flow', desc: 'The owner sets how ordering works for the app, website, kiosk, kiosk QR and counter in one place, and every screen follows it.' },
          { title: 'Live menu', desc: 'Change the menu, an add-on or a price and every open screen shows it straight away.' },
          { title: '3D coffee', desc: 'Turn the cup on the home page, try a hot, flavoured or iced drink, and order from it.' },
        ],
      },
      {
        category: 'Changed',
        items: [
          { title: 'Dashboard menu', desc: 'The sidebar now has groups, pages and sub-pages, with a path at the top, so every part of Settings, Staff, Inventory and the home page editor is its own page.' },
        ],
      },
      {
        category: 'Fixed',
        items: [
          { title: 'New order at the counter', desc: 'The New order screen no longer crashes when it opens.' },
          { title: 'Kiosk payment QR', desc: 'The kiosk shows the real payment QR, not a test one.' },
        ],
      },
    ],
  },
  {
    version: '1.9.0',
    date: '24 October 2026',
    highlight: 'Pay with eSewa or Fonepay',
    changes: [
      {
        category: 'Added',
        items: [
          { title: 'eSewa and Fonepay', desc: 'Pay online on the website, in the app, at the kiosk by scanning a QR, or at the counter. You can also buy a 10-cup pass online. Cash and passes still work.' },
          { title: 'Safer online orders', desc: 'An order waits for the payment, goes to the barista only when it is confirmed, and is cancelled if nobody pays within 15 minutes.' },
        ],
      },
    ],
  },
  {
    version: '1.8.0',
    date: '24 October 2026',
    highlight: 'Simpler settings, a home page you can edit, and one rule for sales',
    changes: [
      {
        category: 'Changed',
        items: [
          { title: 'One rule for sales', desc: 'A sale is an order that has been handed over. Every report agrees, and orders still in the queue show as waiting to be collected.' },
          { title: 'Home page editor matches the home page', desc: 'Change the main picture, headline, buttons, banner, menu pictures and the partner and investor pages, with a preview.' },
          { title: 'Settings hold only what is used', desc: 'Prices and rules, app and company details, and data backup.' },
        ],
      },
      {
        category: 'Fixed',
        items: [
          { title: 'SMS and push notifications removed', desc: 'They are gone from the server, the website and the apps for now. Order updates still appear live and in the inbox.' },
        ],
      },
    ],
  },
  {
    version: '1.7.0',
    date: '24 October 2026',
    highlight: 'No online payments: cash at the counter or a 10-cup pass',
    changes: [
      {
        category: 'Changed',
        items: [
          { title: 'Cash or pass only', desc: 'Orders are paid with cash when the customer collects, or with a 10-cup pass. Orders go straight to the station when placed. Customers cannot cancel; the station can decline an order with a reason.' },
          { title: 'Passes are sold at the counter', desc: 'A 10-cup pass is sold for cash at any station counter and appears in the customer account at once.' },
        ],
      },
      {
        category: 'Fixed',
        items: [
          { title: 'Removed every payment gateway', desc: 'eSewa, Khalti and Fonepay are removed from the API, apps, kiosk, counter POS, owner settings, legal pages and store listings. Older orders stay in reports as "Online (old)".' },
        ],
      },
    ],
  },
  {
    version: '1.6.8',
    date: '23 October 2026',
    highlight: 'Official eSewa ePay v2 Gateway Integration & QR Payment Retirement',
    changes: [
      {
        category: 'Added',
        items: [
          {
            title: 'Official eSewa ePay v2 Web & App Integration',
            desc: 'Implemented the official eSewa ePay v2 checkout protocol (developer.esewa.com.np/pages/Epay) with HMAC-SHA256 signature generation, auto-submitting POST form, return callback signature verification, and server-to-server transaction status lookup API across Web, Android, and 10-cup pass purchases.',
          },
          {
            title: 'eSewa Control Center in Owner Studio',
            desc: 'Added dedicated eSewa ePay settings panel with master switch, auto/live/sandbox/off mode toggles, credential masking, status check connectivity tester, and 30-day analytics.',
          },
        ],
      },
      {
        category: 'Changed',
        items: [
          {
            title: 'Retirement of Alternative Gateways & Payment QR Codes',
            desc: 'Completely removed all legacy and unofficial payment gateway integrations (Fonepay, Khalti) and all payment QR functionality. Payment options are now strictly Cash at counter, official eSewa (ePay v2), and 10-cup passes.',
          },
        ],
      },
    ],
  },
  {
    version: '1.6.7',
    date: '21 October 2026',
    badge: 'Latest',
    highlight: 'Official eSewa ePay v2, Khalti KPG-2 & Fonepay PG + Dynamic QR, Switchable Gateways & Separated Payment/SMS Dashboard',
    changes: [
      {
        category: 'Added',
        items: [
          {
            title: 'Official eSewa ePay v2, Khalti KPG-2 & Fonepay PG + Dynamic QR',
            desc: 'Full official implementation of eSewa ePay v2 (HMAC-SHA256 signed form POST, callback verification & status lookup API), Khalti KPG-2 (/epayment/initiate/ & /epayment/lookup/ with pidx checkout URL), and Fonepay Web/Flutter PG (HMAC-SHA512 merchantRequest) alongside scannable Dynamic QR codes on Web, Android, iOS, Kiosk, and Counter POS.',
          },
          {
            title: 'Switchable Payment Gateways & SMS Features',
            desc: 'Every payment gateway (Fonepay, eSewa, Khalti, Cash) and NestSMS feature (Master SMS, Phone OTP, Order-Ready SMS, Welcome/Referral SMS) can now be switched ON or OFF and toggled between Sandbox and Live independently in real time.',
          },
          {
            title: 'Separated Payment & SMS Gateway Control Center',
            desc: 'New dedicated Payment & SMS dashboard in Owner Admin with 6 organized tabs, 30-day transaction and SMS KPIs, one-click Sandbox/Live endpoint presets, copyable callback/webhook URLs, and interactive live QR test previews.',
          },
        ],
      },
      {
        category: 'Fixed',
        items: [
          {
            title: 'Payment Callback Redirect & eSewa Query Normalization',
            desc: 'Fixed eSewa and Khalti browser callback redirects to /order/:id and handled eSewa callback ?data= query string formatting.',
          },
        ],
      },
    ],
  },
  {
    version: '1.6.6',
    date: '20 October 2026',
    highlight: 'Fonepay Dynamic QR Fix, eSewa & Khalti QR Gateways, NestSMS OTP, and Non-Breachable Marketing Welcome & Referrals',
    changes: [
      {
        category: 'Added',
        items: [
          {
            title: 'eSewa & Khalti Dynamic QR Payment Gateways',
            desc: 'Pay with Fonepay QR, eSewa QR, or Khalti QR across Web, Android, Kiosk, Station POS, and 10-cup Pass purchases, complete with live status polling, signed callbacks/webhooks, and Owner settlement reconciliation.',
          },
          {
            title: 'NestSMS Gateway & Phone Verification',
            desc: 'Integrated NestSMS (api.nestsms.com) for 6-digit SMS OTP phone verification, optional order-ready SMS alerts, and one-click Owner Studio connection tests.',
          },
          {
            title: 'Marketing -> Welcome & Referrals Console',
            desc: 'Moved Welcome offers and referrals into the Marketing section for Owners and Managers, with live KPIs, referral ledger, active coupon audit, and one-click revocation.',
          },
        ],
      },
      {
        category: 'Security',
        items: [
          {
            title: 'Six Non-Breachable Anti-Loss Guardrails',
            desc: 'Enforced single-drink base-price discount caps (excluding add-ons and food), non-stacking with Offer of the Day or Limited Drops, minimum spend floors, permanent SHA-256 phone hash registry blocking delete-and-recreate loops, and qualifying full-price paid order verification before referral rewards unlock.',
          },
        ],
      },
      {
        category: 'Fixed',
        items: [
          {
            title: 'Fonepay Dynamic QR Hardening',
            desc: 'Fixed PRN length truncation with compact 24-character alphanumeric PRNs, strict paymentStatus verification, exact amount validation, and sanitized remarks.',
          },
        ],
      },
    ],
  },
  {
    version: '1.6.5',
    date: '20 October 2026',
    highlight: 'Offer of the Day Restored, Coupon Code at Checkout, Automatic Coupons Retired',
    changes: [
      {
        category: 'Changed',
        items: [
          { title: 'Offer of the day restored', desc: 'Back on Home and the Offers tab on web and mobile.' },
          { title: 'Automatic coupons retired', desc: 'Free first cup and the 30% off ladder are no longer issued; existing ones were cleared.' },
          { title: 'Coupon code box', desc: 'Enter a coupon code on the Offers tab or at checkout on web and mobile.' },
        ],
      },
    ],
  },
  {
    version: '1.6.4',
    date: '20 October 2026',
    highlight: 'Promo Code on Offers, Offer of the Day Removed, Home Polish',
    changes: [
      {
        category: 'Added',
        items: [
          { title: 'Promo code section on Offers', desc: 'Enter a promo code once on the Offers tab on web and mobile. It is validated and offered as an option at checkout.' },
        ],
      },
      {
        category: 'Changed',
        items: [
          { title: 'Offer of the day removed', desc: 'Removed from the Home page and the Offers tab on both platforms so Home stays simple.' },
          { title: 'Home layout polish', desc: 'Shortcut badges are no longer clipped and heading line heights are more comfortable, consistent across web and mobile.' },
        ],
      },
      {
        category: 'Fixed',
        items: [{ title: 'Offers endpoint error', desc: 'The central offers endpoint no longer fails with a server error.' }],
      },
    ],
  },
  {
    version: '1.6.3',
    date: '20 October 2026',
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
