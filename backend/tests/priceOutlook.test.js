import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import PriceHistory from "../src/models/priceHistory.model.js";
import {
  BACKTEST, MARKET, OUTLOOK, assessOutlook, backtestOutlook, comparableOffers, dailyPrices, karachiDay, outlookForOffers, productSeries, summarizeMovement,
} from "../src/services/priceOutlook.service.js";
import { clearMarketMovementCache, getMarketMovement } from "../src/services/marketMovement.service.js";

// 2026-10-01 12:00 UTC is 17:00 in Pakistan: the same calendar day
const NOW = Date.parse("2026-10-01T12:00:00Z");
const DAY = 86400000;
const at = (daysAgo, hour = 12) => new Date(Date.parse("2026-10-01T00:00:00Z") - daysAgo * DAY + hour * 3600000).toISOString();
const entry = (daysAgo, price, hour) => ({ price, recordedAt: at(daysAgo, hour) });
/** one record a day, oldest first, ending today, at the given prices */
const daily = (prices) => prices.map((price, i) => ({ day: karachiDay(at(prices.length - 1 - i)), price }));

describe("karachiDay", () => {
  it("is the calendar day in Pakistan, which starts at 19:00 UTC the evening before", () => {
    expect(karachiDay("2026-09-30T18:59:00Z")).toBe("2026-09-30");
    expect(karachiDay("2026-09-30T19:00:00Z")).toBe("2026-10-01");
    expect(karachiDay("2026-10-01T12:00:00Z")).toBe("2026-10-01");
  });
});

describe("dailyPrices", () => {
  it("keeps the last price of each day, oldest first, whatever order the records arrive in", () => {
    const out = dailyPrices([entry(0, 90, 15), entry(1, 100, 10), entry(0, 95, 9), entry(1, 98, 16)]);
    expect(out).toEqual([{ day: "2026-09-30", price: 98 }, { day: "2026-10-01", price: 90 }]);
  });

  it("ignores records with no usable price or date, and copes with nothing", () => {
    const out = dailyPrices([{ price: 0, recordedAt: at(1) }, { price: -5, recordedAt: at(1) }, { price: "x", recordedAt: at(1) }, { price: 10, recordedAt: "nope" }, { price: 10 }, entry(2, 77)]);
    expect(out).toEqual([{ day: "2026-09-29", price: 77 }]);
    expect(dailyPrices(undefined)).toEqual([]);
    expect(dailyPrices([])).toEqual([]);
  });
});

describe("comparableOffers", () => {
  const offer = (id, over = {}) => ({ _id: id, condition: "new", priceHistory: [], ...over });

  it("leaves out an offer flagged as a probable listing error, and one whose PTA status is unclear", () => {
    const list = [offer("a"), offer("b", { priceCheck: { status: "suspect_high" } }), offer("c", { ptaAssessment: "not_stated" }), offer("d", { priceCheck: { status: "ok" } })];
    expect(comparableOffers(list).map((o) => o._id)).toEqual(["a", "d"]);
  });

  it("uses the new offers when there are any, and everything when there are none", () => {
    expect(comparableOffers([offer("n"), offer("u", { condition: "used" }), offer("r", { condition: "refurbished" }), offer("o", { condition: "open_box" })]).map((o) => o._id)).toEqual(["n"]);
    expect(comparableOffers([offer("u", { condition: "used" }), offer("r", { condition: "refurbished" })]).map((o) => o._id)).toEqual(["u", "r"]);
  });

  it("gives an empty list for nothing", () => {
    expect(comparableOffers(undefined)).toEqual([]);
  });
});

