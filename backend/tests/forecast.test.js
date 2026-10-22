// R2, the 7-day drop forecast: the sample builder (src/ml/forecast/features.js) and the measures (src/ml/forecast/metrics.js).
// The feature and label rules are what decide whether the evaluation is honest (no future in the features, no unseen week in the
// labels), so each is pinned with a hand-made price history.
import { describe, it, expect } from "vitest";

import { buildSamples, dailySeries, featuresAt, fellInWeekTo, FEATURE_NAMES, FORECAST, labelAt, pkDay } from "../src/ml/forecast/features.js";
import { atTop, auc, averagePrecision, brier, brierSkill, clusterBootstrap } from "../src/ml/forecast/metrics.js";

const DAY = 86_400_000;
const START = Date.parse("2026-10-01T12:00:00+05:00");
/** One record per given day offset: [[dayOffset, price], ...] */
const entries = (points) => points.map(([d, price, extra = {}]) => ({ price, recordedAt: new Date(START + d * DAY), ...extra }));
const f = (vector, name) => vector[FEATURE_NAMES.indexOf(name)];

describe("dailySeries", () => {
  it("keeps the last record of each Pakistan calendar day, oldest first, and drops unusable records", () => {
    const late = Date.parse("2026-10-01T23:30:00+05:00"); // still 1 October in Pakistan (18:30 UTC)
    const series = dailySeries([
      { price: 100, recordedAt: new Date(START) },
      { price: 105, recordedAt: new Date(late) },
      { price: 0, recordedAt: new Date(START + DAY) },
      { price: 90, recordedAt: "not a date" },
      { price: 98, recordedAt: new Date(START + 2 * DAY), originalPrice: 120, inStock: false },
    ]);
    expect(series.map((p) => p.price)).toEqual([105, 98]);
    expect(series[0].day).toBe(pkDay(START));
    expect(series[1]).toMatchObject({ originalPrice: 120, inStock: false });
  });
});

describe("labelAt", () => {
  it("is 1 when a record within 7 days is 3% or more below, 0 when none is", () => {
    const series = dailySeries(entries([[0, 100], [3, 98], [6, 97], [10, 90]]));
    expect(labelAt(series, 0)).toBe(1); // 97 is exactly 3% below
    const steady = dailySeries(entries([[0, 100], [3, 98], [6, 97.5]]));
    expect(labelAt(steady, 0)).toBe(0);
  });

  it("does not look past 7 days", () => {
    const series = dailySeries(entries([[0, 100], [5, 100], [8, 50]]));
    expect(labelAt(series, 0)).toBe(0);
  });

  it("gives no label when the week was not seen, or holds an error-sized price", () => {
    expect(labelAt(dailySeries(entries([[0, 100], [4, 90]])), 0)).toBeNull(); // last record only 4 days on
    expect(labelAt(dailySeries(entries([[0, 100]])), 0)).toBeNull();
    expect(labelAt(dailySeries(entries([[0, 100], [6, 49]])), 0)).toBeNull(); // below half: a reading error, not a drop
    expect(labelAt(dailySeries(entries([[0, 100], [3, 201], [6, 100]])), 0)).toBeNull();
  });
});

