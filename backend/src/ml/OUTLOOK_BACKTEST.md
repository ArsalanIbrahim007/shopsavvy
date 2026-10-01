# Wait-or-buy outlook: backtest

Generated 2026-10-01T07:29:34.670Z by `src/scripts/ml/price-outlook-backtest.js`. Read-only.

The outlook (`src/services/priceOutlook.service.js`) is not a price forecast. It says what a product's own recorded prices show:
too early to say (under 7 days or 5 records), flat, at its lowest recorded price, well above its usual price, or in between.
This replays it on past records: for each record with a later record 5 to 9 days on, the verdict uses only the history up to that day,
and is compared with whether the price then fell 3% or more, rose 3% or more, or stayed put.

Records compared: 221, starting 2026-07-03, the last one on 2026-08-17.
A verdict with fewer than 30 comparisons is marked "too few" and should not be read as evidence.

| Verdict at the time | Comparisons | Listings | Fell 3%+ a week later | Rose 3%+ a week later |
|---|---|---|---|---|
| Too early to say (not enough days of records) | 189 | 62 | 17.5% | 11.1% |
| Flat (the best price has not moved) | 0 | 0 | n/a | n/a |
| At its lowest recorded price | 12 | 10 | 0% (too few) | 25% (too few) |
| 5% or more above its usual price | 14 | 7 | 50% (too few) | 7.1% (too few) |
| Around its usual price | 6 | 6 | 33.3% (too few) | 0% (too few) |
| All | 221 | | 19% | 11.3% |

## How to read it

- The verdict is worth showing only if "5% or more above its usual price" fell more often than the rows around it, and "at its lowest" rose or
  stayed put more often. If the rows look alike, the verdict carries no information and the page should say so.
- Comparisons from one listing on neighbouring days overlap, so they are not independent; the Listings column counts distinct listings.
- Daily records only started on 2026-09-27. Before that records were about five days apart, so most verdicts before then are "too early".
- Re-run this as the history grows. Until the judgeable rows have at least 30 comparisons each it cannot support a claim either way.
