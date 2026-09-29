// Shared settings for the cross-store discount anomaly model, imported by
// both the training and the evaluation scripts so the held-out numbers in
// EVALUATION_REPORT.md describe the exact configuration that gets deployed.

export const HYPERPARAMS = { trees: 100, sampleSize: 256, seed: 42 };

// Anomaly score at or above which a discount claim counts as anomalous
// (combined with the direction check in discountAnomaly.service.js).
// Chosen by the stated rule in 03-evaluate.js (most synthetic fakes caught
// while flagging <= 10% of real claims, averaged over 5 splits), not guessed.
// It also matches the paper's own boundary: s ~ 0.5 means "no distinct anomaly".
export const SCORE_THRESHOLD = 0.5;
