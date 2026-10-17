# Grouping evaluation (B9): how often the live site puts an offer under the right product

Sample drawn 2026-10-14 with seed 20261015 (`src/scripts/ml/07-sample-group-merges.js`): 100 merges, chosen at random from
1695 made by the production grouping (trained matcher, `ml`) over every visible active listing of the six deal categories.
A merge is an offer the site placed under a product, judged against that product's main offer using the rubric: same model, same
storage and RAM variant, same condition; colour may differ. Scored by `src/scripts/ml/08-score-group-merges.js`.

Who labelled, and how: B9 labels for group_merges.sample.json, by Claude on 2026-10-17 using the rubric in 07-sample-group-merges.js (same model, same storage/RAM variant, same condition; colour may differ; PTA-approved against non-PTA is different). Ambiguous pairs were checked on the store's own page where it could be read (not Telemart, which refuses requests). A price within 1% of the other side was taken as corroborating the same variant when the page could not say; otherwise unsure. Arsalan spot-checks 20 at random.

**Merge precision: 78.3%** (72 of 92 judged merges correct; 95% interval 68.8% to 85.5%).
Weighted by each category's real share of merges: **78.8%**.
Unsure: 8. Not yet labelled: 0.
Blind human spot-check: pending.

| Category | Merges in catalogue | Sampled | Same | Different | Unsure | Precision | 95% interval |
|---|---|---|---|---|---|---|---|
| smartphone | 905 | 52 | 37 | 9 | 6 | 80.4% | 66.8% to 89.3% |
| laptop | 106 | 8 | 3 | 5 | 0 | 37.5% | 13.7% to 69.4% |
| tv | 114 | 8 | 8 | 0 | 0 | 100.0% | 67.6% to 100.0% |
| tablet | 162 | 9 | 7 | 1 | 1 | 87.5% | 52.9% to 97.8% |
| smartwatch | 258 | 14 | 9 | 4 | 1 | 69.2% | 42.4% to 87.3% |
| headphones | 150 | 9 | 8 | 1 | 0 | 88.9% | 56.5% to 98.0% |

## The wrong merges