describe("productSeries", () => {
  const offer = (platform, history, over = {}) => ({ platform, condition: "new", priceHistory: history, ...over });

  it("takes the lowest comparable price on each day", () => {
    const series = productSeries([
      offer("mega", [entry(2, 100), entry(1, 100), entry(0, 100)]),
      offer("priceoye", [entry(2, 110), entry(1, 90), entry(0, 95)]),
    ]);
    expect(series.map((p) => p.price)).toEqual([100, 90, 95]);
  });

  it("carries a store's price forward for up to three days, and not beyond", () => {
    const series = productSeries([
      offer("mega", [entry(6, 80)]), // seen once, six days ago
      offer("priceoye", [entry(6, 100), entry(3, 100), entry(0, 100)]),
    ]);
    // mega counts on day -6 (its own record) and until day -3 (3 days old); it no longer counts on day -2, -1 or today
    expect(series.map((p) => [p.day, p.price])).toEqual([["2026-09-25", 80], ["2026-09-28", 80], ["2026-10-01", 100]]);
  });

  it("does not let a used offer set the product's price, or a flagged one, or an offer without history", () => {
    const series = productSeries([
      offer("a", [entry(1, 100)]),
      offer("b", [entry(1, 10)], { condition: "used" }),
      offer("c", [entry(1, 5)], { priceCheck: { status: "suspect_low" } }),
      offer("d", []),
    ]);
    expect(series).toEqual([{ day: "2026-09-30", price: 100 }]);
  });

  it("gives nothing for nothing", () => {
    expect(productSeries([])).toEqual([]);
    expect(productSeries(undefined)).toEqual([]);
  });
});

describe("assessOutlook: too early", () => {
  it("says so, and why, when there are no records", () => {
    expect(assessOutlook([], { now: NOW })).toEqual({ verdict: "too_early", why: "no_records", basis: { firstDay: null, lastDay: null, days: 0, records: 0 }, stats: null, strength: null, series: [], limits: { minDays: 7, minRecords: 5, fairDays: 28, fairRecords: 20, staleDays: 3 } });
    expect(assessOutlook(undefined, { now: NOW }).why).toBe("no_records");
  });

  it("needs seven calendar days, first record to last: six is too few, seven is enough", () => {
    expect(assessOutlook(daily([100, 100, 101, 100, 99, 100]), { now: NOW })).toMatchObject({ verdict: "too_early", why: "short", basis: { days: 6, records: 6 } });
    expect(assessOutlook(daily([100, 100, 101, 100, 99, 100, 100]), { now: NOW }).verdict).not.toBe("too_early");
  });

  it("needs five records, not just a long time: four records over a month is too few, five is enough", () => {
    const sparse = (n) => Array.from({ length: n }, (_, i) => ({ day: karachiDay(at(30 - i * Math.floor(30 / (n - 1)))), price: 100 + i }));
    expect(assessOutlook(sparse(4).slice(0, 3).concat([{ day: karachiDay(at(0)), price: 103 }]), { now: NOW })).toMatchObject({ verdict: "too_early", why: "short" });
    const five = [30, 20, 10, 5, 0].map((ago, i) => ({ day: karachiDay(at(ago)), price: 100 + i }));
    expect(assessOutlook(five, { now: NOW }).verdict).not.toBe("too_early");
  });

  it("will not say anything about today from records that stop more than three days ago", () => {
    const old = (gap) => daily([100, 101, 102, 103, 104, 105, 106, 107]).map((p) => ({ ...p, day: karachiDay(Date.parse(p.day) - gap * DAY) }));
    expect(assessOutlook(old(4), { now: NOW })).toMatchObject({ verdict: "too_early", why: "stale" });
    expect(assessOutlook(old(3), { now: NOW }).verdict).not.toBe("too_early");
  });

  it("carries no statistics and no strength, so nothing can be shown that is not there", () => {
    const out = assessOutlook(daily([100, 100, 100]), { now: NOW });
    expect(out.stats).toBeNull();
    expect(out.strength).toBeNull();
  });
});

describe("assessOutlook: the thresholds sent with it", () => {
  it("are the ones it applies, with a verdict and without one, so a page never has its own copy", () => {
    const limits = { minDays: OUTLOOK.MIN_DAYS, minRecords: OUTLOOK.MIN_RECORD_DAYS, fairDays: OUTLOOK.FAIR_DAYS, fairRecords: OUTLOOK.FAIR_RECORDS, staleDays: OUTLOOK.STALE_DAYS };
    expect(assessOutlook(daily([1000, 1010, 1020, 1030, 1040, 1050, 1060]), { now: NOW }).limits).toEqual(limits);
    expect(assessOutlook(daily([1000]), { now: NOW }).limits).toEqual(limits);
  });
});

