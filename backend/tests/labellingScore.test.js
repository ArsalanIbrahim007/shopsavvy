import { describe, it, expect } from "vitest";

import { cohensKappa, parseCsv, readLabel } from "../src/scripts/ml/14-score-labelling.js";
import { bandOf, jaccard, TARGETS } from "../src/scripts/ml/13-mine-labelling-pairs.js";

describe("parseCsv", () => {
  it("reads quoted cells with commas, doubled quotes and a BOM, as written by the mining script", () => {
    const text = '\uFEFF"pair_id","title_A","label"\r\n"N001","Philips 34"" Monitor, curved","same"\r\n';
    expect(parseCsv(text)).toEqual([["pair_id", "title_A", "label"], ["N001", 'Philips 34" Monitor, curved', "same"]]);
  });

  it("reads a sheet Excel saved with semicolons and without quotes", () => {
    expect(parseCsv("pair_id;label;note\nN002;Different;6GB vs 8GB\n")).toEqual([["pair_id", "label", "note"], ["N002", "Different", "6GB vs 8GB"]]);
  });

  it("drops empty lines", () => {
    expect(parseCsv("a,b\n\n1,2\n,\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("readLabel", () => {
  it("accepts the usual spellings and flags anything else", () => {
    expect(["Same", " same ", "s", "1"].map(readLabel)).toEqual([1, 1, 1, 1]);
    expect(["different", "DIFF", "d", "0"].map(readLabel)).toEqual([0, 0, 0, 0]);
    expect(["unsure", "?"].map(readLabel)).toEqual(["unsure", "unsure"]);
    expect(readLabel("")).toBe(null);
    expect(readLabel("maybe")).toBe("invalid");
  });
});

describe("cohensKappa", () => {
  it("is 1 for perfect agreement and 0 for agreement at chance", () => {
    expect(cohensKappa([[1, 1], [0, 0], [1, 1], [0, 0]])).toBe(1);
    // each rater says 1 half the time, independently: observed 0.5, expected 0.5
    expect(cohensKappa([[1, 1], [1, 0], [0, 1], [0, 0]])).toBe(0);
  });

  it("matches a worked example (20 items: 15 agree; p_o 0.75, p_e 0.5, kappa 0.5)", () => {
    const pairs = [...Array(8).fill([1, 1]), ...Array(7).fill([0, 0]), ...Array(2).fill([1, 0]), ...Array(3).fill([0, 1])];
    // rater A: 10 x 1, rater B: 11 x 1 -> p_e = 0.5*0.55 + 0.5*0.45 = 0.5
    expect(cohensKappa(pairs)).toBeCloseTo(0.5, 10);
  });

  it("is null with no items", () => {
    expect(cohensKappa([])).toBe(null);
  });
});

describe("the mining script's helpers", () => {
  it("bands the plain-word overlap", () => {
    expect(jaccard(new Set(["a", "b"]), new Set(["a", "b"]))).toBe(1);
    expect(jaccard(new Set(["a", "b", "c", "d"]), new Set(["a", "b"]))).toBe(0.5);
    expect([0.2, 0.25, 0.49, 0.5, 0.75, 1].map(bandOf)).toEqual([null, "low", "low", "mid", "high", "high"]);
  });

  it("asks for 300 pairs, as the labelling plan does", () => {
    expect(Object.values(TARGETS).reduce((a, b) => a + b, 0)).toBe(300);
  });
});
