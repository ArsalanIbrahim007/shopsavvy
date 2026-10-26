# Load test

Run 26 Oct 2026, 18:36 with `src/scripts/ops/load-test.js` on one machine: 12th Gen Intel(R) Core(TM) i3-12100F (8 threads), 32 GB RAM, Windows_NT 10.0.26200, Node v24.17.0.
The API and MongoDB ran on that same machine, with two grouping workers and the catalogue as it stood (28,194 listings).
Each phase ran 30 s; each shopper sends a request, waits for the answer and sends the next (no pause between them, so this is
far busier than real shoppers, who read a page before the next click). Requests come from 200 visitor addresses through X-Forwarded-For.

"Turned away" is the API answering 503 "busy, try again in a moment" on purpose when its grouping queue is full, so a flood
cannot pile up; "failed" is anything else that went wrong (an error or no answer).

| Shoppers at once | Answered per second | Median | 95th percentile | 99th percentile | Turned away (busy) | Failed | Rate-limited |
|---|---|---|---|---|---|---|---|
| 10 | 29.4 | 304 ms | 839 ms | 1118 ms | 0 | 0 | 0 |
| 25 | 32.5 | 804 ms | 1763 ms | 2038 ms | 4 | 0 | 0 |
| 50 | 27.7 | 485 ms | 4670 ms | 5240 ms | 292 | 0 | 0 |

## By kind of request

### 10 shoppers at once

| Request | Share of the mix | Answered | Median | 95th percentile | Turned away (busy) | Failed | Rate-limited |
|---|---|---|---|---|---|---|---|
| search | 30% | 270 | 380 ms | 748 ms | 0 | 0 | 0 |
| product page | 25% | 214 | 605 ms | 1054 ms | 0 | 0 | 0 |
| category page | 15% | 125 | 37 ms | 197 ms | 0 | 0 | 0 |
| home: deals and counts | 10% | 88 | 64 ms | 228 ms | 0 | 0 | 0 |
| search suggestions | 10% | 83 | 195 ms | 460 ms | 0 | 0 | 0 |
| price drops | 5% | 54 | 32 ms | 171 ms | 0 | 0 | 0 |
| extension lookup | 5% | 47 | 560 ms | 946 ms | 0 | 0 | 0 |

### 25 shoppers at once

| Request | Share of the mix | Answered | Median | 95th percentile | Turned away (busy) | Failed | Rate-limited |
|---|---|---|---|---|---|---|---|
| search | 30% | 279 | 1204 ms | 1638 ms | 3 | 0 | 0 |
| product page | 25% | 262 | 1452 ms | 1950 ms | 1 | 0 | 0 |
| category page | 15% | 154 | 52 ms | 185 ms | 0 | 0 | 0 |
| home: deals and counts | 10% | 87 | 85 ms | 231 ms | 0 | 0 | 0 |
| search suggestions | 10% | 97 | 249 ms | 565 ms | 0 | 0 | 0 |
| price drops | 5% | 45 | 53 ms | 165 ms | 0 | 0 | 0 |
| extension lookup | 5% | 50 | 218 ms | 1792 ms | 0 | 0 | 0 |

### 50 shoppers at once

| Request | Share of the mix | Answered | Median | 95th percentile | Turned away (busy) | Failed | Rate-limited |
|---|---|---|---|---|---|---|---|
| search | 30% | 172 | 3462 ms | 4683 ms | 144 | 0 | 0 |
| product page | 25% | 123 | 4289 ms | 5352 ms | 140 | 0 | 0 |
| category page | 15% | 196 | 185 ms | 435 ms | 0 | 0 | 0 |
| home: deals and counts | 10% | 107 | 298 ms | 630 ms | 0 | 0 | 0 |
| search suggestions | 10% | 111 | 703 ms | 1074 ms | 0 | 0 | 0 |
| price drops | 5% | 74 | 181 ms | 429 ms | 0 | 0 | 0 |
| extension lookup | 5% | 49 | 195 ms | 5200 ms | 8 | 0 | 0 |

## What this does and does not show

- One machine played every part (API, database and shoppers), so the shoppers took CPU from the API: a server with the database
  elsewhere would do better. The figures are for this machine and this catalogue.
- Searches were for phrases already fresh, so no store was asked during the test. A search whose prices are stale answers from
  stored prices just as fast and refreshes in the background; a phrase never searched before waits for the stores (10 to 20 s).
- The catalogue caches were built before the test (as at start-up), so category pages read from memory.
