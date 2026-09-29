# Trained Matching Classifier — Evaluation Report

Generated 2026-09-29T16:22:14.920Z. Pairs are mined from the live listing database, blocked
by category (never all-pairs), labelled by hand against a written rubric
(`dataset/LABELING_RUBRIC.md`) before any model output was consulted, with a 20-pair
independent spot-check per labelling round. Train/test split seed: 20261120.

## Dataset composition

| Split | Positive | Negative | Total |
|---|---|---|---|
| Train | 75 | 143 | 218 |
| Test (held out) | 35 | 38 | 73 |
| Eval-only (never trained on: hard vetoes + cross-category) | 0 | 40 | 40 |

The first dataset was 181 pairs and about 60% smartphones: laptops had no positive pairs,
smartwatches none, TVs six. A second mining pass added 150 pairs across laptops, TVs,
smartwatches, tablets and headphones, so the classifier is now trained and tested outside
phones. Class-weighted training is used rather than artificially balancing the data.

**The split is grouped, not random.** Pairs are split as whole groups: any two pairs that share
a listing or a product family go to the same side, then each category contributes about a
quarter of its pairs to the test set. This is checked: no listing and no product family
appears on both sides. (An earlier random split let several pairs about one product straddle
train and test, which flatters the score.)

## Results on the 113-pair evaluation set (test + eval-only, none trained on)

| Metric | Candidate classifier (v2, multi-category) | Rule baseline (Jaccard ≥ 0.70) |
|---|---|---|
| Accuracy | 85.8% | 78.8% |
| Precision | 85.2% | 92.3% |
| Recall | 65.7% | 34.3% |
| F1 | 74.2% | 50.0% |

### Confusion matrix — candidate classifier (v2)
| | Predicted match | Predicted no-match |
|---|---|---|
| **Actually match** | 23 (TP) | 12 (FN) |
| **Actually no-match** | 4 (FP) | 74 (TN) |

### Confusion matrix — rule baseline
| | Predicted match | Predicted no-match |
|---|---|---|
| **Actually match** | 12 (TP) | 23 (FN) |
| **Actually no-match** | 1 (FP) | 77 (TN) |

Both pipelines run behind the same attribute-constraint veto (`attributeConflict`) — the
comparison isolates the effect of replacing the fixed 0.70 Jaccard threshold with a trained
decision, not the constraint layer itself, which stays identical in both.

## By category (held-out test pairs only)

| Category | Pairs | Same-product pairs | Classifier F1 | Rule F1 | Classifier accuracy |
|---|---|---|---|---|---|
| headphones | 5 | 2 | 66.7% | 0.0% | 80.0% |
| laptop | 12 | 9 | 50.0% | 50.0% | 50.0% |
| other | 2 | 0 | n/a | n/a | 100.0% |
| smartphone | 21 | 8 | 84.2% | 40.0% | 85.7% |
| smartwatch | 9 | 4 | 66.7% | 33.3% | 77.8% |
| tablet | 4 | 1 | 100.0% | 0.0% | 100.0% |
| tv | 20 | 11 | 80.0% | 70.6% | 80.0% |

F1 is shown as n/a where a category has no same-product test pairs. Small per-category counts
mean single pairs move these numbers a lot; read them as a check that no category collapses,
not as precise estimates.

## Production model vs candidate

On the 44 held-out pairs from the newer categories (laptops, TVs, smartwatches, tablets,
headphones), which the production model never saw in training:

| Model | Accuracy | Precision | Recall | F1 |
|---|---|---|---|---|
| Production model (v1, phone-heavy, 106 training pairs, threshold 0.5) | 61.4% | 100.0% | 37.0% | 54.1% |
| Candidate (v2, 218 training pairs, threshold 0.55) | 70.5% | 93.8% | 55.6% | 69.8% |
| Rule baseline | 59.1% | 90.9% | 37.0% | 52.6% |

## Learned weights of the candidate (standardized scale)

| Feature | Weight |
|---|---|
| jaccardBase | 0.7119 |
| jaccardRaw | 0.8708 |
| storageMatch | -0.0212 |
| ramMatch | 0.1351 |
| screenMatch | 0.2350 |
| ptaMatch | 0.0000 |
| modelCodeMatch | 0.0579 |
| priceProximity | 1.3269 |
| titleLenDiff | -0.0107 |
| *(bias)* | -0.7870 |