describe("featuresAt", () => {
  const series = dailySeries(entries([[0, 100], [7, 110], [10, 110], [14, 99, { originalPrice: 120 }], [20, 80]]));

  it("uses only the records up to the sample day", () => {
    const at14 = featuresAt(series, 3, { category: "smartphone", storeFell7: 0.25 });
    const withFuture = featuresAt([...series.slice(0, 4), { day: series[3].day + 1, price: 1, originalPrice: null, inStock: true }], 3, { category: "smartphone", storeFell7: 0.25 });
    expect(at14).toEqual(withFuture);
  });

  it("computes each feature from the history", () => {
    const v = featuresAt(series, 3, { category: "smartphone", storeFell7: 0.25 });
    expect(v).toHaveLength(FEATURE_NAMES.length);
    expect(f(v, "change7")).toBeCloseTo(99 / 110 - 1, 10); // vs the last record at least 7 days before (day 7)
    expect(f(v, "change14")).toBeCloseTo(99 / 100 - 1, 10);
    expect(f(v, "rangePosition")).toBeCloseTo((99 - 99) / (110 - 99), 10); // day 0 (100) is 14 days back, inside 30
    expect(f(v, "vsMedian")).toBeCloseTo(99 / 105 - 1, 10); // median of 100, 110, 110, 99
    expect(f(v, "daysSinceChange")).toBe(0);
    expect(f(v, "changes30")).toBe(2); // 100 -> 110, 110 -> 99
    expect(f(v, "claimedDiscount")).toBeCloseTo(120 / 99 - 1, 10);
    expect(f(v, "historyDays")).toBeCloseTo(Math.log1p(14), 10);
    expect(f(v, "logPrice")).toBeCloseTo(Math.log(99), 10);
    expect(f(v, "inStock")).toBe(1);
    expect(f(v, "storeFell7")).toBe(0.25);
    expect(f(v, "is_smartphone")).toBe(1);
    expect(f(v, "is_tv")).toBe(0);
  });

  it("looks back 30 days only, and reads no discount from a was-price that is not above the price", () => {
    const long = dailySeries(entries([[0, 300], [35, 100], [40, 110], [45, 105, { originalPrice: 100 }]]));
    const v = featuresAt(long, 3, {});
    expect(f(v, "rangePosition")).toBeCloseTo(0.5, 10); // 100..110 only: the 300 from 45 days before is out of range
    expect(f(v, "vsMedian")).toBeCloseTo(0, 10); // median of 100, 105, 110
    expect(f(v, "changes30")).toBe(3); // a move counts on the day it was recorded: 300 -> 100 (day 35), -> 110, -> 105
    expect(f(v, "claimedDiscount")).toBe(0);
  });

  it("is neutral where there is nothing to compare: no earlier record, a flat price", () => {
    const flat = dailySeries(entries([[0, 50], [3, 50]]));
    const v = featuresAt(flat, 1, {});
    expect(f(v, "change7")).toBe(0);
    expect(f(v, "rangePosition")).toBe(0.5);
    expect(f(v, "volatility")).toBe(0);
    expect(f(v, "daysSinceChange")).toBe(3);
    expect(FEATURE_NAMES.filter((n) => n.startsWith("is_")).map((n) => f(v, n))).toEqual([0, 0, 0, 0, 0, 0]); // category unknown
  });
});

describe("fellInWeekTo", () => {
  it("says whether the price fell 3%+ in the 7 days up to a day, and null when nothing was recorded that week", () => {
    const series = dailySeries(entries([[0, 100], [5, 96], [9, 98]]));
    expect(fellInWeekTo(series, series[1].day)).toBe(null); // nothing at least 7 days before day 5
    expect(fellInWeekTo(series, pkDay(START) + 8)).toBe(true); // latest by day 8 is 96 (day 5); a week earlier it was 100 (day 0)
    const small = dailySeries(entries([[0, 100], [8, 98]]));
    expect(fellInWeekTo(small, pkDay(START) + 8)).toBe(false); // 2% is not a fall
    expect(fellInWeekTo(small, pkDay(START) + 20)).toBe(null); // last record 12 days before: nothing in that week
  });
});

describe("buildSamples", () => {
  const history = (key, platform, points, category = "smartphone") => ({ key, platform, category, entries: entries(points) });

  it("makes a sample of each recorded day with a week of history behind it and its next week seen", () => {
    const samples = buildSamples([history("a", "mega", [[0, 100], [3, 100], [7, 100], [10, 100], [14, 96], [17, 96]])]);
    expect(samples.map((s) => s.day - pkDay(START))).toEqual([7, 10]); // day 14 and 17 have no seen week after them
    expect(samples.map((s) => s.label)).toEqual([1, 1]);
    expect(samples[0]).toMatchObject({ key: "a", platform: "mega", category: "smartphone", price: 100 });
  });

  it("works out the store-wide share from the same store's listings, past records only", () => {
    const histories = [
      history("a", "mega", [[0, 100], [7, 100], [12, 100]]),
      history("b", "mega", [[0, 100], [7, 90], [12, 90]]), // fell 10% in the week to day 7
      history("c", "shophive", [[0, 100], [7, 50]]),
      history("d", "mega", [[0, 100], [25, 100]]), // nothing recorded in the week to day 7: unknown, not "did not fall"
    ];
    const sample = buildSamples(histories).find((s) => s.key === "a");
    expect(f(sample.features, "storeFell7")).toBe(0.5); // a did not fall, b did; d is unknown; the other store does not count
  });
});

