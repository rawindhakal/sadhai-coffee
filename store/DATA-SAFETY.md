# Data safety and privacy label answers

Use these to fill in Google Play Console (App content, Data safety) and App Store Connect (App Privacy). They match `web/src/app/privacy/page.tsx` and `mobile/ios/Runner/PrivacyInfo.xcprivacy`. If you change what the app collects, change all three.

## Google Play: Data safety

- **Does your app collect or share user data?** Collects: yes. Shares: no (service providers acting for us, and payment providers the user chooses, are not "sharing" under Google's definition).
- **Is all data encrypted in transit?** Yes (HTTPS).
- **Can users request data deletion?** Yes. In app: Account, Profile, Delete my account. Web link: `https://<your-web-domain>/delete-account`.

| Data type | Collected | Shared | Optional | Purpose |
|---|---|---|---|---|
| Name | Yes | No | No | App functionality, account management |
| Phone number | Yes | No | No | App functionality, account management |
| Email address | Yes | No | Yes | App functionality, communications |
| Purchase history | Yes | No | No | App functionality, analytics (own reporting) |
| Approximate location | Yes (sent only when the user taps Use my location, not stored) | No | Yes | App functionality |
| Precise location | Yes (same request, not stored) | No | Yes | App functionality |
| User IDs (account id) | Yes | No | No | App functionality |
| Device or other IDs (push token, device type) | Yes, only if the customer turns notifications on | No | Yes | App functionality |
| Name and phone number typed at a self-order kiosk (guests) | Collected at the kiosk, not in the app | No | Needed for kiosk ordering only | App functionality |
| App interactions, crash logs, advertising ID, financial info (card numbers), contacts, photos, audio | No | | | |

## Apple: App Privacy

- **Data used to track you:** none.
- **Data linked to you:** Name, Phone Number, Email Address (optional), Purchase History, User ID: all for **App Functionality**. Coarse and precise location are used for App Functionality, are not stored, and are not linked to the account.
- **Data not collected:** contacts, browsing history, search history, diagnostics, advertising data, health, financial info.
- Privacy policy URL: `https://<your-web-domain>/privacy`.

## Play Console declarations

- Ads: No. News app: No. COVID-19 app: No. Government app: No. Financial features: none (payments are for goods and run through Fonepay).
- Target audience: 16 and over. Not designed for children.
- App access: provide the review account from `store/RELEASE.md`.
