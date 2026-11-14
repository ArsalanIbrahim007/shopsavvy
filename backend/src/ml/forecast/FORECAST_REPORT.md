# Will the price drop within 7 days? (R2)

Generated 2026-11-14T05:52:21.553Z by `src/scripts/ml/forecast/02-train-evaluate.js` from `dataset.json` (built 2026-11-14 by 01-build-dataset.js; samples from 2026-10-04).

A sample is one recorded day of one listing. It is a drop when a record within the next 7 days is 3% or more below that day's price.
A day whose next week was not seen (no record at least 5 days on), or with fewer than 7 days of records behind it, is not a sample.
Features use only the records up to the sample day (src/ml/forecast/features.js). All samples: 108522 samples, 31802 listings, 1201 drops (1.11%), 2026-10-08 to 2026-11-09.

Drops are rare, so accuracy is not reported: "never drops" would be about 98.9% accurate and useless. Intervals are 95%,
from 1,000 resamples of whole listings (a listing's neighbouring days are not independent).

## Strict evaluation (by date, with a full week between training labels and the test days)

- Training: 38303 samples, 8454 listings, 432 drops (1.13%), 2026-10-08 to 2026-10-28.
- Test: 47864 samples, 26167 listings, 541 drops (1.13%), 2026-11-05 to 2026-11-09.

The 541 test drops come from **356 listings**: a figure resting on so few listings can move a lot as history grows.

| Forecast | AUC | Average precision | Brier skill | Top 10%: precision | recall | lift |
|---|---|---|---|---|---|---|
| Trained model (logistic regression) | 0.663 (0.624 to 0.699) | 0.064 | 0.012 (0.001 to 0.024) | 4.4% | 39.0% | 3.90 |
| No change: never drops (the base rate for everyone) | 0.500 | 0.006 | 0.000 | 0.0% | 0.0% | 0.00 |
| Outlook rule: how far above its 30-day median | 0.551 (0.529 to 0.571) | 0.032 | n/a | 1.6% | 13.9% | 1.39 |
| It just fell: the drop over the last 7 days | 0.469 (0.449 to 0.489) | 0.007 | n/a | 0.5% | 4.4% | 0.44 |
| Store-wide: share of the store's prices that fell this week | 0.601 (0.565 to 0.638) | 0.018 | n/a | 2.3% | 20.0% | 2.00 |

Chance level: AUC 0.5, average precision 0.011 (the test drop rate), Brier skill 0 (no better than predicting the training
base rate, 1.1%, for everything). L2 chosen by cross-validation: 0.1 (0.001: AP 0.084, 0.01: AP 0.083, 0.1: AP 0.088, 1: AP 0.080).

Against the strongest baseline ("Store-wide: share of the store's prices that fell this week"): AUC +0.062 (0.030 to 0.091). The interval is above zero: the model ranks drop risk better than that baseline, beyond resampling noise.

Shuffled-label check: 20 models trained on the same features with the labels shuffled scored AUC 0.485 on average and
0.737 at most (noise alone, on a test set this size). The real model's 0.663 is not above all of them (permutation p = 0.143).

## Provisional evaluation (other listings, later days)

- Training: 38730 samples, 11287 listings, 406 drops (1.05%), 2026-10-08 to 2026-11-03 (70% of listings, days up to 2026-11-03).
- Test: 15824 samples, 7840 listings, 179 drops (1.13%), 2026-11-04 to 2026-11-09 (the other 30% of listings, days after 2026-11-03).
- A listing's own future never reaches training. A sale that moved many prices of one store in the overlapping week can still be learnt
  from that store's other listings, so these figures may be optimistic; the strict evaluation is the one to quote once it is possible.

The 179 test drops come from **108 listings**: a figure resting on so few listings can move a lot as history grows.

| Forecast | AUC | Average precision | Brier skill | Top 10%: precision | recall | lift |
|---|---|---|---|---|---|---|
| Trained model (logistic regression) | 0.649 (0.570 to 0.717) | 0.055 | 0.004 (-0.019 to 0.023) | 4.0% | 35.2% | 3.52 |
| No change: never drops (the base rate for everyone) | 0.500 | 0.006 | 0.000 | 0.0% | 0.0% | 0.00 |
| Outlook rule: how far above its 30-day median | 0.568 (0.531 to 0.609) | 0.031 | n/a | 1.9% | 16.8% | 1.68 |
| It just fell: the drop over the last 7 days | 0.472 (0.430 to 0.515) | 0.008 | n/a | 0.6% | 5.6% | 0.56 |
| Store-wide: share of the store's prices that fell this week | 0.565 (0.503 to 0.627) | 0.016 | n/a | 2.4% | 21.2% | 2.12 |

Chance level: AUC 0.5, average precision 0.011 (the test drop rate), Brier skill 0 (no better than predicting the training
base rate, 1.0%, for everything). L2 chosen by cross-validation: 0.1 (0.001: AP 0.078, 0.01: AP 0.080, 0.1: AP 0.088, 1: AP 0.082).

Against the strongest baseline ("Outlook rule: how far above its 30-day median"): AUC +0.081 (0.013 to 0.144). The interval is above zero: the model ranks drop risk better than that baseline, beyond resampling noise.

Shuffled-label check: 20 models trained on the same features with the labels shuffled scored AUC 0.473 on average and
0.693 at most (noise alone, on a test set this size). The real model's 0.649 is not above all of them (permutation p = 0.143).

## What the model learned (trained on every sample)

L2 0.01. Weights on standardized features (positive raises the predicted chance of a drop), largest first:

| Feature | Weight |
|---|---|
| changes30 | +0.240 |
| rangePosition | +0.220 |
| volatility | +0.119 |
| historyDays | +0.111 |
| is_tv | -0.105 |
| logPrice | -0.102 |
| storeFell7 | +0.086 |
| is_laptop | +0.080 |
| is_headphones | +0.061 |
| is_smartwatch | +0.050 |
| vsMedian | +0.048 |
| is_smartphone | +0.047 |
| inStock | +0.035 |
| is_tablet | -0.031 |
| daysSinceChange | -0.029 |
| change7 | -0.023 |
| claimedDiscount | -0.016 |
| change14 | +0.009 |

## On the product page

A store's price whose score is in the top 5.0% of all samples (score 0.0283 or more) gets the note "Higher chance
of a price drop this week" (src/services/dropChance.service.js). It quotes the strict test's own top 5.0%: those dropped
7.4 times as often as the rest (36.8% of the drops), yet only 8.3% of them did, so it never says a price will drop.
5.0% rather than 10%: at 10% the note showed on 23 of the 48 most compared products' pages. The store-wide feature
(storeFell7) is set to its training average there, as it needs every listing's history.

## Limits

- Short history: daily recording began 2026-09-27 and the nightly scrape refreshes each listing about every three days, so the samples
  cover about two weeks of one season. A November sale (11.11) may behave nothing like this.
- Re-run 01 and 02 as history grows; results may change in either direction.
