# Will the price drop within 7 days? (R2)

Generated 2026-10-22T13:38:50.625Z by `src/scripts/ml/forecast/02-train-evaluate.js` from `dataset.json` (built 2026-10-22 by 01-build-dataset.js; samples from 2026-10-04).

A sample is one recorded day of one listing. It is a drop when a record within the next 7 days is 3% or more below that day's price.
A day whose next week was not seen (no record at least 5 days on), or with fewer than 7 days of records behind it, is not a sample.
Features use only the records up to the sample day (src/ml/forecast/features.js). All samples: 16127 samples, 4223 listings, 275 drops (1.71%), 2026-10-08 to 2026-10-17.

Drops are rare, so accuracy is not reported: "never drops" would be about 98.3% accurate and useless. Intervals are 95%,
from 1,000 resamples of whole listings (a listing's neighbouring days are not independent).

## Strict evaluation (by date, with a full week between training labels and the test days)

Not possible yet. A 7-day forecast tested on 5 days needs training samples whose label week ended before
those days, at least 2000 of them with 30 drops; today that leaves none.
With records arriving as they do now, it becomes possible once prices are recorded up to about **2026-10-28**: re-run 01 and 02 then.

## Provisional evaluation (other listings, later days)

- Training: 5906 samples, 2049 listings, 114 drops (1.93%), 2026-10-08 to 2026-10-11 (70% of listings, days up to 2026-10-11).
- Test: 2263 samples, 1000 listings, 26 drops (1.15%), 2026-10-13 to 2026-10-17 (the other 30% of listings, days after 2026-10-11).
- A listing's own future never reaches training. A sale that moved many prices of one store in the overlapping week can still be learnt
  from that store's other listings, so these figures may be optimistic; the strict evaluation is the one to quote once it is possible.

The 26 test drops come from **13 listings**: a figure resting on so few listings can move a lot as history grows.

| Forecast | AUC | Average precision | Brier skill | Top 10%: precision | recall | lift |
|---|---|---|---|---|---|---|
| Trained model (logistic regression) | 0.863 (0.702 to 0.960) | 0.222 | 0.092 (-0.136 to 0.265) | 8.4% | 73.1% | 7.32 |
| No change: never drops (the base rate for everyone) | 0.500 | 0.006 | 0.000 | 0.0% | 0.0% | 0.00 |
| Outlook rule: how far above its 30-day median | 0.600 (0.485 to 0.738) | 0.121 | n/a | 3.1% | 26.9% | 2.70 |
| It just fell: the drop over the last 7 days | 0.367 (0.192 to 0.546) | 0.013 | n/a | 1.8% | 15.4% | 1.54 |
| Store-wide: share of the store's prices that fell this week | 0.615 (0.502 to 0.702) | 0.014 | n/a | 0.0% | 0.0% | 0.00 |

Chance level: AUC 0.5, average precision 0.011 (the test drop rate), Brier skill 0 (no better than predicting the training
base rate, 1.9%, for everything). L2 chosen by cross-validation: 0.01 (0.001: AP 0.228, 0.01: AP 0.233, 0.1: AP 0.228, 1: AP 0.178).

Against the strongest baseline ("Store-wide: share of the store's prices that fell this week"): AUC +0.248 (0.092 to 0.378). The interval is above zero: the model ranks drop risk better than that baseline, beyond resampling noise.

Shuffled-label check: 20 models trained on the same features with the labels shuffled scored AUC 0.476 on average and
0.796 at most (noise alone, on a test set this size). The real model's 0.863 is above every one of them (permutation p = 0.048).

## What the model learned (trained on every sample)

L2 0.001. Weights on standardized features (positive raises the predicted chance of a drop), largest first:

| Feature | Weight |
|---|---|
| logPrice | +0.386 |
| historyDays | +0.322 |
| is_smartphone | +0.303 |
| is_tv | -0.289 |
| daysSinceChange | -0.261 |
| is_smartwatch | +0.221 |
| change7 | +0.221 |
| rangePosition | +0.189 |
| is_tablet | -0.163 |
| storeFell7 | +0.157 |
| changes30 | +0.147 |
| volatility | +0.120 |
| inStock | +0.101 |
| is_laptop | +0.093 |
| claimedDiscount | +0.089 |
| vsMedian | -0.081 |
| change14 | +0.058 |
| is_headphones | +0.052 |

## Limits

- Short history: daily recording began 2026-09-27 and the nightly scrape refreshes each listing about every three days, so the samples
  cover about two weeks of one season. A November sale (11.11) may behave nothing like this.
- Re-run 01 and 02 as history grows; results may change in either direction.
