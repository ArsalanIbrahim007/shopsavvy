# November retrain: candidate v4-nov against the live model

Generated 2026-11-19T13:03:12.537Z by `src/scripts/ml/15-retrain-nov.js`.

## Labels

- New pairs labelled: 291 of 300 (not labelled 0, unsure 9, disagreements 7, of which settled 7).
- Agreement between two labellers on 57 pairs: Cohen's kappa **0.744** (above 0.8 is usually read as strong agreement, 0.6 to 0.8 as substantial).
- Training: 342 pairs (366 from the earlier rounds, 194 new; 218 left out because they share a listing or product family with a test pair).
- Threshold 0.6, chosen by grouped 5-fold cross-validation on the training pairs only (precision 70.6%, recall 54.6% there).

## Results on pairs no model trained on

The sealed pairs were set aside when they were mined on 18 Nov, before labelling, and were not looked at until this run.

### Sealed November test set (97 pairs, 58 same)

| Model | Accuracy | Precision | Recall | F1 (95% interval) | TP / FP / FN |
|---|---|---|---|---|---|
| Candidate (v4-nov) | 71.1% | 96.9% | 53.4% | 68.9% (56.3% to 79.5%) | 31 / 1 / 27 |
| Live model (v1, 106 pairs) | 67.0% | 93.3% | 48.3% | 63.6% (51.2% to 74.5%) | 28 / 2 / 30 |
| Word-overlap rule (Jaccard >= 0.70) | 51.5% | 92.3% | 20.7% | 33.8% (20.6% to 46.4%) | 12 / 1 / 46 |

| Category | Pairs | Same | Candidate F1 | Live F1 | Rule F1 |
|---|---|---|---|---|---|
| accessory | 7 | 4 | 40.0% | 40.0% | 0.0% |
| air_conditioner | 9 | 7 | 44.4% | 44.4% | 25.0% |
| headphones | 8 | 7 | 72.7% | 72.7% | 25.0% |
| laptop | 5 | 1 | 0.0% | 0.0% | 0.0% |
| monitor | 10 | 7 | 60.0% | 60.0% | 44.4% |
| other | 3 | 3 | 100.0% | 100.0% | 80.0% |
| refrigerator | 10 | 4 | 100.0% | 100.0% | 85.7% |
| smartphone | 22 | 12 | 63.2% | 55.6% | 0.0% |
| smartwatch | 3 | 2 | 0.0% | 0.0% | 0.0% |
| tablet | 7 | 4 | 85.7% | 33.3% | 0.0% |
| tv | 3 | 2 | 100.0% | 100.0% | 66.7% |
| washing_machine | 10 | 5 | 75.0% | 75.0% | 57.1% |

### The earlier 164-pair evaluation set (164 pairs, 33 same)

| Model | Accuracy | Precision | Recall | F1 (95% interval) | TP / FP / FN |
|---|---|---|---|---|---|
| Candidate (v4-nov) | 89.0% | 89.5% | 51.5% | 65.4% (49.0% to 79.4%) | 17 / 2 / 16 |
| Live model (v1, 106 pairs) | 87.2% | 83.3% | 45.5% | 58.8% (42.1% to 73.1%) | 15 / 3 / 18 |
| Word-overlap rule (Jaccard >= 0.70) | 83.5% | 71.4% | 30.3% | 42.6% (24.4% to 59.5%) | 10 / 4 / 23 |

Each model sits behind the same attribute veto the live site applies (different storage, size and so on is never merged).

## Would more labels help? (learning curve)

Each row trains on part of the training pairs (whole product groups) and scores F1 by grouped 5-fold cross-validation on that
part, at the chosen threshold. The sealed set is not used. A curve still rising at 100% says more labels would likely help.

| Share | Training pairs | Cross-validated F1 |
|---|---|---|
| 25% | 91 | 57.1% |
| 50% | 171 | 57.9% |
| 75% | 257 | 59.8% |
| 100% | 342 | 62.0% |

## Disagreements between labellers

- N019: Arsalan: same, Muzammil: different — "A4tech G3-330NS Wireless Mouse" / "A4tech Wireless Mouse (G3-300NS)"
- N020: Abuzar: same, Muzammil: different — "Infinix Hot 10" / "Infinix Hot 10 Play"
- N022: Arsalan: different, Muzammil: same — "Ronin ACE R-2035 Type-C Charging Cable" / "Ronin - Data Cable ACE iPhone 12W - R-2035 - (SNS36)"
- N028: Arsalan: same, Muzammil: different — "Asus ROG Strix XG27UCG 27" 4k UHD 2160p Dual Mode 4k 160Hz or FHD 320Hz Fast IPS Panel Gaming Monitor (Black, NEW)" / "Asus ROG Strix XG27UCSR 27" Dual Mode 4K Fast IPS Gaming Monitor"
- N049: Arsalan: same, Muzammil: different — "Apple ipad Air 11 M3 Chip" / "Apple iPad Air 11 M3 Chip 256GB Storage Wifi"
- N058: Arsalan: same, Muzammil: different — "Redmi Note 14 8GB – 256GB" / "Redmi Note 14 Pro 8Gb 256Gb Official Pta Approved With Official Warranty At 0% Markup On Upto 6 Months Installments By Microtel Trading"
- N060: Abuzar: different, Arsalan: same — "Gree 1 Ton Split AC GS-12AITH21B" / "GREE AC 1 TON Inverter Split Air Conditioner Airy Plus 12AITH21B-T3 BLACK Free installation 0% PROCESSING 0% MARK UP-UE004"

## What happens next

The candidate is in `src/ml/model.artifact.v4-nov.json`. It replaces the live model only if it is better on the sealed set **and** a
regroup of the whole database, with the changed groups read, shows no new wrong merges. Otherwise the live model stays and these
figures are reported as the result.
