// logisticRegression.js — minimal, dependency-free logistic regression:
// sigmoid activation, batch gradient descent, L2 regularization, and
// feature standardization. Hand-rolled deliberately: at this dataset's
// scale (~85 training rows, 9 features) a library buys nothing but an
// extra dependency, and a from-scratch implementation is something the
// team can walk through line by line in front of the defense panel.

export function sigmoid(z) {
  return 1 / (1 + Math.exp(-z));
}

/**
 * Zero-mean, unit-variance scaling per feature column. Without this,
 * features on different natural scales (a 0-1 jaccard score next to a
 * -1/0/1 match flag) would make gradient descent step unevenly across
 * dimensions and converge slowly or not at all.
 */
export function standardize(X) {
  const n = X[0].length;
  const means = Array(n).fill(0);
  const stds = Array(n).fill(0);

  X.forEach((row) => row.forEach((v, i) => { means[i] += v / X.length; }));
  X.forEach((row) => row.forEach((v, i) => { stds[i] += (v - means[i]) ** 2 / X.length; }));
  for (let i = 0; i < n; i++) stds[i] = Math.sqrt(stds[i]) || 1;

  const Xs = X.map((row) => row.map((v, i) => (v - means[i]) / stds[i]));
  return { Xs, means, stds };
}

/**
 * Trains weights + bias via batch gradient descent on the standardized
 * features. L2 regularization (`l2`) keeps weights from growing unbounded
 * on a small, imbalanced dataset.
 *
 * @param {number[][]} X raw (unstandardized) feature rows
 * @param {number[]} y labels, 0 or 1
 * @param {{epochs?:number, lr?:number, l2?:number, classWeight?: Record<0|1, number>}} [opts]
 */
export function trainLogisticRegression(X, y, opts = {}) {
  const { epochs = 3000, lr = 0.1, l2 = 0.01, classWeight = { 0: 1, 1: 1 } } = opts;
  const { Xs, means, stds } = standardize(X);

  let weights = Array(Xs[0].length).fill(0);
  let bias = 0;

  for (let epoch = 0; epoch < epochs; epoch++) {
    const gradW = Array(weights.length).fill(0);
    let gradB = 0;
    let totalWeight = 0;

    Xs.forEach((x, i) => {
      const pred = sigmoid(x.reduce((sum, v, j) => sum + v * weights[j], bias));
      const w = classWeight[y[i]] ?? 1;
      const err = (pred - y[i]) * w;

      x.forEach((v, j) => { gradW[j] += err * v; });
      gradB += err;
      totalWeight += w;
    });

    weights = weights.map((wgt, j) => wgt - lr * (gradW[j] / totalWeight + l2 * wgt));
    bias -= lr * (gradB / totalWeight);
  }

  return { weights, bias, means, stds };
}

/**
 * @returns {number} predicted probability of the positive class
 */
export function predictProba(x, model) {
  const xs = x.map((v, i) => (v - model.means[i]) / model.stds[i]);
  return sigmoid(xs.reduce((sum, v, j) => sum + v * model.weights[j], model.bias));
}
