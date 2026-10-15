# Push notifications

Sadhai sends push to Android and iPhone through Firebase Cloud Messaging (FCM; Apple's APNs sits behind it) and to browsers through Web Push. Everything is built; two things need your accounts before real messages flow. Until then the system runs in **test mode**: every delivery is recorded as `dry_run`, so you can try the whole pipeline (devices, audiences, caps, campaigns, automations) first.

## What sends automatically
| Message | When | Kind |
|---|---|---|
| Order received, being made, ready | Each order status change | order (always sent) |
| "3 cups left on pass SP-XXXX-XXXX" | A started pass ends within 3 days with cups left | pass (always sent) |
| "Two cups left on your pass" | A pass is down to 2 cups with more than 3 days to run | pass |
| Win-back: "Your Latte is one tap away" | A regular (2+ orders) has not ordered for 14 to 45 days. At most once a month | promo |
| New offer of the day | To customers who ordered at that station in the last 60 days, when the offer goes live | promo |
| New monthly drop | To customers who ordered in the last 60 days | promo |
| Manager and owner alerts | Low stock, short deliveries, stock count differences, cash differences | stock / system |

Rules built in: one promo push per customer per 24 hours (setting `promo_push_daily_cap`), promos skipped for people who turned off "Offers and news", automatic promos never sent between 21:00 and 07:00 Nepal time, each automatic message is sent once per customer (`auto_push_log`). Owners switch each automation on or off under Rules (`auto_*` settings).

## What owners and managers send by hand
Dashboard, Marketing, **Push notifications**: pick an audience (all customers, lapsed, pass ending, one station's customers, or one customer by phone), write the message, preview how many people and devices it reaches, send now or schedule. Managers can only reach their own stations' customers or one customer. History shows delivered and failed counts. API: `POST /admin/push/campaigns`.

## Turn on real delivery

**Android and iPhone (FCM)**
1. Create a Firebase project, add an Android app (`com.sadhai.coffee`) and an iOS app (`com.sadhai.coffee`).
2. iOS: in Apple Developer create an APNs Auth Key (.p8) and upload it in Firebase, Project settings, Cloud Messaging. In Xcode the Push Notifications capability is already declared (`ios/Runner/Runner.entitlements`); enable it for your team.
3. Server: Firebase, Project settings, Service accounts, Generate new private key. Put the JSON (raw, or base64) in `FCM_SERVICE_ACCOUNT_JSON` on the API.
4. App: build with the Firebase values (no config files to commit):
   ```
   flutter build appbundle --release \
     --dart-define=API_URL=https://api.yourdomain.com --dart-define=WEB_URL=https://yourdomain.com \
     --dart-define=FIREBASE_API_KEY=... --dart-define=FIREBASE_PROJECT_ID=... --dart-define=FIREBASE_SENDER_ID=... \
     --dart-define=FIREBASE_APP_ID_ANDROID=... --dart-define=FIREBASE_APP_ID_IOS=...
   ```
   (the values are in Project settings, Your apps. They identify the app and are not secrets.)

**Browsers (Web Push)**
1. `cd backend && npm run vapid` prints a key pair. Put them in `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and set `VAPID_SUBJECT=mailto:you@yourdomain`.
2. Customers turn it on in Account, Profile, Notifications (the browser asks permission only then). Browsers need HTTPS in production.

## How a message travels
`notify()` stores an in-app message, pushes it live over the open connection (SSE), then calls `sendToUser()`, which sends to each active device and logs every result in `push_deliveries`. Dead tokens (uninstalled apps) are switched off automatically. Setting `PUSH_MODE=off` stops all sending.

## Privacy and store rules
Permission is requested only after the customer says yes (our own dialog, or the switch in Account); the OS prompt follows. Tokens are deleted on sign-out and when an account is deleted. See `store/COMPLIANCE.md`.
