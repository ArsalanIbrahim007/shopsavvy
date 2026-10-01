import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { platformColor, platformInitial, platformName, KNOWN_PLATFORMS } from "../src/lib/platforms.js";
import { scoreOf, scoreTone, scoreParts, bestDealOffer } from "../src/lib/score.js";
import { buildSpecs } from "../src/lib/specs.js";
import { getRecentSearches, addRecentSearch, clearRecentSearches, MAX_RECENT } from "../src/lib/recentSearches.js";
import {
  historyPoints, historyStats, pointsInRange, buildSeries, stepPath, chartModel, sparklineModel, RANGES,
  niceTicks, dateTicks, priceAtTime, hoverRows,
} from "../src/lib/history.js";

const DAY = 24 * 3600 * 1000;
const NOW = new Date("2026-09-30T12:00:00Z").getTime();
const daysAgo = (n) => new Date(NOW - n * DAY).toISOString();
const point = (price, days) => ({ price, recordedAt: daysAgo(days) });

describe("platforms: colour and monogram", () => {
  it("gives every known store its own colour and initial, and a neutral grey to an unknown one", () => {
    const colours = KNOWN_PLATFORMS.map(platformColor);
    expect(new Set(colours).size).toBe(colours.length);
    for (const colour of colours) expect(colour).toMatch(/^#[0-9a-f]{6}$/i);
    expect(platformColor("PriceOye")).toBe(platformColor("priceoye"));
    expect(platformColor("some new store")).toBe("#47566b");
    expect(platformInitial("mega")).toBe("M");
    expect(platformInitial("iShopping")).toBe("I");
    expect(platformInitial("")).toBe("S");
    expect(platformInitial(undefined)).toBe("S");
  });

  it("names every store we collect from", () => {
    for (const id of ["priceoye", "mega", "shophive", "w11stop", "telemart", "ishopping", "paklap"]) expect(platformName(id)).not.toBe(id);
  });
});

describe("score", () => {
  const offer = { dealScore: 82.5, scoreBreakdown: { price: 50, trust: 18, freshness: 9, availability: 5.5 }, scoreWeights: { price: 60, trust: 20, freshness: 10, availability: 10 } };

  it("reads the total, ignoring anything that is not a number", () => {
    expect(scoreOf(offer)).toBe(82.5);
    expect(scoreOf({ dealScore: "71" })).toBe(71);
    for (const bad of [{}, { dealScore: "abc" }, { dealScore: undefined }, null, undefined]) expect(scoreOf(bad)).toBeNull();
  });

  it("bands a score: high from 80, mid from 55, low below, none when there is no score", () => {
    expect([100, 80, 79.9, 55, 54.9, 0].map(scoreTone)).toEqual(["high", "high", "mid", "mid", "low", "low"]);
    expect(scoreTone(null)).toBe("none");
    expect(scoreTone(NaN)).toBe("none");
  });

  it("splits a score into its four parts with the server's maximums", () => {
    const parts = scoreParts(offer);
    expect(parts.map((p) => p.key)).toEqual(["price", "trust", "freshness", "availability"]);
    expect(parts.map((p) => [p.got, p.max])).toEqual([[50, 60], [18, 20], [9, 10], [5.5, 10]]);
    expect(parts[0].label).toBe("Price competitiveness");
    expect(parts.reduce((sum, p) => sum + p.got, 0)).toBe(82.5);
  });

  it("uses the server's weights when they change, and the usual ones when none are sent", () => {
    const reweighted = scoreParts({ ...offer, scoreWeights: { price: 50, trust: 30, freshness: 10, availability: 10 } });
    expect(reweighted.map((p) => p.max)).toEqual([50, 30, 10, 10]);
    const noWeights = scoreParts({ scoreBreakdown: offer.scoreBreakdown });
    expect(noWeights.map((p) => p.max)).toEqual([60, 20, 10, 10]);
  });

  it("never shows a part above its maximum or below zero, and treats a missing part as zero", () => {
    const parts = scoreParts({ scoreBreakdown: { price: 99, trust: -4, freshness: "x" } });
    expect(parts.map((p) => p.got)).toEqual([60, 0, 0, 0]);
  });

  it("has no parts for an offer without a breakdown", () => {
    expect(scoreParts({ dealScore: 50 })).toEqual([]);
    expect(scoreParts(undefined)).toEqual([]);
  });

  it("picks the best deal only when offers were compared, and never an unusual price", () => {
    const a = { _id: "a", dealScore: 70 };
    const b = { _id: "b", dealScore: 90 };
    const odd = { _id: "c", dealScore: 99, priceCheck: { status: "suspect_low" } };
    expect(bestDealOffer([a])).toBeNull();
    expect(bestDealOffer([])).toBeNull();
    expect(bestDealOffer(undefined)).toBeNull();
    expect(bestDealOffer([a, b])._id).toBe("b");
    expect(bestDealOffer([a, b, odd])._id).toBe("b");
    expect(bestDealOffer([a, { _id: "x", dealScore: undefined }])._id).toBe("a");
  });
});

describe("buildSpecs", () => {
  it("lists only what the listing states, in a fixed order with readable values", () => {
    const rows = buildSpecs({
      brand: "Samsung", productCategory: "smartphone", storageGb: 256, ramGb: 8, screenInches: 6.7, colour: "Black", condition: "new", ptaStatus: "pta_approved",
    });
    expect(rows).toEqual([
      ["Brand", "Samsung"], ["Category", "Smartphones"], ["Storage", "256 GB"], ["Memory", "8 GB RAM"], ["Screen size", '6.7"'],
      ["Colour", "Black"], ["Condition", "New"], ["PTA status", "PTA approved"],
    ]);
  });

  it("leaves out anything missing, unknown or 'other', instead of printing 'unknown'", () => {
    expect(buildSpecs({ productCategory: "other", ptaStatus: "unknown", storageGb: null, colour: "" })).toEqual([]);
    expect(buildSpecs({ storageGb: 1024 })).toEqual([["Storage", "1 TB"]]);
    expect(buildSpecs(null)).toEqual([]);
    expect(buildSpecs({ resolution: "4K", productCategory: "tv" })).toEqual([["Category", "TVs"], ["Resolution", "4K"]]);
  });
});

describe("recent searches", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("remembers searches newest first, without repeats, up to the limit", () => {
    for (const term of ["iphone", "galaxy", "IPHONE", "macbook"]) addRecentSearch(term);
    expect(getRecentSearches()).toEqual(["macbook", "IPHONE", "galaxy"]);
    for (let i = 0; i < 10; i++) addRecentSearch(`phone ${i}`);
    expect(getRecentSearches()).toHaveLength(MAX_RECENT);
    expect(getRecentSearches()[0]).toBe("phone 9");
  });

  it("ignores empty, blank and oversized text, and trims the rest", () => {
    addRecentSearch("   ");
    addRecentSearch("");
    addRecentSearch(undefined);
    addRecentSearch("x".repeat(101));
    expect(getRecentSearches()).toEqual([]);
    addRecentSearch("  iphone 17  ");
    expect(getRecentSearches()).toEqual(["iphone 17"]);
  });

  it("can be cleared", () => {
    addRecentSearch("iphone");
    clearRecentSearches();
    expect(getRecentSearches()).toEqual([]);
  });

  it("survives junk in storage", () => {
    for (const junk of ["not json", "{}", "42", '["ok", 5, null, "", "  ", {"a":1}]']) {
      window.localStorage.setItem("shopsavvy:recent-searches:v1", junk);
      const result = getRecentSearches();
      expect(Array.isArray(result)).toBe(true);
      expect(result.every((t) => typeof t === "string" && t.trim() !== "")).toBe(true);
    }
    window.localStorage.setItem("shopsavvy:recent-searches:v1", '["ok", 5, null, "", "  "]');
    expect(getRecentSearches()).toEqual(["ok"]);
  });

  it("keeps working when storage is blocked or full", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("full"); });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(getRecentSearches()).toEqual([]);
    expect(() => addRecentSearch("iphone")).not.toThrow();
    expect(addRecentSearch("iphone")).toEqual(["iphone"]);
    expect(() => clearRecentSearches()).not.toThrow();
  });
});