describe("metrics", () => {
  it("auc: 1 for a perfect ranking, 0.5 for ties everywhere, null without both classes", () => {
    expect(auc([0.1, 0.2, 0.8, 0.9], [0, 0, 1, 1])).toBe(1);
    expect(auc([0.9, 0.8, 0.2, 0.1], [0, 0, 1, 1])).toBe(0);
    expect(auc([0.5, 0.5, 0.5, 0.5], [0, 1, 0, 1])).toBe(0.5);
    expect(auc([0.1, 0.4, 0.35, 0.8], [0, 0, 1, 1])).toBe(0.75);
    expect(auc([1, 2], [0, 0])).toBeNull();
  });

  it("averagePrecision: the mean precision at each hit, ties counted against the score", () => {
    expect(averagePrecision([0.9, 0.8, 0.7, 0.6], [1, 0, 1, 0])).toBeCloseTo((1 + 2 / 3) / 2, 10);
    expect(averagePrecision([0.5, 0.5], [1, 0])).toBeCloseTo(0.5, 10); // the tie puts the miss first
    expect(averagePrecision([0.1], [0])).toBeNull();
  });

  it("brier and brierSkill: 0 for the base rate itself, positive when better, negative when worse", () => {
    const labels = [1, 0, 0, 0];
    expect(brier([1, 0, 0, 0], labels)).toBe(0);
    expect(brierSkill([0.25, 0.25, 0.25, 0.25], labels, 0.25)).toBeCloseTo(0, 10);
    expect(brierSkill([0.9, 0.1, 0.1, 0.1], labels, 0.25)).toBeGreaterThan(0);
    expect(brierSkill([0.1, 0.9, 0.1, 0.1], labels, 0.25)).toBeLessThan(0);
  });

  it("atTop: precision, recall and lift in the top share", () => {
    const scores = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
    const labels = [1, 0, 0, 0, 0, 0, 0, 1, 0, 0];
    expect(atTop(scores, labels, 0.2)).toEqual({ share: 0.2, n: 2, hits: 1, precision: 0.5, recall: 0.5, lift: 2.5 });
  });

  it("clusterBootstrap: repeatable, and resamples whole groups", () => {
    const groups = ["a", "a", "b", "b", "c", "c"];
    const values = [1, 1, 2, 2, 3, 3];
    const mean = (ix) => ix.reduce((s, i) => s + values[i], 0) / ix.length;
    const first = clusterBootstrap(groups, mean, { reps: 200, seed: 7 });
    expect(clusterBootstrap(groups, mean, { reps: 200, seed: 7 })).toEqual(first);
    expect(first[0]).toBeGreaterThanOrEqual(1);
    expect(first[1]).toBeLessThanOrEqual(3);
    expect(clusterBootstrap(groups, () => null, { reps: 50 })).toBeNull();
  });

  it("clusterBootstrap: a listing with many samples moves as one, so the interval is as wide as two listings allow", () => {
    // Listing "a" has nine samples of 1, listing "b" one sample of 0. Resampling listings draws {a,a}, {a,b} or {b,b}: the mean
    // can be 0. Resampling single samples would almost never draw ten zeros, and would claim far more certainty than two listings give.
    const groups = [...Array(9).fill("a"), "b"];
    const values = [...Array(9).fill(1), 0];
    const interval = clusterBootstrap(groups, (ix) => ix.reduce((s, i) => s + values[i], 0) / ix.length, { reps: 400, seed: 3 });
    expect(interval[0]).toBe(0);
  });
});

describe("the rules", () => {
  it("are the ones the report states", () => {
    expect(FORECAST).toMatchObject({ DROP: 0.03, WINDOW_DAYS: 7, MIN_SEEN_DAYS: 5, MIN_HISTORY_DAYS: 7 });
  });
});
