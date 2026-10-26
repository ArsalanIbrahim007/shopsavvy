# Load test

Run 26 Oct 2026, 18:42 with `src/scripts/ops/load-test.js` on one machine: 12th Gen Intel(R) Core(TM) i3-12100F (8 threads), 32 GB RAM, Windows_NT 10.0.26200, Node v24.17.0.
The API and MongoDB ran on that same machine, with two grouping workers and the catalogue as it stood (28,645 listings).
Each phase ran 30 s; each shopper sends a request, waits for the answer and sends the next (no pause between them, so this is
far busier than real shoppers, who read a page before the next click). Requests come from 200 visitor addresses through X-Forwarded-For.

"Turned away" is the API answering 503 "busy, try again in a moment" on purpose when its grouping queue is full, so a flood
cannot pile up; "failed" is anything else that went wrong (an error or no answer).

| Shoppers at once | Answered per second | Median | 95th percentile | 99th percentile | Turned away (busy) | Failed | Rate-limited |
|---|---|---|---|---|---|---|---|
| 10 | 26.7 | 329 ms | 929 ms | 1266 ms | 0 | 0 | 0 |
| 25 | 34.6 | 673 ms | 1605 ms | 1943 ms | 0 | 0 | 0 |
| 50 | 37.6 | 1236 ms | 3028 ms | 3672 ms | 0 | 0 | 0 |

## By kind of request

### 10 shoppers at once

| Request | Share of the mix | Answered | Median | 95th percentile | Turned away (busy) | Failed | Rate-limited |
|---|---|---|---|---|---|---|---|
| search | 30% | 239 | 361 ms | 657 ms | 0 | 0 | 0 |
| product page | 25% | 202 | 628 ms | 1157 ms | 0 | 0 | 0 |
| category page | 15% | 118 | 71 ms | 220 ms | 0 | 0 | 0 |
| home: deals and counts | 10% | 93 | 96 ms | 361 ms | 0 | 0 | 0 |
| search suggestions | 10% | 69 | 302 ms | 545 ms | 0 | 0 | 0 |
| price drops | 5% | 38 | 57 ms | 199 ms | 0 | 0 | 0 |
| extension lookup | 5% | 43 | 653 ms | 1359 ms | 0 | 0 | 0 |

### 25 shoppers at once

| Request | Share of the mix | Answered | Median | 95th percentile | Turned away (busy) | Failed | Rate-limited |
|---|---|---|---|---|---|---|---|
| search | 30% | 314 | 798 ms | 1411 ms | 0 | 0 | 0 |
| product page | 25% | 234 | 1287 ms | 1908 ms | 0 | 0 | 0 |
| category page | 15% | 179 | 172 ms | 364 ms | 0 | 0 | 0 |
| home: deals and counts | 10% | 99 | 273 ms | 816 ms | 0 | 0 | 0 |
| search suggestions | 10% | 105 | 583 ms | 847 ms | 0 | 0 | 0 |
| price drops | 5% | 57 | 192 ms | 438 ms | 0 | 0 | 0 |
| extension lookup | 5% | 51 | 1125 ms | 1802 ms | 0 | 0 | 0 |

### 50 shoppers at once

| Request | Share of the mix | Answered | Median | 95th percentile | Turned away (busy) | Failed | Rate-limited |
|---|---|---|---|---|---|---|---|
| search | 30% | 342 | 1541 ms | 2599 ms | 0 | 0 | 0 |
| product page | 25% | 267 | 2583 ms | 3550 ms | 0 | 0 | 0 |
| category page | 15% | 184 | 377 ms | 685 ms | 0 | 0 | 0 |
| home: deals and counts | 10% | 109 | 516 ms | 1002 ms | 0 | 0 | 0 |
| search suggestions | 10% | 122 | 1177 ms | 1650 ms | 0 | 0 | 0 |
| price drops | 5% | 50 | 364 ms | 675 ms | 0 | 0 | 0 |
| extension lookup | 5% | 53 | 508 ms | 3327 ms | 0 | 0 | 0 |

## What this does and does not show

- One machine played every part (API, database and shoppers), so the shoppers took CPU from the API: a server with the database
  elsewhere would do better. The figures are for this machine and this catalogue.
- Searches were for phrases already fresh, so no store was asked during the test. A search whose prices are stale answers from
  stored prices just as fast and refreshes in the background; a phrase never searched before waits for the stores (10 to 20 s).
- The catalogue caches were built before the test (as at start-up), so category pages read from memory.
