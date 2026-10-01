import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

vi.mock("../src/api/endpoints.js", () => ({
  getSuggestions: vi.fn(async () => []),
  getHealth: vi.fn(async () => ({ status: "ok", lastScrapeAt: new Date().toISOString() })),
  searchListings: vi.fn(),
  getCatalog: vi.fn(),
  getListing: vi.fn(),
}));

import * as api from "../src/api/endpoints.js";
import { STALE_AFTER_DAYS, ageInDays, currentOffers, freshnessNotice, isOutOfDate, outOfDateFlag } from "../src/lib/freshness.js";
import { bestDealOffer } from "../src/lib/score.js";
import { summarizeOffers } from "../src/lib/summary.js";
import Product from "../src/pages/Product.jsx";
import Results from "../src/pages/Results.jsx";

const NOW = Date.parse("2026-10-01T12:00:00Z");
const DAY = 86400000;
const daysAgo = (n) => new Date(NOW - n * DAY).toISOString();
const fresh = new Date().toISOString();
const ago = (n) => new Date(Date.now() - n * DAY).toISOString();

describe("isOutOfDate", () => {
  it("is true once a price was last checked more than 14 days ago, and not before", () => {
    expect(STALE_AFTER_DAYS).toBe(14);
    expect(isOutOfDate({ lastScrapedAt: daysAgo(14) }, NOW)).toBe(false);
    expect(isOutOfDate({ lastScrapedAt: new Date(NOW - 14 * DAY - 1000).toISOString() }, NOW)).toBe(true);
    expect(isOutOfDate({ lastScrapedAt: daysAgo(51) }, NOW)).toBe(true);
    expect(isOutOfDate({ lastScrapedAt: daysAgo(0) }, NOW)).toBe(false);
  });

  it("is false when there is no usable date: not knowing is not the same as knowing it is old", () => {
    for (const value of [{}, { lastScrapedAt: null }, { lastScrapedAt: "nope" }, { lastScrapedAt: 0 }, null, undefined]) expect(isOutOfDate(value, NOW)).toBe(false);
  });

  it("uses the current time when none is given", () => {
    expect(isOutOfDate({ lastScrapedAt: ago(20) })).toBe(true);
    expect(isOutOfDate({ lastScrapedAt: ago(1) })).toBe(false);
  });
});

describe("currentOffers", () => {
  const a = { id: "a", lastScrapedAt: daysAgo(1) };
  const old = { id: "old", lastScrapedAt: daysAgo(40) };

  it("drops the old offers when there is a current one, and keeps an offer with no date", () => {
    expect(currentOffers([old, a, { id: "undated" }], NOW).map((o) => o.id)).toEqual(["a", "undated"]);
  });

  it("uses all of them when none is current, and gives [] for nothing", () => {
    expect(currentOffers([old, { id: "older", lastScrapedAt: daysAgo(60) }], NOW)).toHaveLength(2);
    expect(currentOffers([], NOW)).toEqual([]);
    expect(currentOffers(undefined, NOW)).toEqual([]);
  });
});

describe("ageInDays and outOfDateFlag", () => {
  it("counts whole days, never negative, and null without a date", () => {
    expect(ageInDays({ lastScrapedAt: daysAgo(51) }, NOW)).toBe(51);
    expect(ageInDays({ lastScrapedAt: new Date(NOW - 51.9 * DAY).toISOString() }, NOW)).toBe(51);
    expect(ageInDays({ lastScrapedAt: new Date(NOW + DAY).toISOString() }, NOW)).toBe(0);
    expect(ageInDays({}, NOW)).toBeNull();
  });

  it("labels an old price with its age, and says nothing about a current one", () => {
    expect(outOfDateFlag({ lastScrapedAt: daysAgo(51) }, NOW)).toMatchObject({ label: "May be out of date", tone: "caution" });
    expect(outOfDateFlag({ lastScrapedAt: daysAgo(51) }, NOW).reason).toMatch(/last checked this price 51 days ago/);
    expect(outOfDateFlag({ lastScrapedAt: daysAgo(3) }, NOW)).toBeNull();
    expect(outOfDateFlag({}, NOW)).toBeNull();
  });
});

