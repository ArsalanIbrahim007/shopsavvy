// The recall estimator of 11-score-recall.js (2026-10-26): each stratum's same-product share scaled by its real size.
import { describe, it, expect } from "vitest";

import { estimateRecall } from "../src/scripts/ml/11-score-recall.js";

describe("estimateRecall", () => {
  it("scales each stratum's share by its size, so an oversampled stratum does not bias the estimate", () => {
    // together: 1,000 pairs, all the same product -> 1,000 correct; apart: 100 x 50% + 10,000 x 1% = 150 missed
    const result = estimateRecall([
      { name: "together", population: 1000, same: 40, judged: 40 },
      { name: "apart_high", population: 100, same: 25, judged: 50 },
      { name: "apart_low", population: 10000, same: 1, judged: 100 },
    ], { draws: 4000 });
    expect(result.correct).toBe(1000);
    expect(result.missed).toBeCloseTo(150, 6);
    expect(result.recall).toBeCloseTo(1000 / 1150, 6);
    expect(result.interval[0]).toBeLessThan(result.recall);
    expect(result.interval[1]).toBeGreaterThan(result.recall);
  });

  it("is 100% when no same-product pair was found apart, with an interval below it (a sample cannot prove none)", () => {
    const result = estimateRecall([
      { name: "together", population: 500, same: 20, judged: 20 },
      { name: "apart_low", population: 50000, same: 0, judged: 40 },
    ], { draws: 4000 });
    expect(result.recall).toBe(1);
    expect(result.interval[0]).toBeLessThan(1);
  });

  it("gives the same interval every run (seeded)", () => {
    const strata = [{ name: "together", population: 600, same: 30, judged: 40 }, { name: "apart_mid", population: 2000, same: 4, judged: 40 }];
    expect(estimateRecall(strata, { draws: 2000 }).interval).toEqual(estimateRecall(strata, { draws: 2000 }).interval);
  });
});