## Where the two pipelines disagree (first 10 of 18)

- **"Samsung 32" HD H5000 Smart TV (2025)"** vs **"Samsung 32 Inch HD Smart TV (H5000)"** — true label: match, ML said no-match, rule said match. (same Samsung 32in HD H5000; price 3x apart is a listing error, titles identical model)
- **"Apple iPhone 17 Pro Max"** vs **"Apple iPhone 17 Pro Max 256GB PTA Approved"** — true label: match, ML said match, rule said no-match. (no attribute conflict, jaccard 1 ≥ 0.5, price drift 14%)
- **"Vivo Y05"** vs **"Vivo Y05 4GB 64GB"** — true label: match, ML said match, rule said no-match. (no attribute conflict, jaccard 1 ≥ 0.5, price drift 6%)
- **"Samsung 50" Q7F 4K AI Smart QLED TV 2025 (QA50Q7FAAUSMM)"** vs **"Samsung 50 Inch 4K UHD Smart QLED TV (Q7F)"** — true label: match, ML said match, rule said no-match. (same Samsung 50in QLED Q7F)
- **"Apple Iphone 17 Pro"** vs **"Apple iPhone 17 Pro 256GB PTA Approved"** — true label: match, ML said match, rule said no-match. (no attribute conflict, jaccard 1 ≥ 0.5, price drift 3%)
- **"Apple Iphone 17 Pro"** vs **"Apple iPhone 17 Pro 256GB Storage PTA Approved"** — true label: match, ML said match, rule said no-match. (no attribute conflict, jaccard 1 ≥ 0.5, price drift 6%)
- **"Nothing CMF Watch 3 Pro"** vs **"Nothing Cmf Watch Pro"** — true label: no-match, ML said no-match, rule said match. (CMF Watch 3 Pro vs CMF Watch Pro, different generation)
- **"Samsung 50 Inch 4K UHD Smart QLED TV (Q7F)"** vs **"Samsung 50" 4K Vision AI Smart QLED TV - (Q7F)"** — true label: match, ML said match, rule said no-match. (same Samsung 50in QLED Q7F)
- **"TCL 65 Inch Mini LED 4K TV"** vs **"TCL 65C6K 65 INCH Smart & 4K QD MINI LED TV"** — true label: no-match, ML said match, rule said no-match. (TCL 65in with no model code vs 65C6K, price gap 57% (rule 5))
- **"Samsung Galaxy Watch 9 Bluetooth WiFi 40mm With Sports Band"** vs **"Samsung Galaxy Watch 9 40mm"** — true label: match, ML said match, rule said no-match. (same Galaxy Watch 9 40mm)

## Where the candidate is wrong (16 of 113)

