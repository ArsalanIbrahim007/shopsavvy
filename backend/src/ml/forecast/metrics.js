// metrics.js — R2: how well a score ranks and forecasts a rare yes/no outcome (a price drop). Pure functions.
//
// With drops in about 2% of samples, accuracy says nothing ("never drops" is 98% right), so the forecast is judged on:
//   auc               how often a sample that dropped scores above one that did not (0.5 = no better than chance)
//   averagePrecision  the area under the precision-recall curve (chance = the drop rate)
//   brier             mean squared error of the predicted probability; brierSkill compares it with always predicting the base rate
//   atTop             precision, recall and lift among the share of samples the score ranks most likely to drop

/** Area under the ROC curve, ties counted half (the Mann-Whitney statistic). null when either class is missing. */
export function auc(scores, labels) {
  const order = scores.map((s, i) => [s, labels[i]]).sort((a, b) => a[0] - b[0]);
  let rankSum = 0;
  let positives = 0;
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j += 1;
    const averageRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) if (order[k][1] === 1) { rankSum += averageRank; positives += 1; }
    i = j + 1;
  }
  const negatives = order.length - positives;
  if (positives === 0 || negatives === 0) return null;
  return (rankSum - (positives * (positives + 1)) / 2) / (positives * negatives);
}

/** Average precision: the mean of the precision at each sample that dropped, highest scores first (ties broken pessimistically). */
export function averagePrecision(scores, labels) {
  const order = scores.map((s, i) => [s, labels[i]]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  let hits = 0;
  let sum = 0;
  order.forEach(([, label], index) => {
    if (label === 1) {
      hits += 1;
      sum += hits / (index + 1);
    }
  });
  return hits ? sum / hits : null;
}

export function brier(probabilities, labels) {
  return probabilities.reduce((s, p, i) => s + (p - labels[i]) ** 2, 0) / labels.length;
}

/** 1 - brier / brier of always predicting `baseRate`: above 0 means better calibrated forecasts than the base rate alone. */
export function brierSkill(probabilities, labels, baseRate) {
  const reference = brier(labels.map(() => baseRate), labels);
  return reference === 0 ? null : 1 - brier(probabilities, labels) / reference;
}

/** Precision, recall and lift among the top `share` of samples by score. */
export function atTop(scores, labels, share = 0.1) {
  const n = Math.max(1, Math.round(labels.length * share));
  const order = scores.map((s, i) => [s, labels[i]]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).slice(0, n);
  const hits = order.filter(([, l]) => l === 1).length;
  const total = labels.filter((l) => l === 1).length;
  const precision = hits / n;
  const rate = total / labels.length;
  return { share, n, hits, precision, recall: total ? hits / total : null, lift: rate ? precision / rate : null };
}

/** mulberry32, so a bootstrap can be repeated exactly. */
export function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A 95% interval for `statistic(indexes)` by resampling whole groups (listings) with replacement: one listing's neighbouring days
 * are not independent, so resampling single samples would make the interval too narrow.
 * @param {string[]|number[]} groups  the group of each sample
 * @param {(indexes: number[]) => number|null} statistic
 */
export function clusterBootstrap(groups, statistic, { reps = 1000, seed = 20261022 } = {}) {
  const members = new Map();
  groups.forEach((g, i) => { if (!members.has(g)) members.set(g, []); members.get(g).push(i); });
  const keys = [...members.keys()];
  const rand = random(seed);
  const values = [];
  for (let r = 0; r < reps; r++) {
    const indexes = [];
    for (let k = 0; k < keys.length; k++) indexes.push(...members.get(keys[Math.floor(rand() * keys.length)]));
    const value = statistic(indexes);
    if (value !== null && Number.isFinite(value)) values.push(value);
  }
  values.sort((a, b) => a - b);
  if (values.length < reps * 0.9) return null;
  return [values[Math.floor(0.025 * (values.length - 1))], values[Math.ceil(0.975 * (values.length - 1))]];
}
