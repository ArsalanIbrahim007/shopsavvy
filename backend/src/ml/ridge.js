// ridge.js — linear regression with an L2 penalty (ridge), for sparse rows, solved by conjugate gradient. Hand-written like
// logisticRegression.js, so the model is plain arithmetic we can show and explain.
//
// A row is a list of [featureIndex, value] pairs (most of a title's thousand-odd possible words are absent, so rows are short).
// The intercept is a constant feature fitted with the rest but not penalised (2026-11-08: taking it as the mean of y alone, with the
// features left uncentred, biased every prediction). Solves (XᵀX + λD) w = Xᵀy, D the identity with a 0 for the constant.

/** x · w for a sparse row. */
export function dot(row, weights) {
  let sum = 0;
  for (const [index, value] of row) sum += weights[index] * value;
  return sum;
}

/**
 * @param {Array<Array<[number, number]>>} rows
 * @param {number[]} y
 * @param {number} dim  the number of features
 * @param {object} [options]
 * @param {number} [options.lambda]  the L2 penalty
 * @param {number} [options.maxIter]
 * @param {number} [options.tol]     stop when the residual norm falls below tol × its start
 * @returns {{weights: number[], intercept: number, iterations: number}}
 */
export function fitRidge(rows, y, dim, { lambda = 1, maxIter = 1000, tol = 1e-8 } = {}) {
  const n = rows.length;
  if (n === 0) throw new Error("fitRidge: no rows");
  const constant = dim; // the intercept's column, 1 in every row
  const size = dim + 1;
  const withConstant = rows.map((row) => [...row, [constant, 1]]);
  const centre = y.reduce((a, b) => a + b, 0) / n; // solved around the mean, for a better-conditioned start
  dim = size;
  rows = withConstant;

  // A·v = Xᵀ(X v) + λ D v
  const multiply = (v) => {
    const out = new Float64Array(dim);
    for (let i = 0; i < n; i++) {
      const t = dot(rows[i], v);
      if (t !== 0) for (const [index, value] of rows[i]) out[index] += value * t;
    }
    for (let j = 0; j < constant; j++) out[j] += lambda * v[j];
    return out;
  };

  const b = new Float64Array(dim);
  for (let i = 0; i < n; i++) {
    const yc = y[i] - centre;
    for (const [index, value] of rows[i]) b[index] += value * yc;
  }

  // conjugate gradient from w = 0
  const w = new Float64Array(dim);
  const r = Float64Array.from(b);
  const p = Float64Array.from(b);
  let rr = r.reduce((a, v) => a + v * v, 0);
  const stop = rr * tol * tol;
  let iterations = 0;
  for (; iterations < maxIter && rr > stop; iterations++) {
    const Ap = multiply(p);
    let pAp = 0;
    for (let j = 0; j < dim; j++) pAp += p[j] * Ap[j];
    if (pAp <= 0) break;
    const alpha = rr / pAp;
    for (let j = 0; j < dim; j++) {
      w[j] += alpha * p[j];
      r[j] -= alpha * Ap[j];
    }
    const next = r.reduce((a, v) => a + v * v, 0);
    const beta = next / rr;
    rr = next;
    for (let j = 0; j < dim; j++) p[j] = r[j] + beta * p[j];
  }
  return { weights: Array.from(w.subarray(0, constant)), intercept: centre + w[constant], iterations };
}

/** The model's prediction for a sparse row. */
export function predictRidge(row, model) {
  return model.intercept + dot(row, model.weights);
}
