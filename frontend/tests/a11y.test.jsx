import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import axe from "axe-core";

vi.mock("../src/api/endpoints.js", () => ({
  getSuggestions: vi.fn(async () => []),
  getHealth: vi.fn(async () => ({ status: "ok", lastScrapeAt: new Date().toISOString() })),
  getStats: vi.fn(async () => ({ products: 10, platforms: 7, categories: [] })),
  getDeals: vi.fn(async () => ({ deals: [], generatedAt: null, maxAgeHours: 72 })),
  getCatalog: vi.fn(async () => ({ groups: [], total: 0, offset: 0, generatedAt: null })),
  createAlert: vi.fn(),
  getListing: vi.fn(),
  getIntegrity: vi.fn(async () => ({
    generatedAt: new Date().toISOString(),
    live: {
      offers: 100, stores: 5, products: 80, productsCompared: 10,
      unusualPrices: { count: 1, examples: [{ platform: "priceoye", title: "A TV", price: 225999, reason: "2.5 times what 2 other stores charge." }] },
      discounts: { claims: 10, verdicts: { genuine: 1, likelyGenuine: 1, suspicious: 2, likelyFake: 1, unverified: 5 }, aboveMarket: 1 },
      pta: { offers: 20, approved: 10, nonPta: 2, notStated: 5, movedOut: 1, readFromProductPage: 4, productsKeptApart: 2 },
      freshness: { within24h: 80, within72h: 95, newestAt: new Date().toISOString() },
      history: { points: 500, days: 25, since: "2026-07-03T00:00:00Z" },
    },
    evaluation: {
      outlook: { generatedAt: "2026-10-01T07:29:34.670Z", comparisons: 221, from: "2026-07-03", to: "2026-08-17", minimumToJudge: 30, rows: [
        { verdict: "too_early", label: "x", comparisons: 189, listings: 62, fellShare: 17.5, roseShare: 11.1, judgeable: true },
        { verdict: "flat", label: "x", comparisons: 0, listings: 0, fellShare: null, roseShare: null, judgeable: false },
        { verdict: "at_low", label: "x", comparisons: 12, listings: 10, fellShare: 0, roseShare: 25, judgeable: false },
        { verdict: "above_usual", label: "x", comparisons: 14, listings: 7, fellShare: 50, roseShare: 7.1, judgeable: false },
        { verdict: "usual", label: "x", comparisons: 6, listings: 6, fellShare: 33.3, roseShare: 0, judgeable: false },
      ], all: { label: "All", comparisons: 221, listings: null, fellShare: 19, roseShare: 11.3, judgeable: true } },
      matcher: { generatedAt: "2026-09-29T10:00:00Z", heldOutPairs: 105, trainingPairs: 106, models: { production: { accuracy: 78.1, precision: 71.4, recall: 34.5, f1: 46.5 }, candidate: { accuracy: 74.3, precision: 54.2, recall: 44.8, f1: 49.1 }, rule: { accuracy: 74.3, precision: 58.3, recall: 24.1, f1: 34.1 } } },
      discount: { generatedAt: "2026-09-29T10:00:00Z", judgeableClaims: 251, historyRuleJudged: 14, historyRuleShare: 5.6, splits: 5, flaggedRealClaims: 7, caughtInvented: { "1.3x": 9.5, "1.5x": 29.5, "1.75x": 85, "2x": 96.8 } },
    },
  })),
}));

import Layout from "../src/components/Layout.jsx";
import ProductCard from "../src/components/ProductCard.jsx";
import ResultGroup from "../src/components/results/ResultGroup.jsx";
import PriceHistoryChart from "../src/components/product/PriceHistoryChart.jsx";
import AlertForm from "../src/components/product/AlertForm.jsx";
import Home from "../src/pages/Home.jsx";
import HonestPrices from "../src/pages/HonestPrices.jsx";

// Structural accessibility rules (names, roles, labels, landmarks, headings, duplicate ids) run on what the pages
// render. Colour contrast is left to tests/theme.test.js (it needs real layout and colours, which jsdom does not
// have) and to the browser audits (axe and Lighthouse: no violations on 2026-10-01, light and dark).

const DAY = 86400000;
const offer = (id, platform, price, over = {}) => ({
  _id: id, platform, price, title: "Apple iPad Air 11", productCategory: "tablet", inStock: true, colour: null,
  lastScrapedAt: new Date().toISOString(), productUrl: `https://${platform}.example.com/${id}`, dealScore: 80,
  recommendation: { action: "GOOD_DEAL", reason: "cheapest" }, ptaStatus: "unknown",
  priceHistory: [
    { price: price + 5000, recordedAt: new Date(Date.now() - 40 * DAY).toISOString() },
    { price, recordedAt: new Date(Date.now() - 2 * DAY).toISOString() },
  ],
  ...over,
});
const offers = [
  offer("a", "paklap", 275000, { colour: "Blue" }),
  offer("b", "paklap", 275000, { colour: "Purple" }),
  offer("c", "mega", 280000, { ptaStatus: "pta_approved" }),
  offer("d", "priceoye", 268000, { ptaAssessment: "not_stated" }),
];

const violationsIn = async (container) => {
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
  return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
};
const inRouter = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe("accessibility (axe, structural rules)", () => {
  it("the page frame: skip link, header with search, navigation, theme button and footer", async () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/results?q=ipad"]}>
        <Routes><Route element={<Layout />}><Route path="*" element={<h1>Page</h1>} /></Route></Routes>
      </MemoryRouter>
    );
    expect(await violationsIn(container)).toEqual([]);
  });

  it("the home page", async () => {
    const { container, findByRole } = inRouter(<Home />);
    await findByRole("heading", { name: /browse by category/i });
    expect(await violationsIn(container)).toEqual([]);
  });

  it("the how-we-keep-prices-honest page, with its tables and figures", async () => {
    const { container, findByText } = inRouter(<HonestPrices />);
    await findByText(/Counted from/);
    expect(await violationsIn(container)).toEqual([]);
  });

  it("product cards, with colours and PTA labels", async () => {
    const { container } = inRouter(
      <div>
        <h2>Products</h2>
        <ProductCard group={{ productName: "Apple iPad Air 11", offers }} />
      </div>
    );
    expect(await violationsIn(container)).toEqual([]);
  });

  it("a product: colour picker, offers table with PTA and colour labels", async () => {
    const { container } = inRouter(<ResultGroup group={{ productName: "Apple iPad Air 11", offers }} currentId="a" colour="Blue" onColour={() => {}} />);
    expect(await violationsIn(container)).toEqual([]);
  });

  it("the price history chart, with its axes and buttons", async () => {
    const { container } = inRouter(<PriceHistoryChart offers={offers} currentId="a" />);
    expect(await violationsIn(container)).toEqual([]);
  });

  it("the price alert form", async () => {
    const { container } = inRouter(<AlertForm listing={offers[0]} />);
    expect(await violationsIn(container)).toEqual([]);
  });
});
