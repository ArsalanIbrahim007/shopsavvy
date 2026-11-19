# Will the price drop within 7 days? (R2)

Generated 2026-11-18T23:49:28.586Z by `src/scripts/ml/forecast/02-train-evaluate.js` from `dataset.json` (built 2026-11-18 by 01-build-dataset.js; samples from 2026-10-04).

A sample is one recorded day of one listing. It is a drop when a record within the next 7 days is 3% or more below that day's price.
A day whose next week was not seen (no record at least 5 days on), or with fewer than 7 days of records behind it, is not a sample.
Features use only the records up to the sample day (src/ml/forecast/features.js). All samples: 238878 samples, 49892 listings, 2709 drops (1.13%), 2026-10-08 to 2026-11-14.

Drops are rare, so accuracy is not reported: "never drops" would be about 98.9% accurate and useless. Intervals are 95%,
from 1,000 resamples of whole listings (a listing's neighbouring days are not independent).

## Strict evaluation (by date, with a full week between training labels and the test days)

- Training: 49772 samples, 13765 listings, 509 drops (1.02%), 2026-10-08 to 2026-11-02.
- Test: 113675 samples, 47442 listings, 1186 drops (1.04%), 2026-11-10 to 2026-11-14.

The 1186 test drops come from **609 listings**: a figure resting on so few listings can move a lot as history grows.

| Forecast | AUC | Average precision | Brier skill | Top 10%: precision | recall | lift |
|---|---|---|---|---|---|---|
| Trained model (logistic regression) | 0.622 (0.600 to 0.644) | 0.022 | -0.032 (-0.047 to -0.020) | 2.0% | 19.0% | 1.90 |
| No change: never drops (the base rate for everyone) | 0.500 | 0.005 | 0.000 | 0.0% | 0.0% | 0.00 |
| Outlook rule: how far above its 30-day median | 0.516 (0.504 to 0.529) | 0.011 | n/a | 0.6% | 6.2% | 0.62 |
| It just fell: the drop over the last 7 days | 0.488 (0.473 to 0.502) | 0.007 | n/a | 0.7% | 6.9% | 0.69 |
| Store-wide: share of the store's prices that fell this week | 0.754 (0.736 to 0.773) | 0.025 | n/a | 3.9% | 37.2% | 3.72 |

Chance level: AUC 0.5, average precision 0.010 (the test drop rate), Brier skill 0 (no better than predicting the training
base rate, 1.0%, for everything). L2 chosen by cross-validation: 0.1 (0.001: AP 0.077, 0.01: AP 0.078, 0.1: AP 0.082, 1: AP 0.067).

Against the strongest baseline ("Store-wide: share of the store's prices that fell this week"): AUC -0.132 (-0.161 to -0.105). The interval includes zero: the model is not shown to rank drop risk better than that baseline.

Shuffled-label check: 20 models trained on the same features with the labels shuffled scored AUC 0.542 on average and
0.734 at most (noise alone, on a test set this size). The real model's 0.622 is not above all of them (permutation p = 0.190).

## Provisional evaluation (other listings, later days)

- Training: 87972 samples, 24912 listings, 1096 drops (1.25%), 2026-10-08 to 2026-11-09 (70% of listings, days up to 2026-11-09).
- Test: 33864 samples, 14074 listings, 356 drops (1.05%), 2026-11-10 to 2026-11-14 (the other 30% of listings, days after 2026-11-09).
- A listing's own future never reaches training. A sale that moved many prices of one store in the overlapping week can still be learnt
  from that store's other listings, so these figures may be optimistic; the strict evaluation is the one to quote once it is possible.

The 356 test drops come from **183 listings**: a figure resting on so few listings can move a lot as history grows.

| Forecast | AUC | Average precision | Brier skill | Top 10%: precision | recall | lift |
|---|---|---|---|---|---|---|
| Trained model (logistic regression) | 0.716 (0.675 to 0.751) | 0.028 | -0.079 (-0.130 to -0.036) | 2.4% | 22.5% | 2.25 |
| No change: never drops (the base rate for everyone) | 0.500 | 0.005 | 0.000 | 0.0% | 0.0% | 0.00 |
| Outlook rule: how far above its 30-day median | 0.536 (0.512 to 0.559) | 0.013 | n/a | 0.8% | 7.9% | 0.79 |
| It just fell: the drop over the last 7 days | 0.470 (0.441 to 0.499) | 0.006 | n/a | 0.5% | 5.1% | 0.51 |
| Store-wide: share of the store's prices that fell this week | 0.751 (0.715 to 0.787) | 0.025 | n/a | 3.9% | 37.4% | 3.74 |

Chance level: AUC 0.5, average precision 0.011 (the test drop rate), Brier skill 0 (no better than predicting the training
base rate, 1.2%, for everything). L2 chosen by cross-validation: 0.01 (0.001: AP 0.073, 0.01: AP 0.074, 0.1: AP 0.071, 1: AP 0.065).

Against the strongest baseline ("Store-wide: share of the store's prices that fell this week"): AUC -0.035 (-0.081 to 0.013). The interval includes zero: the model is not shown to rank drop risk better than that baseline.

Shuffled-label check: 20 models trained on the same features with the labels shuffled scored AUC 0.488 on average and
0.642 at most (noise alone, on a test set this size). The real model's 0.716 is above every one of them (permutation p = 0.048).

## What the model learned (trained on every sample)

L2 0.01. Weights on standardized features (positive raises the predicted chance of a drop), largest first:

| Feature | Weight |
|---|---|
| changes30 | +0.221 |
| rangePosition | +0.135 |
| logPrice | -0.130 |
| storeFell7 | +0.109 |
| daysSinceChange | -0.102 |
| is_tv | -0.090 |
| vsMedian | +0.078 |
| historyDays | +0.072 |
| is_smartwatch | +0.063 |
| is_laptop | +0.050 |
| claimedDiscount | -0.031 |
| is_smartphone | +0.022 |
| volatility | +0.018 |
| inStock | -0.016 |
| is_tablet | -0.014 |
| is_headphones | +0.011 |
| change14 | -0.010 |
| change7 | +0.006 |

## On the product page

A store's price whose score is in the top 5.0% of all samples (score 0.0226 or more) gets the note "Higher chance
of a price drop this week" (src/services/dropChance.service.js). It quotes the strict test's own top 5.0%: those dropped
3.0 times as often as the rest (15.2% of the drops), yet only 3.2% of them did, so it never says a price will drop.
5.0% rather than 10%: at 10% the note showed on 23 of the 48 most compared products' pages. The store-wide feature
(storeFell7) is set to its training average there, as it needs every listing's history.

## Limits

- Short history: daily recording began 2026-09-27 and the nightly scrape refreshes each listing about every three days, so the samples
  cover about two weeks of one season. A November sale (11.11) may behave nothing like this.
- Re-run 01 and 02 as history grows; results may change in either direction.
