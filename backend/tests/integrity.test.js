import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("../src/services/catalogFeed.service.js", () => ({
  CATALOG_CATEGORIES: ["smartphone", "tv"],
  getCatalogGroups: vi.fn(),
}));

import PriceHistory from "../src/models/priceHistory.model.js";
import Listing from "../src/models/listing.model.js";
import { createApp } from "../src/createApp.js";
import { getCatalogGroups } from "../src/services/catalogFeed.service.js";
import { clearEvaluationCache, parseDiscountReport, parseMatcherReport, readEvaluation } from "../src/services/evaluationReport.service.js";
import { clearIntegrityCache, getIntegrityReport, summarizeGroups } from "../src/services/integrity.service.js";

// ---- the reports ----

const MATCHER = `# Trained Matching Classifier — Evaluation Report

Generated 2026-09-29T16:29:45.742Z. Pairs are mined from the live listing database.

## Results on the 164-pair evaluation set (test + eval-only, none trained on)

| Metric | Candidate classifier (model.artifact.v3-hardneg.json) | Rule baseline (Jaccard ≥ 0.70) |
|---|---|---|
| Accuracy | 83.5% | 82.9% |

## Production model vs candidate

On the 105 held-out pairs from the newer categories (laptops, TVs), which the production model never saw in training:

| Model | Accuracy | Precision | Recall | F1 |
|---|---|---|---|---|
| Production model (v1, phone-heavy, 106 training pairs, threshold 0.5) | 78.1% | 71.4% | 34.5% | 46.5% |
| Candidate (model.artifact.v3-hardneg.json, 366 training pairs, threshold 0.6) | 74.3% | 54.2% | 44.8% | 49.1% |
| Rule baseline | 74.3% | 58.3% | 24.1% | 34.1% |

## Learned weights of the candidate (standardized scale)

| Feature | Weight |
|---|---|
| jaccardBase | 0.4747 |
`;

const DISCOUNT = `# Cross-store discount anomaly detector — evaluation report

Generated 2026-09-29T05:33:33.454Z from the dataset built 2026-09-29T05:33:32.848Z.

## Coverage

- Offers claiming a discount that have at least one other store to compare against: **251**.
- Of those, the history-based rule could reach a verdict on only **14** (5.6%); the rest were "unverified" for lack of history.

## Held-out evaluation

Averaged over 5 independent 75/25 splits (188 train / 63 held out each).

| Decision rule | Real claims flagged | Caught @ 1.3x | Caught @ 1.5x | Caught @ 1.75x | Caught @ 2x |
| --- | --- | --- | --- | --- | --- |
| Isolation Forest, score >= 0.5 | 7.0% | 9.5% | 29.5% | 85.0% | 96.8% |
| Isolation Forest, score >= 0.52 | 5.7% | 8.3% | 12.6% | 54.6% | 96.8% |
| Baseline: original > 1.2 x market median | 33.0% | 100.0% | 100.0% | 100.0% | 100.0% |
`;

