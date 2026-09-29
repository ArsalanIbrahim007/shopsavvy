import { describe, it, expect } from "vitest";
import {
  createRng,
  averagePathLength,
  trainIsolationForest,
  anomalyScore,
} from "../../src/ml/isolationForest.js";

function clusterWithOutlier(seed = 7) {
  const rng = createRng(seed);
  const rows = [];
  for (let i = 0; i < 300; i++) rows.push([rng() * 0.2, rng() * 0.2]);
  return { rows, outlier: [3, 3], inlier: [0.1, 0.1] };
}

describe("isolation forest", () => {
  it("normaliser matches the paper's reference values", () => {
    expect(averagePathLength(1)).toBe(0);
    expect(averagePathLength(2)).toBe(1);
    // c(256) ≈ 10.24 (Liu et al., 2008)
    expect(averagePathLength(256)).toBeCloseTo(10.24, 1);
  });

  it("scores a far-away point as more anomalous than a point inside the cluster", () => {
    const { rows, outlier, inlier } = clusterWithOutlier();
    const model = trainIsolationForest(rows, { seed: 1 });

    const outlierScore = anomalyScore(outlier, model);
    const inlierScore = anomalyScore(inlier, model);

    expect(outlierScore).toBeGreaterThan(0.6);
    expect(inlierScore).toBeLessThan(0.5);
    expect(outlierScore).toBeGreaterThan(inlierScore);
  });

  it("is reproducible for a fixed seed", () => {
    const { rows, outlier } = clusterWithOutlier();
    const a = anomalyScore(outlier, trainIsolationForest(rows, { seed: 3 }));
    const b = anomalyScore(outlier, trainIsolationForest(rows, { seed: 3 }));
    expect(a).toBe(b);
  });

  it("caps the subsample at the dataset size for small datasets", () => {
    const model = trainIsolationForest([[1], [2], [3], [4], [100]], { seed: 1, trees: 50 });
    expect(model.sampleSize).toBe(5);
    expect(anomalyScore([100], model)).toBeGreaterThan(anomalyScore([2], model));
  });

  it("survives rows with a constant column", () => {
    const rows = Array.from({ length: 50 }, (_, i) => [5, i % 7]);
    const model = trainIsolationForest(rows, { seed: 2, trees: 20 });
    expect(Number.isFinite(anomalyScore([5, 3], model))).toBe(true);
  });

  it("rejects a dataset too small to split", () => {
    expect(() => trainIsolationForest([[1]])).toThrow();
  });
});
