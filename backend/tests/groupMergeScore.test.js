import { describe, it, expect } from "vitest";

import { tally, weightedPrecision, wilson } from "../src/scripts/ml/08-score-group-merges.js";

describe("wilson", () => {
  it("matches published values for the 95% Wilson score interval", () => {
    // 81 of 100: a textbook case, 0.7222 to 0.8749
    const [low, high] = wilson(81, 100);
    expect(low).toBeCloseTo(0.7222, 3);
    expect(high).toBeCloseTo(0.8749, 3);
  });

  it("stays inside 0 to 1 at the edges, where a plain normal interval would not", () => {
    const [low, high] = wilson(100, 100);
    expect(high).toBeCloseTo(1, 12);
    expect(low).toBeCloseTo(0.963, 3);
    const [low0] = wilson(0, 10);
    expect(low0).toBe(0);
  });

  it("is wider for fewer judgements", () => {
    const [a, b] = wilson(9, 10);
    const [c, d] = wilson(90, 100);
    expect(b - a).toBeGreaterThan(d - c);
  });

  it("gives null when nothing was judged", () => {
    expect(wilson(0, 0)).toBeNull();
  });
});

describe("tally", () => {
  it("counts same, different, unsure and unlabelled, and leaves unsure out of precision", () => {
    const t = tally([{ verdict: "same" }, { verdict: "same" }, { verdict: "same" }, { verdict: "different" }, { verdict: "unsure" }, { verdict: null }]);
    expect(t).toMatchObject({ same: 3, different: 1, unsure: 1, unlabelled: 1, judged: 4, precision: 0.75 });
    expect(t.interval[0]).toBeLessThan(0.75);
    expect(t.interval[1]).toBeGreaterThan(0.75);
  });

  it("has no precision when nothing was judged either way", () => {
    expect(tally([{ verdict: "unsure" }, { verdict: null }])).toMatchObject({ judged: 0, precision: null, interval: null });
  });
});

describe("weightedPrecision", () => {
  it("weights each category by how many merges it really has, not by how many were sampled", () => {
    const byCategory = { smartphone: { precision: 0.9 }, tv: { precision: 0.5 } };
    expect(weightedPrecision(byCategory, { smartphone: 900, tv: 100 })).toBeCloseTo(0.86, 10);
  });

  it("leaves a category with nothing judged out of the weights", () => {
    expect(weightedPrecision({ smartphone: { precision: 0.9 }, tv: { precision: null } }, { smartphone: 900, tv: 100 })).toBeCloseTo(0.9, 10);
    expect(weightedPrecision({ tv: { precision: null } }, { tv: 100 })).toBeNull();
  });
});