describe("history: points and stats", () => {
  it("keeps valid points in time order, one per instant, and drops junk", () => {
    const offer = { priceHistory: [point(120, 1), point(100, 10), point(0, 5), point("x", 4), { price: 90, recordedAt: "not a date" }, point(100, 10), point(110, 3)] };
    expect(historyPoints(offer).map((p) => p.price)).toEqual([100, 110, 120]);
    expect(historyPoints({})).toEqual([]);
    expect(historyPoints(null)).toEqual([]);
  });

  it("summarises lowest, highest and the change from first to latest", () => {
    const stats = historyStats(historyPoints({ priceHistory: [point(100, 30), point(80, 20), point(120, 10), point(90, 1)] }));
    expect(stats).toMatchObject({ count: 4, min: 80, max: 120, changePercent: -10 });
    expect(stats.first.price).toBe(100);
    expect(stats.last.price).toBe(90);
    expect(historyStats([])).toBeNull();
  });
});

describe("history: ranges", () => {
  const points = historyPoints({ priceHistory: [point(100, 200), point(110, 60), point(105, 20), point(95, 2)] });

  it("keeps the points inside the window", () => {
    expect(pointsInRange(points, "30d", NOW).map((p) => p.price)).toEqual([110, 105, 95]); // 110 was still the price when the window began
    expect(pointsInRange(points, "all", NOW)).toEqual(points);
    expect(pointsInRange([], "30d", NOW)).toEqual([]);
  });

  it("carries the price that held at the start of the window, placed at the window's start", () => {
    const inRange = pointsInRange(points, "30d", NOW);
    expect(inRange[0].price).toBe(110);
    expect(inRange[0].at.getTime()).toBe(NOW - 30 * DAY);
    const ninety = pointsInRange(points, "90d", NOW);
    expect(ninety.map((p) => p.price)).toEqual([100, 110, 105, 95]); // the 200-day-old price is carried to the start, the 60-day one is inside
    expect(ninety[0].at.getTime()).toBe(NOW - 90 * DAY);
  });

  it("does not invent a starting price when nothing was recorded before the window", () => {
    const recent = historyPoints({ priceHistory: [point(100, 10), point(90, 2)] });
    expect(pointsInRange(recent, "30d", NOW).map((p) => p.price)).toEqual([100, 90]);
  });

  it("falls back to 90 days for an unknown range, and offers 30 days, 90 days and all time", () => {
    expect(pointsInRange(points, "bogus", NOW)).toEqual(pointsInRange(points, "90d", NOW));
    expect(RANGES.map((r) => r.id)).toEqual(["30d", "90d", "all"]);
  });
});

