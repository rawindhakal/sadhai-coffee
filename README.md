# Sadhai Coffee platform

Good coffee, every day. An order-ahead coffee platform for Nepal, built from the Sadhai brand system and its Luckin-style growth playbook (app-first pickup, free first cup, 10-cup pass, referral, monthly drops), with the guardrails kept in code.

| Part | Folder | Stack |
|---|---|---|
| API | `backend/` | Node 20, Express, PostgreSQL (`pg`), JWT, zod, Server-Sent Events |
| Web (customer, station, manager, owner) | `web/` | Next.js 14 (App Router), TypeScript, dependency-free charts |
| Mobile (customer, station staff, manager, owner) | `mobile/` | Flutter 3, provider |
| Brand files | `brand/` | Logo mark, app icon, ridge pattern (from the design system) and `brand/illustrations/` (menu, scene and hero artwork) |
| Store assets and docs | `store/`, `tools/icons/` | Compliance checklist, data-safety answers, listing copy, release guide; icon generator |

## Versions and history

The platform has one version number (`VERSION`, currently **1.1.0**) shared by the API, web and mobile apps. `history.md` is the running development log. Add notes under *Unreleased* as you work, then `node scripts/release.mjs minor --commit` (or `patch`, `major`) bumps everything, files the notes under the new version and tags it. `node scripts/check-version.mjs` keeps the files honest (CI runs it). `GET /version` tells apps the current and minimum supported version; set `MIN_APP_VERSION` to make very old apps show an update screen.

## Store readiness

Google Play and App Store requirements are tracked in `store/COMPLIANCE.md`: in-app account deletion, privacy policy and terms, data export, permission purpose strings, Apple privacy manifest, HTTPS-only release builds, release signing, icons and splash from the brand mark. `store/DATA-SAFETY.md`, `store/STORE-LISTING.md` and `store/RELEASE.md` hold the console answers, listing copy and the step-by-step release checklist. Legal pages are drafts for a lawyer to confirm; set company details in `web/src/lib/site.ts`.

## What's new in 1.2

- **Passes**: each pass has a unique code; buy several and they are used one after another (a big order spills into the next pass). See the pass wallet in Offers.
- **Kiosk**: open `/kiosk` on a counter tablet, sign in once with the station account, and customers order for themselves (name and phone collected with consent; pay at the counter, by pass code, or online). Tap the logo five times and enter the staff password to leave kiosk mode.
- **Push notifications**: automatic order, pass, win-back, offer and drop messages, plus a campaign console under Marketing. Runs in test mode until Firebase and web keys are set; see `store/PUSH.md`.
- **Recipes, costing and central inventory**: ingredient pack prices and wastage drive recipe cost and margin; everything is bought centrally and sent to stations with receiving, shortage tracking and shelf counts. See `docs/INVENTORY-AND-COSTING.md`.

## Who uses what

| Role | Web | Mobile |
|---|---|---|
| **Customer** | Pick a station, order ahead, pay (cash, eSewa, Khalti, Fonepay, pass), live pickup number, 10-cup pass, coupons, referral, ratings, English/Nepali | Same, native |
| **Station staff** | Live queue with 90-second timers and sound, counter orders, customer lookup, pass sales, sold-out toggles, stock, cash count | Live queue, sold out, stock, close day |
| **Manager** (one or more stations) | Modern dashboard: KPIs against the previous period, live operations board, alerts, orders with detail drawer, customers and win-back list, station menu, stock, staff, offer of the day, promos, cash counts, ratings, accountability | Numbers, run station, promos |
| **Owner** | Everything, plus stations, menu and prices, drops, team, finance (settlement reconciliation, pass register), growth, rules, audit log, CSV export | Numbers, run station, promos |

## Run it

Needs Node 20+, PostgreSQL 14+, Flutter 3.

```bash
# 1. API
cd backend
cp .env.example .env            # set DATABASE_URL and JWT_SECRET
createdb sadhai_coffee
npm install
npm run setup                   # schema + demo data
npm run dev                     # http://localhost:4747
npm run smoke                   # end-to-end API check (server must be running)

# 2. Web
cd ../web
cp .env.local.example .env.local
npm install && npm run dev      # http://localhost:3000

# 3. Mobile
cd ../mobile
flutter pub get
flutter run                     # iOS simulator -> localhost:4747, Android emulator -> 10.0.2.2:4747
# real device or deployed API: flutter run --dart-define=API_URL=https://api.yourdomain.com
```

Or with Docker: `docker compose up --build`, then `docker compose exec api npm run setup`.

### Demo logins (password `Sadhai@123`)

| Role | Phone |
|---|---|
| Owner | 9800000001 |
| Manager (TU Gate, Teaching Hospital) | 9800000002 |
| Manager (Kalanki, New Road) | 9800000003 |
| Station staff (TU Gate) | 9800000011 |
| Customer | 9812345678 |

