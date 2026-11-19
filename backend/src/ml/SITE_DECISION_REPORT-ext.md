# The site's decision for a pair, on labelled pairs no model trained on

Generated 2026-11-19T13:10:37.711Z by `src/scripts/ml/17-evaluate-site-decision.js`. "Site decision" is every check the site uses to
put two listings in one product (veto, shared model code, classifier, same filler-free words, same model, same titles without
store wording), asked of each pair in both orders. "Classifier step" is the veto, shared model code and classifier only.
Nothing was tuned for this: the same functions the live site runs, with each model.

## Sealed November test set (97 pairs, 58 same)

| Decision | Model | Accuracy | Precision | Recall | F1 (95% interval) | TP / FP / FN |
|---|---|---|---|---|---|---|
| Site decision | Live model (v1) | 75.3% | 97.2% | 60.3% | 74.5% (62.5% to 84.0%) | 35 / 1 / 23 |
| Site decision | Candidate (model.artifact.v4-nov-ext.json) | 79.4% | 97.5% | 67.2% | 79.6% (68.4% to 88.0%) | 39 / 1 / 19 |
| Classifier step | Live model (v1) | 68.0% | 93.5% | 50.0% | 65.2% (51.9% to 76.9%) | 29 / 2 / 29 |
| Classifier step | Candidate (model.artifact.v4-nov-ext.json) | 76.3% | 97.3% | 62.1% | 75.8% (62.8% to 84.8%) | 36 / 1 / 22 |

## Earlier 164-pair evaluation set (164 pairs, 33 same)

| Decision | Model | Accuracy | Precision | Recall | F1 (95% interval) | TP / FP / FN |
|---|---|---|---|---|---|---|
| Site decision | Live model (v1) | 87.8% | 84.2% | 48.5% | 61.5% (44.9% to 73.5%) | 16 / 3 / 17 |
| Site decision | Candidate (model.artifact.v4-nov-ext.json) | 84.8% | 63.3% | 57.6% | 60.3% (44.4% to 73.8%) | 19 / 11 / 14 |
| Classifier step | Live model (v1) | 87.2% | 83.3% | 45.5% | 58.8% (42.1% to 71.4%) | 15 / 3 / 18 |
| Classifier step | Candidate (model.artifact.v4-nov-ext.json) | 83.5% | 60.7% | 51.5% | 55.7% (40.0% to 71.1%) | 17 / 11 / 16 |