describe("history: series and chart model", () => {
  const offers = [
    { _id: "a", platform: "priceoye", priceHistory: [point(100, 40), point(90, 10)] },
    { _id: "b", platform: "mega", priceHistory: [point(110, 40), point(105, 5)] },
    { _id: "c", platform: "shophive", priceHistory: [] },
  ];

  it("makes one series per offer that has history, marks the opened one, and names the store", () => {
    const series = buildSeries(offers, "all", { currentId: "b", now: NOW });
    expect(series.map((s) => [s.id, s.name, s.isCurrent])).toEqual([["a", "PriceOye", false], ["b", "Mega.pk", true]]);
    expect(buildSeries([], "all", { now: NOW })).toEqual([]);
    expect(buildSeries(undefined, "all", { now: NOW })).toEqual([]);
  });

  it("draws a step path: flat until the price changes, then straight up or down", () => {
    expect(stepPath([[0, 10], [50, 10], [50, 30], [100, 30]])).toBe("M0.0,10.0 H50.0V10.0 H50.0V30.0 H100.0V30.0");
    expect(stepPath([[5, 5]])).toBe("M5.0,5.0");
  });

  it("scales every series onto the same axes, lowest price at the bottom and earliest time at the left", () => {
    const model = chartModel(buildSeries(offers, "all", { now: NOW }), { width: 640, height: 240 });
    expect(model).toMatchObject({ min: 90, max: 110 });
    const { pad } = model;
    const top = model.yTicks.at(-1);
    const bottom = model.yTicks[0];
    expect(bottom.value).toBeLessThanOrEqual(90); // the scale covers every price, with a little room
    expect(top.value).toBeGreaterThanOrEqual(110);
    expect(bottom.y).toBeCloseTo(240 - pad.bottom); // the lowest tick is the bottom of the plot, the highest the top
    expect(top.y).toBeCloseTo(pad.top);
    expect(model.y(90)).toBeLessThan(bottom.y);
    expect(model.y(110)).toBeGreaterThan(top.y);
    expect(model.y(110)).toBeLessThan(model.y(90)); // dearer is higher on the chart
    expect(model.x(model.from)).toBeCloseTo(pad.left);
    expect(model.x(model.to)).toBeCloseTo(640 - pad.right);
    expect(model.lines).toHaveLength(2);
    expect(model.lines[0].dots.map((d) => d.price)).toEqual([100, 90]);
  });

  it("extends each line to the right edge, because the last price is still the price today", () => {
    const model = chartModel(buildSeries(offers, "all", { now: NOW }));
    const a = model.lines.find((l) => l.id === "a");
    // a's last point is 10 days ago, b's is 5 days ago: a's line runs on to b's date
    expect(a.path.split("H").length).toBe(3); // one step plus the extension
    expect(a.path).toContain(`H${(model.width - model.pad.right).toFixed(1)}`);
  });

  it("has nothing to draw for no data or a single moment, and centres a flat line", () => {
    expect(chartModel([])).toBeNull();
    const single = buildSeries([{ _id: "a", platform: "mega", priceHistory: [point(100, 3)] }], "all", { now: NOW });
    expect(chartModel(single)).toBeNull();
    const flat = chartModel(buildSeries([{ _id: "a", platform: "mega", priceHistory: [point(100, 30), point(100, 1)] }], "all", { now: NOW }), { height: 240 });
    const { pad } = flat;
    expect(flat.y(100)).toBeCloseTo(pad.top + (240 - pad.top - pad.bottom) / 2, 0); // middle of the drawing area
    expect(flat.yTicks.map((t) => t.value)).toContain(100); // and the axis still has a scale around it
  });
});

