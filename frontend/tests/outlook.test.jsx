import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import axe from "axe-core";

vi.mock("../src/api/endpoints.js", () => ({
  getSuggestions: vi.fn(async () => []),
  getHealth: vi.fn(async () => ({ status: "ok", lastScrapeAt: new Date().toISOString() })),
  getListing: vi.fn(),
}));

import * as api from "../src/api/endpoints.js";
import PriceOutlook from "../src/components/product/PriceOutlook.jsx";
import { chartFor, describeOutlook, evidenceFor, gaugeFor, movementFor } from "../src/lib/outlook.js";
import Product from "../src/pages/Product.jsx";

const basis = { firstDay: "2026-09-22", lastDay: "2026-10-01", days: 10, records: 10 };
const stats = { current: 60000, low: 60000, high: 66000, usual: 62000, vsUsualPct: -3.2, changeWeekPct: -9.1, daysSinceChange: 0, daysBelow: 0 };
const series = [66000, 65000, 64000, 63000, 62000, 61000, 60500, 60200, 60100, 60000].map((price, i) => ({ day: `2026-09-${String(22 + i).padStart(2, "0")}`, price })).slice(0, 10).map((p, i) => ({ ...p, day: i < 9 ? p.day : "2026-10-01" }));
const limits = { minDays: 7, minRecords: 5, fairDays: 28, fairRecords: 20, staleDays: 3 };
const market = { comparisons: 221, comparedFrom: "2026-07-03", comparedTo: "2026-08-17", fell: 42, rose: 25, steady: 154, stores: 3, fellFromLargestStore: 60 };
const outlook = (over = {}) => ({ verdict: "at_low", why: null, basis, stats, strength: "early", series, limits, market: null, ...over });
const tooEarly = (over = {}) => ({ verdict: "too_early", why: "short", basis: { firstDay: "2026-09-29", lastDay: "2026-10-01", days: 3, records: 3 }, stats: null, strength: null, series: [], limits, market: null, ...over });

describe("describeOutlook: nothing to show", () => {
  it("is null without an outlook or with a verdict it does not know", () => {
    for (const value of [null, undefined, {}, { verdict: "will_drop_soon" }]) expect(describeOutlook(value)).toBeNull();
  });
});

describe("describeOutlook: too early", () => {
  it("says so, with no gauge, no figures and no 'early estimate' tag", () => {
    const view = describeOutlook(tooEarly());
    expect(view).toMatchObject({ label: "Too early to say", tone: "neutral", glyph: "…", gauge: null, tiles: [], early: false });
    expect(view.headline).toMatch(/not tracked this product for long enough/);
    expect(view.detail).toBe("We have 3 records over 3 days. We need at least 7 days and 5 records before we say anything.");
  });

  it("shows how far it is from having enough: the days and the records against the minimum", () => {
    const { evidence } = describeOutlook(tooEarly());
    expect(evidence.title).toBe("Needed before we can say anything");
    expect(evidence.note).toBeNull();
    expect(evidence.meters).toEqual([
      { id: "days", label: "Days of records", value: 3, target: 7, share: 3 / 7, reached: false },
      { id: "records", label: "Records", value: 3, target: 5, share: 0.6, reached: false },
    ]);
  });

  it("uses the thresholds the server sent, and its own only if the server sent none", () => {
    expect(describeOutlook(tooEarly({ limits: { ...limits, minDays: 10, minRecords: 8 } })).evidence.meters.map((m) => m.target)).toEqual([10, 8]);
    expect(describeOutlook(tooEarly({ limits: undefined })).evidence.meters.map((m) => m.target)).toEqual([7, 5]);
    expect(describeOutlook(tooEarly({ limits: undefined })).detail).toMatch(/at least 7 days and 5 records/);
  });

  it("uses singular and plural correctly", () => {
    expect(describeOutlook(tooEarly({ basis: { days: 1, records: 1 } })).detail).toMatch(/^We have 1 record over 1 day\./);
  });

  it("says when there are no records, and when the newest record is too old, and then shows no meters", () => {
    const none = describeOutlook(tooEarly({ why: "no_records", basis: { days: 0, records: 0 } }));
    expect(none.detail).toBe("We have no price records for it yet.");
    expect(none.evidence).not.toBeNull();
    const stale = describeOutlook(tooEarly({ why: "stale", basis: { lastDay: "2026-09-20", days: 9, records: 9 } }));
    expect(stale.detail).toBe("Our newest record is from 20 Sept 2026, too long ago to say anything about today's price.");
    expect(stale.evidence).toBeNull();
  });

  it("shows no figures even if the server sent numbers with it", () => {
    const view = describeOutlook(tooEarly({ stats }));
    expect(view.tiles).toEqual([]);
    expect(view.gauge).toBeNull();
  });
});

