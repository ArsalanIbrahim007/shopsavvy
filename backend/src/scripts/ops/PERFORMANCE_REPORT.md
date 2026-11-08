# Response times

Measured 2026-11-08T16:20:40.213Z against `http://localhost:5000` by `src/scripts/ops/measure-response-times.js`: each endpoint asked 21
times in a row from the same machine, the first answer ("first") apart from the rest (median and 95th percentile). Sizes are what was
sent (gzip) and the JSON it unpacks to.

| What | First | Median | 95th percentile | Sent | JSON |
|---|---|---|---|---|---|
| Health check | 126 ms | 122.6 ms | 152.0 ms | 0.3 KB | 0.3 KB |
| Home: most compared (5 phones) | 36 ms | 7.1 ms | 8.9 ms | 33.4 KB | 453.2 KB |
| Home: verified deals | 2 ms | 1.2 ms | 2.2 ms | 1.7 KB | 5.8 KB |
| Home: caught discounts | 1 ms | 0.8 ms | 1.3 ms | 0.9 KB | 2.1 KB |
| Search: "samsung galaxy a17" | 288 ms | 117.1 ms | 135.9 ms | 63.9 KB | 907.6 KB |
| Search: "iphone 17 pro max" | 185 ms | 105.0 ms | 179.4 ms | 44.5 KB | 562.3 KB |
| Product page | 1734 ms | 4.8 ms | 32.0 ms | 12.2 KB | 130.7 KB |
| Price drops | 1414 ms | 1.3 ms | 2.3 ms | 5.1 KB | 28.1 KB |
| Honest prices report | 3 ms | 0.7 ms | 0.8 ms | 2.1 KB | 5.2 KB |

How it is kept fast: answers are compressed; the category catalogues, deals, caught discounts and the honest-prices report are computed
in the background and kept (in memory, and on disk across restarts); a product page is kept a minute; a search answers from stored
prices at once and refreshes stale ones in the background; and the site starts loading a product when its card is hovered.
