# Will the price drop within 7 days? (R2)

Generated 2026-11-07T00:59:00.319Z by `src/scripts/ml/forecast/02-train-evaluate.js` from `dataset.json` (built 2026-11-07 by 01-build-dataset.js; samples from 2026-10-04).

A sample is one recorded day of one listing. It is a drop when a record within the next 7 days is 3% or more below that day's price.
A day whose next week was not seen (no record at least 5 days on), or with fewer than 7 days of records behind it, is not a sample.
Features use only the records up to the sample day (src/ml/forecast/features.js). All samples: 44479 samples, 10900 listings, 476 drops (1.07%), 2026-10-08 to 2026-11-02.

Drops are rare, so accuracy is not reported: "never drops" would be about 98.9% accurate and useless. Intervals are 95%,
from 1,000 resamples of whole listings (a listing's neighbouring days are not independent).

## Strict evaluation (by date, with a full week between training labels and the test days)

- Training: 25554 samples, 6753 listings, 330 drops (1.29%), 2026-10-08 to 2026-10-21.
- Test: 6176 samples, 4078 listings, 44 drops (0.71%), 2026-10-29 to 2026-11-02.

The 44 test drops come from **33 listings**: a figure resting on so few listings can move a lot as history grows.

| Forecast | AUC | Average precision | Brier skill | Top 10%: precision | recall | lift |
|---|---|---|---|---|---|---|
| Trained model (logistic regression) | 0.764 (0.651 to 0.860) | 0.142 | 0.049 (0.012 to 0.104) | 3.9% | 54.5% | 5.45 |
| No change: never drops (the base rate for everyone) | 0.500 | 0.004 | 0.000 | 0.0% | 0.0% | 0.00 |
| Outlook rule: how far above its 30-day median | 0.600 (0.520 to 0.691) | 0.131 | n/a | 1.8% | 25.0% | 2.50 |
| It just fell: the drop over the last 7 days | 0.376 (0.304 to 0.442) | 0.004 | n/a | 0.0% | 0.0% | 0.00 |
| Store-wide: share of the store's prices that fell this week | 0.448 (0.338 to 0.565) | 0.007 | n/a | 0.6% | 9.1% | 0.91 |

Chance level: AUC 0.5, average precision 0.007 (the test drop rate), Brier skill 0 (no better than predicting the training
base rate, 1.3%, for everything). L2 chosen by cross-validation: 0.1 (0.001: AP 0.103, 0.01: AP 0.108, 0.1: AP 0.117, 1: AP 0.111).

Against the strongest baseline ("Outlook rule: how far above its 30-day median"): AUC +0.163 (0.044 to 0.269). The interval is above zero: the model ranks drop risk better than that baseline, beyond resampling noise.

Shuffled-label check: 20 models trained on the same features with the labels shuffled scored AUC 0.507 on average and
0.695 at most (noise alone, on a test set this size). The real model's 0.764 is above every one of them (permutation p = 0.048).

## Provisional evaluation (other listings, later days)

- Training: 16274 samples, 4325 listings, 260 drops (1.60%), 2026-10-08 to 2026-10-20 (70% of listings, days up to 2026-10-20).
- Test: 6306 samples, 2216 listings, 36 drops (0.57%), 2026-10-21 to 2026-11-02 (the other 30% of listings, days after 2026-10-20).
- A listing's own future never reaches training. A sale that moved many prices of one store in the overlapping week can still be learnt
  from that store's other listings, so these figures may be optimistic; the strict evaluation is the one to quote once it is possible.

The 36 test drops come from **27 listings**: a figure resting on so few listings can move a lot as history grows.

| Forecast | AUC | Average precision | Brier skill | Top 10%: precision | recall | lift |
|---|---|---|---|---|---|---|
| Trained model (logistic regression) | 0.397 (0.299 to 0.526) | 0.049 | -0.030 (-0.162 to 0.073) | 1.0% | 16.7% | 1.67 |
| No change: never drops (the base rate for everyone) | 0.500 | 0.003 | 0.000 | 0.0% | 0.0% | 0.00 |
| Outlook rule: how far above its 30-day median | 0.576 (0.520 to 0.649) | 0.057 | n/a | 1.0% | 16.7% | 1.67 |
| It just fell: the drop over the last 7 days | 0.425 (0.351 to 0.482) | 0.003 | n/a | 0.0% | 0.0% | 0.00 |
| Store-wide: share of the store's prices that fell this week | 0.563 (0.475 to 0.658) | 0.007 | n/a | 0.3% | 5.6% | 0.56 |

Chance level: AUC 0.5, average precision 0.006 (the test drop rate), Brier skill 0 (no better than predicting the training
base rate, 1.6%, for everything). L2 chosen by cross-validation: 0.001 (0.001: AP 0.142, 0.01: AP 0.141, 0.1: AP 0.137, 1: AP 0.120).

Against the strongest baseline ("Outlook rule: how far above its 30-day median"): AUC -0.179 (-0.236 to -0.106). The interval includes zero: the model is not shown to rank drop risk better than that baseline.

Shuffled-label check: 20 models trained on the same features with the labels shuffled scored AUC 0.537 on average and
0.757 at most (noise alone, on a test set this size). The real model's 0.397 is not above all of them (permutation p = 0.762).

## What the model learned (trained on every sample)

L2 0.1. Weights on standardized features (positive raises the predicted chance of a drop), largest first:

| Feature | Weight |
|---|---|
| changes30 | +0.101 |
| volatility | +0.080 |
| change14 | +0.052 |
| historyDays | +0.049 |
| change7 | +0.047 |
| is_smartphone | +0.046 |
| is_laptop | +0.042 |
| daysSinceChange | -0.038 |
| rangePosition | +0.037 |
| vsMedian | +0.033 |
| is_tv | -0.031 |
| storeFell7 | +0.031 |
| is_headphones | +0.019 |
| logPrice | +0.017 |
| inStock | +0.011 |
| is_smartwatch | +0.010 |
| is_tablet | -0.008 |
| claimedDiscount | +0.004 |

## Limits

- Short history: daily recording began 2026-09-27 and the nightly scrape refreshes each listing about every three days, so the samples
  cover about two weeks of one season. A November sale (11.11) may behave nothing like this.
- Re-run 01 and 02 as history grows; results may change in either direction.