describe("history: sparkline", () => {
  it("needs at least two recorded prices", () => {
    expect(sparklineModel({ priceHistory: [point(100, 1)] })).toBeNull();
    expect(sparklineModel({})).toBeNull();
  });

  it("reports direction, change and range", () => {
    const down = sparklineModel({ priceHistory: [point(100, 10), point(90, 5), point(80, 1)] });
    expect(down).toMatchObject({ tone: "down", changePercent: -20, min: 80, max: 100, count: 3 });
    expect(sparklineModel({ priceHistory: [point(80, 10), point(100, 1)] }).tone).toBe("up");
    expect(sparklineModel({ priceHistory: [point(80, 10), point(80, 1)] }).tone).toBe("flat");
  });

  it("puts the lowest price at the bottom edge and the highest at the top", () => {
    const model = sparklineModel({ priceHistory: [point(100, 10), point(50, 1)] }, { width: 100, height: 20 });
    const ys = model.polyline.split(" ").map((p) => Number(p.split(",")[1]));
    expect(ys).toEqual([0, 20]);
    expect(model.endY).toBe(20);
  });
});

describe("history: axis ticks", () => {
  it("niceTicks gives round, evenly spaced values that cover the range", () => {
    expect(niceTicks(64000, 72000)).toEqual({ ticks: [64000, 66000, 68000, 70000, 72000], min: 64000, max: 72000 });
    const t = niceTicks(284999, 398000);
    expect(t.min).toBeLessThanOrEqual(284999);
    expect(t.max).toBeGreaterThanOrEqual(398000);
    const steps = t.ticks.slice(1).map((v, i) => v - t.ticks[i]);
    expect(new Set(steps).size).toBe(1); // evenly spaced
    expect(t.ticks.every((v) => v % steps[0] === 0)).toBe(true); // round multiples of the step
    expect([1, 2, 5]).toContain(Number(String(steps[0]).replace(/0+$/, "")));
    expect(t.ticks.length).toBeGreaterThanOrEqual(4);
    expect(t.ticks.length).toBeLessThanOrEqual(7);
  });

  it("niceTicks gives a flat range a band around the value, and never goes below zero", () => {
    const flat = niceTicks(100, 100);
    expect(flat.min).toBeLessThan(100);
    expect(flat.max).toBeGreaterThan(100);
    expect(flat.ticks).toContain(100);
    expect(niceTicks(0.5, 3).min).toBeGreaterThanOrEqual(0);
    expect(niceTicks(10, 12).ticks.every((v) => v >= 0)).toBe(true);
  });

  it("dateTicks puts a label on a whole number of days, about six at most, inside the range", () => {
    const from = new Date(NOW - 90 * DAY);
    const to = new Date(NOW);
    const ticks = dateTicks(from, to, 6);
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    expect(ticks.length).toBeLessThanOrEqual(7);
    for (const tick of ticks) {
      expect(tick.getTime()).toBeGreaterThanOrEqual(from.getTime());
      expect(tick.getTime()).toBeLessThanOrEqual(to.getTime());
      expect([tick.getHours(), tick.getMinutes()]).toEqual([0, 0]); // calendar days
    }
    const gaps = ticks.slice(1).map((t, i) => Math.round((t - ticks[i]) / DAY));
    expect(new Set(gaps).size).toBe(1);
    expect(dateTicks(from, to, 3).length).toBeLessThan(dateTicks(from, to, 12).length); // fewer labels on a narrow chart
  });

  it("dateTicks labels the two ends of a range shorter than two days", () => {
    const from = new Date(NOW - 20 * 3600 * 1000);
    const to = new Date(NOW);
    expect(dateTicks(from, to)).toEqual([from, to]);
  });

  it("the chart model carries labelled ticks for both axes, and the year only when the range spans two", () => {
    const model = chartModel(buildSeries([{ _id: "a", platform: "mega", priceHistory: [point(369999, 60), point(389999, 2)] }], "all", { now: NOW }), { width: 640, height: 300 });
    expect(model.yTicks.length).toBeGreaterThanOrEqual(4);
    expect(model.yTicks.every((t) => /^[\d,]+$/.test(t.label))).toBe(true);
    expect(model.yTicks[0].label).toBe(model.yTicks[0].value.toLocaleString("en-US"));
    expect(model.xTicks.every((t) => /^\d{1,2} [A-Z][a-z]{2,3}$/.test(t.label))).toBe(true);
    for (const t of model.xTicks) expect(t.x).toBeCloseTo(model.x(t.at));

    const longer = chartModel(buildSeries([{ _id: "a", platform: "mega", priceHistory: [point(1, 500), point(2, 2)] }], "all", { now: NOW }));
    expect(longer.xTicks.every((t) => /\d{4}$/.test(t.label))).toBe(true);
  });

  it("timeAt turns a horizontal position back into a date, kept inside the chart", () => {
    const model = chartModel(buildSeries([{ _id: "a", platform: "mega", priceHistory: [point(100, 40), point(90, 10)] }], "all", { now: NOW }));
    expect(model.timeAt(model.pad.left).getTime()).toBe(model.from.getTime());
    expect(model.timeAt(model.width - model.pad.right).getTime()).toBe(model.to.getTime());
    expect(model.timeAt(-500).getTime()).toBe(model.from.getTime());
    expect(model.timeAt(99999).getTime()).toBe(model.to.getTime());
    const middle = model.timeAt((model.pad.left + model.width - model.pad.right) / 2).getTime();
    expect(middle).toBeCloseTo((model.from.getTime() + model.to.getTime()) / 2, -2);
  });
});

