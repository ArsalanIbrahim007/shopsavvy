# Cross-store discount anomaly detector — evaluation report

Generated 2026-09-29T05:33:33.454Z from the dataset built 2026-09-29T05:33:32.848Z. Regenerate with `node src/scripts/ml/discount/03-evaluate.js`.

## What it does

A store claiming a discount shows a "was" price. A fake discount is a "was" price the product never really sold at. The history-based rule (`fakeDiscountScore.js`) can only judge a claim after it has seen at least 3 prices for that exact listing — true for very few listings. This model instead compares the claim against the **other stores selling the same product right now** (products grouped by the trained matcher), which needs no history at all.

Features (all scale-free ratios): `logOriginalVsMedian`, `logOriginalVsMax`, `logPriceVsMedian`, `claimedDiscount`. Model: hand-rolled Isolation Forest (Liu, Ting & Zhou, 2008), 100 trees, subsample 256, seed 42. A claim is flagged when its anomaly score is at least the threshold **and** it matches the fake-discount pattern: the claimed original price is above the highest price any other store currently charges, while the store's own current price is within 25% of the market median. (Isolation Forest flags *any* unusual pattern; only this one is a fake-discount signal.)

**Disclosed post-hoc refinement:** the 25% current-price guard was added *after* inspecting the first version's flagged real claims. Several were stores whose current price was itself 1.5-2.5x the market with only a token discount (e.g. a 2TB phone grouped with cheaper variants) — a grouping error or plain overpricing, not evidence about the "was" price. In those cases the model now abstains (status `not_comparable`) rather than accusing the store. The synthetic fakes below leave the current price unchanged, so the guard has little effect on their detection rates; it mainly removes false flags on real data.

## Coverage

- Offers claiming a discount that have at least one other store to compare against: **251**.
- Of those, the history-based rule could reach a verdict on only **14** (5.6%); the rest were "unverified" for lack of history. This model scores all 251.

## Held-out evaluation

Averaged over 5 independent 75/25 splits (188 train / 63 held out each) — with this few held-out rows a single split is too noisy (one row = 1.6%). Synthetic fake discounts were made by raising held-out claims' original price to 1.3x, 1.5x, 1.75x, 2x the market median (only where that raised it). "Real claims flagged" is the share of held-out real claims flagged — an upper bound on the false-positive rate, since some real claims are themselves inflated.

| Decision rule | Real claims flagged | Caught @ 1.3x | Caught @ 1.5x | Caught @ 1.75x | Caught @ 2x |
| --- | --- | --- | --- | --- | --- |
| Isolation Forest, score >= 0.5 | 7.0% | 9.5% | 29.5% | 85.0% | 96.8% |
| Isolation Forest, score >= 0.52 | 5.7% | 8.3% | 12.6% | 54.6% | 96.8% |
| Isolation Forest, score >= 0.55 | 4.1% | 5.5% | 7.3% | 17.2% | 95.8% |
| Isolation Forest, score >= 0.58 | 2.2% | 2.4% | 5.3% | 9.4% | 64.2% |
| Isolation Forest, score >= 0.6 | 1.3% | 1.2% | 3.5% | 7.4% | 35.3% |
| Isolation Forest, score >= 0.65 | 1.0% | 0.0% | 0.3% | 1.7% | 6.8% |
| Baseline: original > 1.2 x market median | 33.0% | 100.0% | 100.0% | 100.0% | 100.0% |

**Threshold selection rule** (stated before looking at which value wins): among thresholds that flag at most 10% of real claims — the conventional ~10% contamination assumption for Isolation Forest — pick the one that catches the most synthetic fakes. That gives **0.5**; deployed threshold: **0.5**.

## Honest reading

- The synthetic positives only change the original price, which is exactly the one feature the baseline rule looks at, so this test is structurally favourable to the baseline. The comparison is still worth showing because it answers the obvious panel question: *why a model instead of a threshold?*
- The model's case is that it does not need a hand-picked constant: what counts as unusual is learned from how stores actually price, across several features jointly. Real stores routinely claim "was" prices above the market median (the median claim in this dataset already sits above it), so a fixed 20% rule flags a large share of ordinary claims — compare the two rows' real-flag rates above.
- Moderate inflation (1.3x-1.5x) is mostly **not** caught, and that is a property of the market, not a defect in the forest: 22.3% of real claims already sit more than 1.3x above the market median. Judged only against other stores, a 1.3x claim genuinely looks like everyone else's. Catching those needs a listing's own history, which is the history-based rule's job.
- It cannot tell a genuine launch price that has since fallen apart from an invented one; it only says the claim is not supported by today's market. That is why it runs **alongside** the history-based rule as extra evidence, and does not override it.
- Grouping errors propagate: if the matcher wrongly places a more expensive variant with cheaper ones, its genuine original price can look inflated.

## Agreement with the history-based rule

Where the history rule could judge (14 rows): the model flagged **0 of 7** claims the rule called fake/suspicious, and **0 of 7** it called genuine.

This is expected, because the two answer different questions. The history rule asks *"did this store ever actually sell at its 'was' price?"*; this model asks *"is the 'was' price out of line with what the market charges today?"* None of the 7 claims the history rule flagged is more than 19.5% above the highest current market price — ordinary by market standards — while their own stores' past prices show they never sold that high. They are complementary: one catches a store misrepresenting its own past, the other catches claims far out of line with the market, and only the second works without history (all 251 claims today vs. 14 for the first).

## Most anomalous real claims (production model, 20 flagged of 251)

| Score | Store | Price | Claimed original | Market median | Other stores | Title |
| --- | --- | --- | --- | --- | --- | --- |
| 0.678 | priceoye | 7,449 | 20,000 | 11,149 | 2 | HUAWEI Band 9 |
| 0.659 | priceoye | 47,999 | 120,000 | 52,500 | 5 | Samsung Galaxy Watch 7 44mm |
| 0.648 | priceoye | 64,499 | 149,999 | 64,999 | 3 | Samsung Watch 8 44mm |
| 0.604 | w11stop | 460 | 800 | 600 | 1 | FASTER F15 Universal Music Earphone |
| 0.602 | priceoye | 52,499 | 110,000 | 54,999 | 1 | Huawei Watch GT6 |
| 0.582 | priceoye | 38,599 | 69,999 | 44,999 | 3 | Samsung Galaxy Buds 3 Pro |
| 0.582 | priceoye | 96,999 | 184,999 | 91,750 | 2 | Samsung Galaxy Watch 9 44mm |
| 0.579 | priceoye | 25,499 | 45,000 | 29,999 | 3 | Samsung Galaxy Buds 3 |
| 0.570 | priceoye | 325,999 | 656,999 | 361,999 | 3 | Samsung Galaxy Z Fold 5 |
| 0.568 | priceoye | 27,999 | 53,000 | 26,999 | 1 | Nothing CMF Watch 3 Pro |
| 0.565 | telemart | 426,999 | 780,000 | 393,999 | 3 | Apple iPhone 17 Air PTA Approved With Official Warranty |
| 0.558 | shophive | 449,999 | 639,999 | 364,999 | 1 | EcoFlow Delta Pro 3 Smart Extra Battery |
| 0.527 | priceoye | 217,999 | 399,999 | 224,999 | 1 | Samsung Galaxy Z Flip 5 |
| 0.521 | priceoye | 355,999 | 541,999 | 316,999 | 1 | Samsung Galaxy S24 Ultra (12GB-1TB) |
| 0.515 | shophive | 364,999 | 520,999 | 449,999 | 1 | EcoFlow Delta Pro Smart Extra Battery |
