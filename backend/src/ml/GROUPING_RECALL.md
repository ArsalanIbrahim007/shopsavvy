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

## Model codes (2026-11-08)

Most missed pairs left were televisions, tablets and watches whose titles name the same model code in different wording ("TCL |
50 Inch | 50P79L | Premium QLED TV" and "TCL - Smart Google TV QLED Premium 50 inch - P79L"); the trained matcher scored such pairs
as low as 0.17. Two changes (similarityModel.service.js `sharedModelCode`, `prefixConflict`; productGrouping.service.js
`mergeSameModelGroups`):

- Two titles of the same brand naming the same distinctive code (letters and digits, at least 4 characters, a leading screen
  size dropped) are one product when their prices are within 25%, after every veto (size, storage, PTA, generation...). Never for
  computers (a processor's code is shared by many laptops), nor for the brand itself, a warranty ("1Year"), a spec ("HDR10",
  "DDR5", "BE3600") or a store's own reference ("ISPK-0545", "SNS65").
- A listing joins the first group that matches, so two offers of one TV could settle in two groups of that TV. A last pass joins
  such groups when an offer of each names the model, the groups' brands and middle prices agree, and no offer conflicts with any
  offer of the other group.
- One number under different hyphened prefixes is two models (Sony's WH-1000XM6 headphones and WF-1000XM6 earbuds). This veto
  applies to every match, and split a mix-up the trained matcher had made before.

The first version took any shared code. Its 10,568 newly joined pairs were read by code: "A4Tech" (the brand) alone joined 3,206
pairs of different headsets, and "1Year", "HDR10", "DDR5" and "SNS67" joined others, so the exclusions above were added and it was
measured again. The final version, against a snapshot of the grouping without it taken the same day:

- **recall: 72.5%** (63.3% on the same day without it; the 64.3% above was before the 2026-11-08 price refresh);
  estimated 15,173 same-product pairs together, 5,766 apart
- **pair precision: 98.9%**; estimated 166 different-product pairs together (the same pairs as before)
- same-product pairs now together that were apart without it: r014, r036, r065, r147; different-product pairs now together: none.
  r067 is split with or without it (its two prices are now 25% apart)
- merge precision (GROUPING_EVALUATION.md sample): 59 of 61, 96.7%, as without it; no labelled merge changed
- groups 9,218 to 8,914; 6,583 pairs of offers newly together, 329 newly apart. Of the newly together, a random 40 and the 25 joined
  only through a group (not by a pair of their own) furthest apart in price were read: all one product, some at a store charging far
  more than the rest. The newly apart are mostly offers of one phone or TV now in two groups of it instead of one (a lost comparison,
  not a wrong one), plus the Sony headphones and earbuds, now correctly apart.

## A fresh, larger sample (2026-11-09)

In the first sample, one same-product pair among the 40 low-similarity pairs (a Zero watch) stood for 5,025 of the 5,766 missed
pairs estimated above: the figure rested on one example. A fresh sample was drawn from the grouping of 2026-11-09
(`10-sample-recall-pairs.js --tag=nov9 --n-low=160 --seed=20261109`), with the low-similarity stratum sampled 160 times instead
of 40, and labelled (`group_recall_nov9.labels.json`, with a reason for each). The labels were not made blind: the list read showed
each pair's stratum. Scored with `11-score-recall.js --tag=nov9`:

| Stratum | Candidate pairs | Sampled | Same product |
|---|---:|---:|---:|
| together | 24,531 | 40 | 39 |
| apart, high similarity | 11,804 | 50 | 1 |
| apart, mid similarity | 45,650 | 40 | 6 |
| apart, low similarity | 424,400 | 160 | 1 |

- **recall: 71.1%** (95% interval 52.8% to 82.2%); estimated 23,918 same-product pairs together, 9,736 apart
- **pair precision: 97.5%**; the one different pair together is an "iPhone Air 256GB" at PKR 411,990 with an "iPhone 17 Air" of
  unstated storage at 475,199, the price of the 512GB
- The old sample, rechecked the same day, gives 75.2%; the fresh one is the estimate to quote, as it rests on 8 same-product pairs
  apart instead of 1.

Where the missed pairs are now: the mid-similarity stratum holds about 6,800 of the 9,736. Its same-product pairs are a DigiMall
title that states only the RAM ("Infinix Note 60 8GB RAM", "Oppo A6K 4GB RAM") beside one that states the storage, an A4Tech
headset named "Bloody MR710" at one store, and a Samsung TV written "55Q7F" and "Q7F". Read in the live grouping, the cause is not
the pair matcher (it scores four of these pairs 0.53 to 0.69, a match) but the order of grouping: an AlfaMall seller's title such as
"Infinix Note 60 | (256GB - 8GB RAM) | PTA Approved | Official Warranty With Free SURPRISE GIFT | Electro Ease" heads a group, and
offers compared with that title are turned away (0.40; 0.85 without the last two parts), so one phone sits in two groups.

Changed on 2026-11-09:
- A TV's code with and without its year letter ("65Q60D" and "65Q60", "43F6000F" and "43F6000") is one model, when both codes begin
  with the stated screen size and the prices are within 10% (`sameTvWithoutYearLetter`). It joined 30 pairs of offers, all read and
  all one TV, and labelled pair r089 of the first sample. The old sample's recall went from 72.5% to 75.2%, with no different pair
  joined.

Tried on 2026-11-09 and not kept, because they made it worse:
- A last pass joining groups whose representative titles the matcher accepts (as `mergeSameModelGroups` does for model codes):
  it joined none of the fresh sample's missed pairs, and joined r040 of the first sample, a different-product pair.
- Cutting a marketplace title at its first part about the sale (warranty, gift, instalments) before matching: it fixed the Infinix
  pair, but the groups re-formed differently, and five same-product pairs of the fresh sample that were together came apart
  (recall 62.0%).
What would fix it is choosing a group's representative title more carefully (the plainest title, not the first one with a stated
capacity); that changes every group and needs the full recheck, so it is left for after the submission.

## Groups kept apart by a store's wording (2026-11-09, later the same day)

The store wording was counted across the six categories' titles: nearly all of it is AlfaMall's sellers' ("| Electro Ease",
"- (HomeCart)", "| On Installments By 3az Mart", "- ISPK-0624", "At 0% Markup On Upto 6 Months Installments By Microtel Trading").
`withoutStoreWording` (similarityModel.service.js) takes out only such pieces (a "|" part, a " - " tail, a closing bracket, a run
from "At 0% Markup" or "1 Year Official Warranty" to the end, and store codes) and keeps every word about the product, the PTA status
and the condition ("3 Months Warranty (Used)" keeps "Used").