Demo data: 4 stations, 13 menu items with Nepali names, ~15,000 orders over 60 days, passes, coupons, a live drop, provider settlements. Change every password before any real use. The seed refuses to run in production.

## Customer app flow (web and Flutter)

1. **Sign in, then location.** The app asks to use the phone's location (free on-device GPS; no paid maps or geocoding). Stations are sorted by distance with walking time and a nearest badge, on a free OpenStreetMap map in Flutter. Denying location just shows every station with search.
2. **Home:** station and search at the top; **offer circles** (Today, free first cup, drop, pass, coupons, give a cup, merch); a **hero** (live drop, else offer of the day, else the brand line); **best sellers**; **square category boxes**; **offer of the day**; **merch**; and **food and beverage** with category filters. One-tap add, steppers for quantity, search across everything.
3. **Bottom bar:** Home, Offers, **Cart** (raised centre button with a live count and a "View cart" strip), Orders (with "Order again"), Account. The cart and checkout are one screen and the cart survives restarts.
4. **Offer of the day** is set by managers (their own stations, up to 40%, never below food cost) or the owner (any station, any scope). It goes live in the app immediately, is applied server-side at checkout, has a cup limit and end time, and is recorded in the audit log.

## Running Sadhai on existing cafes (accountability)

- A station can be **Sadhai-run** or a **partner cafe** with a revenue share (set under Owner, Stations).
- The cafe keeps the **cash** it takes; Sadhai holds the **digital money**. The **partner statement** nets this: cafe share of net sales minus the cash the cafe holds = what Sadhai pays the cafe, or what the cafe remits. Pass cups count at the pass's per-cup value so the cafe is paid for them. The owner records each settlement with a reference.
- Every order records who started it and who marked it ready. The **scorecard** flags cash counts that do not match, trading days with no cash count, high cancellations, orders marked ready in under 12 seconds, slow service and low ratings, per station and per staff member. Managers see their own stations; the owner sees all.
- Existing safeguards stay: audit log, settlement reconciliation, pass register with a related-party flag, offer caps and price floors.

## How the playbook is built in

- **Free first cup, then three 30%-off coupons in 21 days**: issued at sign-up (`issueSignupLadder`), amounts and days editable by the owner under *Rules*.
- **10-cup pass, Rs 1,200, 30 days**: pass covers drinks only; one cup per item; cancelled orders return the cup.
- **Give a cup. Get a cup.**: both sides rewarded after the friend's first *completed* order; capped at 3 a month per referrer.
- **Limited drop**: capped cups sold atomically (`sold + qty <= cap`), shows "n left", sells out cleanly.
- **One push a day**: owner broadcasts skip anyone already sent a promo in the last 24 hours.
- **Honest prices**: every price is all-in; no tax or service line anywhere.
- **Offer payback and spend**: Growth tab shows spend per offer, cost per acquired customer, repeat rate within 90 days, app share. Promo codes carry use caps and end dates.
- **Anti-fabrication guardrails**: pass register with a related-party flag (reported, target zero), passes sold against cups redeemed, cups still owed, and a daily reconciliation of app sales to eSewa/Khalti/Fonepay settlements and cash counts.
- **Pickup-first operations**: letter-plus-number pickup codes per station, a queue board that flags orders past the 90-second target, auto sold-out when an ingredient runs short, low-stock alerts to managers.

## Payments

`PAYMENT_MODE=sandbox` (default) lets the app confirm test payments, so nothing real moves. For production set `PAYMENT_MODE=live` and configure:

- **eSewa** (ePay v2): `ESEWA_PRODUCT_CODE`, `ESEWA_SECRET`, `ESEWA_FORM_URL`. The signed form is generated server-side; the success redirect is verified by HMAC and a status call.
- **Khalti** (ePayment): `KHALTI_SECRET`, `KHALTI_BASE_URL`. Initiated and verified by lookup on the server.
- **Fonepay**: confirmed by a signed webhook, `POST /payments/webhook/fonepay` with header `x-signature` = HMAC-SHA256 of `payment_id|provider_ref|status` using `FONEPAY_WEBHOOK_SECRET`. Wire it to your Fonepay merchant integration.

Test the sandbox values against each provider's current documentation before going live. Digital refunds are recorded in Sadhai (`refund_pending_manual`) and paid out from the provider dashboard.

## Things to do before launch

- Set a strong `JWT_SECRET`, `PAYMENT_MODE=live`, `IGNORE_STATION_HOURS=0`, HTTPS, and tight `CORS_ORIGINS`.
- Sign-up uses phone and password. Add SMS OTP (Sparrow SMS or Aakash SMS) in `routes/auth.js`, and push delivery (FCM) in `lib/notify.js`; hooks are marked.
- The SSE hub is in memory. For more than one API instance, replace `lib/hub.js` with Postgres `LISTEN/NOTIFY` or Redis.
- Have a native copywriter check the Nepali strings, as the brand notes ask.
- Flutter platform folders were generated for iOS and Android; add your app signing, icon (`brand/app-icon.svg`) and deep links.
