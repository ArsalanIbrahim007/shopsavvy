# Will the price drop within 7 days? (R2)

Generated 2026-11-08T16:32:10.971Z by `src/scripts/ml/forecast/02-train-evaluate.js` from `dataset.json` (built 2026-11-08 by 01-build-dataset.js; samples from 2026-10-04).

A sample is one recorded day of one listing. It is a drop when a record within the next 7 days is 3% or more below that day's price.
A day whose next week was not seen (no record at least 5 days on), or with fewer than 7 days of records behind it, is not a sample.
Features use only the records up to the sample day (src/ml/forecast/features.js). All samples: 51424 samples, 14171 listings, 535 drops (1.04%), 2026-10-08 to 2026-11-03.

Drops are rare, so accuracy is not reported: "never drops" would be about 99.0% accurate and useless. Intervals are 95%,
from 1,000 resamples of whole listings (a listing's neighbouring days are not independent).

## Strict evaluation (by date, with a full week between training labels and the test days)

- Training: 28008 samples, 7047 listings, 340 drops (1.21%), 2026-10-08 to 2026-10-22.
- Test: 12135 samples, 8088 listings, 99 drops (0.82%), 2026-10-30 to 2026-11-03.

The 99 test drops come from **70 listings**: a figure resting on so few listings can move a lot as history grows.

| Forecast | AUC | Average precision | Brier skill | Top 10%: precision | recall | lift |
|---|---|---|---|---|---|---|
| Trained model (logistic regression) | 0.700 (0.620 to 0.783) | 0.072 | 0.015 (-0.012 to 0.043) | 4.0% | 48.5% | 4.85 |
| No change: never drops (the base rate for everyone) | 0.500 | 0.004 | 0.000 | 0.0% | 0.0% | 0.00 |
| Outlook rule: how far above its 30-day median | 0.560 (0.513 to 0.613) | 0.041 | n/a | 1.3% | 16.2% | 1.62 |
| It just fell: the drop over the last 7 days | 0.414 (0.363 to 0.456) | 0.004 | n/a | 0.2% | 2.0% | 0.20 |
| Store-wide: share of the store's prices that fell this week | 0.513 (0.435 to 0.598) | 0.008 | n/a | 1.5% | 18.2% | 1.82 |

Chance level: AUC 0.5, average precision 0.008 (the test drop rate), Brier skill 0 (no better than predicting the training
base rate, 1.2%, for everything). L2 chosen by cross-validation: 0.1 (0.001: AP 0.091, 0.01: AP 0.097, 0.1: AP 0.108, 1: AP 0.105).

Against the strongest baseline ("Outlook rule: how far above its 30-day median"): AUC +0.140 (0.058 to 0.216). The interval is above zero: the model ranks drop risk better than that baseline, beyond resampling noise.

Shuffled-label check: 20 models trained on the same features with the labels shuffled scored AUC 0.487 on average and
0.641 at most (noise alone, on a test set this size). The real model's 0.700 is above every one of them (permutation p = 0.048).

## Provisional evaluation (other listings, later days)

- Training: 19835 samples, 4982 listings, 237 drops (1.19%), 2026-10-08 to 2026-10-22 (70% of listings, days up to 2026-10-22).
- Test: 6825 samples, 2943 listings, 62 drops (0.91%), 2026-10-24 to 2026-11-03 (the other 30% of listings, days after 2026-10-22).
- A listing's own future never reaches training. A sale that moved many prices of one store in the overlapping week can still be learnt
  from that store's other listings, so these figures may be optimistic; the strict evaluation is the one to quote once it is possible.

The 62 test drops come from **39 listings**: a figure resting on so few listings can move a lot as history grows.

| Forecast | AUC | Average precision | Brier skill | Top 10%: precision | recall | lift |
|---|---|---|---|---|---|---|
| Trained model (logistic regression) | 0.539 (0.393 to 0.676) | 0.093 | 0.014 (0.003 to 0.028) | 3.1% | 33.9% | 3.38 |
| No change: never drops (the base rate for everyone) | 0.500 | 0.005 | 0.000 | 0.0% | 0.0% | 0.00 |
| Outlook rule: how far above its 30-day median | 0.585 (0.516 to 0.667) | 0.079 | n/a | 1.8% | 19.4% | 1.93 |
| It just fell: the drop over the last 7 days | 0.408 (0.339 to 0.469) | 0.005 | n/a | 0.0% | 0.0% | 0.00 |
| Store-wide: share of the store's prices that fell this week | 0.512 (0.415 to 0.605) | 0.010 | n/a | 1.3% | 14.5% | 1.45 |

Chance level: AUC 0.5, average precision 0.009 (the test drop rate), Brier skill 0 (no better than predicting the training
base rate, 1.2%, for everything). L2 chosen by cross-validation: 0.1 (0.001: AP 0.112, 0.01: AP 0.110, 0.1: AP 0.117, 1: AP 0.109).

Against the strongest baseline ("Outlook rule: how far above its 30-day median"): AUC -0.046 (-0.171 to 0.072). The interval includes zero: the model is not shown to rank drop risk better than that baseline.

Shuffled-label check: 20 models trained on the same features with the labels shuffled scored AUC 0.483 on average and
0.741 at most (noise alone, on a test set this size). The real model's 0.539 is not above all of them (permutation p = 0.333).

## What the model learned (trained on every sample)

L2 1. Weights on standardized features (positive raises the predicted chance of a drop), largest first:

| Feature | Weight |
|---|---|
| changes30 | +0.013 |
| volatility | +0.013 |
| change7 | +0.010 |
| change14 | +0.009 |
| vsMedian | +0.008 |
| is_smartphone | +0.006 |
| historyDays | +0.006 |
| rangePosition | +0.006 |
| is_laptop | +0.004 |
| daysSinceChange | -0.004 |
| is_tv | -0.003 |
| storeFell7 | +0.003 |
| logPrice | +0.002 |
| is_headphones | +0.001 |
| inStock | +0.001 |
| is_tablet | -0.001 |
| is_smartwatch | +0.001 |
| claimedDiscount | +0.000 |

## On the product page

A store's price whose score is in the top 5.0% of all samples (score 0.0116 or more) gets the note "Higher chance
of a price drop this week" (src/services/dropChance.service.js). It quotes the strict test's own top 5.0%: those dropped
6.5 times as often as the rest (32.3% of the drops), yet only 5.3% of them did, so it never says a price will drop.
5.0% rather than 10%: at 10% the note showed on 23 of the 48 most compared products' pages. The store-wide feature
(storeFell7) is set to its training average there, as it needs every listing's history.

## Limits

- Short history: daily recording began 2026-09-27 and the nightly scrape refreshes each listing about every three days, so the samples
  cover about two weeks of one season. A November sale (11.11) may behave nothing like this.
- Re-run 01 and 02 as history grows; results may change in either direction.
