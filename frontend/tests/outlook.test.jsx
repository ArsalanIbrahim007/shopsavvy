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
import { describeOutlook, marketNote } from "../src/lib/outlook.js";
import Product from "../src/pages/Product.jsx";

const basis = { firstDay: "2026-09-22", lastDay: "2026-10-01", days: 10, records: 10 };
const stats = { current: 60000, low: 60000, high: 66000, usual: 62000, vsUsualPct: -3.2, changeWeekPct: -9.1, daysSinceChange: 0, daysBelow: 0 };
const market = { comparisons: 221, comparedFrom: "2026-07-03", comparedTo: "2026-08-17", fell: 42, rose: 25, steady: 154, stores: 3, fellFromLargestStore: 60 };
const outlook = (over = {}) => ({ verdict: "at_low", why: null, basis, stats, strength: "early", market: null, ...over });

describe("describeOutlook: nothing to show", () => {
  it("is null without an outlook or with a verdict it does not know", () => {
    for (const value of [null, undefined, {}, { verdict: "will_drop_soon" }]) expect(describeOutlook(value)).toBeNull();
  });
});

describe("describeOutlook: too early", () => {
  it("says so, without advice, evidence or an 'early estimate' tag", () => {
    const view = describeOutlook({ verdict: "too_early", why: "short", basis: { firstDay: "2026-09-29", lastDay: "2026-10-01", days: 3, records: 3 }, stats: null, strength: null });
    expect(view).toMatchObject({ label: "Too early to say", tone: "neutral", facts: [], early: false });
    expect(view.headline).toMatch(/not tracked this product for long enough/);
    expect(view.detail).toBe("We have 3 records over 3 days. We need at least 7 days and 5 records before we say anything.");
  });

  it("shows no evidence for a too-early result even if the server sent numbers with it", () => {
    expect(describeOutlook({ verdict: "too_early", why: "short", basis: { days: 3, records: 3 }, stats }).facts).toEqual([]);
  });

  it("uses singular and plural correctly", () => {
    expect(describeOutlook({ verdict: "too_early", why: "short", basis: { days: 1, records: 1 } }).detail).toMatch(/^We have 1 record over 1 day\./);
  });

  it("says when there are no records, and when the newest record is too old", () => {
    expect(describeOutlook({ verdict: "too_early", why: "no_records", basis: {} }).detail).toBe("We have no price records for it yet.");
    expect(describeOutlook({ verdict: "too_early", why: "stale", basis: { lastDay: "2026-09-20" } }).detail).toBe("Our newest record is from 20 Sept 2026, too long ago to say anything about today's price.");
  });
});

describe("describeOutlook: the verdicts and their evidence", () => {
  it("at_low: good time to buy, with the low and the high it has been", () => {
    const view = describeOutlook(outlook());
    expect(view).toMatchObject({ verdict: "at_low", tone: "good", label: "Good time to buy", headline: "Today's best price is the lowest we have recorded.", detail: null });
    expect(view.facts[0]).toBe("Today's best price, PKR 60,000, is the lowest in our records (10 days, 10 records). It has been as high as PKR 66,000.");
    expect(view.facts).toContain("Over the last week the best price went down 9.1%.");
    expect(view.facts).toContain("The price changed today.");
  });

  it("above_usual: you may want to wait, with how far above usual it is and how often it was lower", () => {
    const view = describeOutlook(outlook({ verdict: "above_usual", stats: { ...stats, current: 1050, low: 900, high: 1100, usual: 1000, vsUsualPct: 5, daysBelow: 5, changeWeekPct: 5, daysSinceChange: 2 } }));
    expect(view).toMatchObject({ tone: "caution", label: "You may want to wait" });
    expect(view.facts[0]).toBe("Today's best price, PKR 1,050, is 5% above its usual level of PKR 1,000.");
    expect(view.facts[1]).toBe("It was lower on 5 recorded days out of 10 (10 days, 10 records), down to PKR 900.");
    expect(view.facts).toContain("Over the last week the best price went up 5%.");
    expect(view.facts).toContain("The price last changed 2 days ago.");
  });

  it("says '1 recorded day' for one day", () => {
    const view = describeOutlook(outlook({ verdict: "above_usual", stats: { ...stats, daysBelow: 1, vsUsualPct: 6, usual: 1000, current: 1060 } }));
    expect(view.facts[1]).toMatch(/^It was lower on 1 recorded day out of 10/);
  });

  it("usual: no clear reason to wait, with the range it has been in", () => {
    const view = describeOutlook(outlook({ verdict: "usual", stats: { ...stats, current: 1020, low: 1000, high: 1030, usual: 1015, changeWeekPct: 0, daysSinceChange: null } }));
    expect(view).toMatchObject({ tone: "neutral", label: "No clear reason to wait" });
    expect(view.facts[0]).toBe("Today's best price, PKR 1,020, is close to its usual level of PKR 1,015.");
    expect(view.facts[1]).toBe("Over 10 days it ranged from PKR 1,000 to PKR 1,030 (10 records).");
    expect(view.facts).toHaveLength(2); // no change over the week, and it never changed: nothing more to say
  });

  it("flat: waiting is unlikely to help, and adds no week or last-change lines", () => {
    const view = describeOutlook(outlook({ verdict: "flat", stats: { ...stats, current: 1000, low: 1000, high: 1005, changeWeekPct: 0.5, daysSinceChange: 4 } }));
    expect(view).toMatchObject({ tone: "neutral", label: "Waiting is unlikely to help", headline: "The best price has not moved." });
    expect(view.facts).toEqual(["In 10 days, 10 records it stayed between PKR 1,000 and PKR 1,005, so there is no sign of a drop to wait for."]);
  });

  it("leaves out a week change of zero or none", () => {
    const none = describeOutlook(outlook({ stats: { ...stats, changeWeekPct: null, daysSinceChange: null } }));
    expect(none.facts).toHaveLength(1);
    const zero = describeOutlook(outlook({ stats: { ...stats, changeWeekPct: 0, daysSinceChange: null } }));
    expect(zero.facts).toHaveLength(1);
  });

  it("is an early estimate unless the history is fair", () => {
    expect(describeOutlook(outlook({ strength: "early" })).early).toBe(true);
    expect(describeOutlook(outlook({ strength: "fair" })).early).toBe(false);
  });
});

