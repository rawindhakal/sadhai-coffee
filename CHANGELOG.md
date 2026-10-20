# Changelog

All notable changes to the Sadhai Coffee platform across the API, web applications, and Flutter mobile applications are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.6.5] - 2026-10-20

### Changed
- Offer of the day restored on Home and Offers (mobile and web).
- Retired automatic signup coupons (free first cup, 30% off ladder); existing ones cleared.
- Coupon code box on Offers and at checkout (mobile and web).

---

## [1.6.4] - 2026-10-20

### Added
- Promo code section on the Offers tab (mobile and web), validated by `POST /promos/check` and selectable at checkout.

### Changed
- Removed "Offer of the day" from Home and Offers on mobile and web.
- Home layout polish: unclipped shortcut badges, relaxed heading line height.

### Fixed
- `/offers` returned 500 (wrong price column).

---

## [1.6.3] - 2026-10-20

### Added
- **Dedicated Passes & Wallet Report**:
  - Added dedicated `/owner/reports/passes` backend analytics endpoint and `PassesReportTab` in owner and manager dashboards.
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

---

## [1.6.2] - 2026-10-20

### Changed
- **Simplified Home Page (Web & Mobile Unified)**:
  - Removed unnecessary marketing clutter from the web home page: stripped the interactive 90-second BrewLab timer simulation, people profile figures, terroir narrative cards, redundant partner recruiting banner, and FAQ accordions.
  - Aligned data and information identically across web and mobile: live counter status with nearest-first finder, standard price tiers (Hot Rs 100, Flavored Rs 120, Iced Rs 150), live category/product menu with photos, and digital 10-cup pass.
  - Replaced the gamified punch pass slider with a clean, clear 10-Cup Punch Pass card ({rs(900)} for 10 cups, Rs 90/cup, valid 30 days at all counters).
  - Streamlined main navigation links to Menu & prices, 10-cup pass, Counters, Order ahead, and For cafes.
- **Unified Checkout Experience (Mobile & Web)**:
  - Removed promo code input field and apply button from mobile checkout ([`mobile/lib/screens/cart.dart`](file:///Users/rawindhakal/Developments/sadhai-coffee/mobile/lib/screens/cart.dart)).
  - Removed promo code input field from web checkout ([`web/src/app/cart/page.tsx`](file:///Users/rawindhakal/Developments/sadhai-coffee/web/src/app/cart/page.tsx)).
  - Kept the Offer selector clean and identical across platforms: "No offer", active earned coupons, and 10-cup pass.

---

## [1.6.1] - 2026-10-16

### Added
- **Owner Data Management & Security (`/settings`)**:
  - Full JSON database backup export: one-click backup of system state (stations, categories, products, recipes, users, managers, shifts, orders, ledger, settings) with audit logging.
  - Password-protected JSON restore: requires owner password re-authentication, performs pre-flight validation, and transactionally restores data with audit trails.
  - Granular selective data reset: allows the owner to selectively purge orders, transactions, stock ledgers, or rosters while safeguarding core products, stations, and user accounts.
- **User & Manager Administration (`/users`)**:
  - Full CRUD management console for users and managers.
  - Role-based tabs (All, Customers, Baristas & Staff, Managers, Owners) with instant phone/name search and status filters.
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

---

## [1.6.0] - 2026-10-15

### Added
- **New home page** (`/`): live hero with an illustrated barista and floating beans, a live menu and prices from the API, "The people of Sadhai" (farmers, baristas, commuters, cafe owners), the 90-second brew simulator, the 10-cup pass calculator, live counters with open/closed and wait times plus "show the nearest first", app and cafe-partner sections, and a FAQ that matches how ordering really works. Mobile menu now works. `/newhome` redirects to `/`.
- Owner can change the main hero picture and the four people pictures and captions under Home page and pictures (new "People" tab and "Main hero picture").
- Illustrated beans and people in the brand style (`web/public/img/bean*.svg`, `person-*.svg`).

### Fixed
- **Station hours now save reliably** from the owner screen: stations without a Nepali name, address or coordinates no longer fail validation, and a badly formed time is refused with a message instead of being ignored.
- `npm run seed` now refuses to wipe a database whose station hours or details have been changed. Use `npm run seed:force` to reset on purpose.
- Removed invented claims from the preview page and leftover eSewa mentions.

---

## [1.5.1] - 2026-10-15

### Changed
- Placed orders cannot be cancelled by the customer once received by the bar.
- Station can decline an order with a reason (triggering customer refund).

---

## [1.5.0] - 2026-10-15

### Added
- Pickup later: customers choose a pickup time later today (same day, inside opening hours, at least 15 minutes ahead).
- Closed outlets cannot be ordered from: closed, out-of-hours, and paused stations are greyed out with menu locked.

---

## [1.4.0] - 2026-10-15

### Added
- Fonepay is the exclusive online payment provider. eSewa and Khalti removed.
- 4-digit pickup code verification before barista handover.
- Partner cafe owner role with dedicated dashboard (`/partner`).
- Order progression states: Placed → Accepted → Preparing → Ready → Picked up.

---

## [1.3.0] - 2026-10-15

### Added
- Tiered pricing across stations (hot coffee Rs 100, flavored Rs 120, iced Rs 150).
- Standard recipes with bill-of-materials costing and versioned recipe cards.
- Encrypted and masked owner settings for API keys and integrations.
- Complete staff directory, shift scheduling, and attendance management.

---

## [1.2.0] - 2026-10-15

### Added
- Sequential 10-cup passes with individual codes (`SP-XXXX-XXXX`).
- Self-order kiosk interface (`/kiosk`).
- Central inventory tracking with purchase orders, loss tracking, and supplier management.
- Web & mobile push notification infrastructure.

---

## [1.1.0] - 2026-10-15

### Added
- Redesigned customer storefront with free GPS geolocation and OpenStreetMap nearest-station finder.
- Bottom navigation cart with persistent state and one-screen checkout.
- Offer of the day engine with food-cost safety rails.
- Modern operations dashboards with command palette (`Cmd+K`), real-time feeds, and CSV export.

---

## [1.0.0] - 2026-10-14

### Added
- Initial platform release: Node 20 / Express API, PostgreSQL database, Next.js 14 web app, and Flutter mobile app.
