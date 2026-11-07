#!/usr/bin/env bash
# setup-server.sh — sets up a fresh Ubuntu 24.04 server (a 2 GB DigitalOcean droplet) to run the ShopSavvy API and the nightly
# price refresh. Run as root, with the API's public name:
#
#   bash setup-server.sh shopsavvy-api.duckdns.org
#
# It installs Node 24, Caddy (HTTPS) and Chromium's libraries, adds swap, opens only SSH/HTTP/HTTPS, clones the repository into
# /home/shopsavvy/shopsavvy, installs the backend, and installs the services (API, nightly timer, Caddy). The first time it stops
# after creating backend/.env from deploy/env.production.example: fill that in, then run the same command again to start
# everything. Safe to run again: on later runs it pulls the latest main and restarts the API.
set -euo pipefail

DOMAIN="${1:?Usage: bash setup-server.sh <api domain, e.g. shopsavvy-api.duckdns.org>}"
REPO="https://github.com/ArsalanIbrahim007/shopsavvy.git"
APP_USER="shopsavvy"
HOME_DIR="/home/${APP_USER}"
APP_DIR="${HOME_DIR}/shopsavvy"

[ "$(id -u)" -eq 0 ] || { echo "Run as root."; exit 1; }

echo "== Swap (2 GB): the API and Chromium together are close to 2 GB of memory"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo "/swapfile none swap sw 0 0" >> /etc/fstab
fi

echo "== Packages: git, Node 24, Caddy, firewall"
apt-get update -y
apt-get install -y git curl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https ufw
if ! command -v node >/dev/null || ! node -v | grep -q '^v24'; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi
if ! command -v caddy >/dev/null; then
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y && apt-get install -y caddy
fi
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable

echo "== The app user and the code"
id "${APP_USER}" >/dev/null 2>&1 || useradd --create-home --shell /bin/bash "${APP_USER}"
if [ -d "${APP_DIR}/.git" ]; then
  sudo -u "${APP_USER}" git -C "${APP_DIR}" pull --ff-only origin main
else
  sudo -u "${APP_USER}" git clone --branch main "${REPO}" "${APP_DIR}"
fi

echo "== Backend packages and Chromium (for the scrapers that need a browser)"
sudo -u "${APP_USER}" bash -c "cd '${APP_DIR}/backend' && npm ci --omit=dev --ignore-scripts"
(cd "${APP_DIR}/backend" && npx --yes playwright install-deps chromium)
sudo -u "${APP_USER}" bash -c "cd '${APP_DIR}/backend' && npx playwright install chromium"

if [ ! -f "${APP_DIR}/backend/.env" ]; then
  cp "${APP_DIR}/deploy/env.production.example" "${APP_DIR}/backend/.env"
  chown "${APP_USER}:${APP_USER}" "${APP_DIR}/backend/.env" && chmod 600 "${APP_DIR}/backend/.env"
  echo
  echo "Created ${APP_DIR}/backend/.env. Fill in every FILL value (nano ${APP_DIR}/backend/.env),"
  echo "then run this command again to start everything."
  exit 0
fi
if grep -q "USER:PASSWORD@CLUSTER" "${APP_DIR}/backend/.env"; then
  echo "backend/.env still has the example MONGO_URI: fill it in first."; exit 1
fi

echo "== Services: API, nightly refresh at 03:00 PKT, HTTPS for ${DOMAIN}"
cp "${APP_DIR}/deploy/shopsavvy-api.service" "${APP_DIR}/deploy/shopsavvy-scrape.service" "${APP_DIR}/deploy/shopsavvy-scrape.timer" /etc/systemd/system/
sed "s/{\$API_DOMAIN}/${DOMAIN}/" "${APP_DIR}/deploy/Caddyfile" > /etc/caddy/Caddyfile
systemctl daemon-reload
systemctl enable --now shopsavvy-api.service shopsavvy-scrape.timer
systemctl restart shopsavvy-api.service
systemctl enable caddy && systemctl restart caddy

echo
echo "Started. Check, in a minute:  curl https://${DOMAIN}/api/health"
echo "Logs: journalctl -u shopsavvy-api -f    Nightly: systemctl list-timers shopsavvy-scrape.timer"
