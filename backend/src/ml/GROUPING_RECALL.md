# Grouping recall: how often the site leaves one product split in two

Sample drawn 2026-10-26 with seed 20261016 (`src/scripts/ml/10-sample-recall-pairs.js`), scored by `11-score-recall.js`.
Grouping: the production one (trained matcher, `ml`) over every visible active listing of smartphone, laptop, tv, tablet, smartwatch, headphones.

**Recall: 30.5%** (95% interval 15.1% to 49.7%): of all pairs of offers of the same product
from two stores (among the candidate pairs below), the share the site shows as one product. Estimated 6,292 such pairs together
and 14,362 kept apart.

Pair precision, from the same sample: 38 of 40 pairs the site put together are the same product (95.0%).
Unlabelled: 0.

## How it was measured

- **Candidate pairs:** two offers from different stores in the same category whose titles share at least 40% of their model words
  (Jaccard over the normalised title without capacities and tier words, as the matcher's rule compares). All other pairs are left out: they are
  almost never the same product, but any that are would lower recall, so this is recall among candidate pairs.
- **Strata:** what the site did with each candidate pair, and for the pairs it kept apart, how similar their titles are. The most similar apart
  pairs, where missed merges concentrate, were sampled hardest; each stratum counts by its real size, so that does not bias the estimate.
- **Labels:** every sampled pair judged same or different from the titles and prices alone, with `src/ml/dataset/LABELING_RUBRIC.md` and the
  site's rule that PTA-approved and non-PTA phones are different products; read blind (without the stratum). By Claude; a person's blind
  spot-check is still to do.

| Stratum | Candidate pairs | Sampled | Same | Different | Same share |
|---|---|---|---|---|---|
| together (one product on the site) | 6,623 | 40 | 38 | 2 | 95.0% |
| apart, similarity 0.8 or more | 8,888 | 50 | 3 | 47 | 6.0% |
| apart, similarity 0.6 to 0.8 | 23,031 | 40 | 7 | 33 | 17.5% |
| apart, similarity 0.4 to 0.6 | 195,956 | 40 | 2 | 38 | 5.0% |

## The same product kept apart (missed merges in the sample)

The last column is what the current matcher does with the pair (a veto in `attributeConflict`, or the trained model's score).

| Id | Category | Stratum | Offer A | Offer B | Why they are the same | Kept apart by |
|---|---|---|---|---|---|---|
| r003 | smartphone | apart_mid | ishopping "Xiaomi Redmi Note 15 Pro 512GB 12GB RAM White Titanium" (PKR 114,240) | digimall "Xiaomi Redmi Note 15 Pro 12GB RAM" (PKR 121,289) | Same Note 15 Pro 12GB; storage stated once, price within 6%. | neither: the model scores 0.77, the grouping kept them apart |
| r014 | tv | apart_mid | digimall "TCL 40" QLED Smart TV (40S59K)" (PKR 76,199) | alfamall "TCL - Smart Google TV QLED 40 inch - S59K - 40S59K - (SNS65)" (PKR 78,999) | Same TCL 40S59K. | the trained model (score 0.17) |
| r035 | tv | apart_mid | priceoye "Samsung 98 Inch 4K UHD Smart Crystal UHD TV (DU9000)" (PKR 1,099,999) | shophive "Samsung 98DU9000 98" Crystal UHD 4K Smart TV" (PKR 1,079,999) | Same Samsung 98 inch DU9000. | neither: the model scores 0.95, the grouping kept them apart |
| r036 | smartwatch | apart_high | digimall "Samsung Galaxy Watch 8 Classic 46mm (L500)" (PKR 98,999) | ishopping "Samsung Galaxy Watch 8 Classic 46mm (SM-L500)" (PKR 74,350) | Same Watch 8 Classic 46mm (L500). | neither: the model scores 0.92, the grouping kept them apart |
| r037 | tv | apart_high | digimall "Samsung 75 inch Crystal UHD 4K Smart TV (75U8000F)" (PKR 363,599) | priceoye "Samsung 75 Inch 4K UHD Smart Crystal UHD TV (U8000F)" (PKR 429,999) | Same Samsung 75 inch U8000F. | neither: the model scores 0.94, the grouping kept them apart |
| r058 | tv | apart_low | shophive "TCL iFFALCON 75" U65A Pro 4K QLED TV - 2026" (PKR 260,999) | digimall "Tcl iFFALCON 75 Inch 4K UHD QLED Google TV (75U65A Pro)" (PKR 291,499) | Same iFFalcon 75 inch U65A Pro. | neither: the model scores 0.76, the grouping kept them apart |
| r065 | smartwatch | apart_mid | xcessorieshub "Samsung Galaxy Watch 8 Classic 46mm" (PKR 76,999) | eezepc "Samsung Galaxy Watch 8 Classic Black" (PKR 80,990) | Same Watch 8 Classic; 46mm stated once, price within 5%. | the trained model (score 0.45) |
| r089 | tv | apart_mid | ishopping "Samsung 65" 4K Smart QLED TV (65Q60D)" (PKR 272,480) | priceoye "Samsung 65 Inch 4K Smart QLED TV (65Q60)" (PKR 298,999) | 65Q60D against 65Q60 within 10%: the shorter code of the same set. | the trained model (score 0.08) |
| r097 | smartwatch | apart_low | priceoye "Zero Edge Smart Watch" (PKR 6,299) | alfatah "ZERO WATCH EDGE JET BLACK" (PKR 6,500) | Same Zero Edge watch. | the trained model (score 0.26) |
| r112 | smartphone | apart_high | mega "Xiaomi Redmi Note 14 Pro 12GB RAM 512GB Storage" (PKR 92,999) | digimall "REDMI NOTE 14 PRO 12GB RAM PTA APPROVED" (PKR 96,199) | Same Note 14 Pro 12GB PTA; storage stated once, price within 4%. | neither: the model scores 0.80, the grouping kept them apart |
| r147 | smartwatch | apart_mid | shophive "Samsung Galaxy Watch 8 46MM Classic" (PKR 81,499) | paklap "Samsung Galaxy 8 L500 46mm Classic Smart Watch (White, NEW)" (PKR 77,500) | Same Watch 8 Classic 46mm. | neither: the model scores 0.63, the grouping kept them apart |
| r151 | smartphone | apart_mid | ishopping "Xiaomi Redmi Note 15 256GB 8GB RAM Forest Green" (PKR 74,970) | digimall "Xiaomi Redmi Note 15 8GB RAM" (PKR 78,849) | Same Note 15 8GB; storage stated once, price within 5%. | neither: the model scores 0.77, the grouping kept them apart |

Kept apart by a veto: 0 of 12; by the trained model's score: 4; by neither: 8.

## Pairs the site put together that are different

| Id | Category | Stratum | Offer A | Offer B | Why they differ |
|---|---|---|---|---|---|
| r030 | tv | together | ledshop "Samsung S90F OLED 4K Vision AI Smart TV" (PKR 869,999) | digimall "SAMSUNG 83"OLED S90F 4K Samsung Vision AI Smart TV" (PKR 1,873,500) | S90F with no size at PKR 869,999 against the 83 inch at 1,873,500: another size. |
| r040 | smartphone | together | ishopping "Samsung Galaxy A07" (PKR 36,295) | digimall "Samsung Galaxy A07 4GB RAM" (PKR 39,659) | Judgement: bare A07 against A07 4GB RAM, which comes in two storage sizes; price does not settle it (rule 5). |

## Judgement calls

Labels where the rubric needed judgement; a person's spot-check should look at these first.

| Id | Category | Stratum | Offer A | Offer B | Label and reason |
|---|---|---|---|---|---|
| r040 (different) | smartphone | together | ishopping "Samsung Galaxy A07" (PKR 36,295) | digimall "Samsung Galaxy A07 4GB RAM" (PKR 39,659) |  |
| r067 (same) | smartphone | together | xcessorieshub "Redmi Note 13 Pro 8GB-256GB" (PKR 59,999) | techroid "Redmi Note 13 Pro (8GB – 256GB) 8GB – 256GB" (PKR 74,999) |  |
| r121 (same) | smartphone | together | ishopping "Apple iPhone 17 - Mercantile Warranty" (PKR 352,499) | xcessorieshub "Apple iPhone 17 PTA Approved 256GB" (PKR 399,999) |  |
| r123 (different) | smartphone | apart_high | xcessorieshub "Samsung Galaxy S26 Ultra PTA Approved 512GB – 12GB RAM" (PKR 449,999) | digimall "Samsung Galaxy S26 Ultra 12GB RAM" (PKR 424,999) |  |

## After the fixes (2026-10-26)

The live catalogue regrouped with the matcher fixed (`12-recheck-recall.js`): a title stating only its RAM no longer reads as storage,
and a television's model code matches with or without its screen size in front. The same labelled pairs, scored again:

- **recall: 64.3%** (was the figure above); estimated 13,274 same-product pairs together, 7,380 apart
- **pair precision: 98.8%**; estimated 166 different-product pairs together
- same-product pairs now together that were apart: r003, r035, r037, r058, r112, r151; now apart that were together: none
- different-product pairs now together: none; now apart that were together: r040

The merge-precision sample (GROUPING_EVALUATION.md, 09 against a snapshot of the old grouping) was rechecked the same day: no
correct merge was newly split (the two split ones, m034 and m047, were split before), precision over the merges still made was
97.1%, and of the 3,103 pairs of offers newly together a random 40 and the 40 furthest apart in price were
read; all were the same product (store price differences such as instalment prices, not different models). The trained matcher's
pair scores (EVALUATION_REPORT.md) rose: accuracy 79.0% to 80.0%, precision 76.9% to 78.6%, recall 34.5% to 37.9%.

## What this does and does not measure

Pair recall among candidate pairs: one product split into two groups of five offers each counts as 25 missed pairs, as is usual for this
measure. Together with merge precision (GROUPING_EVALUATION.md) it describes both mistakes a comparison can make: showing two products as
one (precision) and one product as two (recall). The first is the costlier, since it shows a shopper another product's price, and the
matcher is tuned to avoid it, which is why recall is the lower of the two.
