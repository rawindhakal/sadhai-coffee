# Development history

The running log of how Sadhai Coffee was built and what changed. Newest first. Every release has a version number (`MAJOR.MINOR.PATCH`) that is the same in the API, the web app and the mobile app, and is stamped in `VERSION`.

- **MAJOR**: a change that breaks existing apps or data (the API drops something, the schema needs a manual migration).
- **MINOR**: a new feature that is safe for older apps.
- **PATCH**: a fix.

## How to record a change

1. While you work, add a bullet under **Unreleased** below, in the right group (Added, Changed, Fixed, Security).
2. To release: `node scripts/release.mjs minor` (or `patch`, `major`, or an exact `1.2.0`). It moves the Unreleased notes under the new version and date, bumps the version everywhere (`VERSION`, `backend/package.json`, `web/package.json`, `web/src/lib/version.ts`, `mobile/pubspec.yaml` with the next build number, `mobile/lib/version.dart`), and with `--commit` makes the commit and `vX.Y.Z` git tag.
3. `node scripts/check-version.mjs` fails if any of those files disagree. CI runs it on every push.
4. To force very old apps to update, raise `MIN_APP_VERSION` on the API. Apps older than that show an "Please update" screen.

## Unreleased

_Nothing yet._

## v1.6.4 (2026-10-20)

### Added
- **Promo code section on Offers (mobile and web)**: enter a code once on the Offers tab; it is validated by the new `POST /promos/check` and offered as an option at checkout.

### Changed
- **Offer of the day removed** from the Home page (hero, "Today" circle, section) and the Offers tab on both mobile and web. Limited drops stay.
- **Home layout polish**: round shortcut badges no longer clipped, relaxed heading line height, consistent spacing between web and mobile.

### Fixed
- `/offers` returned 500 because of a wrong product price column.

## v1.6.3 (2026-10-20)

### Added
- **Dedicated Passes & Wallet Report**:
  - Backend analytics endpoint `/owner/reports/passes` and frontend `<PassesReportTab />` in owner and manager dashboards.
  - KPI cards tracking passes sold, revenue, cups redeemed, redemption rates, outstanding NPR liabilities, and breakage income from expired cups.
  - Station redemptions breakdown with order counts, cups fulfilled, and estimated outlet reimbursement credit.
  - Complete searchable pass ledger with customer details, pass codes, status filters, related-party toggles, and one-click CSV export.
- **Kiosk Station QR Code ("Order on Phone")**:
  - Station-specific QR code on the kiosk idle attract screen and top navigation bar (`/order?station=<id>`), allowing customers to scan and order on their phone.
- **Kiosk On-Screen Touch Keyboards**:
  - Touch QWERTY virtual keyboard with Shift/Caps, Backspace, Space, and Next keys for typing customer names without physical hardware keyboards.
  - Large numeric touch keypad for entering 10-digit mobile numbers.
- **Centralized Public Offers Route (`/offers`)**:
  - Synchronized public endpoint returning active daily offers, limited drops, and pass configurations centrally.
- **Web Changelog Page (`/changelog`)**:
  - Public product release history page with version timeline, feature highlights, and GitHub repository links.

### Changed
- **10-Cup Passes Stacked Wallet UI (Mobile & Web)**:
  - Multi-pass stacking into an organized digital wallet showing total available cups at a glance, the currently active pass on top with full code and cup indicators, and queued passes stacked underneath with one-tap switching.
- **Harmonized Offers & Coupons**:
  - Harmonized My Coupons display across web and mobile showing clear expiration dates, discount badges, and checkout auto-application instructions.

### Fixed
- **Live Pass Updating After Checkout**:
  - Added `passEpoch` signal in mobile `CartState` and instant cache reloading on web, guaranteeing pass balances and coupons refresh immediately after placing an order or purchasing a pass.
- **Android Pickup Time Window**:
  - Fixed pickup time window not displaying on Android by binding station load events and guaranteeing the pickup window section ("As soon as possible" / "Later today") renders consistently for all active stations.

## v1.6.2 (2026-10-20)

### Changed
- **Simplified Home Page (Web & Mobile Unified)**:
  - Removed unnecessary marketing clutter from the web home page: stripped the simulated BrewLab timer, people profile figures, terroir narrative cards, redundant partner recruiting banner, and FAQ accordions.
  - Aligned data and information identically across web and mobile: live counter status with nearest-first finder, standard price tiers (Hot Rs 100, Flavored Rs 120, Iced Rs 150), live category/product menu with photos, and digital 10-cup pass.
  - Replaced the gamified punch pass slider with a clean, clear 10-Cup Punch Pass card (10 cups for Rs 900, Rs 90/cup, valid 30 days at all counters).
  - Streamlined main navigation links to Menu & prices, 10-cup pass, Counters, Order ahead, and For cafes.
