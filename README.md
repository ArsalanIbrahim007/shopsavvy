# ShopSavvy

ShopSavvy compares electronics and home-appliance prices across Pakistani online stores, and is honest about them. It
collects listings from 23 stores, works out which listings are the *same product*, and shows them side by side with a
check of every claimed discount against the price history and the other stores. Final Year Project, Bahria University
Karachi.

## What it does

- **Search and compare.** One search across 23 stores, grouped by product, so each product is a price comparison.
  Searches answer at once from stored prices and refresh them from the stores in the background; the page updates
  itself when the new prices arrive.
- **Ten categories:** smartphones, laptops, TVs, tablets, smartwatches, headphones, air conditioners, refrigerators,
  washing machines and monitors, each with its own filters (storage, PTA status, screen size, tonnage, capacity...).
- **Product matching.** Hard rules veto a match when a decisive attribute differs (storage, RAM, screen size, PTA status,
  model code, condition, tonnage, series...), and a trained classifier (logistic regression) decides the rest.
- **Honest prices.**
  - A claimed "was" price is checked against the listing's own history and against what other stores charge.
  - A price far out of line is flagged as unusual, and never shown as the lowest price or counted as a saving.
  - PTA-approved and non-PTA phones are never compared.
  - A price not checked for 14 days is labelled and left out of the comparison.
- **Price history and advice.** Every offer's price is recorded nightly. The product page shows the history, says whether
  to buy now or wait, and marks the lowest price recorded. A price-drops page lists recent falls.
- **Price alerts** by email (no account: double opt-in, a cancel link in every email).
- **Paste a link** from Amazon, AliExpress or Temu to see what the product costs in Pakistan.
- **For the browser extension** (in progress): an endpoint that tells which product a store's page is, and where it is
  cheaper (`GET /api/listings/match`).
- **Found by search engines:** a sitemap, schema.org product data and canonical addresses on product pages.

## How accurate it is

Every figure is measured on the live catalogue, from samples labelled by hand. Each report says how it was measured and
what it does not measure.

