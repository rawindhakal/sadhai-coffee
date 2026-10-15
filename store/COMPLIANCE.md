# Store compliance checklist

How the app meets the Google Play and Apple App Store rules that apply to it. "Done" means it is in the code. "You" means a step only the publisher can do.

| Requirement | Where | Status |
|---|---|---|
| **Account deletion inside the app** (Apple 5.1.1(v), Google Play account deletion policy) | App: Account, Profile, Delete my account. Web: `/delete-account`. API: `DELETE /me` (password required, blocked while an order is in progress, erases personal data, keeps pseudonymised order records) | Done |
| **Web page for account deletion** (Google requires a public URL) | `https://sadhaicoffee.com/delete-account` | Done. You: put the URL in Play Console, App content, Data safety |
| **Privacy policy URL** in both stores and inside the app | `/privacy`, linked from sign-up, Profile and the web footer | Done. You: have it reviewed and set company details in `web/src/lib/site.ts` |
| **Terms of use** and consent at sign-up | `/terms`, required checkbox on register (app and web) | Done |
| **Data export** (good practice, privacy law) | Profile, Copy my data / Download my data. API: `GET /me/export` | Done |
| **Purpose strings for permissions** | iOS `NSLocationWhenInUseUsageDescription` explains the single use. Android asks only for coarse and fine location while in use, never background | Done |
| **Permission is optional** (Apple 5.1.1(iv)) | The app works without location: choose a station by hand | Done |
| **Apple privacy manifest** | `mobile/ios/Runner/PrivacyInfo.xcprivacy` (no tracking, collected data types, UserDefaults reason) | Done. Plugins ship their own manifests |
| **App Privacy labels / Play Data safety** | `store/DATA-SAFETY.md` has the answers to enter | You: enter them in the consoles |
| **Push notifications permission** (Apple 4.5.4, Android 13) | Asked only after the customer agrees in our own dialog (after the first order) or flips the switch in Account. Order and pass messages are always sent; offers are one a day at most, can be turned off, and are never sent between 21:00 and 07:00 automatically. Tokens are removed on sign-out and account deletion | Done |
| **No tracking, no ads SDKs, no advertising ID** | None are included | Done |
| **Export compliance (encryption)** | `ITSAppUsesNonExemptEncryption = false` (only standard HTTPS) | Done |
| **HTTPS only in release** | Android release has cleartext off (debug manifest allows local http). iOS ATS is on, with only local-network allowed for development | Done. You: point `API_URL` at an https domain |
| **Sign in with Apple** (Apple 4.8) | Not required: the app uses its own phone and password login, no third-party social login | N/A |
| **In-app purchase rules** (Apple 3.1.1, Google Payments) | Customers buy physical goods and food (coffee, merch) and vouchers redeemable for them in person, so external payment (Fonepay, cash) is allowed. No digital content or subscriptions | Done. Keep it that way |
| **User-generated content** (Apple 1.2) | The only free text is an optional order note and rating comment, visible only to the station and managers, not to other customers. No public feed | Done |
| **Minimum functionality / not a web wrapper** (Apple 4.2) | Native Flutter app with location, live order tracking and a pass wallet | Done |
| **Accessibility basics** | Semantic labels on controls, 44 px minimum touch targets, text contrast 4.5:1 (brand tokens), reduced-motion respected, system text scaling works | Done. You: test with VoiceOver and TalkBack before release |
| **Target API level** (Google) | Uses Flutter's current default `targetSdk` | Done. Rebuild with the latest Flutter before each release |
| **App signing** | Android reads `android/key.properties` for the upload key (use Play App Signing). iOS signs with your Apple team in Xcode | You: create keys and add secrets |
| **Support contact and developer details** | `/support`, `web/src/lib/site.ts` | You: fill in real email and company |
| **Content rating** | Everyone / 4+ (no violence, gambling, user chat) | You: complete the questionnaires |
| **Force-update path** | `GET /version` with `min_app_version`, blocking update screen in the app | Done |
| **Review access** | Apple and Google reviewers need a working account | You: create a dedicated review customer in production and put it in the review notes (`store/RELEASE.md`) |

Not testable on the build machine used so far: it has no Xcode, no accepted Android licences and no device. Run the release checklist in `store/RELEASE.md` on a machine that does.