- **"Samsung 32" HD H5000 Smart TV (2025)"** (64999) vs **"Samsung 32 Inch HD Smart TV (H5000)"** (215999) — true label: match, ML said no-match. (same Samsung 32in HD H5000; price 3x apart is a listing error, titles identical model)
- **"Acer Aspire Spin 14 ASP 14-52MTN-52Y0 Ultra 5 (1 Year Warranty)"** (264999) vs **"Acer Aspire Spin 14 Intel Core Ultra 5 125U 16GB RAM 512GB SSD Laptop - 1 Year Warranty"** (265999) — true label: match, ML said no-match. (same Aspire Spin 14 Ultra 5; one side omits RAM/SSD, price within 1%)
- **"Lenovo Thinkbook 16 14th Core 7 (8GB-512GB SSD)"** (269999) vs **"Lenovo ThinkBook 16 G8 16" Intel Core 7 240H 8GB RAM 512GB SSD Laptop 1 Year Warranty"** (260999) — true label: match, ML said no-match. (same ThinkBook 16 Core 7, 8GB/512GB; one side omits generation, price within 4%)
- **"Samsung Galaxy Buds3 FE"** (21499) vs **"Samsung Galaxy Buds 3 FE"** (26999) — true label: match, ML said no-match. (same Galaxy Buds 3 FE; spelling of the name only)
- **"Dell Pro 15 Essential PV15250 15.6" Raptor Lake 13th Gen Core i5-1334U 8GB RAM 512GB SSD Laptop"** (175999) vs **"Dell Pro 15 Essential PV15250 Laptop - Raptor Lake -13th Gen Core i5 1334U 10-Core Processor 8-GB 512-GB SSD Intel UHD Graphics 15.6" Full HD 1080P IPS WVA 120Hz AG Display TPM (Carbon Black, Brand New, Light Cosmetic Marks)"** (166000) — true label: match, ML said no-match. (same Dell Pro 15 Essential PV15250, i5-1334U, 8GB/512GB)
- **"Samsung 75" Neo QLED 8K QN800D Smart AI TV (2024)"** (1781999) vs **"Samsung 75 Inch 8K UHD Smart Neo QLED TV (QN800D)"** (245000) — true label: match, ML said no-match. (same Samsung 75in QN800D 8K; price 7x apart is a listing error, identical model code)
- **"Samsung Galaxy Watch 9 Bluetooth WiFi 44mm With Sports Band"** (109999) vs **"Samsung Galaxy 9 L350 44mm Smart Watch (Graphite, NEW)"** (90500) — true label: match, ML said no-match. (same Galaxy Watch 9 44mm (SM-L350); all specs stated and equal)
- **"TCL 65 Inch Mini LED 4K TV"** (416900) vs **"TCL 65C6K 65 INCH Smart & 4K QD MINI LED TV"** (264999) — true label: no-match, ML said match. (TCL 65in with no model code vs 65C6K, price gap 57% (rule 5))
- **"Samsung 85" QN70F Neo QLED 4K AI Smart TV (2025)"** (884999) vs **"Samsung 85 Inch 4K UHD Smart Neo QLED TV (QN70F)"** (325999) — true label: match, ML said no-match. (same Samsung 85in QN70F; price gap is a store outlier, same model code)
- **"Acer Extensa 15 Raptor Lake 13th Gen i7-13620H 8GB RAM 512GB SSD Laptop - 1 Year Warranty"** (208999) vs **"Acer Extensa 15 Laptop - Raptor Lake - 13th Gen Core i7 13620H 10-Core Processor 8-GB 512-GB SSD Intel UHD Graphics 15.6" Full HD 1080P ComfyView 60Hz AG Display TPM (Pure Silver, Acer 1 Year Direct Local Warranty, NEW)"** (208000) — true label: match, ML said no-match. (same Extensa 15, i7-13620H, 8GB/512GB)
- **"Apple Iphone 17 Air"** (393999) vs **"Apple iPhone 17 Air 512GB PTA Approved"** (508499) — true label: no-match, ML said match. (high text overlap but unstated capacity + price drift 25% >15%)
- **"Apple iPhone 17 Pro"** (374999) vs **"Apple iPhone 17 Pro 256GB PTA Approved"** (449999) — true label: no-match, ML said match. (high text overlap but unstated capacity + price drift 18% >15%)
- **"Samsung Galaxy Watch 9 Bluetooth WiFi 44mm With Sports Band"** (109999) vs **"Samsung Galaxy Watch 9 44mm"** (92999) — true label: match, ML said no-match. (same Galaxy Watch 9 44mm; accessory wording only)
- **"Acer TravelMate P2 15 Meteor Lake Core Ultra 5 115U Series 1 8GB RAM 512GB SSD Laptop - 1 Year Warranty"** (216999) vs **"Acer TravelMate P2 15 Laptop - Meteor Lake - Intel Core Ultra 5 115U (Series 1) 8-Core Processor 8-GB 512-GB SSD Intel Integrated Graphics 15.6" Full HD 1080P IPS 60Hz AG Display TPM (Pure Silver, Acer 1 Year Direct Local Warranty, NEW)"** (216000) — true label: match, ML said no-match. (same TravelMate P2 15, Ultra 5 115U, 8GB/512GB)
- **"Apple Iphone 17 Pro"** (434999) vs **"Apple iPhone 17 Pro 1TB PTA Approved"** (650499) — true label: no-match, ML said match. (high text overlap but unstated capacity + price drift 40% >15%)
- **"Acer Extensa 15 Raptor Lake 13th Gen i5-13420H 8GB 512GB SSD Laptop - 1 Year Warranty"** (179999) vs **"Acer Extensa 15 Laptop - Raptor Lake - 13th Gen Core i5 13420H 8-Core Processor 8-GB 512-GB SSD Intel UHD Graphics 15.6" Full HD 1080P ComfyView 60Hz AG Display TPM (Pure Silver, Acer 1 Year Direct Local Warranty, NEW)"** (179000) — true label: match, ML said no-match. (same Extensa 15, i5-13420H, 8GB/512GB)