describe("assessOutlook: the series sent to be drawn", () => {
  it("is the best price on each recorded day, oldest first, for a verdict and for too early alike", () => {
    const series = daily([1200, 1150, 1100, 1050, 1000, 1000, 1010]);
    expect(assessOutlook(series, { now: NOW }).series).toEqual(series);
    expect(assessOutlook(daily([1000, 1010]), { now: NOW }).series).toEqual(daily([1000, 1010]));
  });

  it("is only the newest 120 days when there are more", () => {
    const many = daily(Array.from({ length: 150 }, (_, i) => 1000 + (i % 7) * 20));
    const out = assessOutlook(many, { now: NOW });
    expect(out.series).toHaveLength(120);
    expect(out.series[119]).toEqual(many[149]);
    expect(out.series[0]).toEqual(many[30]);
    // the numbers still describe all of it
    expect(out.basis.records).toBe(150);
  });
});

describe("assessOutlook: the verdicts", () => {
  it("flat: the best price has stayed within 1%", () => {
    expect(assessOutlook(daily([1000, 1000, 1005, 1000, 1010, 1000, 1000]), { now: NOW }).verdict).toBe("flat"); // 1% from low to high
    expect(assessOutlook(daily([1000, 1000, 1000, 1000, 1000, 1000, 1000]), { now: NOW }).verdict).toBe("flat");
  });

  it("not flat once it has moved by more than 1%", () => {
    expect(assessOutlook(daily([1000, 1000, 1000, 1000, 1000, 1000, 1011]), { now: NOW }).verdict).not.toBe("flat");
  });

  it("at_low: at, or within 1% of, the lowest recorded price", () => {
    expect(assessOutlook(daily([1200, 1150, 1100, 1050, 1000, 1000, 1000]), { now: NOW }).verdict).toBe("at_low");
    expect(assessOutlook(daily([1200, 1150, 1100, 1050, 1000, 1005, 1010]), { now: NOW }).verdict).toBe("at_low"); // exactly 1% above the low
    expect(assessOutlook(daily([1200, 1150, 1100, 1050, 1000, 1005, 1011]), { now: NOW }).verdict).not.toBe("at_low");
  });

  it("above_usual: 5% or more above the median, and not at the low", () => {
    // median of 1000 x5 and 1100 x2 is 1000; 1050 is exactly 5% above it
    expect(assessOutlook(daily([1000, 1000, 1000, 1000, 1000, 1050, 1050]), { now: NOW }).verdict).toBe("above_usual");
    expect(assessOutlook(daily([1000, 1000, 1000, 1000, 1000, 1049, 1049]), { now: NOW }).verdict).toBe("usual");
  });

  it("usual: in between", () => {
    expect(assessOutlook(daily([1000, 1020, 1010, 1030, 1020, 1015, 1020]), { now: NOW }).verdict).toBe("usual");
  });

  it("checks flat before at_low, so a price that never moved is not called 'at its lowest'", () => {
    const out = assessOutlook(daily([500, 500, 500, 500, 500, 500, 500, 500]), { now: NOW });
    expect(out.verdict).toBe("flat");
  });
});

