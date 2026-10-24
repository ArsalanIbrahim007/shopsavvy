# Grouping evaluation, appliances and monitors: how often an offer is put under the right product

Sample drawn 2026-10-22 with seed 20261022 (`src/scripts/ml/07-sample-group-merges.js`): 60 merges, chosen at random from
281 made by the production grouping (trained matcher, `ml`) over every visible active listing of air_conditioner, refrigerator, washing_machine, monitor.
A merge is an offer the site placed under a product, judged against that product's main offer using the rubric: same model, same
storage and RAM variant, same condition; colour may differ. Scored by `src/scripts/ml/08-score-group-merges.js`.

Who labelled, and how: Labels for group_merges_appliances.sample.json (60 merges drawn 2026-10-22, seed 20261022, after recategorise.js --apply), by Claude on 2026-10-22, from the titles and prices, using the B9 rubric: same model, same capacity (tonnage, kg, volume) and condition; colour and finish may differ. Not yet spot-checked by a person.

**Merge precision: 79.3%** (46 of 58 judged merges correct; 95% interval 67.2% to 87.7%).
Weighted by each category's real share of merges: **77.7%**.
Unsure: 2. Not yet labelled: 0.
Blind human spot-check: pending.

| Category | Merges in catalogue | Sampled | Same | Different | Unsure | Precision | 95% interval |
|---|---|---|---|---|---|---|---|
| air_conditioner | 124 | 23 | 17 | 6 | 0 | 73.9% | 53.5% to 87.5% |
| refrigerator | 64 | 12 | 9 | 2 | 1 | 81.8% | 52.3% to 94.9% |
| washing_machine | 83 | 15 | 11 | 3 | 1 | 78.6% | 52.4% to 92.4% |
| monitor | 10 | 10 | 9 | 1 | 0 | 90.0% | 59.6% to 98.2% |

## The wrong merges

| Id | Category | Main offer | Merged offer | Why it is wrong |
|---|---|---|---|---|
| m005 | air_conditioner | shophive: TCL 18T5 SMT-C BreezeIN Smart 1.5 Ton Inverter Air Conditioner | shophive: TCL TAC-18T5 FreshIN 3.0 1.5 Ton Inverter Split Air Conditioner (2025) | TCL BreezeIN Smart against FreshIN 3.0: different series of 1.5 ton AC (PKR 196,499 against 227,999 at one store). |
| m007 | air_conditioner | priceoye: Dawlance 1.5 Ton Magna T3 Milky White Textured Series Inverter Split AC | priceoye: Dawlance 1.5 Ton Hyper T3 White Series Inverter Split AC | Dawlance Magna T3 against Hyper T3: different series. |
| m009 | air_conditioner | shophive: TCL 18T5 SMT-C BreezeIN Smart 1.5 Ton Inverter Air Conditioner | ishopping: TCL FreshIN 3.0 Series Inverter Split Air Conditioner 1.5 Ton (TAC-18T5) | TCL BreezeIN Smart against FreshIN 3.0 (TAC-18T5): different series. |
| m014 | air_conditioner | priceoye: Dawlance 1.0 Ton Infinity Plus Series AC (15) | priceoye: Dawlance 1.0 Ton Designer Plus Series Inverter AC (15) | Dawlance Infinity Plus against Designer Plus: different series. |
| m018 | air_conditioner | shophive: Dawlance Sprinter X 30 1.5 Ton Inverter Split Air Conditioner | ishopping: Dawlance Elegance X Inverter Split Air Conditioner 1.5 Ton | Dawlance Sprinter X against Elegance X: different series. |
| m020 | air_conditioner | shophive: Dawlance Sprinter X 30 1.5 Ton Inverter Split Air Conditioner | ishopping: Dawlance 30 Econo + Inverter Split Air Conditioner 1.5 Ton | Dawlance Sprinter X against Econo+: different series. |
| m029 | refrigerator | shophive: PEL PRLP-21860 Life Pro 12 CFT Top Mount Refrigerator | shophive: PEL PRLP-6460 Life Pro 12 CFT Top Mount Refrigerator | PEL PRLP-21860 against PRLP-6460: different models (both 12 cu ft). |
| m030 | refrigerator | ishopping: Dawlance Chrome Pro Inv Freezer-On-Top Refrigerator (REF-9149) | ishopping: Dawlance Chrome Pro Inv Freezer-On-Top Refrigerator (REF-9140) | Dawlance REF-9149 against REF-9140: different models. |
| m047 | washing_machine | jalalelectronics: DAWLANCE WASHING MACHINE DW-10095 GB TWIN TUB BLACK LID | ishopping: Dawlance Twin Tub Washing Machine (DW-6550C) | Dawlance DW-10095 against DW-6550: different models. |
| m048 | washing_machine | jalalelectronics: DAWLANCE WASHING MACHINE DW-10095 GB TWIN TUB BLACK LID | ishopping: Dawlance Twin Tub Washing Machine (DW-6550W) | Dawlance DW-10095 against DW-6550: different models. |
| m050 | washing_machine | ishopping: Haier Top Load Automatic Dryer Machine 6KG (HWS-60-50) | ishopping: Haier Top Load Automatic Dryer Machine 6KG (HD-60-50) | Haier HWS-60-50 against HD-60-50: different model codes. |
| m054 | monitor | paklap: Lenovo ThinkVision T24-40 23.8-Inch FHD 1080p 120Hz IPS Panel Monitor (Eclipse Black, Lenovo Direct Local Warranty, NEW) | paklap: Lenovo ThinkVision T24-4v 23.8-Inch FHD 1080p 120Hz IPS Panel Monitor (Eclipse Black, Lenovo Direct Local Warranty, NEW) | Lenovo ThinkVision T24-40 against T24-4v: different models. |

What this does and does not measure: precision only (a wrong merge shows a shopper a different product's price as this one's, the costlier
error). It does not measure recall (two offers of one product left in separate groups), which needs a different sample: pairs the site
did not merge. Pair-level scores for the trained matcher are in EVALUATION_REPORT.md.
