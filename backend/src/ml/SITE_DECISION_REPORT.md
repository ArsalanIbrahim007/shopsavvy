# The site's decision for a pair, on labelled pairs no model trained on

Generated 2026-11-19T20:28:39.857Z by `src/scripts/ml/17-evaluate-site-decision.js`. "Site decision" is every check the site uses to
put two listings in one product (veto, shared model code, classifier, same filler-free words, same model, same titles without
store wording), asked of each pair in both orders. "Classifier step" is the veto, shared model code and classifier only.
Nothing was tuned for this: the same functions the live site runs, with each model.

## Sealed November test set (97 pairs, 58 same)

| Decision | Model | Accuracy | Precision | Recall | F1 (95% interval) | TP / FP / FN |
|---|---|---|---|---|---|---|
| Site decision | Live model (v1) | 75.3% | 97.2% | 60.3% | 74.5% (62.5% to 84.0%) | 35 / 1 / 23 |
| Site decision | Candidate (model.artifact.v4-nov.json) | 74.2% | 97.1% | 58.6% | 73.1% (61.5% to 83.0%) | 34 / 1 / 24 |
| Classifier step | Live model (v1) | 68.0% | 93.5% | 50.0% | 65.2% (51.9% to 76.9%) | 29 / 2 / 29 |
| Classifier step | Candidate (model.artifact.v4-nov.json) | 72.2% | 97.0% | 55.2% | 70.3% (57.5% to 81.5%) | 32 / 1 / 26 |
| Rule baseline | Word overlap (Jaccard >= 0.70) | 51.5% | 92.3% | 20.7% | 33.8% (18.8% to 47.9%) | 12 / 1 / 46 |

## Earlier pairs the live model never saw (164 less the 16 it was trained on) (148 pairs, 29 same)

| Decision | Model | Accuracy | Precision | Recall | F1 (95% interval) | TP / FP / FN |
|---|---|---|---|---|---|---|
| Site decision | Live model (v1) | 86.5% | 80.0% | 41.4% | 54.5% (38.1% to 69.6%) | 12 / 3 / 17 |
| Site decision | Candidate (model.artifact.v4-nov.json) | 88.5% | 87.5% | 48.3% | 62.2% (48.8% to 76.9%) | 14 / 2 / 15 |
| Classifier step | Live model (v1) | 85.8% | 78.6% | 37.9% | 51.2% (34.3% to 66.7%) | 11 / 3 / 18 |
| Classifier step | Candidate (model.artifact.v4-nov.json) | 87.8% | 86.7% | 44.8% | 59.1% (45.7% to 75.0%) | 13 / 2 / 16 |
| Rule baseline | Word overlap (Jaccard >= 0.70) | 82.4% | 63.6% | 24.1% | 35.0% (13.8% to 52.6%) | 7 / 4 / 22 |

## Earlier 164-pair evaluation set (16 of these were in the live model's training data) (164 pairs, 33 same)

| Decision | Model | Accuracy | Precision | Recall | F1 (95% interval) | TP / FP / FN |
|---|---|---|---|---|---|---|
| Site decision | Live model (v1) | 87.8% | 84.2% | 48.5% | 61.5% (44.9% to 73.5%) | 16 / 3 / 17 |
| Site decision | Candidate (model.artifact.v4-nov.json) | 89.6% | 90.0% | 54.5% | 67.9% (51.2% to 80.6%) | 18 / 2 / 15 |
| Classifier step | Live model (v1) | 87.2% | 83.3% | 45.5% | 58.8% (42.1% to 71.4%) | 15 / 3 / 18 |
| Classifier step | Candidate (model.artifact.v4-nov.json) | 89.0% | 89.5% | 51.5% | 65.4% (48.6% to 79.2%) | 17 / 2 / 16 |
| Rule baseline | Word overlap (Jaccard >= 0.70) | 83.5% | 71.4% | 30.3% | 42.6% (25.0% to 59.3%) | 10 / 4 / 23 |