Tried first, and not kept: letting an offer turned away by a group's title try again with both titles without that wording, while the
groups were forming. The phones' groups re-formed (2,470 to 2,239): two missed pairs of the fresh sample joined, but three that were
together came apart, and the old sample fell from 75.2% to 72.5%.

Kept: a last pass over the finished groups (`mergeStoreWordedGroups`). Two groups join when, without the store wording, the matcher
takes their titles for one product, and:
- at least one of the two titles has store wording;
- both state the same capacity, the same brand, and RAM that does not differ (also read as sellers write it short, "8+256GB");
- their prices are within 15%, each group's price taken before the pass;
- neither is a computer, and a used or like-new unit never joins a new one;
- no offer of one conflicts with an offer of the other (the grouping's usual checks, and the 4G/5G families read on the titles
  without the wording).

It joins 143 groups into others (phones 2,470 to 2,329 groups; tablets; nothing in TVs, headphones, watches or laptops). All were read.
The first version had joined two different laptops (a Dell Latitude 7400 with a 5400), a like-new S25 Ultra with new ones, an 8GB
Nothing Phone 4a with the 12GB one, and a Samsung A17 with the A17 5G; the limits above came from those, and none of them joins
now. Grouping time is unchanged (phones about 13 s).

Rechecked (`12-recheck-recall.js`, both samples, the same labels):

| Sample | Recall before | Recall after | Pair precision before | Pair precision after |
|---|---:|---:|---:|---:|
| Fresh (2026-11-09) | 71.1% | 77.9% | 97.5% | 96.9% |
| First | 75.2% | 75.2% | 98.9% | 99.0% |

- **recall: 77.9%** on the fresh sample; estimated 26,200 same-product pairs together, 7,454 apart. It joined r195 (Oppo A6K 4GB/128GB)
  and r289 (Infinix Hot 60 Pro 8GB/128GB), and split no pair that was together.
- **pair precision: 96.9%**; the different pairs together are the iPhone Air above and r001, a DigiMall "Samsung Galaxy S26 Plus 12GB
  RAM" (storage unstated) at PKR 382,999 with a 512GB at 444,999. r001 was labelled different by its price (rule 5) and is one of
  the uncertain labels set aside for a second, blind reading: the stores' prices on 2026-11-09 put the 12GB/256GB at PKR 346,000
  to 360,000 and the 12GB/512GB at 383,000, which is the 512GB's price. The label was left as it was, so as not to change a label
  after seeing the result.

