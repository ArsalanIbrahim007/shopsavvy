# Online from this PC (for user testing)

The website is hosted free on Cloudflare Pages. The API, the database and the nightly price refresh stay on this PC, and an ngrok
tunnel gives the API a fixed public address. No card and no student verification are needed. The site works **while this PC is on
and `Run ShopSavvy Online.cmd` is running**; otherwise the pages open but show no prices.

For an always-on server, see `README.md` in this folder (a cloud server; Google Cloud's free trial needs a card).

## 1. ngrok (once)

1. Sign up at ngrok.com.
2. Install it: download it from ngrok.com/download, or in PowerShell: `winget install ngrok.ngrok`. Open a new terminal afterwards.
3. In the ngrok dashboard, copy your authtoken (*Getting Started > Your Authtoken*) and run, typing the token yourself:
   ```
   ngrok config add-authtoken <your token>
   ```
4. In the dashboard, open *Domains*: the free plan gives one fixed domain (like `something.ngrok-free.app`). Write that domain,
   without `https://`, on the only line of `deploy\ngrok-domain.txt`. The file is not committed.

## 2. Cloudflare Pages (once)

1. Sign up at dash.cloudflare.com. *Workers & Pages > Create > Pages > Connect to Git*, and pick the ShopSavvy repository, branch
   `main`.
2. Build settings:
   - Root directory: `frontend`
   - Build command: `npm run build`
   - Output directory: `dist`
   - Environment variables: `VITE_API_URL` = `https://<your ngrok domain>/api`, and `NODE_VERSION` = `22`
3. *Save and Deploy*. Cloudflare gives the site an address like `https://shopsavvy.pages.dev`; every push to `main` rebuilds it.

## 3. The API's settings on this PC (once)

Add two lines to `backend\.env` (your website's address from step 2):

```
CORS_ORIGINS=https://shopsavvy.pages.dev
TRUST_PROXY=1
```

`CORS_ORIGINS` lets the website read the API; `TRUST_PROXY=1` makes the rate limits count each visitor, not ngrok (one proxy).

## 4. Going online

1. Make sure nothing else uses port 5000 (stop `npm run dev` if it is running).
2. Double-click `Run ShopSavvy Online.cmd` in the project folder. Two windows open: the API, and ngrok showing the address.
3. Wait a minute or two after starting: the API groups the catalogue first (until then the first pages come from the last saved copy).
4. Open your Cloudflare Pages address on a phone to check, then send it to the testers.

The nightly scrape (Task Scheduler, 10 PM) runs as before; it does not need the tunnel.

## Limits

- Free ngrok shows visitors a one-time warning page when they open an API address directly. The website's own requests skip it
  (frontend `src/api/client.js`), so testers using the site never see it.
- If the PC sleeps, restarts or loses power or internet, the site shows no prices until `Run ShopSavvy Online.cmd` runs again.
  For the defense, do not rely on it: have the demo running locally too, or a recording.
