#!/usr/bin/env bash
# Read-only look at a Sadhai server. Run it ON the server (nothing is changed, no secrets are printed):
#   bash inspect-server.sh
# Paste the output back to whoever is helping you.
set -u
say() { printf '\n== %s\n' "$*"; }

say "Host"
uname -a; uptime; df -h / | tail -1; free -h | head -2

say "Where the app lives"
for d in /var/www/sadhai-coffee /opt/sadhai-coffee /srv/sadhai-coffee /root/sadhai-coffee /home/*/sadhai-coffee; do
  [ -d "$d/.git" ] && { echo "$d"; (cd "$d" && git log -1 --format='commit %h  %ad  %s' --date=short && git status --short | head -5 && echo "VERSION: $(cat VERSION 2>/dev/null)"); }
done

say "Running processes (node, next, docker, pm2, nginx, postgres)"
ps aux | grep -E 'node|next|nginx|postgres|docker' | grep -v grep | awk '{print $1, $11, $12, $13, $14}' | head -20
command -v pm2 >/dev/null && pm2 list 2>/dev/null | head -20
command -v docker >/dev/null && docker ps --format '{{.Names}}  {{.Image}}  {{.Status}}' 2>/dev/null
systemctl list-units --type=service --state=running 2>/dev/null | grep -Ei 'sadhai|nginx|postgres|node|docker' | head

say "Listening ports"
ss -ltnp 2>/dev/null | awk 'NR==1 || /:(80|443|3000|4747|5432) /' | head

say "Nginx sites for sadhaicoffee.com"
grep -rl "sadhaicoffee" /etc/nginx 2>/dev/null | head
nginx -t 2>&1 | tail -2
ls /etc/letsencrypt/live 2>/dev/null

say "API health"
curl -s -m 5 -o /dev/null -w 'api  :4747/stations -> %{http_code}\n' http://127.0.0.1:4747/stations
curl -s -m 5 -o /dev/null -w 'web  :3000/        -> %{http_code}\n' http://127.0.0.1:3000/
curl -s -m 5 http://127.0.0.1:4747/version 2>/dev/null | head -c 300; echo

say "Environment variable NAMES the API uses (values hidden)"
for f in /var/www/sadhai-coffee/backend/.env /opt/sadhai-coffee/backend/.env /srv/sadhai-coffee/backend/.env /root/sadhai-coffee/backend/.env; do
  [ -f "$f" ] && { echo "$f"; sed -E 's/=.*/=<hidden>/' "$f" | grep -v '^#' | grep -v '^$'; }
done

say "Database (needs psql access as the app user; skip if it asks for a password)"
if command -v psql >/dev/null; then
  sudo -u postgres psql -Atc "select datname from pg_database where datname like 'sadhai%'" 2>/dev/null
  sudo -u postgres psql -d sadhai_coffee -Atc "select 'orders', count(*) from orders union all select 'orders awaiting payment', count(*) from orders where status='awaiting_payment' union all select 'passes pending', count(*) from passes where status='pending'" 2>/dev/null
fi
echo; echo "Done. Nothing was changed."