| What | Result | Report |
|---|---|---|
| Merge precision, phones, laptops, TVs, tablets, watches, headphones (an offer placed under the right product) | 95.9% | [GROUPING_EVALUATION.md](backend/src/ml/GROUPING_EVALUATION.md) |
| Merge precision, appliances and monitors | 97.7% | [GROUPING_EVALUATION_APPLIANCES.md](backend/src/ml/GROUPING_EVALUATION_APPLIANCES.md) |
| Recall (two stores' offers of one product shown as one product) | 64.3% | [GROUPING_RECALL.md](backend/src/ml/GROUPING_RECALL.md) |
| Pair precision on the recall sample | 98.8% | [GROUPING_RECALL.md](backend/src/ml/GROUPING_RECALL.md) |
| Trained matcher on held-out pairs (accuracy / precision) | 80.0% / 78.6% | [EVALUATION_REPORT.md](backend/src/ml/EVALUATION_REPORT.md) |
| Fake-discount detector | see report | [discount/EVALUATION_REPORT.md](backend/src/ml/discount/EVALUATION_REPORT.md) |

The matcher is tuned to avoid showing a shopper another product's price (precision) before bringing every offer of a
product together (recall). The scripts that draw, label and score these samples are in `backend/src/scripts/ml/`
(`07`–`12`).

## Stores

PriceOye, Mega.pk, Shophive, iShopping, Paklap, W11Stop, Mi Store, MyMart, Al-Fatah, XcessoriesHub, eezepc, LEDshop,
Techroid, Subhan Electronics, Jalal Electronics, Japan Electronics, Zero Lifestyle, Audionic, Ronin, Baseus, Infinix,
AlfaMall and Faysal DigiMall.

A store is added only after its terms of service and `robots.txt` are checked. Daraz and Telemart are switched off
because their terms forbid automated reading, and several other stores were never added for the same reason. Requests
keep a polite delay per store, and a store that stops answering is paused rather than retried. The stores added through
the platform adapters are read through their public product endpoints, with a User-Agent that says who is asking.
iShopping and Paklap are read with a headless browser, because they refuse plain requests.

## How it is built

```
frontend/  React 19 + Vite single-page app
   │  REST (JSON)
backend/   Node.js + Express 5 API
   ├── scrapers/   one per store, plus shared adapters (Shopify, WooCommerce, a storefront API) and Playwright for the
   │               stores that need a real browser
   ├── services/   matching (rules + trained classifier), grouping (in worker threads), deal scores, discount checks,
   │               price history, alerts, search, catalogues, sitemap
   ├── jobs/       nightly scrape and price recording; alert checks every 15 minutes
   └── ml/         the trained models, the labelled datasets and the evaluation reports
MongoDB    listings, price history, alerts
```

## Getting started

Requirements: Node.js 24 and a running MongoDB.

```bash
cd backend
npm install               # also installs Playwright's Chromium (needed by the iShopping and Paklap scrapers)
cp .env.example .env      # Windows PowerShell: copy .env.example .env; then set at least MONGO_URI
npm run dev               # API on http://localhost:5000, docs at http://localhost:5000/api-docs
```

```bash
cd frontend
npm install
npm run dev               # web app on http://localhost:5173
```

An empty database fills itself: a search for something not stored fetches it from the stores. `node src/scripts/seed.js`
scrapes a default set of queries first (`--clear` wipes existing listings). The nightly scrape that builds price history
runs inside the API when `SCHEDULED_SCRAPING=true`, or on its own with `node src/scripts/run-scheduled-scrape.js` (on
Windows, `src/scripts/ops/Run ShopSavvy Scrape.cmd` can be scheduled with Task Scheduler).

### Configuration (`backend/.env`)

| Variable | Purpose |
|---|---|
| `MONGO_URI` | MongoDB connection string |
| `PORT` | API port (default 5000) |
| `ADMIN_API_KEY` | Enables the endpoints that write by hand and forced re-scrapes (`x-admin-key` header). Empty: switched off |
| `SCHEDULED_SCRAPING` | `true` runs the nightly scrape inside the API. Off by default |
| `WARM_DEALS` | `false` skips filling the deals and catalogue caches at start-up |
| `GROUPING_WORKERS` | Worker threads for grouping (default 2) |
| `ALERT_TOKEN_SECRET` | Signs the confirm and cancel links in alert emails; a long random value |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Sends alert emails. Not set: emails are written to the server log instead |
| `ALERT_AUTO_CONFIRM` | `true` skips email confirmation of alerts. Demonstrations only |
| `PUBLIC_BASE_URL` | The API's public address, for the links in alert emails (default `http://localhost:<PORT>`) |
| `PUBLIC_SITE_URL` | The website's public address, for links back to it (sitemap, extension) (default `http://localhost:5173`) |
| `CORS_ORIGINS` | Websites allowed to read the API from a browser, comma separated (`https://shopsavvy.example`). Not set: `localhost` only |
| `TRUST_PROXY` | Behind a host's proxy, how many proxy hops to believe for the visitor's address (usually `1`). Not set: no proxy |
| `GROQ_API_KEY`, `SERPAPI_KEY` | Optional: an experimental product-discovery layer, off by default |

The frontend is built with `VITE_API_URL` (the API's full address, default `http://localhost:5000/api`); its
`robots.txt` names the sitemap from it, or from `SITEMAP_URL`. `SITE_URL` (the website's own address) gives link
previews of the site their picture; a product's Share button hands out the API's `/share/product/...` page, whose
preview shows that product.

### Deploying

Set `CORS_ORIGINS`, `TRUST_PROXY`, `PUBLIC_SITE_URL`, `PUBLIC_BASE_URL` and the SMTP settings on the API's host, and
build the frontend with `VITE_API_URL` pointing at the API and `SITE_URL` at the website. The nightly scrape needs a machine that stays on and can run
Chromium.

## Tests

```bash
cd backend && npm test            # over 1,000 unit and API tests (Vitest); no database or network needed
cd frontend && npm test           # over 570 unit, component and accessibility tests
cd frontend && npm run lint
```

GitHub runs the backend tests and the frontend lint, tests and build on every push to `main` and every pull request
(`.github/workflows/ci.yml`). Changes to the matching rules are also checked against the live catalogue with the scripts
in `backend/src/scripts/ml/` before they are kept.

## Privacy

No accounts, cookies, analytics or ads. The only personal data kept is the email address given for a price alert, for as
long as the alert needs it; see the site's privacy page (`/privacy`).

## Team

| Who | What |
|---|---|
| Arsalan Ibrahim | Backend and API, matching and the trained models, evaluation, frontend, scheduling and deployment |
| Muzammil Zafar | Scrapers for PriceOye, Mega, Shophive and W11Stop; product categories; specifications engine and Compare page |
| Abuzar | Scrapers for iShopping and Paklap; shared scraper utilities; the browser extension |

See [CONTRIBUTING.md](CONTRIBUTING.md) for the branch workflow.

## License

[MIT](LICENSE).