| Id | Category | Main offer | Merged offer | Why it is wrong |
|---|---|---|---|---|
| m003 | smartphone | mega: Apple iPhone 16 Pro Max 512GB Dual Sim NON PTA | mega: Apple iPhone 16 Pro Max | Same store lists the 512GB and a generic iPhone 16 Pro Max separately; the generic one is cheaper, so a different (base) storage variant. |
| m005 | smartphone | eezepc: Apple iPhone 17 512GB | mega: Apple iPhone 17 | 512GB at Rs 482,490 against a non-PTA generic at Rs 279,999 (42% less): different PTA status or storage. |
| m008 | smartphone | mega: Samsung Galaxy S26 Ultra 12GB RAM 256GB Storage NON PTA | ishopping: Samsung Galaxy S26 Ultra | Non-PTA 12/256 at Rs 269,999 against an unstated S26 Ultra at Rs 388,999 (44% more): the official PTA version. |
| m009 | smartphone | priceoye: Xiaomi Redmi Note 7 Pro | priceoye: Xiaomi Redmi 7 Pro | Redmi Note 7 Pro against Redmi 7 Pro: different models. |
| m010 | smartphone | priceoye: Xiaomi Redmi Note 7 Pro | priceoye: Xiaomi Redmi 7 Pro | Redmi Note 7 Pro against Redmi 7 Pro: different models (same pair as m009, merged in two groups). |
| m016 | smartphone | mega: Samsung Galaxy S26 Ultra 12GB RAM 512GB Storage NON PTA | shophive: Samsung Galaxy S26 Ultra 12GB 512GB | Same 12/512 S26 Ultra, but non-PTA at Rs 318,999 against Rs 446,999 (40% more): PTA against non-PTA. |
| m017 | smartphone | mega: Samsung Galaxy Z Fold 7 12GB RAM 256GB Storage Non PTA | mega: Samsung Galaxy Z Fold 7 | Non-PTA Z Fold 7 12/256 at Rs 359,999 against an unstated one at Rs 531,999 (48% more): PTA or larger storage. |
| m019 | smartphone | mega: Apple iPhone 17 Pro Max 1TB Storage NON PTA | mega: Apple iPhone 17 Pro Max | 1TB 17 Pro Max against a generic one from the same store at Rs 125,000 less: a smaller storage variant. |
| m045 | smartphone | priceoye: Xiaomi Redmi 9A Sport | priceoye: Xiaomi Redmi 9A | Redmi 9A Sport against Redmi 9A: different models. |
| m053 | laptop | priceoye: Lenovo ThinkBook 14 G8 IAL Core Ultra 7 255H (16GB Ram - 512GB SSD) | shophive: Lenovo ThinkBook 16 G8 Arrow Lake 16" Intel Core Ultra 7 255H 16GB RAM 512GB SSD Laptop 1 Year Warranty | ThinkBook 14 G8 against ThinkBook 16 G8: different models. |
| m054 | laptop | paklap: HP 250R G9 Notebook PC - Raptor Lake - 13th Gen Core i5 1334U 10-Core Processor 8-GB 512-GB SSD Intel UHD Graphics 15.6" Full HD 1080P 60Hz AG Display TPM (Black, Brand New, Light Cosmetic Marks) | paklap: HP 250R G9 Notebook PC - Raptor Lake - 13th Gen Core i5 1334U 10-Core Processor 8-GB 512-GB SSD Intel UHD Graphics 15.6" Full HD 1080P 60Hz AG Display TPM (Black, NEW) | Same laptop, but one is 'Brand New, Light Cosmetic Marks' and the other 'NEW': different condition. |
| m055 | laptop | priceoye: Lenovo ThinkPad E16 Gen 3 Intel Core Ultra 7 256V (16GB RAM - 512GB SSD) | mega: LENOVO THINKPAD E16 Gen3 CORE Ultra 7 16GB RAM 512GB SSD DOS | Mega's page names the Core Ultra 7 255H; the main offer is the Ultra 7 256V: different processor. |
| m058 | laptop | shophive: Dell Pro 15 Essential PV15250 15.6" Raptor Lake 13th Gen Core i5-1334U 8GB RAM 512GB SSD Laptop | paklap: Dell Pro 15 Essential PV15250 Laptop - Raptor Lake -13th Gen Core i5 1334U 10-Core Processor 8-GB 512-GB SSD Intel UHD Graphics 15.6" Full HD 1080P IPS WVA 120Hz AG Display TPM (Carbon Black, Brand New, Light Cosmetic Marks) | Same Dell laptop, but 'Brand New, Light Cosmetic Marks' against new: different condition. |
| m059 | laptop | ishopping: G-Mart Scripture Texture Laptop Back Skin Protector | ishopping: G-Mart Glitter Texture Back Skin Laptop Protector - Blue | Scripture texture skin against glitter texture skin: different products. |
| m075 | tablet | shophive: Samsung Galaxy Tab S11 Ultra 14.6" 12GB/256GB Wifi | mega: Samsung Galaxy Tab S11 Ultra | Mega's page is the 5G Tab S11 Ultra; the main offer is the WiFi one. |
| m079 | smartwatch | priceoye: Max 585 Ultra 3 Seven + One Smart Watch | priceoye: Max 580 Ultra 3 Seven + One Smart Watch | Max 585 against Max 580: different models. |
| m080 | smartwatch | priceoye: Max 585 Ultra 3 Seven + One Smart Watch | priceoye: Max 576 Ultra 3 Seven + One Smart Watch | Max 585 against Max 576: different models. |
| m087 | smartwatch | priceoye: Gus-03 Ultra 3 7+1 Smart Watch | priceoye: Gus-01 Ultra 3 7+1 Smart Watch | Gus-03 against Gus-01: different models. |
| m089 | smartwatch | priceoye: HY Ultra2 Smart Watch | priceoye: i40 Ultra2 Suit 7 Sets Colorful Straps Smart Watch | HY Ultra2 against i40 Ultra2 Suit: different products. |
| m097 | headphones | telemart: Samsung Galaxy Buds Pro | priceoye: Samsung Galaxy Buds 2 Pro | Galaxy Buds Pro against Galaxy Buds 2 Pro: different generations. |

What this does and does not measure: precision only (a wrong merge shows a shopper a different product's price as this one's, the costlier
error). It does not measure recall (two offers of one product left in separate groups), which needs a different sample: pairs the site
did not merge. Pair-level scores for the trained matcher are in EVALUATION_REPORT.md.