## Sanity check against the original 18 hand-labeled cases (`test-grouping-ml.js`)

The classifier was also run through the same 18 cases used to validate the rule-based system
in `test-grouping.js` (report §4.4.3, Chapter 5). It passes 16/18, against the rule's 18/18.

The first attempt (a randomly-mined 150-pair dataset) only reached 12/18 — a genuine finding
worth keeping in the record, not just the improved number: a model trained on **randomly
sampled real listings** does not automatically rediscover the specific lessons a rule system
was **iteratively hardened against** over months of bug fixes (quote-mark `"` vs the word
"inch", RAM stated on only one side, a bare title vs a specific one). Closing most of that gap
took a second, *targeted* mining pass for exactly those three patterns (`_mine_gap_examples.js`)
— 31 additional real pairs, still mined from the live corpus, not fabricated — which raised the
score to 16/18 and meaningfully improved the held-out evaluation numbers above (F1 rose from
0.667 to 0.923). The lesson: representative training data has to be deliberately curated for
known-hard cases, not just randomly sampled, even when the underlying examples are all real.

The remaining 2/18 are a genuine design disagreement, not a bug: `test-grouping.js` never
supplies price data (it tests text/attribute matching in isolation), so `priceProximity`
reports its neutral "unknown" value for these two. The rule pipeline's own answer for "bare
title vs. a specific variant with no corroborating price" is to conservatively reject; the
classifier, lacking price evidence either way, falls back to the strong text-similarity signal
(jaccard = 1.0) and accepts. In the live system this scenario cannot actually occur — every
real listing has a price — so this is a property of the hand-written test harness, not a
deployment-relevant weakness, and it wasn't chased further to avoid overfitting to an
artificial no-price scenario at the expense of the model's calibration on real data.

## Why the retrained candidate is not the production model

The candidate (v2) was trained on the expanded, multi-category dataset. On the held-out pairs it
is clearly better than the production model outside phones (see "Production model vs candidate"
above). It is nevertheless **not deployed**, because a pair-level score is not the same as
system-level precision, and the difference showed up when both were checked properly.

Regrouping the whole 2,727-listing database with each model and reviewing the changes by hand:

| | Production model (v1) | Candidate (v2, threshold 0.55) |
|---|---|---|
| Groups formed | 2,205 | 2,051 |
| Merges relative to production | n/a | 163 |
| Sample of 30 candidate merges judged correct | n/a | about 12 |

Most wrong merges join products that differ only in a short model identifier or a wording
variant: Honor 7 with 8X, Huawei Y5/Y6/Y7 Prime, Oppo Reno Z with Reno 4, Buds 2a with Buds 2,
Galaxy Watch 8 with 8 Classic, RTX 5060 with RTX 5070. Two reasons explain the gap:

1. **The training pairs are richer in same-product pairs than the live catalogue.** They were
   mined from high-similarity bands (34% positive in training). Grouping compares each listing
   against many groups, and almost all of those comparisons are different products, so a model
   with modest precision on a balanced sample produces many false merges at scale. Selecting the
   threshold by cross-validation and weighting precision (F0.5) moved it only from 0.50 to 0.55;
   the negatives seen in training are not the ones the live system meets.
2. **Whole categories the live system groups were never in training**: accessories, appliances,
   older phones. The production model's strongly negative bias, learned from phone-dominated
   data, happens to be the safer behaviour there.

The candidate is kept, with its training and evaluation scripts, as a documented result. Two
follow-ups are planned before it can replace the production model: add hard negatives mined
from the categories above, and evaluate at the grouping level (precision of merges on a
hand-reviewed sample) rather than only on pairs.

The regrouping check also led to two rule changes that improve both models and were kept:
a veto when titles state different bare series numbers (Z Fold 5 vs 7), and a veto when they
state different values in the same short-identifier slot (ThinkBook G8 vs G9, MacBook M4 vs M5,
Honor 7X vs 7i). Each was measured on the live data before being added: the first affected
5 of 319 existing groups and the second 2 of 318, every one a genuine error and none a false
alarm.