describe("freshnessNotice", () => {
  const o = (platform, days) => ({ platform, lastScrapedAt: daysAgo(days) });

  it("is null when every price is current", () => {
    expect(freshnessNotice([o("mega", 1), o("priceoye", 5)], NOW)).toBeNull();
    expect(freshnessNotice([], NOW)).toBeNull();
    expect(freshnessNotice(undefined, NOW)).toBeNull();
  });

  it("names the stores and says what the old prices are left out of", () => {
    expect(freshnessNotice([o("mega", 1), o("shophive", 51)], NOW)).toBe(
      "1 price has not been checked for over 14 days (Shophive). It is labelled below and left out of the lowest price, the best deal and what you can save."
    );
    expect(freshnessNotice([o("mega", 1), o("shophive", 51), o("priceoye", 45)], NOW)).toMatch(/^2 prices have not been checked for over 14 days \(Shophive, PriceOye\)\. They are labelled below/);
  });

  it("when none is current, says how old the newest is and does not claim anything was left out", () => {
    const text = freshnessNotice([o("shophive", 51), o("priceoye", 45)], NOW);
    expect(text).toBe("None of these prices has been checked for over 14 days (the newest is 45 days old), so they may be out of date. Check the store before you buy.");
    expect(text).not.toMatch(/left out/);
  });
});

const offer = (id, platform, price, over = {}) => ({
  _id: id, platform, price, title: "Acer Nitro V 15", productCategory: "laptop", imageUrl: "https://img.example.com/a.jpg",
  lastScrapedAt: fresh, inStock: true, condition: "new", dealScore: 70, productUrl: `https://${platform}.example.com/${id}`,
  recommendation: { action: "FAIR_PRICE", reason: "fine" }, ...over,
});

describe("summarizeOffers with out-of-date prices", () => {
  const offers = [offer("a", "priceoye", 330000), offer("b", "mega", 335000), offer("old", "shophive", 300000, { lastScrapedAt: ago(45), dealScore: 99 })];

  it("never takes the lowest price, the average or the best deal from a price not checked for two weeks", () => {
    const summary = summarizeOffers(offers);
    expect(summary.lowest._id).toBe("a");
    expect(summary.bestDeal._id).not.toBe("old");
    expect(summary.average).toBe(332500);
    expect(summary.count).toBe(2);
    expect(summary.platformCount).toBe(2);
    expect(summary.outOfDate).toBe(1);
    expect(summary.excluded).toBe(0);
  });

  it("uses the old prices when they are all there is", () => {
    const summary = summarizeOffers([offer("x", "shophive", 300000, { lastScrapedAt: ago(45) }), offer("y", "mega", 310000, { lastScrapedAt: ago(50) })]);
    expect(summary.lowest._id).toBe("x");
    expect(summary.outOfDate).toBe(0);
    expect(summary.count).toBe(2);
  });

  it("counts a pre-owned offer as excluded and an old one as out of date, separately", () => {
    const summary = summarizeOffers([...offers, offer("u", "paklap", 100000, { condition: "used" })]);
    expect(summary).toMatchObject({ excluded: 1, outOfDate: 1, count: 2 });
  });

  it("changes nothing when every price is current", () => {
    expect(summarizeOffers(offers.slice(0, 2))).toMatchObject({ outOfDate: 0, count: 2 });
    expect(summarizeOffers([])).toMatchObject({ outOfDate: 0, count: 0 });
  });
});

describe("bestDealOffer with out-of-date prices", () => {
  it("never points to an old price, however well it scores", () => {
    const best = bestDealOffer([offer("old", "shophive", 300000, { lastScrapedAt: ago(45), dealScore: 99 }), offer("a", "priceoye", 330000, { dealScore: 60 }), offer("b", "mega", 335000, { dealScore: 50 })]);
    expect(best._id).toBe("a");
  });

  it("is null when only one current offer is left to compare", () => {
    expect(bestDealOffer([offer("old", "shophive", 300000, { lastScrapedAt: ago(45) }), offer("a", "priceoye", 330000)])).toBeNull();
  });
});

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

function renderProduct(offers, current = offers[0]) {
  vi.mocked(api.getListing).mockReset().mockResolvedValue({ listing: current, offers, summary: null, productGroup: null, outlook: null });
  return render(<MemoryRouter initialEntries={["/product/p1"]}><Routes><Route path="/product/:id" element={<Product />} /></Routes></MemoryRouter>);
}
const rowsOf = () => within(screen.getByRole("table", { name: /^offers for/i })).getAllByRole("row").slice(1);

