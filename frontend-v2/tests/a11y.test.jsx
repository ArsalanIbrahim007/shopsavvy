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
}));

import Layout from "../src/components/Layout.jsx";
import ProductCard from "../src/components/ProductCard.jsx";
import ResultGroup from "../src/components/results/ResultGroup.jsx";
import PriceHistoryChart from "../src/components/product/PriceHistoryChart.jsx";
import AlertForm from "../src/components/product/AlertForm.jsx";
import Home from "../src/pages/Home.jsx";

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
