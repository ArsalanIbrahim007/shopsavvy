# Deploying ShopSavvy

| Part | Where | Cost |
|---|---|---|
| Website (`frontend/`) | Cloudflare Pages, built from GitHub on every push to `main` | free |
| API and the nightly price refresh (`backend/`) | a 2 GB DigitalOcean droplet, Ubuntu 24.04 (the API needs about 1.2 GB, the scrapers a browser) | GitHub Student Pack credit |
| HTTPS name for the API | DuckDNS (`<name>.duckdns.org`) + Caddy on the droplet | free |
| Database | MongoDB Atlas M0 (512 MB; ShopSavvy uses about 135 MB) | free |

Do the steps in order. Nothing secret goes into git: the server's settings live only in `backend/.env` on the server.

## 1. Accounts

1. **GitHub Student Developer Pack** (education.github.com/pack): sign in with GitHub, verify with the university email or ID card.
   Approval can take a day. It gives the DigitalOcean credit.
2. **DigitalOcean**: sign up through the Student Pack offer, so the credit is applied.
3. **MongoDB Atlas** (mongodb.com/atlas), **Cloudflare** (dash.cloudflare.com) and **DuckDNS** (duckdns.org: sign in with GitHub).

## 2. Database: Atlas, and copying the data

1. Atlas: create a free **M0** cluster, region **AWS Mumbai (ap-south-1)** (nearest to Pakistan).
2. *Database Access*: add a user with a long password (letters and digits only, so it needs no escaping in the address).
3. *Network Access*: add your current IP address (for the copy), and later the droplet's.
4. *Connect > Drivers*: copy the address and put the database name before the `?`:
   `mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/shopsavvy?retryWrites=true&w=majority`
5. On your PC, with your local MongoDB running:
   ```
   cd backend
   node --env-file=.env src/scripts/ops/copy-database.js "<the Atlas address>"
   ```
   It copies every collection (about 137,000 documents, a few minutes over the internet) and prints the counts.

## 3. The server

1. DigitalOcean: *Create Droplet*: **Ubuntu 24.04**, **Basic, 2 GB / 1 CPU**, region **Bangalore** (nearest), authentication by
   SSH key or a root password. Note its IP address.
2. DuckDNS: add a subdomain (e.g. `shopsavvy-api`) and set its IP to the droplet's. The API's name is then
   `shopsavvy-api.duckdns.org`.
3. Atlas *Network Access*: add the droplet's IP.
4. Connect to the droplet (`ssh root@<ip>`, or the *Console* button on DigitalOcean) and run:
   ```
   curl -fsSL https://raw.githubusercontent.com/ArsalanIbrahim007/shopsavvy/main/deploy/setup-server.sh -o setup.sh
   bash setup.sh shopsavvy-api.duckdns.org
   ```
   The first run installs everything (about 5 minutes) and creates `/home/shopsavvy/shopsavvy/backend/.env`.
5. Fill it in: `nano /home/shopsavvy/shopsavvy/backend/.env` (every `FILL`: the Atlas address, the two addresses, two random
   keys). Save with Ctrl+O, Enter, Ctrl+X.
6. Run `bash setup.sh shopsavvy-api.duckdns.org` again. It starts the API, Caddy (HTTPS) and the nightly timer.
7. Check: `curl https://shopsavvy-api.duckdns.org/api/health` says `"status":"ok"` and `"db":"up"`.

## 4. The website: Cloudflare Pages

1. *Workers & Pages > Create > Pages > Connect to Git*: the `shopsavvy` repository, branch **main**.
2. Settings: project name `shopsavvy` (the address becomes `shopsavvy.pages.dev` if free), **root directory `frontend`**,
   build command **`npm run build`**, output directory **`dist`**.
3. Environment variables:
   - `VITE_API_URL` = `https://shopsavvy-api.duckdns.org/api`
   - `SITE_URL` = `https://shopsavvy.pages.dev` (the real Pages address)
   - `NODE_VERSION` = `24`
4. Deploy. `frontend/public/_redirects` makes every address (`/product/...`, `/results?...`) open the app.
5. If the Pages address differs from `shopsavvy.pages.dev`: put the real one in the server's `.env` (`CORS_ORIGINS`,
   `PUBLIC_SITE_URL`) and run `systemctl restart shopsavvy-api`.

## 5. After

- **Browser extension**: in its popup, *Settings*: `https://shopsavvy-api.duckdns.org` (it asks permission once).
- **The Windows nightly task**: switch it off once the server's first nightly refresh has run (`journalctl -u shopsavvy-scrape`),
  or both write to different databases.
- **Updating**: push to `main`. The website rebuilds by itself; for the API run `bash setup.sh shopsavvy-api.duckdns.org` on the
  server (it pulls `main` and restarts).
- **Logs**: `journalctl -u shopsavvy-api -f`; the nightly refresh: `journalctl -u shopsavvy-scrape`; when it runs next:
  `systemctl list-timers shopsavvy-scrape.timer`.
- **Backups**: Atlas M0 has no automatic backups. Run the copy script the other way now and then (to your PC's MongoDB):
  `MONGO_URI="<Atlas address>" node src/scripts/ops/copy-database.js "mongodb://127.0.0.1:27017/shopsavvy_backup" --replace`.