describe("assessOutlook: the numbers behind a verdict", () => {
  const series = daily([1200, 1150, 1100, 1050, 1000, 1000, 1010, 1060, 1100, 1100]); // 10 days

  it("reports the basis and the statistics", () => {
    const out = assessOutlook(series, { now: NOW });
    expect(out.basis).toEqual({ firstDay: "2026-09-22", lastDay: "2026-10-01", days: 10, records: 10 });
    expect(out.stats).toMatchObject({ current: 1100, low: 1000, high: 1200 });
    expect(out.stats.usual).toBe(1080); // median of the ten prices: (1060 + 1100) / 2
    expect(out.stats.vsUsualPct).toBe(1.9);
    expect(out.stats.daysBelow).toBe(5); // 1000, 1000, 1010, 1060 and 1050 are below 1100
  });

  it("measures the change over a week against the record at least seven days back", () => {
    // newest record 2026-10-01, so the week-ago record is 2026-09-24 at 1100 (the fourth price)
    expect(assessOutlook(series, { now: NOW }).stats.changeWeekPct).toBe(0);
    expect(assessOutlook(daily([1000, 1000, 1000, 1000, 1000, 1000, 1000, 1100]), { now: NOW }).stats.changeWeekPct).toBe(10);
  });

  it("has no weekly change when the records do not go back a week", () => {
    expect(assessOutlook(daily([1000, 1010, 1020, 1030, 1040, 1050, 1060]), { now: NOW }).stats.changeWeekPct).toBeNull();
  });

  it("counts the days since the price last changed by 0.5% or more, and null if it never did", () => {
    expect(assessOutlook(daily([1000, 1000, 1000, 1000, 1000, 1100, 1100, 1100]), { now: NOW }).stats.daysSinceChange).toBe(2);
    expect(assessOutlook(daily([1000, 1000, 1000, 1000, 1000, 1000, 1000, 1004]), { now: NOW }).stats.daysSinceChange).toBeNull(); // 0.4%
    expect(assessOutlook(daily([1000, 1000, 1000, 1000, 1000, 1000, 1000, 1005]), { now: NOW }).stats.daysSinceChange).toBe(0); // 0.5%
  });

  it("calls the history early under four weeks or twenty records, fair from both", () => {
    const long = (days, step = 1) => Array.from({ length: days }, (_, i) => ({ day: karachiDay(at(days - 1 - i)), price: 1000 + (i % 3) * 20 })).filter((_, i) => i % step === 0 || i === days - 1);
    expect(assessOutlook(long(27), { now: NOW }).strength).toBe("early");
    expect(assessOutlook(long(28), { now: NOW }).strength).toBe("fair");
    expect(assessOutlook(long(28, 2), { now: NOW }).strength).toBe("early"); // 28 days but only 15 records
    expect(assessOutlook(long(40), { now: NOW }).strength).toBe("fair");
  });
});

describe("outlookForOffers", () => {
  it("puts the pieces together: the best comparable price per day, then the verdict", () => {
    const history = (prices) => prices.map((price, i) => entry(prices.length - 1 - i, price));
    const out = outlookForOffers([
      { platform: "mega", condition: "new", priceHistory: history([1200, 1150, 1100, 1050, 1020, 1010, 1000, 1000]) },
      { platform: "priceoye", condition: "new", priceHistory: history([1300, 1300, 1300, 1300, 1300, 1300, 1300, 1300]) },
      { platform: "x", condition: "used", priceHistory: history([100, 100, 100, 100, 100, 100, 100, 100]) },
    ], { now: NOW });
    expect(out.verdict).toBe("at_low");
    expect(out.stats).toMatchObject({ current: 1000, low: 1000, high: 1200 });
  });
});

