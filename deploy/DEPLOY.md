# Updating the server to v1.7.0 (no online payments)

Do these on the server, as the user that runs the app. Take a backup first. **Never run `npm run seed` on the server**: it erases the database.

1. **Look first (changes nothing).** `bash deploy/inspect-server.sh` and read the output: where the app lives, how it is run (pm2, docker or systemd), the commit and version, and whether any orders are still "awaiting payment".
2. **Back up the database.**
   ```bash
   mkdir -p ~/backups && pg_dump -Fc sadhai_coffee > ~/backups/sadhai-$(date +%F-%H%M).dump
   ```
   (With Docker: `docker compose exec db pg_dump -U sadhai -Fc sadhai_coffee > ~/backups/...dump`.)
3. **Get the code.** `git fetch && git status` (it should be clean; if the server has local edits, save them first with `git stash`), then `git checkout main && git pull`.
4. **Update the API.**
   ```bash
   cd backend && npm ci --omit=dev
   npm run migrate        # safe to run again; it also cancels any order or pass still waiting for an online payment and removes the old gateway keys
   ```
5. **Build the web app** with the production address:
   ```bash
   cd ../web && npm ci
   NEXT_PUBLIC_API_URL=https://sadhaicoffee.com/api npm run build
   ```
6. **Restart** the API and the web app the way they are run (`pm2 restart all`, `docker compose up -d --build`, or `systemctl restart ...`).
7. **Check.**
   ```bash
   curl -s https://sadhaicoffee.com/api/config | head -c 400     # payment_methods should be ["cash","pass"]
   curl -s -o /dev/null -w '%{http_code}\n' https://sadhaicoffee.com/
   ```
   Then sign in as the owner: Settings, "App and company" should show only addresses and company details, and a test order placed from the web goes straight to the station queue.

## Old payment keys
`npm run migrate` also deletes any gateway keys saved from the owner dashboard. In `backend/.env`, delete any `ESEWA_*`, `KHALTI_*`, `FONEPAY_*`, `PAYMENT_MODE` and `CASH_ENABLED` lines; they are ignored now.

## Roll back
Restore the dump (`pg_restore -c -d sadhai_coffee ~/backups/<file>.dump`), `git checkout <previous commit>`, rebuild the web app and restart.

## Mobile apps
The apps from before v1.7.0 still show an eSewa option. Raise `MIN_APP_VERSION` to `1.7.0` once the new app builds are published, so old apps ask for an update.
