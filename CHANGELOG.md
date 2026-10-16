# Changelog

All notable changes to the Sadhai Coffee platform across the API, web applications, and Flutter mobile applications are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
