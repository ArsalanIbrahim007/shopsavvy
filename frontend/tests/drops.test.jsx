import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import axe from "axe-core";

vi.mock("../src/api/endpoints.js", () => ({
  getPriceDrops: vi.fn(),
  getHealth: vi.fn(async () => ({ status: "ok", lastScrapeAt: new Date().toISOString() })),
  getSuggestions: vi.fn(async () => []),
}));

import * as api from "../src/api/endpoints.js";
import { ApiError } from "../src/api/errors.js";
import { formatDay, formatDropPercent, rulesSentence } from "../src/lib/drops.js";
import Layout from "../src/components/Layout.jsx";
import PriceDrops from "../src/pages/PriceDrops.jsx";

const RULES = { MIN_PERCENT: 5, MIN_RUPEES: 500, MAX_PERCENT: 50, RECENT_DAYS: 2, BEFORE_MAX_DAYS: 14 };
const item = (id, title, before, price, over = {}) => ({
  _id: id, title, platform: "priceoye", productCategory: "smartwatch", imageUrl: "https://img.example.com/w.jpg", price,
  drop: { price, before, day: "2026-10-14", beforeDay: "2026-10-11", rupees: before - price, percent: Math.round(((before - price) / before) * 1000) / 10 },
  ...over,
});
const WATCH = item("a", "Apple Watch Series 12 42mm", 204999, 156999);
const IPAD = item("b", "Apple iPad 11 (A16)", 149999, 139999, { productCategory: "tablet" });

const at = (path) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route element={<Layout />}>
        <Route path="drops" element={<PriceDrops />} />
        <Route path="product/:id" element={<p>product page</p>} />
      </Route>
    </Routes>
  </MemoryRouter>,
);

beforeEach(() => {
  vi.mocked(api.getPriceDrops).mockReset().mockResolvedValue({ drops: [WATCH, IPAD], generatedAt: new Date().toISOString(), rules: RULES });
});

describe("drops wording", () => {
  it("writes a calendar day the same way on any time zone", () => {
    expect(formatDay("2026-10-11")).toBe("11 Oct");
    expect(formatDay("2026-01-01")).toBe("1 Jan");
    expect(formatDay("not a day")).toBe("");
  });

  it("writes the percentage with one decimal only when it has one, and nothing for a non-drop", () => {
    expect(formatDropPercent(23.4)).toBe("23.4% less");
    expect(formatDropPercent(6)).toBe("6% less");
    for (const bad of [0, -3, null, undefined, "x"]) expect(formatDropPercent(bad)).toBe("");
  });

  it("states the server's own thresholds, and says something sensible when it sent none", () => {
    const sentence = rulesSentence(RULES);
    expect(sentence).toContain("at least 5% and PKR 500");
    expect(sentence).toContain("at most 14 days earlier");
    expect(sentence).toContain("last 2 days");
    expect(sentence).toContain("more than 50%");
    expect(rulesSentence(null)).toMatch(/real margin/);
  });
});

describe("Price drops page", () => {
  it("lists each offer with its new price, the price we recorded before and when, and how much less", async () => {
    at("/drops");
    const card = (await screen.findByRole("heading", { name: "Apple Watch Series 12 42mm" })).closest("article");
    expect(within(card).getByText("PKR 156,999")).toBeInTheDocument();
    expect(within(card).getByText("23.4% less")).toBeInTheDocument();
    expect(card.textContent).toContain("Was PKR 204,999 on 11 Oct");
    expect(card.textContent).toContain("this price since 14 Oct");
    expect(within(card).getByText("PriceOye")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: /Apple Watch Series 12/ })).toHaveAttribute("href", "/product/a");
    expect(screen.getByText(/2 offers, biggest drop first/)).toBeInTheDocument();
    expect(screen.getByText(/at least 5% and PKR 500/)).toBeInTheDocument();
  });

  it("asks for every category by default, and for one category from ?category=, marking that choice", async () => {
    at("/drops");
    await screen.findByText(/biggest drop first/);
    expect(api.getPriceDrops).toHaveBeenLastCalledWith(expect.objectContaining({ category: undefined }));
    expect(screen.getByRole("link", { name: "All" })).toHaveAttribute("aria-current", "page");
  });

  it("narrows to one category from the address, so the view can be shared", async () => {
    at("/drops?category=tablet");
    await screen.findByText(/biggest drop first/);
    expect(api.getPriceDrops).toHaveBeenLastCalledWith(expect.objectContaining({ category: "tablet" }));
    expect(screen.getByRole("link", { name: "Tablets" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "All" })).not.toHaveAttribute("aria-current");
  });

  it("loads the chosen category when a chip is clicked", async () => {
    at("/drops");
    await screen.findByText(/biggest drop first/);
    vi.mocked(api.getPriceDrops).mockResolvedValue({ drops: [IPAD], generatedAt: null, rules: RULES });
    fireEvent.click(screen.getByRole("link", { name: "Tablets" }));
    expect(await screen.findByText(/1 offer, biggest drop first/)).toBeInTheDocument(); // one offer: singular
    expect(api.getPriceDrops).toHaveBeenLastCalledWith(expect.objectContaining({ category: "tablet" }));
    expect(screen.queryByRole("heading", { name: "Apple Watch Series 12 42mm" })).toBeNull();
  });

  it("treats an unknown category as all of them instead of failing", async () => {
    at("/drops?category=fridge");
    await screen.findByText(/biggest drop first/);
    expect(api.getPriceDrops).toHaveBeenLastCalledWith(expect.objectContaining({ category: undefined }));
  });

  it("says plainly when nothing dropped, naming the category asked for", async () => {
    vi.mocked(api.getPriceDrops).mockResolvedValue({ drops: [], generatedAt: null, rules: RULES });
    at("/drops?category=laptop");
    expect(await screen.findByText(/No price in laptops has dropped by a real margin/)).toBeInTheDocument();
  });

  it("shows an error with a way to try again, and tries again", async () => {
    vi.mocked(api.getPriceDrops).mockRejectedValueOnce(new ApiError({ status: 0, code: "NETWORK_ERROR" }));
    at("/drops");
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByText(/biggest drop first/)).toBeInTheDocument();
    expect(api.getPriceDrops).toHaveBeenCalledTimes(2);
  });

  it("is in the header, marked as the current page while on it", async () => {
    at("/drops");
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("link", { name: "Price drops" })).toHaveAttribute("href", "/drops");
    expect(within(nav).getByRole("link", { name: "Price drops" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Deals" })).not.toHaveAttribute("aria-current");
    await screen.findByText(/biggest drop first/);
  });

  it("has no accessibility violations", async () => {
    const { container } = at("/drops");
    await screen.findByText(/biggest drop first/);
    await waitFor(() => expect(container.querySelector("[aria-busy='true']")).toBeNull());
    const results = await axe.run(container, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
});