describe("describeOutlook: the verdicts", () => {
  it("at_low: a good time to buy, in the 'good' tone", () => {
    expect(describeOutlook(outlook())).toMatchObject({ verdict: "at_low", tone: "good", glyph: "↓", label: "Good time to buy", detail: null });
    expect(describeOutlook(outlook()).headline).toBe("Today's best price is at or near the lowest we have recorded.");
  });

  it("above_usual, usual and flat have their own label, tone and symbol", () => {
    expect(describeOutlook(outlook({ verdict: "above_usual" }))).toMatchObject({ tone: "caution", glyph: "↑", label: "You may want to wait" });
    expect(describeOutlook(outlook({ verdict: "usual" }))).toMatchObject({ tone: "neutral", glyph: "≈", label: "No clear reason to wait" });
    expect(describeOutlook(outlook({ verdict: "flat" }))).toMatchObject({ tone: "neutral", glyph: "=", label: "Waiting is unlikely to help", headline: "The best price has not moved." });
  });

  it("is an early estimate unless the history is fair", () => {
    expect(describeOutlook(outlook({ strength: "early" })).early).toBe(true);
    expect(describeOutlook(outlook({ strength: "fair" })).early).toBe(false);
  });
});

describe("the four figures", () => {
  const tiles = (over) => Object.fromEntries(describeOutlook(outlook({ stats: { ...stats, ...over } })).tiles.map((t) => [t.id, t]));

  it("are the same four, in order: versus usual, last 7 days, last changed, tracked for", () => {
    expect(describeOutlook(outlook()).tiles.map((t) => t.id)).toEqual(["usual", "week", "changed", "tracked"]);
  });

  it("versus its usual price: how far below or above, with the usual price, and a tone", () => {
    expect(tiles({ vsUsualPct: -3.2 }).usual).toMatchObject({ value: "3.2% below", hint: "Usual price PKR 62,000", trend: "down", tone: "good" });
    expect(tiles({ vsUsualPct: 5 }).usual).toMatchObject({ value: "5% above", trend: "up", tone: "caution" });
    expect(tiles({ vsUsualPct: 4.9 }).usual).toMatchObject({ value: "4.9% above", trend: "up", tone: "neutral" }); // above, but not far enough to warn
    expect(tiles({ vsUsualPct: -0.9 }).usual).toMatchObject({ trend: "down", tone: "neutral" }); // below, but not far enough to praise
    expect(tiles({ vsUsualPct: -1 }).usual.tone).toBe("good");
    expect(tiles({ vsUsualPct: 0 }).usual).toMatchObject({ value: "At its usual price", trend: "flat", tone: "neutral" });
  });

  it("last 7 days: up, down, no change, or not enough history", () => {
    expect(tiles({ changeWeekPct: -9.1 }).week).toMatchObject({ value: "Down 9.1%", trend: "down", tone: "good" });
    expect(tiles({ changeWeekPct: 5 }).week).toMatchObject({ value: "Up 5%", trend: "up", tone: "caution" });
    expect(tiles({ changeWeekPct: 0 }).week).toMatchObject({ value: "No change", trend: "flat", tone: "neutral" });
    expect(tiles({ changeWeekPct: null }).week).toMatchObject({ value: "Not enough history", trend: null, tone: "neutral", hint: "Needs a record from a week ago" });
  });

  it("price last changed: today, days ago, or not in the records", () => {
    expect(tiles({ daysSinceChange: 0 }).changed.value).toBe("Today");
    expect(tiles({ daysSinceChange: 1 }).changed.value).toBe("1 day ago");
    expect(tiles({ daysSinceChange: 2 }).changed.value).toBe("2 days ago");
    expect(tiles({ daysSinceChange: null }).changed.value).toBe("Not in the records");
  });

  it("tracked for: the days and the records", () => {
    expect(tiles({}).tracked).toMatchObject({ value: "10 days", hint: "10 records" });
    const one = describeOutlook(outlook({ basis: { ...basis, days: 1, records: 1 } })).tiles.find((t) => t.id === "tracked");
    expect(one).toMatchObject({ value: "1 day", hint: "1 record" });
  });
});

