# Releasing to Google Play and the App Store

## Before every release
1. Describe the changes under **Unreleased** in `history.md`.
2. `node scripts/release.mjs minor --commit` (or `patch` / `major`). This bumps `VERSION`, the API, web and mobile versions, the mobile build number, files the notes in `history.md`, commits and tags `vX.Y.Z`.
3. `git push --follow-tags`. CI runs the API smoke test, web build, Flutter analyze and tests, and `node scripts/check-version.mjs`. The tag triggers the release build workflow.
4. Deploy the API and web first. The API is backward compatible within a major version; raise `MIN_APP_VERSION` only to retire old apps.

## One-time setup

**Config to change before going live**
- `web/src/lib/site.ts` (or the `NEXT_PUBLIC_*` env vars): company name, address, support and privacy emails.
- Mobile: build with `--dart-define=API_URL=https://api.yourdomain.com --dart-define=WEB_URL=https://yourdomain.com`.
- API: `PAYMENT_MODE=live`, `IGNORE_STATION_HOURS=0`, strong `JWT_SECRET`, `CORS_ORIGINS`, `PUBLIC_API_URL`, `PUBLIC_WEB_URL`, `PLAY_STORE_URL`, `APP_STORE_URL`, `MIN_APP_VERSION`.

**Android (Google Play)**
1. `keytool -genkey -v -keystore ~/sadhai-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload`
2. Create `mobile/android/key.properties` (git-ignored):
   ```
   storeFile=/absolute/path/sadhai-upload.jks
   storePassword=...
   keyAlias=upload
   keyPassword=...
   ```
3. Accept SDK licences once: `flutter doctor --android-licenses`.
4. Build: `cd mobile && flutter build appbundle --release --dart-define=API_URL=... --dart-define=WEB_URL=...` → `build/app/outputs/bundle/release/app-release.aab`.
5. Play Console: create the app (`com.sadhai.coffee`), enrol in Play App Signing, upload the AAB to internal testing first, complete App content (privacy policy URL, Data safety from `store/DATA-SAFETY.md`, content rating, target audience, account deletion URL), then promote.
6. New personal developer accounts must run a closed test with testers for 14 days before production access.

**iOS (App Store)**
1. Needs a Mac with Xcode, CocoaPods and an Apple Developer Program membership.
2. `cd mobile && flutter build ipa --release --dart-define=API_URL=... --dart-define=WEB_URL=...` (set your team under Runner, Signing and Capabilities; bundle id `com.sadhai.coffee`).
3. Upload with Transporter or `xcrun altool`. In App Store Connect fill the listing (`store/STORE-LISTING.md`), App Privacy (`store/DATA-SAFETY.md`), age rating, export compliance (already declared in Info.plist), and the privacy policy URL.
4. Test with TestFlight before submitting.

## Review notes (paste into both consoles)
> Sadhai Coffee lets customers order coffee for pickup at a counter. Sign in with the review account below. Location is optional: tap “Choose a station myself” to skip it. Payments are for physical goods (coffee and merchandise) and run through Nepali wallets; in review builds the payment is a test confirmation and no money moves. Account deletion is under Account, Profile, Delete my account.
>
> Review account: phone `<create a dedicated customer in production>`, password `<set a strong one>`.

Create that account in production (register in the app), give it a free-first-cup coupon and keep a station open for the review window.

## Release checklist
- [ ] `node scripts/check-version.mjs` is green and the tag matches `VERSION`
- [ ] API deployed, `GET /version` shows the new version
- [ ] Release build opened on a real Android and iPhone device: sign up, location allow and deny, order, pay (test), pickup number updates, pass, delete account
- [ ] Screen reader pass (TalkBack, VoiceOver) on sign-in, home, cart and order tracking
- [ ] Screenshots current, listing copy current, privacy policy and data-safety answers match the build
- [ ] Rollout staged (Play: 10% then 100%; Apple: phased release)
