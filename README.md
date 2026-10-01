# ShopSavvy

ShopSavvy is a price-comparison site for electronics sold by Pakistani online stores. It collects listings
from several stores, works out which listings are the *same product*, and shows them side by side with a
verdict on whether each price is a good deal. Final Year Project, Bahria University Karachi.

## What it does

- **Search and compare.** One search across the stores, with the results grouped by product so each group is a
  price comparison (PriceOye, Mega, Shophive, W11Stop, Telemart, iShopping, Paklap).
- **Product matching.** Decides whether two store titles are the same product. Hard rules (storage, RAM, screen
  size, PTA status, model codes, condition) can veto a match, and a trained classifier (logistic regression)
  decides the rest. Held-out evaluation is in `backend/src/ml/EVALUATION_REPORT.md`.
- **Deal analysis.** Each offer gets a score and a recommendation. It checks a discount against the price history,
  against other stores, and for prices that look like listing errors.
- **Price history and alerts.** Prices are recorded over time; a shopper can ask to be told when a product
  drops below a target price.
- **Top deals and search suggestions** for the home page, served from stored data without scraping.

## Repository layout

| Folder | What is in it |
|---|---|
| `backend/` | Node.js + Express API, scrapers, matching and ranking code, background jobs, tests |
| `frontend/` | React 19 + Vite web app (see [frontend/README.md](frontend/README.md)) |
| `backend/src/scripts/` | One-off tools: see [backend/src/scripts/README.md](backend/src/scripts/README.md) |

## Getting started

Requirements: a recent Node.js (developed on 24) and a running MongoDB.

```bash
cd backend
npm install
cp .env.example .env      # (Windows PowerShell: copy .env.example .env) then edit it: at least MONGO_URI, and ADMIN_API_KEY if you need the admin endpoints
npm run dev               # API on http://localhost:5000
```

```bash
cd frontend
npm install
npm run dev               # web app on http://localhost:5173
```

The API documentation (Swagger) is served at <http://localhost:5000/api-docs>. Data comes from the scrapers:
searching for something that has not been scraped recently fetches it live, and `node src/scripts/seed.js` scrapes a
default set of queries to fill an empty database (`--clear` wipes existing listings first).

### Configuration (`backend/.env`)

| Variable | Purpose |
|---|---|
| `MONGO_URI` | MongoDB connection string |
| `PORT` | API port (default 5000) |
| `ADMIN_API_KEY` | Enables the endpoints that write by hand and forced re-scrapes; sent in the `x-admin-key` header. Leave empty to keep them switched off |
| `SCHEDULED_SCRAPING` | `true` runs a daily background re-scrape to build price history. Off by default |
| `WARM_DEALS` | `false` skips filling the top-deals cache at start-up |
| `GROUPING_WORKERS` | Worker threads used for heavy grouping (default 2) |
| `ALERT_TOKEN_SECRET` | Signs the confirm / cancel links in alert emails; use a long random value |
| `PUBLIC_BASE_URL` | The API's public address, used in those links (default `http://localhost:<PORT>`) |
| `ALERT_AUTO_CONFIRM` | `true` skips email confirmation of alerts. Demonstrations only |
| `CORS_ORIGINS` | Websites allowed to read the API from a browser, comma separated origins (for example `https://shopsavvy.example`). Not set: only `localhost` pages, which is what local development needs. **Set it when deploying** |

The frontend reads `VITE_API_URL` if the API is not on `http://localhost:5000/api`.

## Tests

```bash
cd backend && npm test        # unit and API tests (Vitest); the API tests need no database
cd frontend && npm test           # unit and component tests (Vitest)
cd frontend && npm run lint
```

`npm run check:grouping`, `check:grouping-ml`, `check:categories` and `check:api` (the last needs the API running)
run the older script-style checks.

## Tech

React, Vite, Node.js, Express 5, MongoDB with Mongoose, Axios, Cheerio and Playwright for collection, Vitest for tests.

## Working together

See [CONTRIBUTING.md](CONTRIBUTING.md) for the branch workflow.