describe("gaugeFor", () => {
  it("places today's price and the usual price along the range from the lowest to the highest, as 0 to 100", () => {
    expect(gaugeFor({ low: 100, high: 200, current: 150, usual: 125 })).toMatchObject({ currentPct: 50, usualPct: 25, caption: "50% of the way from its lowest to its highest price" });
    expect(gaugeFor({ low: 100, high: 300, current: 110, usual: 200 })).toMatchObject({ currentPct: 5, usualPct: 50 });
  });

  it("says when it is at either end of the range", () => {
    expect(gaugeFor({ low: 100, high: 200, current: 100, usual: 150 })).toMatchObject({ currentPct: 0, caption: "At the bottom of its range" });
    expect(gaugeFor({ low: 100, high: 200, current: 200, usual: 150 })).toMatchObject({ currentPct: 100, caption: "At the top of its range" });
  });

  it("keeps a position that falls outside the range on the bar", () => {
    expect(gaugeFor({ low: 100, high: 200, current: 250, usual: 50 })).toMatchObject({ currentPct: 100, usualPct: 0 });
  });

  it("is null when the price never moved, or there are no figures", () => {
    expect(gaugeFor({ low: 100, high: 100, current: 100, usual: 100 })).toBeNull();
    expect(gaugeFor(null)).toBeNull();
    expect(gaugeFor(undefined)).toBeNull();
  });

  it("is part of a verdict, and not of a flat one", () => {
    expect(describeOutlook(outlook()).gauge).toMatchObject({ low: 60000, high: 66000, current: 60000, currentPct: 0 });
    expect(describeOutlook(outlook({ verdict: "flat", stats: { ...stats, high: 60000 } })).gauge).toBeNull();
  });
});

describe("evidenceFor", () => {
  it("measures a verdict against what a fair estimate needs, and says which side of it the history is", () => {
    const early = describeOutlook(outlook({ basis: { ...basis, days: 88, records: 13 } })).evidence;
    expect(early.title).toBe("How much history this rests on");
    expect(early.meters).toEqual([
      { id: "days", label: "Days of records", value: 88, target: 28, share: 1, reached: true },
      { id: "records", label: "Records", value: 13, target: 20, share: 0.65, reached: false },
    ]);
    expect(early.note).toBe("An early estimate until both reach the mark.");
    expect(describeOutlook(outlook({ strength: "fair", basis: { ...basis, days: 30, records: 25 } })).evidence.note).toBe("Enough for a fair estimate.");
  });

  it("never shows a meter more than full", () => {
    expect(evidenceFor(outlook({ basis: { ...basis, days: 500, records: 500 } }), limits).meters.map((m) => m.share)).toEqual([1, 1]);
  });

  it("counts a meter as reached exactly at its target", () => {
    expect(evidenceFor(outlook({ basis: { ...basis, days: 28, records: 20 } }), limits).meters.every((m) => m.reached)).toBe(true);
    expect(evidenceFor(outlook({ basis: { ...basis, days: 27, records: 19 } }), limits).meters.some((m) => m.reached)).toBe(false);
  });
});