Still apart: r243 (Infinix Note 60: its two groups now meet, but an offer of one conflicts with an offer of the other), the A4Tech
"Bloody MR710" (one title starts with the brand "A4tech", the other with its line "Bloody"), the Samsung "55Q7F" / "Q7F" (a code of
three characters is too short for the model-code rule), and pairs worded too differently for the matcher (a Xiaomi soundbar,
Audionic earbuds, a Zero watch).

## Three leftovers (2026-11-09, evening)

Each change was measured alone against a snapshot of the live grouping (every group it joined or split, read), then both samples.

1. **A line named alone is its maker's brand** (`sameBrand`). "A4tech Bloody MR710" and "Bloody MR710" were kept apart by the
   model-code rule's same-brand test. A title's second word now counts as its brand too, when it is a word of four letters or more
   ("Haier LED" is not the brand "led"). It joined 12 groups of A4tech Bloody headsets (G535, G575, MR710, MH390, G230P, MR575...),
   all one model each. It also joined "Soundcore by Anker R50i" with "Anker Soundcore R50i **NC**", a different product: the
   model-code rule now refuses a code followed by a variant word in one title and not the other (NC, ANC, Pro, Plus, Max, Lite). A
   longer list (Neo, Mini, Ultra) was tried and dropped: "QN70F Neo QLED", "H75M80FUX Mini LED" and "55P79L Ultra HD" continue a TV's
   name, and those TVs' groups came apart.
2. **A TV's code with and without its screen size, "55Q7F" and "Q7F"** (`sameTvShortCode`). Both titles must state the same size
   (or the code itself carries it: "TCL 75P8L 75''", whose 75'' the size reader does not read), and the prices be within 10%. Used
   in every pair comparison it re-formed the TVs' groups (1,744 to 1,606, a few wrongly: a TCL P725 with a P6L), so it is used only
   where finished groups join (`mergeSameModelGroups`), and there the groups' own titles must name the code as well: through one
   offer it had joined a Dawlance KORE group holding two E3A offers to the E3A, and a TCL C6 holding a P6K to the P6K. It joins 77
   groups into others (TVs 1,744 to 1,599: TCL P6L, P8L, C6K, C7L, T6D, T6C; Samsung Q7F, Q6F, Q8F; Dawlance E22, G3A; Haier K85,
   S80; and two pairs of iPad 11 A16), splitting none. r287 itself stays apart: one of its groups is headed by "Samsung Q7F ... (Q4 AI
   Processor ...)", and the model-code rule leaves out any title naming a processor, as computers do (left as it is: narrowing it
   changes every TV that names its "AiPQ Processor").
3. **A seller's "8/256"** (`ramStorageShorthand`). 399 phone listings, nearly all from two AlfaMall sellers, write RAM and storage
   that way and stated no capacity. Read by the grouping loop's storage reader, it let different phones join, since those titles are
   mostly the seller's wording (a Tecno Spark Go 3, a Redmi A5 and an Infinix Smart 20 in one group); read by the RAM reader, it
   changed what the trained matcher sees (its features compare RAM), with the same effect. So it is read only by the store-wording
   pass (`mergeStoreWordedGroups`), whose checks stand: 42 joins (phones 2,196 to 2,148), no splits, and the same 6 groups mixing
   two models among these sellers' titles as before (an older fault, not this change's).

Rechecked (`12-recheck-recall.js`, both samples, the same labels):

| Sample | Recall before | Recall after | Pair precision before | Pair precision after |
|---|---:|---:|---:|---:|
| Fresh (2026-11-09) | 77.9% | 81.2% | 96.9% | 97.0% |
| First | 75.2% | 75.2% | 99.0% | 99.0% |

- **recall: 81.2%** on the fresh sample: it joined r020 (Bloody MR710) as well as r195 and r289, and split no pair that was together.
- **pair precision: 97.0%**; the different pairs together are still the iPhone Air and r001 above.

Still apart: r243 (a member conflict), r287 (above), and the pairs worded too differently for the matcher.

## What this does and does not measure

Pair recall among candidate pairs: one product split into two groups of five offers each counts as 25 missed pairs, as is usual for this
measure. Together with merge precision (GROUPING_EVALUATION.md) it describes both mistakes a comparison can make: showing two products as
one (precision) and one product as two (recall). The first is the costlier, since it shows a shopper another product's price, and the
matcher is tuned to avoid it, which is why recall is the lower of the two.
