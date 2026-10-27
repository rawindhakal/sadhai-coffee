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
- **Recipes, costing and central inventory**: ingredient pack prices and wastage drive recipe cost and margin; everything is bought centrally and sent to stations with receiving, shortage tracking and shelf counts. See `docs/INVENTORY-AND-COSTING.md`.

## Who uses what

| Role | Web | Mobile |
|---|---|---|
| **Customer** | Pick a station, order ahead, pay (cash at pickup, eSewa, Fonepay or a 10-cup pass), live pickup number, 10-cup pass, coupons, referral, ratings, English/Nepali | Same, native |
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
# real device or deployed API: flutter run --dart-define=API_URL=https://sadhaicoffee.com/api
```

Or with Docker: `docker compose up --build`, then `docker compose exec api npm run setup`.

### Demo logins (password `Sadhai@123`)

| Role | Phone |
|---|---|
| Owner | 9800000001 |
| Manager (TU Gate, Teaching Hospital) | 9800000002 |
| Manager (Kalanki, New Road) | 9800000003 |
| Station staff (TU Gate) | 9800000011 |
| Partner cafe owner (Kalanki) | 9801111111 |
| Partner cafe owner (New Road) | 9802222222 |
| Customer | 9812345678 |

`npm run seed` wipes the database and recreates the demo. It refuses to run if station hours or details have been changed, so a re-seed cannot silently undo your edits. To reset on purpose, run `npm run seed:force`.

Demo data: 4 stations, 13 menu items with Nepali names, ~15,000 orders over 60 days, passes, coupons, a live drop, provider settlements. Change every password before any real use. The seed refuses to run in production.

## Customer app flow (web and Flutter)

1. **Sign in, then location.** The app asks to use the phone's location (free on-device GPS; no paid maps or geocoding). Stations are sorted by distance with walking time and a nearest badge, on a free OpenStreetMap map in Flutter. Denying location just shows every station with search.
2. **Home:** station and search at the top; **offer circles** (Today, free first cup, drop, pass, coupons, give a cup, merch); a **hero** (live drop, else offer of the day, else the brand line); **best sellers**; **square category boxes**; **offer of the day**; **merch**; and **food and beverage** with category filters. One-tap add, steppers for quantity, search across everything.
3. **Bottom bar:** Home, Offers, **Cart** (raised centre button with a live count and a "View cart" strip), Orders (with "Order again"), Account. The cart and checkout are one screen and the cart survives restarts.
4. **Offer of the day** is set by managers (their own stations, up to 40%, never below food cost) or the owner (any station, any scope). It goes live in the app immediately, is applied server-side at checkout, has a cup limit and end time, and is recorded in the audit log.

## Running Sadhai on existing cafes (accountability)

- A station can be **Sadhai-run** or a **partner cafe** with a revenue share (set under Owner, Stations).
- The cafe keeps the **cash** it takes; Sadhai holds the **digital money** (eSewa and Fonepay). The **partner statement** nets this: cafe share of net sales minus the cash the cafe holds = what Sadhai pays the cafe, or what the cafe remits. Pass cups count at the pass's per-cup value so the cafe is paid for them. The owner records each settlement with a reference.
- Every order records who started it and who marked it ready. The **scorecard** flags cash counts that do not match, trading days with no cash count, high cancellations, orders marked ready in under 12 seconds, slow service and low ratings, per station and per staff member. Managers see their own stations; the owner sees all.
- Existing safeguards stay: audit log, settlement reconciliation, pass register with a related-party flag, offer caps and price floors.

## How the playbook is built in

- **Free first cup, then three 30%-off coupons in 21 days**: issued at sign-up (`issueSignupLadder`), amounts and days editable by the owner under *Rules*.
- **10-cup pass, Rs 1,200, 30 days**: pass covers drinks only; one cup per item; cancelled orders return the cup.
- **Give a cup. Get a cup.**: both sides rewarded after the friend's first *completed* order; capped at 3 a month per referrer.
- **Limited drop**: capped cups sold atomically (`sold + qty <= cap`), shows "n left", sells out cleanly.
- **Honest prices**: every price is all-in; no tax or service line anywhere.
- **Offer payback and spend**: Growth tab shows spend per offer, cost per acquired customer, repeat rate within 90 days, app share. Promo codes carry use caps and end dates.
- **Anti-fabrication guardrails**: pass register with a related-party flag (reported, target zero), passes sold against cups redeemed, cups still owed, and daily cash counts per counter.
- **Pickup-first operations**: letter-plus-number pickup codes per station, a queue board that flags orders past the 90-second target, auto sold-out when an ingredient runs short, low-stock alerts to managers.

## Payments

Customers pay with **cash at the counter** (when they collect), a **10-cup pass**, or online with **eSewa** (ePay v2), **Fonepay** (Dynamic QR, or web payment until the QR service is set up) or **NepalPay QR**. Coupons and promo codes only reduce the price. Both gateways start **switched off**; the owner turns each on under **Settings, Payments**.

- **How an online order works.** The order waits as *awaiting payment*: the barista does not see it and no ingredients are used. The customer is sent to eSewa's or Fonepay's page and comes back to their order. When the gateway's signed answer is verified the order is placed and goes to the station. An order nobody pays for is cancelled after 15 minutes (eSewa is asked one last time first). The customer can cancel while it is still waiting; once placed only the station can decline it, and a paid order is then marked for a refund.
- **Where it works.** Website cart, the mobile app, the self-order kiosk (a QR the guest scans with their phone) and the counter (the barista shows a QR). 10-cup passes can also be bought online; counters still sell them for cash.
- **Setup.** In Settings, Payments, enter the merchant code and secret key from eSewa (and from Fonepay: merchant code PID and shared secret), choose **Live**, and press *Try a Rs 10 payment*. In **Sandbox** eSewa uses its test server with the public test code `EPAYTEST`; Fonepay needs the test code Fonepay gives you (until then a built-in test page is used). On a real website customers are never offered Sandbox payments.
- **The QR window.** Paying never leaves the page: a window shows the QR, the amount, a countdown and the status, and closes itself a moment after the money arrives. Fonepay and NepalPay show a real bank-scannable QR; eSewa shows a QR of its payment page plus an *Open eSewa* button.
- **NepalPay QR setup.** Needs only the **merchant code** and **secret key** you were given (Settings, Payments). The QR holds our payment page; the phone is sent on with a request signed with the secret (HMAC-SHA512, same scheme as Fonepay's merchant request), and the signed answer comes back to `/payments/nepalpay/return`. If your NepalPay provider uses a different signing scheme the first Rs 10 test will show it; tell me what the failure says.
- **Order flow.** Settings, Order flow decides, for each of the app, website, kiosk QR, kiosk and counter: on or off, which ways to pay, the most items, notes, pickup later, and (kiosk) whether to ask for a name and phone. The API enforces it and every screen reads it from `/config`.
- **Security.** Requests and answers are signed (eSewa HMAC-SHA256, Fonepay HMAC-SHA512). Answers with a wrong signature, wrong merchant or wrong amount are ignored or cancel the order. Secrets are stored encrypted and never shown again.
- **Money and refunds.** Online money arrives in Sadhai's merchant accounts. Partner cafes hold the cash, so the partner statement nets their share against the cash they hold. Refunds are paid back from the merchant account and then marked done in Settings, Payments.
- The Fonepay request format follows Fonepay's web payment (merchantRequest). Test with your own merchant details before going live; only Sandbox is exercised by `npm run smoke` and `npm run flows`.

## Things to do before launch

- **Domain `sadhaicoffee.com`:** web app and legal pages at `https://sadhaicoffee.com` (also `www`), API at `https://sadhaicoffee.com/api` (nginx forwards `/api/` to the API on port 4747). Set `PUBLIC_WEB_URL`, `PUBLIC_API_URL` and `CORS_ORIGINS` to match (see `backend/.env.example`), build the web app with `NEXT_PUBLIC_API_URL=https://sadhaicoffee.com/api`, and build the mobile apps with `--dart-define=API_URL=https://sadhaicoffee.com/api --dart-define=WEB_URL=https://sadhaicoffee.com`. The support and privacy addresses default to `support@sadhaicoffee.com` and `privacy@sadhaicoffee.com`; create those mailboxes. The same values can be saved under Settings and keys. Privacy policy URL for the stores: `https://sadhaicoffee.com/privacy`.
- Set a strong `JWT_SECRET`, `IGNORE_STATION_HOURS=0`, HTTPS, and tight `CORS_ORIGINS`.
- Sign-up uses a phone number and password. There is no SMS or push notification: order updates show live in the app and in the inbox.
- The SSE hub is in memory. For more than one API instance, replace `lib/hub.js` with Postgres `LISTEN/NOTIFY` or Redis.
- Have a native copywriter check the Nepali strings, as the brand notes ask.
- Flutter platform folders were generated for iOS and Android; add your app signing, icon (`brand/app-icon.svg`) and deep links.
