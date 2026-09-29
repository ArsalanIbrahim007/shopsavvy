// isolationForest.js — dependency-free Isolation Forest (Liu, Ting & Zhou,
// ICDM 2008). Anomalies are "few and different", so random axis-aligned
// splits isolate them in fewer steps than normal points; the average path
// length over many random trees becomes the anomaly score.
//
// Hand-rolled for the same reason as logisticRegression.js: the whole
// algorithm is ~100 lines, and a from-scratch version can be walked through
// in front of the panel. Seeded so training is reproducible.

const EULER_GAMMA = 0.5772156649;

/** Deterministic PRNG (mulberry32) so the same seed builds the same forest. */
export function createRng(seed = 42) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Average path length of an unsuccessful binary-search-tree lookup among n
 * points — the normaliser from the original paper, and the depth credited
 * to a leaf that still holds n points when the height limit stops growth.
 */
export function averagePathLength(n) {
  if (n <= 1) return 0;
  if (n === 2) return 1;
  return 2 * (Math.log(n - 1) + EULER_GAMMA) - (2 * (n - 1)) / n;
}

function sampleWithoutReplacement(rows, size, rng) {
  const copy = rows.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, size);
}

function buildTree(rows, depth, heightLimit, rng) {
  if (depth >= heightLimit || rows.length <= 1) return { s: rows.length };

  // Only features that still vary within this node can split it.
  const dims = rows[0].length;
  const splittable = [];
  for (let q = 0; q < dims; q++) {
    let min = Infinity;
    let max = -Infinity;
    for (const r of rows) {
      if (r[q] < min) min = r[q];
      if (r[q] > max) max = r[q];
    }
    if (max > min) splittable.push([q, min, max]);
  }
  if (splittable.length === 0) return { s: rows.length };

  const [q, min, max] = splittable[Math.floor(rng() * splittable.length)];
  const p = min + rng() * (max - min);

  const left = [];
  const right = [];
  for (const r of rows) (r[q] < p ? left : right).push(r);

  return {
    q,
    p: Number(p.toFixed(6)),
    l: buildTree(left, depth + 1, heightLimit, rng),
    r: buildTree(right, depth + 1, heightLimit, rng),
  };
}

function pathLength(x, node, depth = 0) {
  if (node.s !== undefined) return depth + averagePathLength(node.s);
  return pathLength(x, x[node.q] < node.p ? node.l : node.r, depth + 1);
}

/**
 * @param {number[][]} X feature rows
 * @param {{trees?: number, sampleSize?: number, seed?: number}} [opts]
 */
export function trainIsolationForest(X, opts = {}) {
  const { trees = 100, sampleSize = 256, seed = 42 } = opts;
  if (!Array.isArray(X) || X.length < 2) {
    throw new Error("trainIsolationForest needs at least two rows");
  }

  const rng = createRng(seed);
  const psi = Math.min(sampleSize, X.length);
  const heightLimit = Math.ceil(Math.log2(psi));

  const forest = [];
  for (let t = 0; t < trees; t++) {
    forest.push(buildTree(sampleWithoutReplacement(X, psi, rng), 0, heightLimit, rng));
  }

  return { forest, sampleSize: psi };
}

/**
 * Anomaly score in (0, 1): close to 1 means isolated quickly (anomalous),
 * around 0.5 or below means indistinguishable from the bulk of the data.
 */
export function anomalyScore(x, model) {
  const mean =
    model.forest.reduce((sum, tree) => sum + pathLength(x, tree), 0) / model.forest.length;
  return 2 ** (-mean / averagePathLength(model.sampleSize));
}
