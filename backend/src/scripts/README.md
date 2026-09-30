# Scripts

Run these from the `backend/` folder (they read `.env` from there), for example
`node src/scripts/diagnostics/check-platform.js`.

**Anything that writes has a `--dry` option that only reports what it would do. Run that first.**

| Folder | Purpose | Writes to the database? |
|---|---|---|
| `checks/` | Classification and grouping checks against known cases (`npm run check:grouping`, `check:grouping-ml`, `check:categories`) | no |
| `diagnostics/` | Read-only reports: attribute coverage, platform counts, discount classification, history depth, why two listings did or did not group, and an end-to-end search check (`check-api.js`, needs the API running) | no |
| `maintenance/` | Clean-up and repair: remove accessories, seed data or HTML titles, backfill attributes, repair types, trim history | **yes** (use `--dry` first) |
| `demo-data/` | Simulated price history and inflated "was" prices for demonstrations. Entries are tagged as simulated | **yes** (use `--dry` first) |
| `ml/` | The matching model's dataset, training and evaluation pipeline, in numbered order | only its own files |
| top level | `seed.js` (scrapes a default set of queries), `run-scheduled-scrape.js`, `prewarm-demo.js`, `merge-duplicate-listings.js`, `audit-scrapers.js`, `benchmark-scrapers.js`, `report-price-anomalies.js` | see each file's header |

Do not run the `maintenance/` or `demo-data/` scripts against a database you care about without a backup.