describe("parseMatcherReport", () => {
  it("reads the production model, the retrained candidate and the plain rule on the held-out pairs", () => {
    expect(parseMatcherReport(MATCHER)).toEqual({
      generatedAt: "2026-09-29T16:29:45.742Z",
      heldOutPairs: 105,
      models: {
        production: { accuracy: 78.1, precision: 71.4, recall: 34.5, f1: 46.5 },
        candidate: { accuracy: 74.3, precision: 54.2, recall: 44.8, f1: 49.1 },
        rule: { accuracy: 74.3, precision: 58.3, recall: 24.1, f1: 34.1 },
      },
    });
  });

  it("takes the production row, not the first table in the report", () => {
    expect(parseMatcherReport(MATCHER).models.production.accuracy).not.toBe(83.5);
  });

  it("gives null for text that is not that report, or that has lost a row or a number", () => {
    expect(parseMatcherReport("")).toBeNull();
    expect(parseMatcherReport(undefined)).toBeNull();
    expect(parseMatcherReport("# Something else")).toBeNull();
    expect(parseMatcherReport(MATCHER.replace(/\| Rule baseline \|.*\n/, ""))).toBeNull();
    expect(parseMatcherReport(MATCHER.replace("| 78.1% | 71.4% |", "| n/a | 71.4% |"))).toBeNull();
    expect(parseMatcherReport(MATCHER.replace("On the 105 held-out pairs", "On some pairs"))).toBeNull();
  });

  it("still reads the report when the candidate row is gone", () => {
    const parsed = parseMatcherReport(MATCHER.replace(/\| Candidate \(.*\n/, ""));
    expect(parsed.models.candidate).toBeNull();
    expect(parsed.models.production.f1).toBe(46.5);
  });
});

describe("parseDiscountReport", () => {
  it("reads the coverage and the row for the threshold in use", () => {
    expect(parseDiscountReport(DISCOUNT, 0.5)).toEqual({
      generatedAt: "2026-09-29T05:33:33.454Z", judgeableClaims: 251, historyRuleJudged: 14, historyRuleShare: 5.6, splits: 5, threshold: 0.5,
      flaggedRealClaims: 7, caughtInvented: { "1.3x": 9.5, "1.5x": 29.5, "1.75x": 85, "2x": 96.8 },
    });
    expect(parseDiscountReport(DISCOUNT, 0.52).flaggedRealClaims).toBe(5.7);
  });

  it("gives null for a threshold with no row, and for text that is not that report", () => {
    expect(parseDiscountReport(DISCOUNT, 0.7)).toBeNull();
    expect(parseDiscountReport("", 0.5)).toBeNull();
    expect(parseDiscountReport(DISCOUNT.replace("**251**", "many"), 0.5)).toBeNull();
    expect(parseDiscountReport(DISCOUNT.replace("| 7.0% | 9.5% |", "| 7.0% |"), 0.5)).toBeNull();
  });
});

describe("the real reports in the repository", () => {
  beforeEach(() => clearEvaluationCache());

  it("can still be read, so the page is never silently empty", () => {
    const evaluation = readEvaluation();
    expect(evaluation.matcher).not.toBeNull();
    expect(evaluation.discount).not.toBeNull();
    for (const model of Object.values(evaluation.matcher.models)) {
      for (const value of Object.values(model)) expect(value).toBeGreaterThan(0), expect(value).toBeLessThanOrEqual(100);
    }
    expect(evaluation.matcher.heldOutPairs).toBeGreaterThan(20);
    expect(evaluation.matcher.trainingPairs).toBeGreaterThan(20);
    expect(evaluation.matcher.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
    expect(evaluation.discount.judgeableClaims).toBeGreaterThan(evaluation.discount.historyRuleJudged);
    expect(evaluation.discount.caughtInvented["2x"]).toBeGreaterThanOrEqual(evaluation.discount.caughtInvented["1.3x"]);
  });

  it("is the same object each time (read once)", () => {
    expect(readEvaluation()).toBe(readEvaluation());
  });

  it("names the model file in use", () => {
    const artifact = JSON.parse(readFileSync(new URL("../src/ml/model.artifact.json", import.meta.url), "utf8"));
    expect(readEvaluation().matcher.trainingPairs).toBe(artifact.trainingSize);
  });
});

// ---- the live counts ----

const NOW = Date.parse("2026-10-01T12:00:00Z");
const hoursAgo = (h) => new Date(NOW - h * 3600000).toISOString();
const offer = (platform, price, over = {}) => ({ platform, price, title: `Phone ${platform}`, productCategory: "smartphone", lastScrapedAt: hoursAgo(1), ...over });
const group = (offers, over = {}) => ({ productName: "Phone", offers, ...over });

describe("summarizeGroups", () => {
  it("counts offers, stores, products and the products compared across at least two stores", () => {
    const out = summarizeGroups([
      group([offer("mega", 1), offer("shophive", 1), offer("MEGA", 1)]),
      group([offer("mega", 1)]),
      group([offer("Mega.pk", 1), offer("priceoye", 1)]),
    ], { now: NOW });
    expect(out).toMatchObject({ offers: 6, products: 3, productsCompared: 2 });
    expect(out.stores).toBe(4); // mega, shophive, "mega.pk" is its own spelling here, priceoye
  });

  it("counts offers set aside as unusual prices, and keeps one example per store with the server's reason", () => {
    const flagged = (platform, reason) => offer(platform, 225999, { title: `TV ${platform}`, priceCheck: { status: "suspect_high", reason } });
    const out = summarizeGroups([group([flagged("priceoye", "2.5 times what others charge"), flagged("priceoye", "again"), flagged("mega", "far above"), flagged("telemart", "high"), flagged("w11stop", "also high"), offer("x", 1, { priceCheck: { status: "ok" } })])], { now: NOW });
    expect(out.unusualPrices.count).toBe(5);
    expect(out.unusualPrices.examples).toHaveLength(3); // at most three
    expect(out.unusualPrices.examples.map((e) => e.platform)).toEqual(["priceoye", "mega", "telemart"]); // one per store
    expect(out.unusualPrices.examples[0]).toEqual({ title: "TV priceoye", platform: "priceoye", price: 225999, reason: "2.5 times what others charge" });
  });

  it("does not offer an example without a reason", () => {
    const out = summarizeGroups([group([offer("a", 1, { priceCheck: { status: "suspect_low" } })])], { now: NOW });
    expect(out.unusualPrices).toEqual({ count: 1, examples: [] });
  });

  it("counts discount claims by verdict, treating a missing verdict as unverified, and leaves out offers that claim nothing", () => {
    const claim = (classification, over = {}) => offer("a", 100, { originalPrice: 150, discountAnalysis: classification ? { classification } : undefined, ...over });
    const out = summarizeGroups([group([
      claim("genuine_discount"), claim("possibly_genuine"), claim("possibly_genuine"), claim("suspicious"), claim("likely_fake"), claim("unverified_discount"), claim(undefined),
      offer("b", 100, { originalPrice: 100 }), offer("c", 100), offer("d", 100, { originalPrice: 90 }), claim("suspicious", { discountAnomaly: { isAnomalous: true } }),
    ])], { now: NOW });
    expect(out.discounts).toEqual({ claims: 8, verdicts: { genuine: 1, likelyGenuine: 2, suspicious: 2, likelyFake: 1, unverified: 2 }, aboveMarket: 1 });
  });

  it("counts how PTA was handled, for phones and tablets only", () => {
    const phone = (over) => offer("a", 100, over);
    const out = summarizeGroups([
      group([phone({ ptaStatus: "pta_approved" }), phone({ ptaStatus: "pta_approved", ptaSource: "product_page" }), phone({ ptaStatus: "non_pta", ptaSource: "title" }), phone({ ptaStatus: "unknown", ptaAssessment: "not_stated" })], { ptaStatus: "pta_approved" }),
      group([phone({ ptaStatus: "unknown", ptaAssessment: "likely_non_pta" })], { ptaStatus: "likely_non_pta" }),
      group([phone({ ptaStatus: "non_pta" })], { ptaStatus: "non_pta" }),
      group([offer("a", 100, { productCategory: "laptop", ptaStatus: "pta_approved" })]),
    ], { now: NOW });
    expect(out.pta).toEqual({ offers: 6, approved: 2, nonPta: 2, notStated: 1, movedOut: 1, readFromProductPage: 1, productsKeptApart: 2 });
  });

  it("counts tablets as well as phones, because both are sold with or without PTA approval", () => {
    const tablet = (over) => offer("a", 100, { productCategory: "tablet", ...over });
    const out = summarizeGroups([group([tablet({ ptaStatus: "pta_approved" }), tablet({ ptaStatus: "non_pta" })])], { now: NOW });
    expect(out.pta).toMatchObject({ offers: 2, approved: 1, nonPta: 1 });
  });

  it("counts a page-read answer only when the page gave one", () => {
    const out = summarizeGroups([group([
      offer("a", 100, { ptaStatus: "pta_approved", ptaSource: "product_page" }),
      offer("b", 100, { ptaStatus: "unknown", ptaSource: "product_page" }),
    ])], { now: NOW });
    expect(out.pta.readFromProductPage).toBe(1);
  });

  it("counts how fresh the prices are, and finds the newest scrape", () => {
    const out = summarizeGroups([group([offer("a", 1, { lastScrapedAt: hoursAgo(2) }), offer("b", 1, { lastScrapedAt: hoursAgo(30) }), offer("c", 1, { lastScrapedAt: hoursAgo(100) }), offer("d", 1, { lastScrapedAt: undefined })])], { now: NOW });
    expect(out.freshness).toEqual({ within24h: 1, within72h: 2, outOfDate: 0, outOfDateAfterDays: 14, newestAt: hoursAgo(2) });
  });

  it("counts the offers whose price was last checked more than 14 days ago, and not the ones with no date", () => {
    const out = summarizeGroups([group([offer("a", 1, { lastScrapedAt: hoursAgo(14 * 24) }), offer("b", 1, { lastScrapedAt: hoursAgo(14 * 24 + 1) }), offer("c", 1, { lastScrapedAt: hoursAgo(60 * 24) }), offer("d", 1, { lastScrapedAt: undefined })])], { now: NOW });
    expect(out.freshness.outOfDate).toBe(2);
    expect(out.freshness.outOfDateAfterDays).toBe(14);
  });

  it("includes an offer checked exactly 24 or 72 hours ago, and leaves out one checked a little earlier than that", () => {
    const at = (h) => offer("a", 1, { lastScrapedAt: hoursAgo(h) });
    const out = summarizeGroups([group([at(24), at(24.01), at(60), at(72), at(72.01)])], { now: NOW });
    expect(out.freshness.within24h).toBe(1);
    expect(out.freshness.within72h).toBe(4);
  });

  it("says nothing it cannot count for an empty catalog", () => {
    const out = summarizeGroups([], { now: NOW });
    expect(out).toMatchObject({ offers: 0, stores: 0, products: 0, productsCompared: 0 });
    expect(out.freshness.newestAt).toBeNull();
  });
});

describe("getIntegrityReport", () => {
  let aggregate;
  let count;
  beforeEach(() => {
    clearIntegrityCache();
    vi.mocked(getCatalogGroups).mockReset().mockImplementation(async (category) => ({ groups: category === "smartphone" ? [group([offer("mega", 1), offer("shophive", 1)])] : [group([offer("telemart", 5, { productCategory: "tv" })])], generatedAt: "x" }));
    aggregate = vi.spyOn(PriceHistory, "aggregate").mockResolvedValue([{ _id: null, points: 8296, since: new Date("2026-07-03T14:52:26Z"), days: ["2026-07-03", "2026-07-04", "2026-07-05"] }]);
    count = vi.spyOn(Listing, "countDocuments").mockResolvedValue(4217);
  });
  afterEach(() => vi.restoreAllMocks());

  it("counts across every category, and adds the history depth, the listing count and both models' numbers", async () => {
    const report = await getIntegrityReport({ now: NOW });
    expect(getCatalogGroups).toHaveBeenCalledTimes(2);
    expect(report.live).toMatchObject({ offers: 3, stores: 3, products: 2, productsCompared: 1, listings: 4217, history: { points: 8296, days: 3, since: "2026-07-03T14:52:26.000Z" } });
    expect(report.evaluation.matcher.models.production.accuracy).toBeGreaterThan(0);
    expect(report.generatedAt).toBe(new Date(NOW).toISOString());
  });

  it("counts history days on the Pakistan calendar, since a day there starts at 19:00 UTC", async () => {
    await getIntegrityReport({ now: NOW });
    const group = aggregate.mock.calls[0][0].find((stage) => stage.$group).$group;
    expect(group.days.$addToSet.$dateToString.timezone).toBe("Asia/Karachi");
  });

  it("says no history rather than failing when none is recorded", async () => {
    aggregate.mockResolvedValue([]);
    expect((await getIntegrityReport({ now: NOW })).live.history).toEqual({ points: 0, days: 0, since: null });
  });

  it("is cached for ten minutes, and shares one computation between requests that arrive together", async () => {
    const [a, b] = await Promise.all([getIntegrityReport({ now: NOW }), getIntegrityReport({ now: NOW })]);
    expect(a).toBe(b);
    expect(getCatalogGroups).toHaveBeenCalledTimes(2);
    await getIntegrityReport({ now: NOW + 9 * 60000 });
    expect(getCatalogGroups).toHaveBeenCalledTimes(2);
    await getIntegrityReport({ now: NOW + 11 * 60000 });
    expect(getCatalogGroups).toHaveBeenCalledTimes(4);
    expect(count).toHaveBeenCalledTimes(2);
  });

  it("does not cache a failure", async () => {
    vi.mocked(getCatalogGroups).mockRejectedValueOnce(new Error("grouping failed"));
    await expect(getIntegrityReport({ now: NOW })).rejects.toThrow("grouping failed");
    expect((await getIntegrityReport({ now: NOW })).live.offers).toBe(3);
  });
});

describe("GET /api/integrity", () => {
  let server;
  let url;
  beforeAll(() => new Promise((resolve) => { server = createApp().listen(0, () => { url = `http://127.0.0.1:${server.address().port}`; resolve(); }); }));
  afterAll(() => new Promise((resolve) => server.close(resolve)));
  beforeEach(() => {
    clearIntegrityCache();
    vi.mocked(getCatalogGroups).mockReset().mockResolvedValue({ groups: [group([offer("mega", 1), offer("shophive", 1)])], generatedAt: "x" });
    vi.spyOn(PriceHistory, "aggregate").mockResolvedValue([]);
    vi.spyOn(Listing, "countDocuments").mockResolvedValue(10);
  });
  afterEach(() => vi.restoreAllMocks());

  it("answers with the live counts and both models' numbers, cached for a minute", async () => {
    const response = await fetch(`${url}/api/integrity`);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=60");
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.live).toMatchObject({ offers: 4, stores: 2, listings: 10 }); // the same two offers returned for each of the two categories
    expect(body.evaluation.matcher.models.rule.recall).toBeGreaterThan(0);
    expect(body.evaluation.discount.judgeableClaims).toBeGreaterThan(0);
  });

  it("answers a failure in the standard error shape, not a stack trace", async () => {
    vi.mocked(getCatalogGroups).mockRejectedValue(new Error("boom"));
    const response = await fetch(`${url}/api/integrity`);
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(JSON.stringify(body)).not.toMatch(/boom|at .*\.js/);
  });
});
