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