describe("marketNote", () => {
  it("gives the counts, the period, and how much of the falling came from one store", () => {
    expect(marketNote(market)).toBe(
      "For context: in 221 week-long comparisons across 3 stores from 3 Jul 2026 to 17 Aug 2026, 42 prices fell by 3% or more, 25 rose by 3% or more and 154 stayed within 3%. 60% of the falls came from one store, so treat this as a rough guide only."
    );
  });

  it("says '1 store' for one, and leaves out the one-store sentence when nothing fell", () => {
    const note = marketNote({ ...market, comparisons: 5, fell: 0, rose: 1, steady: 4, stores: 1, fellFromLargestStore: null });
    expect(note).toMatch(/in 5 week-long comparisons across 1 store from/);
    expect(note).not.toMatch(/one store/);
  });

  it("never says '% of the falls' when there were no falls, or when the share is unknown", () => {
    expect(marketNote({ ...market, fell: 0, fellFromLargestStore: 50 })).not.toMatch(/of the falls/);
    expect(marketNote({ ...market, fell: 3, fellFromLargestStore: null })).not.toMatch(/of the falls|null/);
  });

  it("is null without a market summary or with no comparisons, never zeros dressed up as a finding", () => {
    expect(marketNote(null)).toBeNull();
    expect(marketNote(undefined)).toBeNull();
    expect(marketNote({ ...market, comparisons: 0 })).toBeNull();
  });

  it("is part of the outlook when the server sent it", () => {
    expect(describeOutlook(outlook({ market })).market).toMatch(/^For context: in 221/);
    expect(describeOutlook(outlook({ market: null })).market).toBeNull();
  });
});

const renderPanel = (value) => render(<MemoryRouter><PriceOutlook outlook={value} /></MemoryRouter>);

describe("PriceOutlook panel", () => {
  it("shows nothing when there is no outlook", () => {
    const { container } = renderPanel(null);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the verdict, an early-estimate tag, the evidence, the market context, and says it is not a forecast", () => {
    renderPanel(outlook({ market }));
    const section = screen.getByRole("region", { name: "Wait or buy?" });
    expect(within(section).getByRole("heading", { level: 2, name: "Wait or buy?" })).toBeInTheDocument();
    expect(within(section).getByText("Good time to buy")).toBeInTheDocument();
    expect(within(section).getByText("Early estimate")).toBeInTheDocument();
    expect(within(section).getByText("Today's best price is the lowest we have recorded.")).toBeInTheDocument();
    expect(within(section).getByText(/is the lowest in our records \(10 days, 10 records\)/)).toBeInTheDocument();
    expect(within(section).getByText(/^For context: in 221 week-long comparisons/)).toBeInTheDocument();
    expect(section).toHaveTextContent("This is not a forecast.");
    expect(within(section).getByRole("link", { name: "How much to trust it" })).toHaveAttribute("href", "/honest-prices");
  });

  it("has no early-estimate tag when the history is fair, and none when it is too early", () => {
    renderPanel(outlook({ strength: "fair" }));
    expect(screen.queryByText("Early estimate")).toBeNull();
  });

  it("for too early: the plain statement and the reason, no evidence list, no tag", () => {
    renderPanel({ verdict: "too_early", why: "short", basis: { days: 2, records: 2 }, stats: null, strength: null, market });
    expect(screen.getByText("Too early to say")).toBeInTheDocument();
    expect(screen.getByText(/We have 2 records over 2 days/)).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByText("Early estimate")).toBeNull();
    expect(screen.getByText(/^For context/)).toBeInTheDocument();
  });

  it("has no accessibility violations (structure and names)", async () => {
    const { container } = renderPanel(outlook({ market }));
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