describe("summarizeMovement", () => {
  const doc = (platform, ...records) => ({ platform, entries: records.map(([daysAgo, price]) => entry(daysAgo, price)) });

  it("compares each record with the first later one 5 to 9 days on, counting falls and rises of 3% or more", () => {
    const out = summarizeMovement([
      doc("mega", [20, 1000], [14, 960]), // -4%: fell
      doc("mega", [20, 1000], [14, 1030]), // +3%: rose (exactly 3%)
      doc("priceoye", [20, 1000], [14, 1029]), // +2.9%: steady
      doc("priceoye", [20, 1000], [14, 970]), // -3%: fell (exactly 3%)
    ], { now: NOW });
    expect(out).toMatchObject({ comparisons: 4, fell: 2, rose: 1, steady: 1, stores: 2 });
  });

  it("ignores a later record that is 4 or 10 days on, and uses the first one inside the 5 to 9 day range", () => {
    expect(summarizeMovement([doc("mega", [20, 1000], [16, 500])], { now: NOW }).comparisons).toBe(0); // 4 days
    expect(summarizeMovement([doc("mega", [20, 1000], [10, 500])], { now: NOW }).comparisons).toBe(0); // 10 days
    expect(summarizeMovement([doc("mega", [20, 1000], [15, 500])], { now: NOW }).fell).toBe(1); // 5 days
    expect(summarizeMovement([doc("mega", [20, 1000], [11, 500])], { now: NOW }).fell).toBe(1); // 9 days
    const out = summarizeMovement([doc("mega", [20, 1000], [14, 1000], [12, 500])], { now: NOW }); // 6 days, then 8 days: the 6-day one counts
    expect(out).toMatchObject({ comparisons: 1, steady: 1, fell: 0 });
  });

  it("says how much of the falling came from one store, and over what period", () => {
    const out = summarizeMovement([
      doc("mega", [30, 1000], [24, 900]), doc("mega", [30, 1000], [24, 900]), doc("mega", [30, 1000], [24, 900]),
      doc("shophive", [20, 1000], [14, 900]),
    ], { now: NOW });
    expect(out.fellFromLargestStore).toBe(75);
    expect(out).toMatchObject({ comparedFrom: "2026-09-01", comparedTo: "2026-09-17" });
  });

  it("counts the listings that have two or more records, and how many of those ever changed", () => {
    const out = summarizeMovement([
      doc("mega", [10, 1000]), // one record: not counted
      doc("mega", [10, 1000], [3, 1000]), // never changed
      doc("mega", [10, 1000], [3, 1100]), // changed
      doc("mega", [10, 1000], [3, 1004]), // 0.4%: not a change
    ], { now: NOW });
    expect(out).toMatchObject({ listings: 3, listingsChanged: 1, since: "2026-09-21" });
  });

  it("reports the earliest record among the listings it counted", () => {
    const out = summarizeMovement([doc("mega", [10, 1000], [3, 1000]), doc("mega", [20, 1000], [3, 1000]), doc("mega", [15, 1000], [3, 1000])], { now: NOW });
    expect(out.since).toBe("2026-09-11");
  });

  it("gives zeros and nulls, not a made-up rate, when there is nothing to compare", () => {
    expect(summarizeMovement([], { now: NOW })).toMatchObject({ comparisons: 0, fell: 0, rose: 0, steady: 0, stores: 0, fellFromLargestStore: null, listings: 0, listingsChanged: 0, since: null, comparedFrom: null, comparedTo: null });
    expect(summarizeMovement(undefined, { now: NOW }).comparisons).toBe(0);
  });

  it("is stamped with the time it was worked out", () => {
    expect(summarizeMovement([], { now: NOW }).asOf).toBe(new Date(NOW).toISOString());
  });
});

describe("backtestOutlook", () => {
  const docOf = (prices, start = 40) => ({ platform: "mega", entries: prices.map((price, i) => entry(start - i, price)) });

  it("uses only the history up to each record, never the days after it", () => {
    // 20 days of records; at day 10 (index 10) the history so far is flat at 1000 even though the price drops later
    const prices = [...Array(11).fill(1000), ...Array(9).fill(800)];
    const out = backtestOutlook([docOf(prices, 20)]);
    const flat = out.table.find((row) => row.verdict === "flat");
    expect(flat.comparisons).toBeGreaterThan(0);
    expect(flat.fell).toBeGreaterThan(0); // flat in the past, fell afterwards: counted as a fall, but the verdict was still "flat"
    // the very first records have no history behind them
    expect(out.table.find((row) => row.verdict === "too_early").comparisons).toBeGreaterThan(0);
  });

  it("counts a fall, a rise and a steady week against the verdict given at the time", () => {
    const rising = docOf([100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 110], 13); // ends rising
    const out = backtestOutlook([rising]);
    expect(out.all.comparisons).toBe(out.table.reduce((n, row) => n + row.comparisons, 0));
    expect(out.all.rose).toBe(out.table.reduce((n, row) => n + row.rose, 0));
    expect(out.all.rose).toBeGreaterThan(0);
    for (const row of out.table) expect(row.comparisons).toBe(row.fell + row.rose + row.steady);
  });

  it("marks a verdict with fewer than 30 comparisons as too few to judge, and 30 as judgeable", () => {
    const one = backtestOutlook([docOf(Array(20).fill(1000), 20)]);
    expect(one.table.every((row) => row.judgeable === false)).toBe(true);
    const many = backtestOutlook(Array.from({ length: BACKTEST.MIN_JUDGEABLE }, () => ({ platform: "mega", entries: [entry(10, 1000), entry(4, 1000)] })));
    expect(many.table.find((row) => row.verdict === "too_early")).toMatchObject({ comparisons: 30, judgeable: true });
  });

  it("counts distinct listings separately from overlapping comparisons", () => {
    const out = backtestOutlook([docOf(Array(20).fill(1000), 20), docOf(Array(20).fill(900), 20)]);
    const flat = out.table.find((row) => row.verdict === "flat");
    expect(flat.listings).toBe(2);
    expect(flat.comparisons).toBeGreaterThan(flat.listings);
  });

  it("reports the period covered, always lists every verdict, and copes with nothing", () => {
    const out = backtestOutlook([docOf(Array(20).fill(1000), 20)]);
    expect(out.from).toBe("2026-09-11");
    expect(out.table.map((row) => row.verdict)).toEqual(["too_early", "flat", "at_low", "above_usual", "usual"]);
    const empty = backtestOutlook([]);
    expect(empty.all).toEqual({ comparisons: 0, fell: 0, rose: 0, fellShare: null, roseShare: null });
    expect(empty.from).toBeNull();
    expect(backtestOutlook(undefined).table).toHaveLength(5);
  });

  it("rounds shares to one decimal", () => {
    const docs = [
      { platform: "a", entries: [entry(10, 1000), entry(4, 960)] },
      { platform: "a", entries: [entry(10, 1000), entry(4, 1000)] },
      { platform: "a", entries: [entry(10, 1000), entry(4, 1000)] },
    ];
    expect(backtestOutlook(docs).all.fellShare).toBe(33.3);
  });
});

