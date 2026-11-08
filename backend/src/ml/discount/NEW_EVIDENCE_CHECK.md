# Discount verdicts without a listing's own history: are they right?

Written by `src/scripts/ml/discount/04-check-new-evidence.js` on 2026-11-08.

Since 2026-11-08 a claim whose listing has too little history of its own is judged on other evidence
(`ranking/dealScore.js` `judgeWithMoreEvidence`): first the same product's history at the other stores, then the fair price for
its specs (`FAIR_PRICE_REPORT.md`). As first built, that cut the "unverified" claims from 54.7% to 6.2%. This checks whether those
verdicts are right. It found that half of them were not, and the rule was changed the same day.

## The first version: it could also clear a claim

The same check, run on the rule as first committed (other evidence could also call a claim genuine):

| Evidence, the listing's own history hidden | Claims | Judged | Same side as its own history | Called inflated | Called genuine |
|---|---:|---:|---:|---:|---:|
| Other stores' history of the product | 12107 | 9760 (80.6%) | 6566 (67.3%) | 6510, 98.4% right | 3250, 5.0% right |
| Fair price for the specs | 12107 | 6803 (56.2%) | 1003 (14.7%) | 834, 99.2% right | 5969, 2.9% right |
| Both, in that order (as the site does) | 12107 | 10752 (88.8%) | 6795 (63.2%) | 6708, 98.4% right | 4044, 4.8% right |

Its "inflated" verdicts were right, but its "genuine" verdicts were almost always wrong. A "was" price in line with the fair price,
or one another store once charged, does not show that this store ever charged it: stores set their "was" prices at the market's
price. So other evidence may now only find a claim inflated, never clear it; a claim it cannot show inflated stays unverified.
Across the live catalogue that day, the claims stood at:

| Rule | Claims | Unverified | Genuine + likely genuine | Suspicious + likely fake |
|---|---:|---:|---:|---:|
| Before 2026-11-08 (the listing's own history only) | 23,427 | 54.7% | | |
| First version (could also clear a claim) | 23,427 | 1,452 (6.2%) | 4,031 | 17,944 |
| Now (can only find a claim inflated) | 23,449 | 4,549 (19.4%) | 345 | 18,555 |

## Now

**How.** For every claim the listing's own history can judge (did this store actually sell at its "was" price?), that history is
hidden and the claim is judged as a listing without history is. The other stores' histories leave out this listing's own, so the
answer cannot leak in. Genuine and likely genuine count as one side, suspicious and likely fake as the other.

Claims the listing's own history judged: 12194 (345 genuine side, 11849 inflated side). Always answering the commoner side would agree 97.2% of the time.

| Evidence, the listing's own history hidden | Claims | Judged | Same side as its own history | Called inflated | Called genuine |
|---|---:|---:|---:|---:|---:|
| Other stores' history of the product | 12194 | 6574 (53.9%) | 6468 (98.4%) | 6574, 98.4% right | 0 |
| Fair price for the specs | 12194 | 852 (7.0%) | 845 (99.2%) | 852, 99.2% right | 0 |
| Both, in that order (as the site does) | 12194 | 6877 (56.4%) | 6766 (98.4%) | 6877, 98.4% right | 0 |

**Reading it.** "Judged" is how often the evidence reached a verdict instead of staying unverified; "same side" is how often that
verdict agreed with the listing's own history. The listing's own history is the direct evidence, so it is taken as the answer here,
though it can be wrong too (a store that sold at its "was" price for a day, long ago).

**What it does not show.** 97.2% of the claims a listing's own history judges are on the inflated side, so calling every claim
inflated would agree 97.2% of the time; the evidence's 98.4% is only a little better than that. What it adds is a reason for each
claim it flags, stated on the product page (a "was" price above every price the product had at any store we track, or above what
such specs cost). And these are claims with history; the ones without may differ. The disagreements below are mostly DigiMall
offers whose own history shows a small genuine cut that other stores never matched.

## Disagreements (the first 12)

| Store | Listing | Price | "Was" | Own history | Without it |
|---|---|---:|---:|---|---|
| digimall | Xiaomi Redmi Note 15 Pro 8GB RAM | 96,849 | 101,999 | possibly_genuine | suspicious (product_history) |
| digimall | REDMI NOTE 15 PRO 8GB RAM PTA APPROVED | 96,699 | 97,399 | possibly_genuine | suspicious (product_history) |
| digimall | Redmi Note 15 Pro 8GB RAM | 96,799 | 101,999 | possibly_genuine | suspicious (product_history) |
| digimall | Redmi Note 15 Pro 8GB RAM | 96,799 | 101,999 | possibly_genuine | suspicious (product_history) |
| mega | Samsung Galaxy A17 8GB RAM 256GB Storage PTA Approved | 81,999 | 90,999 | possibly_genuine | suspicious (product_history) |
| digimall | Samsung Galaxy A17 8GB RAM | 84,999 | 89,599 | possibly_genuine | suspicious (product_history) |
| mega | Samsung Galaxy S26 Ultra 12GB RAM 256GB Storage PTA Approved | 407,999 | 427,999 | possibly_genuine | suspicious (product_history) |
| digimall | Samsung Galaxy S26 Ultra 12GB RAM | 417,849 | 439,999 | possibly_genuine | suspicious (product_history) |
| digimall | Xiaomi Redmi Note 15 8GB RAM | 79,309 | 82,309 | possibly_genuine | suspicious (product_history) |
| digimall | Xiaomi Redmi Note 14 Pro 12GB RAM | 95,249 | 100,299 | possibly_genuine | suspicious (product_history) |
| digimall | Xiaomi Redmi Note 14 Pro 12GB RAM | 98,299 | 101,299 | possibly_genuine | suspicious (product_history) |
| digimall | Xiaomi Redmi Note 15 Pro 12GB RAM | 117,699 | 123,949 | possibly_genuine | suspicious (product_history) |