describe("movementFor", () => {
  it("gives the shares, which always add up to 100, the period and how much of the falling came from one store", () => {
    const out = movementFor(market);
    expect(out).toMatchObject({ total: 221, fell: 42, rose: 25, steady: 154, stores: 3, fellShare: 19, roseShare: 11, steadyShare: 70, period: "3 Jul 2026 to 17 Aug 2026" });
    expect(out.fellShare + out.steadyShare + out.roseShare).toBe(100);
    expect(out.concentration).toBe("60% of the falls came from one store, so treat this as a rough guide only.");
  });

  it("makes the shares add up to 100 even when rounding would not (a third each)", () => {
    const out = movementFor({ ...market, comparisons: 3, fell: 1, rose: 1, steady: 1 });
    expect([out.fellShare, out.steadyShare, out.roseShare]).toEqual([33, 34, 33]);
  });

  it("leaves out the one-store sentence when nothing fell or the share is unknown, and the period when there is none", () => {
    expect(movementFor({ ...market, fell: 0, fellFromLargestStore: 50 }).concentration).toBeNull();
    expect(movementFor({ ...market, fellFromLargestStore: null }).concentration).toBeNull();
    expect(movementFor({ ...market, comparedFrom: null, comparedTo: null }).period).toBeNull();
  });

  it("is null without a sample, never zeros dressed up as a finding", () => {
    for (const value of [null, undefined, { ...market, comparisons: 0 }]) expect(movementFor(value)).toBeNull();
  });

  it("is part of the outlook when the server sent it", () => {
    expect(describeOutlook(outlook({ market })).movement).toMatchObject({ total: 221 });
    expect(describeOutlook(outlook({ market: null })).movement).toBeNull();
  });
});

describe("chartFor", () => {
  it("draws the best price day by day as a step line, with today's price at the end", () => {
    const model = chartFor(outlook(), { width: 640, height: 240 });
    expect(model.path.startsWith("M")).toBe(true);
    expect(model.dots).toHaveLength(10);
    expect(model.today).toMatchObject({ price: 60000 });
    expect(model.today.cx).toBe(model.dots.at(-1).cx);
    expect(model.today.cy).toBe(model.dots.at(-1).cy);
    expect(model.width).toBe(640);
  });

  it("puts the highest level above the usual level and the lowest below it", () => {
    const [high, usual, low] = chartFor(outlook()).references;
    expect([high.id, usual.id, low.id]).toEqual(["high", "usual", "low"]);
    expect(high.y).toBeLessThan(usual.y); // a higher price is nearer the top of the drawing
    expect(usual.y).toBeLessThan(low.y);
    expect([high.price, usual.price, low.price]).toEqual([66000, 62000, 60000]);
  });

  it("describes itself in words for anyone who cannot see it", () => {
    expect(chartFor(outlook()).description).toBe("The best price each day for 10 days (10 records): lowest PKR 60,000, usual PKR 62,000, highest PKR 66,000, and PKR 60,000 today.");
  });

  it("gives a narrow screen fewer date labels, and room for its price labels", () => {
    const long = Array.from({ length: 30 }, (_, i) => ({ day: new Date(Date.UTC(2026, 7, 22 + i)).toISOString().slice(0, 10), price: 60000 + (i % 9) * 500 }));
    const wide = chartFor(outlook({ series: long }), { width: 640 });
    const narrow = chartFor(outlook({ series: long }), { width: 320, height: 210 });
    expect(wide.pad.left).toBe(68);
    expect(narrow.pad.left).toBe(62);
    expect(narrow.xTicks.length).toBeLessThanOrEqual(3);
    expect(wide.xTicks.length).toBeGreaterThan(3);
  });

  it("is null with fewer than two days of records, or with no figures", () => {
    expect(chartFor(outlook({ series: [] }))).toBeNull();
    expect(chartFor(outlook({ series: [series[0]] }))).toBeNull();
    expect(chartFor(outlook({ series: undefined }))).toBeNull();
    expect(chartFor(tooEarly())).toBeNull();
    expect(chartFor(outlook({ stats: null }))).toBeNull();
  });
});

const renderPanel = (value) => render(<MemoryRouter><PriceOutlook outlook={value} /></MemoryRouter>);

