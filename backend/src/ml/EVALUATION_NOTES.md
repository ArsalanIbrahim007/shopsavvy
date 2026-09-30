## Sanity check against the original 18 hand-labeled cases (`src/scripts/checks/test-grouping-ml.js`, `npm run check:grouping-ml`)

The classifier was also run through the same 18 cases used to validate the rule-based system
in `src/scripts/checks/test-grouping.js` (report §4.4.3, Chapter 5). It passes 16/18, against the rule's 18/18.

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

## Why no retrained candidate is the production model yet

Three retrained candidates were built and evaluated, and none is deployed. The first (v2) beat
the production model on the held-out pairs of its own, easier test set. The later test set includes
the hard negatives, and on it the latest candidate has better recall and F1 than the production
model but lower precision (54% against 71% on the newer categories) and lower accuracy. Since a
wrong merge is worse than a missed one, that is not an upgrade. Pair-level scores also do not
predict system-level behaviour, so each candidate was additionally checked by regrouping the whole
2,727-listing database and comparing against the production grouping.

| Model | Training pairs | Groups formed | Merges vs production | Judgement of the merges |
|---|---|---|---|---|
| Production (v1, phone-heavy) | 106 | 2,205 | n/a | n/a |
| v2: multi-category data | 218 | 2,051 | 163 | about 12 of 30 sampled correct |
| v3: plus 199 hard-negative pairs | 366 | 2,191 | 58 | about half of the first 48 correct |
| v3 with four extra features | 366 | 2,176 | 69 | not reviewed in full |

**What worked.** The hard negatives were the right data: taking the pairs where v2 and the
production model disagreed on the live catalogue, hand-labelling them (167 different products,
32 the same), and retraining cut the extra merges from 163 to 58 without the threshold moving much.

**What did not.** The remaining wrong merges are laptops and TVs whose titles share almost all
their words but name different models: ThinkBook 16 with ThinkPad E16, ThinkPad T480 with Latitude
5400, S26 Ultra with Z Fold 8 Ultra. A logistic regression on text-overlap and price features has
no way to see "same specification, different brand or model". Four extra features that count
how many filler-free and digit-bearing tokens differ moved the cross-validated F0.5 only from
0.696 to 0.706, and made the whole-database result slightly worse, so they are not used.
The production model's strongly negative bias, learned from phone-dominated data, happens to be
the safer behaviour on these comparisons.

**What would change this.** A model that compares brand and model identifiers directly (for
example a per-token difference model, or a small sequence model), or a much larger set of
hard negatives. Both are out of scope for this project; the candidates and their scripts are
kept as a documented, reproducible result rather than deployed.

The regrouping checks also produced rule changes that improve the live system whichever model is
used, and were kept:

- a veto when titles state different bare series numbers (Z Fold 5 vs 7);
- a veto when they state different values in the same short-identifier slot (ThinkBook G8 vs G9,
  MacBook M4 vs M5, Honor 7X vs 7i).

Each was measured on the live data before being added (5 of 319 and 2 of 318 existing groups
affected, every one a genuine error, none a false alarm).

**A check on the veto layer.** Across all 331 labelled pairs, none of the 142 same-product pairs
is blocked by the attribute veto. Every hard negative that reaches the classifier passes the
veto, which is what makes them hard.
