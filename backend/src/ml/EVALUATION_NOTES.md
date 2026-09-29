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