- **Unified Checkout Experience (Mobile & Web)**:
  - Removed promo code input field and apply button from mobile checkout ([`mobile/lib/screens/cart.dart`](file:///Users/rawindhakal/Developments/sadhai-coffee/mobile/lib/screens/cart.dart)).
  - Removed promo code input field from web checkout ([`web/src/app/cart/page.tsx`](file:///Users/rawindhakal/Developments/sadhai-coffee/web/src/app/cart/page.tsx)).
  - Kept the Offer selector clean and identical across platforms: "No offer", active earned coupons, and 10-cup pass.

## v1.6.1 (2026-10-16)

### Added
- **Owner Data Management & Security (`/settings`)**:
  - Full JSON database backup: complete system snapshot export (stations, products, recipes, users, managers, shifts, orders, ledgers, and settings) with audit logging.
  - Password-protected JSON restore: requires owner re-authentication with password verification, validates schema pre-flight, and transactionally restores data with audit trails.
  - Granular selective data reset: allows the owner to selectively wipe orders, transactions, stock ledgers, or rosters while safeguarding core products, stations, and user accounts.
- **User & Manager Administration (`/users`)**:
  - Full CRUD console for users and managers.
  - Role-based tabs (All, Customers, Baristas & Staff, Managers, Owners) with real-time phone/name search and status filters.
  - Add manager/barista dialog with station assignment, phone validation, and role assignment.
  - Direct password reset and credential updates with safety checks preventing self-deletion or deletion of the last owner.
- **Menu Studio & Inventory-Linked Pricing (`/menu`)**:
  - Menu Studio with full CRUD for products and categories: create, edit, sort, toggle active status, and delete.
  - Product photo uploading and custom media URLs with live preview cards.
  - Station-specific pricing overrides: customize prices per outlet with fallback to standard category/tier pricing.
  - Recipe & central inventory integration: connects products to ingredient bills of materials, showing live real-time "cups left" stock counts per station.
  - Preservation of option IDs and recipes during edits to ensure order history integrity.
- **Production Android Application Build**:
  - Production release APK (`app-release.apk`) generated with ProGuard code obfuscation and resource shrinking.
  - OpenJDK 17 and Android SDK 36 toolchain configured with accepted Google licenses.

### Changed
- **Default Mobile API Endpoint**:
  - Updated `mobile/lib/api.dart` to default to `https://sadhaicoffee.com/api` (with automatic trailing-slash trimming) so Android APK builds connect immediately to the live production server without requiring custom `--dart-define` flags.
- **Nginx API & CORS Routing**:
  - Configured reverse proxy on `sadhaicoffee.com` for `/api/` endpoints with complete CORS headers (`Access-Control-Allow-Origin`, `Access-Control-Allow-Headers`, `Access-Control-Allow-Methods`) to resolve preflight cross-origin issues across web and mobile clients.
- **Mobile Product Artwork**:
  - Enhanced `mobile/lib/art.dart` to normalize leading slashes on uploaded media URLs and apply rounded clipping (`ClipRRect`) with smooth loading indicators and fallback illustration art.

### Fixed
- **Flutter Material Assertion Crash**:
  - Fixed runtime crash `Assertion failed: !(shape != null && borderRadius != null)` in `mobile/lib/screens/home.dart` (`_CatBox`) by removing conflicting `borderRadius` parameter when `shape: RoundedRectangleBorder` is present.
- **Flutter Layout Overflow**:
  - Fixed `RenderFlex overflowed by 78 pixels on the right` in `_Head` banner by enclosing the subtitle text in an `Expanded` widget with `TextOverflow.ellipsis`.
- **Flutter Async Context Warnings**:
  - Fixed all `use_build_context_synchronously` warnings in `mobile/lib/screens/account.dart` and `mobile/lib/screens/customer.dart` using proper `context.mounted` guards.
  - Achieved 100% clean `flutter analyze` with 0 warnings and 0 errors.

## v1.6.0 (2026-10-15)

### Added
- **New home page** (`/`): live hero with an illustrated barista and floating beans, a live menu and prices from the API, "The people of Sadhai" (farmers, baristas, commuters, cafe owners), the 90-second brew simulator, the 10-cup pass calculator, live counters with open/closed and wait times plus "show the nearest first", app and cafe-partner sections, and a FAQ that matches how ordering really works. Mobile menu now works. `/newhome` redirects to `/`.
- Owner can change the main hero picture and the four people pictures and captions under Home page and pictures (new "People" tab and "Main hero picture").
- Illustrated beans and people in the brand style (`web/public/img/bean*.svg`, `person-*.svg`).

### Fixed
- **Station hours now save reliably** from the owner screen: stations without a Nepali name, address or coordinates no longer fail validation, and a badly formed time is refused with a message instead of being ignored.
- `npm run seed` now refuses to wipe a database whose station hours or details have been changed. Use `npm run seed:force` to reset on purpose. (Re-seeding was resetting hours back to 07:00 to 20:00.)
- Removed invented claims from the preview page (fake counters, partner yield, savings) and the leftover eSewa mentions.

## v1.5.1 (2026-10-15)

### Changed
- **Placed orders cannot be cancelled by the customer.** Only an order waiting for payment can be cancelled; once placed it goes to the bar. The station can still decline an order with a reason (a paid order is refunded). The web and mobile cancel buttons, checkout notes and terms are updated.

## v1.5.0 (2026-10-15)

### Added
- **Pickup later**: customers choose a pickup time later today (web and app): same day, inside opening hours, at least 15 minutes ahead. Scheduled orders wait under "Later today" at the station and move to the live queue a few minutes before pickup. The owner can switch it off or change the lead times.
- **Closed outlets cannot be ordered from**: closed, out-of-hours and paused stations are greyed out in the station list, show a banner with the menu locked, and are refused by the cart, quote, order and kiosk APIs.
- `npm run flows` now has 137 checks.

## v1.4.0 (2026-10-15)

### Added
- **Fonepay is now the only online payment.** eSewa and Khalti are removed from the API, apps, settings and documents. A Fonepay QR is shown in the web app, the kiosk, the counter POS and the mobile app; the app polls `GET /payments/:id` and the signed webhook also confirms. Owner settings hold the Fonepay merchant keys with a Test button.
- **Pickup code.** Every app and kiosk order has a 4-digit code the customer reads out. Staff must enter it to hand over; five wrong tries lock it to a manager; managers can hand over with a recorded reason.
- **Proper order steps.** Accept, then Mark prepared, then Hand over. An order cannot be marked ready before it is accepted. Declining needs a reason and refunds paid orders.
- **Partner cafe owner role** with its own dashboard (`/partner`) and mobile view: sales, orders, live queue, stock, ratings, cash counts, settlement statement and counter logins, with Sadhai's costs, margins and customer phone numbers hidden.
- **Sadhai-run vs partner stations**: rosters, auto-assign, attendance, payroll and My shift now apply only to Sadhai-run stations.
- `npm run flows` runs 112 end-to-end checks of the order, payment, handover, partner and supervision flows.

### Fixed
- The seeded "offer of the day" ended at the wrong time, so it was already expired when seeded in the evening.

## v1.3.0 (2026-10-15)

### Added
- **Tiered pricing**: hot coffee Rs 100, flavored Rs 120, iced Rs 150 at every station. Tier prices live in settings and reprice all products on the tier.
- **Standard recipes**: versioned recipes, read-only recipe cards for stations (web and Flutter), owner-only edits.
- **Owner control without redeploys**: encrypted, masked settings and API keys with test buttons (payments, push, company); every hero layer, section picture, partner and investor page content and product pictures editable from the owner dashboard; setup checklist.
- **Staff management**: staff directory with roles, skills, days off and hourly rate; 6-hour shift templates; auto-assign roster with fairness, rest and leave rules, duty rotation and checklists; publish with notifications; attendance with check-in/out, flags and manual correction; time off; payroll with overtime, social security, adjustments, approval, payment, CSV and payslips; labour KPIs on the overview; "My shift" for staff on web and in the app.
- **Public pages** `/partners` and `/investors` with enquiry form and an owner inbox; `/help` guide; `docs/WORKFLOWS.md`.
- One shared logo component on web and in Flutter.

### Changed
- Pass price is Rs 900 (editable) and is read from the API by the apps. Product pictures use uploaded images when set.

## v1.2.0 (2026-10-15)

### Added
- **Unique passes used one after another**: every pass has its own code (`SP-XXXX-XXXX`). A customer can buy as many as they like; an order spills across passes automatically (started passes first, then the oldest unstarted one). Each pass starts its 30 days with its first cup, and an unstarted pass can wait 180 days. Pass wallet in the web and Flutter apps, redeem by code at the counter, cancellations return cups to the right pass.
- **Self-order kiosk** (`/kiosk`): attract screen, name and phone collected on a big keypad with consent, large-touch menu with offers, payment at the counter, with a pass code (code and phone must both match), or online (QR in live mode), a big pickup number, auto-reset and inactivity timeout, staff-only exit. Orders show on the station queue with the guest's name.
- **Push notifications**: device registration (Android, iOS, web), FCM HTTP v1 and Web Push senders with a test (dry-run) mode, delivery log, per-user opt-out of offers, daily marketing cap, quiet hours. Owner and manager console to send or schedule campaigns to audiences; automatic messages for pass ending, pass nearly used, win-back, new offer of the day and new drop. Service worker and profile toggles on the web; firebase_messaging in Flutter with a permission prompt only after the customer agrees.
- **Recipe management and costing**: ingredients bought in packs (Rs 2,500/kg coffee, Rs 110/L milk, Rs 50/kg ice, Rs 5/L water, Rs 1,500/L syrups, Rs 5 per sugar sachet), 10% coffee wastage, a 16 g double shot, option recipes (large, oat, extra shot, sugar), barista method text, calculated item cost, margin and food-cost % against a target, suggested prices, price what-if, and the real cost stored on every order line.
- **Central inventory**: central store, suppliers, purchase orders with receiving and price variance, suggested purchases, station requests, dispatch, station receiving with shortage tracking, shelf counts with loss at cost, network stock matrix, valuation, price history, full ledgers. Manager "warehouse" role.
- Docs: `docs/INVENTORY-AND-COSTING.md`, `store/PUSH.md`.

### Changed
- A sale now uses the recipe and chosen options from stock, including the wastage allowance, instead of the base recipe only.
- Welcome and referral messages no longer count against the daily offers cap.
- Privacy policy, terms and data-safety answers cover kiosks, push and the new pass rules.

### Security
- Kiosk pass payment needs both the pass code and the account's phone number.
- Push tokens are removed on sign-out and account deletion.

## v1.1.0 (2026-10-15)

### Added
- **Customer storefront redesign** (web and Flutter): location step using free on-device GPS and an OpenStreetMap map, nearest-station suggestions with walking time, home with offer circles, hero, best sellers, square category boxes, offer of the day, merch, and a food and beverage list with search.
- **Cart as a bottom-bar tab** with a live count, a "View cart" strip, steppers, one-screen checkout, persistence across restarts, and "Order again".
- **Offer of the day**: managers (own stations, up to 40%, never below food cost) and the owner (any scope) publish offers that go live immediately and apply server-side, with cup limits, end times and audit logging.
- **Merch category** (mug, tote, beans, cap) that is excluded from the pass and from cup counts.
- **Partner cafe accountability**: partner or Sadhai-run stations, revenue share, partner statements that net cash held against share, settlement records, per-station and per-staff scorecards with automatic flags, and who-started/who-finished on every order.
- **Modern dashboards** for owner, manager and station: sidebar navigation with deep links, global search and command palette (Ctrl or Cmd + K), alerts centre, live operations board with a real-time order feed, KPI cards with period comparison and sparklines, interactive trend chart, payment and category mix, a day-by-hour heatmap, customer segments and win-back list, order and customer drawers with timelines, sortable tables with CSV export, dark mode.
- **Illustrated imagery**: original brand illustrations for every menu item, three story scenes and a layered parallax hills hero; a new interactive landing page (parallax hero, 90-second timer ring, step explorer, menu showcase with tilt cards, punchable 10-cup pass, live drop banner, partner section).
- **Version system**: `VERSION`, `history.md`, `scripts/release.mjs`, `scripts/check-version.mjs`, `GET /version`, minimum-version update gate in the mobile app, version shown in the apps and legal pages.
- **Store compliance**: in-app and web account deletion, data export, privacy policy, terms of use, support and delete-account pages, sign-up consent, Apple privacy manifest, ITSAppUsesNonExemptEncryption, Android release signing from `key.properties`, HTTPS-only release builds, backups disabled, app icons and splash generated from the brand mark, store listing and data-safety documents in `store/`.
- GitHub Actions: CI (API smoke test against Postgres, web build, Flutter analyze and test, version check) and a tag-triggered release build.

### Changed
- API access logs record the path only, never the query string, so coordinates and live-update tokens are not logged.
- Android application ID and iOS bundle ID are both `com.sadhai.coffee`.
- Reports count only drinks as cups; offers and drops are priced server-side.

### Fixed
- Scorecard query used a column outside its group.
- Pass redemption and coupon logic now ignore merch and food correctly.

### Security
- Account deletion requires the password and is blocked while an order is in progress; deleted accounts cannot sign in and old tokens stop working.

## v1.0.0 (2026-10-14)

### Added
- First complete platform built from the Sadhai Coffee design system and growth playbook.
- **API** (Node 20, Express, PostgreSQL): phone and password auth with refresh tokens, roles (customer, station, manager, owner), orders with pickup codes, stock deduction by recipe, payments for cash, eSewa, Khalti and Fonepay (sandbox by default), the 10-cup pass, free-first-cup and coupon ladder, referrals, limited drops, promo codes, notifications, live updates over server-sent events, cash counts, provider settlement reconciliation, reports and an audit log.
- **Web** (Next.js 14): customer ordering and tracking, station queue and counter orders, manager and owner dashboards.
- **Mobile** (Flutter): customer app plus station, manager and owner screens.
- Seed data with four stations, a Nepali-named menu, 60 days of orders, passes, coupons and a live drop.
- End-to-end API smoke test (`npm run smoke`).