describe("PriceOutlook panel", () => {
  it("shows nothing when there is no outlook", () => {
    const { container } = renderPanel(null);
    expect(container).toBeEmptyDOMElement();
  });

  it("draws the verdict, the gauge, the chart, the four figures, the evidence and the movement", () => {
    renderPanel(outlook({ market }));
    const section = screen.getByRole("region", { name: "Wait or buy?" });
    expect(within(section).getByRole("heading", { level: 2, name: "Wait or buy?" })).toBeInTheDocument();
    expect(within(section).getByText("Good time to buy")).toBeInTheDocument();
    expect(within(section).getByText("Today's best price is at or near the lowest we have recorded.")).toBeInTheDocument();
    expect(within(section).getByText("Early estimate")).toBeInTheDocument();

    const gauge = within(section).getByRole("img", { name: /Today's best price is PKR 60,000\. The lowest it has been is PKR 60,000, the highest PKR 66,000, and its usual price PKR 62,000\./ });
    expect(gauge).toBeInTheDocument();
    expect(within(section).getByRole("img", { name: /The best price each day for 10 days/ })).toBeInTheDocument();

    const figures = within(section).getByRole("list", { name: "The numbers" });
    expect(within(figures).getAllByRole("listitem")).toHaveLength(4);
    expect(figures).toHaveTextContent("3.2% below");
    expect(figures).toHaveTextContent("Down 9.1%");
    expect(figures).toHaveTextContent("Today");
    expect(figures).toHaveTextContent("10 days");
  });

  it("gives each figure's direction in words as well as an arrow", () => {
    renderPanel(outlook());
    const figures = screen.getByRole("list", { name: "The numbers" });
    expect(figures).toHaveTextContent("(down)");
  });

  it("shows the evidence as progress bars with their values, and says how far each is from its mark", () => {
    renderPanel(outlook({ basis: { ...basis, days: 88, records: 13 } }));
    const bars = screen.getAllByRole("progressbar");
    expect(bars).toHaveLength(2);
    expect(bars[0]).toHaveAccessibleName("Days of records");
    expect(bars[0]).toHaveAttribute("aria-valuenow", "28"); // capped at its target
    expect(bars[0]).toHaveAttribute("aria-valuemax", "28");
    expect(bars[0]).toHaveAttribute("aria-valuetext", "88 of 28");
    expect(bars[1]).toHaveAccessibleName("Records");
    expect(bars[1]).toHaveAttribute("aria-valuenow", "13");
    expect(bars[1]).toHaveAttribute("aria-valuemax", "20");
    expect(screen.getByText("88 · enough ✓")).toBeInTheDocument();
    expect(screen.getByText("13 of 20 needed")).toBeInTheDocument();
    expect(screen.getByText("An early estimate until both reach the mark.")).toBeInTheDocument();
  });

  it("shows how prices move at the stores we track, as a bar with its legend, and the one-store caution", () => {
    renderPanel(outlook({ market }));
    const bar = screen.getByRole("img", { name: "Of 221 week-long comparisons, 42 fell by 3% or more, 154 stayed within 3% and 25 rose by 3% or more." });
    expect(bar).toBeInTheDocument();
    const movement = screen.getByRole("region", { name: /how prices have moved/i });
    expect(movement).toHaveTextContent("Fell 3%+ 19% (42)");
    expect(movement).toHaveTextContent("Within 3% 70% (154)");
    expect(movement).toHaveTextContent("Rose 3%+ 11% (25)");
    expect(movement).toHaveTextContent("221 week-long comparisons across 3 stores, 3 Jul 2026 to 17 Aug 2026.");
    expect(movement).toHaveTextContent("60% of the falls came from one store");
  });

  it("leaves out the movement when the server sent none", () => {
    renderPanel(outlook({ market: null }));
    expect(screen.queryByRole("region", { name: /how prices have moved/i })).toBeNull();
  });

  it("says it is not a forecast and links to how much to trust it", () => {
    renderPanel(outlook());
    expect(screen.getByText(/This is not a forecast\./)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "How much to trust it" })).toHaveAttribute("href", "/honest-prices");
  });

  it("has no early-estimate tag when the history is fair", () => {
    renderPanel(outlook({ strength: "fair" }));
    expect(screen.queryByText("Early estimate")).toBeNull();
  });

  it("for too early: the plain statement and how far it is from enough, but no gauge, chart or figures", () => {
    renderPanel(tooEarly({ market }));
    expect(screen.getByText("Too early to say")).toBeInTheDocument();
    expect(screen.getByText(/We have 3 records over 3 days/)).toBeInTheDocument();
    expect(screen.getByText("3 of 7 needed")).toBeInTheDocument();
    expect(screen.getByText("3 of 5 needed")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Today's best price is/ })).toBeNull();
    expect(screen.queryByRole("img", { name: /The best price each day/ })).toBeNull();
    expect(screen.queryByRole("list", { name: "The numbers" })).toBeNull();
    expect(screen.queryByText("Early estimate")).toBeNull();
    expect(screen.getByRole("region", { name: /how prices have moved/i })).toBeInTheDocument();
  });

  it("draws no chart for a too-early product even if it has a few recorded days", () => {
    renderPanel(tooEarly({ series: series.slice(-3) }));
    expect(screen.queryByRole("img", { name: /The best price each day/ })).toBeNull();
    expect(screen.queryByText("The best price, day by day")).toBeNull(); // not even an empty frame for it
  });

  it("draws no segment for a movement that did not happen", () => {
    const { container } = renderPanel(outlook({ market: { ...market, comparisons: 10, fell: 0, rose: 4, steady: 6, fellFromLargestStore: null } }));
    expect(container.querySelector(".outlook-split__part--fell")).toBeNull();
    expect(container.querySelector(".outlook-split__part--steady")).not.toBeNull();
    expect(container.querySelector(".outlook-split__part--rose")).not.toBeNull();
    const calm = renderPanel(outlook({ market: { ...market, comparisons: 10, fell: 5, rose: 0, steady: 5 } }));
    expect(calm.container.querySelector(".outlook-split__part--rose")).toBeNull();
  });

  it("for a price that never moved: no gauge, but the chart and the figures", () => {
    renderPanel(outlook({ verdict: "flat", stats: { ...stats, high: 60000 }, series: series.map((p) => ({ ...p, price: 60000 })) }));
    expect(screen.queryByRole("img", { name: /Today's best price is PKR/ })).toBeNull();
    expect(screen.getByRole("img", { name: /The best price each day/ })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "The numbers" })).toBeInTheDocument();
  });

  it("has no accessibility violations (structure and names)", async () => {
    const { container } = renderPanel(outlook({ market }));
    const results = await axe.run(container, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });

  it("has none for the too-early state either", async () => {
    const { container } = renderPanel(tooEarly({ market }));
    const results = await axe.run(container, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
});

describe("Product page: the outlook", () => {
  const NOW = new Date().toISOString();
  const offer = (id, platform, price) => ({
    _id: id, platform, price, title: "Samsung Galaxy A17 256GB", productCategory: "smartphone", imageUrl: "https://img.example.com/a.jpg",
    lastScrapedAt: NOW, inStock: true, productUrl: `https://${platform}.example.com/${id}`, dealScore: 70, condition: "new",
    recommendation: { action: "FAIR_PRICE", reason: "fine" },
  });
  const offers = [offer("p1", "priceoye", 64000), offer("p2", "mega", 66000)];
  const renderProduct = (value) => {
    vi.mocked(api.getListing).mockReset().mockResolvedValue({ listing: offers[0], offers, summary: null, productGroup: null, outlook: value });
    return render(
      <MemoryRouter initialEntries={["/product/p1"]}>
        <Routes><Route path="/product/:id" element={<Product />} /></Routes>
      </MemoryRouter>
    );
  };

  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  it("sits between the offers and the deal verdict", async () => {
    renderProduct(outlook());
    const heading = await screen.findByRole("heading", { level: 2, name: "Wait or buy?" });
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings.indexOf("Wait or buy?")).toBeGreaterThan(-1);
    expect(headings.indexOf("Wait or buy?")).toBeLessThan(headings.findIndex((text) => text.startsWith("Deal verdict")));
    expect(heading.closest("section")).toHaveTextContent("Good time to buy");
  });

  it("shows nothing about it when the server sent no outlook", async () => {
    renderProduct(null);
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByRole("heading", { name: "Wait or buy?" })).toBeNull();
  });
});