describe("history: what a store charged on a date", () => {
  const offers = [
    { _id: "a", platform: "priceoye", priceHistory: [point(100, 40), point(90, 10)] },
    { _id: "b", platform: "mega", priceHistory: [point(110, 30), point(105, 5)] },
  ];
  const series = buildSeries(offers, "all", { currentId: "a", now: NOW });
  const at = (days) => NOW - days * DAY;

  it("priceAtTime is the last recorded price at or before the time, and nothing before the first", () => {
    const a = series[0].points;
    expect(priceAtTime(a, at(50))).toBeNull();
    expect(priceAtTime(a, at(40))).toBe(100);
    expect(priceAtTime(a, at(20))).toBe(100); // held until it changed
    expect(priceAtTime(a, at(10))).toBe(90);
    expect(priceAtTime(a, at(0))).toBe(90);
  });

  it("hoverRows lists every store with a price on that date, cheapest first, and leaves out stores with none yet", () => {
    expect(hoverRows(series, at(35)).map((r) => [r.name, r.price])).toEqual([["PriceOye", 100]]); // Mega starts 30 days ago
    expect(hoverRows(series, at(20)).map((r) => [r.name, r.price])).toEqual([["PriceOye", 100], ["Mega.pk", 110]]);
    expect(hoverRows(series, at(1)).map((r) => [r.name, r.price])).toEqual([["PriceOye", 90], ["Mega.pk", 105]]);
    expect(hoverRows(series, at(60))).toEqual([]);
    expect(hoverRows(series, at(1))[0]).toMatchObject({ platform: "priceoye", isCurrent: true });
  });
});