describe("the constants a reader of the page is told about", () => {
  it("are the ones the page text says", () => {
    expect(OUTLOOK).toMatchObject({ MIN_DAYS: 7, MIN_RECORD_DAYS: 5, STALE_DAYS: 3, CARRY_DAYS: 3, FLAT: 0.01, NEAR_LOW: 0.01, ABOVE_USUAL: 0.05, FAIR_DAYS: 28, FAIR_RECORDS: 20 });
    expect(MARKET).toMatchObject({ COMPARE_MIN_DAYS: 5, COMPARE_MAX_DAYS: 9, MOVE: 0.03 });
  });
});

describe("getMarketMovement", () => {
  let find;
  const docs = [{ platform: "mega", entries: [entry(10, 1000), entry(4, 900)] }];
  beforeEach(() => {
    clearMarketMovementCache();
    vi.spyOn(console, "error").mockImplementation(() => {});
    find = vi.spyOn(PriceHistory, "find").mockReturnValue({ select: () => ({ lean: async () => docs }) });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("reads every price history once and caches the answer for ten minutes", async () => {
    const first = await getMarketMovement({ now: NOW });
    expect(first).toMatchObject({ comparisons: 1, fell: 1 });
    expect(await getMarketMovement({ now: NOW + 9 * 60000 })).toBe(first);
    expect(find).toHaveBeenCalledTimes(1);
    await getMarketMovement({ now: NOW + 10 * 60000 + 1 });
    expect(find).toHaveBeenCalledTimes(2);
  });

  it("shares one read between requests that arrive together", async () => {
    await Promise.all([getMarketMovement({ now: NOW }), getMarketMovement({ now: NOW })]);
    expect(find).toHaveBeenCalledTimes(1);
  });

  it("gives null, not an error, when the history cannot be read, and does not cache that", async () => {
    find.mockReturnValueOnce({ select: () => ({ lean: async () => { throw new Error("db down"); } }) });
    expect(await getMarketMovement({ now: NOW })).toBeNull();
    expect(await getMarketMovement({ now: NOW })).toMatchObject({ comparisons: 1 });
  });

  it("gives null rather than keeping the page waiting, and the answer is there for the next request", async () => {
    vi.useFakeTimers();
    let release;
    find.mockReturnValueOnce({ select: () => ({ lean: () => new Promise((resolve) => { release = () => resolve(docs); }) }) });
    const slow = getMarketMovement({ now: NOW, waitMs: 3000 });
    await vi.advanceTimersByTimeAsync(3001);
    expect(await slow).toBeNull();
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(await getMarketMovement({ now: NOW })).toMatchObject({ comparisons: 1 });
    expect(find).toHaveBeenCalledTimes(1);
  });
});