describe("Product page: out-of-date prices", () => {
  const offers = [offer("a", "priceoye", 330000), offer("b", "mega", 335000), offer("old", "shophive", 300000, { lastScrapedAt: ago(45) })];

  it("keeps the old price in the table, labelled, and out of the lowest price and what you can save", async () => {
    renderProduct(offers);
    const card = await screen.findByRole("article");
    expect(card).toHaveTextContent("Lowest at PriceOye");
    expect(card).toHaveTextContent("you can save up to PKR 5,000"); // 335,000 - 330,000, not 335,000 - 300,000
    expect(card).toHaveTextContent(/1 price has not been checked for over 14 days \(Shophive\)\. It is labelled below and left out of the lowest price/);

    const old = rowsOf().find((row) => row.textContent.includes("PKR 300,000"));
    expect(within(old).getByText("May be out of date")).toBeInTheDocument();
    expect(old).not.toHaveClass("is-lowest");
    expect(old).not.toHaveTextContent("Best deal");
    expect(rowsOf().find((row) => row.textContent.includes("PKR 330,000"))).toHaveClass("is-lowest");
  });

  it("leaves it out of the cross-store lowest and highest price, even when it is the dearest", async () => {
    renderProduct([...offers.slice(0, 2), offer("dear", "paklap", 400000, { lastScrapedAt: ago(45) })]);
    const summary = (await screen.findByRole("heading", { name: "Across stores" })).closest("section");
    expect(summary).toHaveTextContent("PKR 330,000");
    expect(summary).toHaveTextContent("PKR 335,000");
    expect(summary).not.toHaveTextContent("PKR 400,000");
  });

  it("when every price is old, shows them with a badge on the page header and says how old", async () => {
    renderProduct([offer("x", "shophive", 300000, { lastScrapedAt: ago(45) }), offer("y", "mega", 310000, { lastScrapedAt: ago(50) })]);
    const card = await screen.findByRole("article");
    expect(card).toHaveTextContent("Lowest at Shophive");
    expect(within(card).getAllByText("May be out of date").length).toBeGreaterThanOrEqual(3); // header and each row
    expect(card).toHaveTextContent(/None of these prices has been checked for over 14 days \(the newest is 45 days old\)/);
  });

  it("shows no label or notice when every price is current", async () => {
    renderProduct(offers.slice(0, 2));
    const card = await screen.findByRole("article");
    expect(within(card).queryByText("May be out of date")).toBeNull();
    expect(card).not.toHaveTextContent(/not been checked/);
  });
});

const group = (name, list) => ({ productName: name, offerCount: list.length, offers: list });
const renderResults = (groups) => {
  vi.mocked(api.searchListings).mockReset().mockResolvedValue({ offers: [], groups, groupCount: groups.length, summary: null });
  return render(<MemoryRouter initialEntries={["/results?q=nitro"]}><Routes><Route path="*" element={<Results />} /></Routes></MemoryRouter>);
};

describe("Results page: out-of-date prices", () => {
  it("keeps them out of the summary and says how many were left out", async () => {
    renderResults([group("Acer Nitro V 15", [offer("a", "priceoye", 330000), offer("b", "mega", 335000), offer("old", "shophive", 300000, { lastScrapedAt: ago(45) })])]);
    const cards = await screen.findByRole("group", { name: /summary of these results/i });
    expect(cards).toHaveTextContent("PKR 330,000at PriceOye");
    expect(cards).not.toHaveTextContent("PKR 300,000");
    expect(cards).toHaveTextContent("2 offers shown, 1 with an old price not counted");
  });

  it("prices a card at the lowest current offer, and badges a card whose every price is old", async () => {
    renderResults([
      group("Acer Nitro V 15", [offer("a", "priceoye", 330000), offer("old", "shophive", 300000, { lastScrapedAt: ago(45) })]),
      group("Lenovo ThinkPad E16", [offer("t1", "shophive", 379999, { lastScrapedAt: ago(51) }), offer("t2", "mega", 390000, { lastScrapedAt: ago(50) })]),
    ]);
    const cards = await screen.findAllByRole("article");
    expect(within(cards[0]).getByText("PKR 330,000")).toBeInTheDocument();
    expect(within(cards[0]).queryByText("May be out of date")).toBeNull();
    expect(within(cards[1]).getByText("PKR 379,999")).toBeInTheDocument();
    expect(within(cards[1]).getByText("May be out of date")).toBeInTheDocument();
  });

  it("does not mention old prices when there are none", async () => {
    renderResults([group("Acer Nitro V 15", [offer("a", "priceoye", 330000), offer("b", "mega", 335000)])]);
    const cards = await screen.findByRole("group", { name: /summary of these results/i });
    expect(cards).toHaveTextContent("2 offers shown");
    expect(cards).not.toHaveTextContent(/old price/);
  });
});

