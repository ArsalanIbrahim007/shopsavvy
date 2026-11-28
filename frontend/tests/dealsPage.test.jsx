// The Verified deals page (2026-11-29): the header's "Deals" link went to /#deals, a home-page section that only exists once its
// data has arrived, and often led nowhere. Now a page of its own, like Price drops.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

vi.mock("../src/api/endpoints.js", () => ({
  getDeals: vi.fn(),
  getHealth: vi.fn(async () => ({ status: "ok", lastScrapeAt: new Date().toISOString() })),
  getSuggestions: vi.fn(async () => []),
}));

import * as api from "../src/api/endpoints.js";
import { ApiError } from "../src/api/errors.js";
import Layout from "../src/components/Layout.jsx";
import Deals from "../src/pages/Deals.jsx";

const deal = (id, productName, category, price, savingPercent) => ({
  productName, category, imageUrl: "https://img.example.com/x.jpg", savingPercent, savingAmount: Math.round(price * savingPercent / 100),
  referencePrice: Math.round(price / (1 - savingPercent / 100)), storeCount: 3, offerCount: 4,
  lowest: { _id: id, title: productName, price, platform: "priceoye" },
});
const PHONE = deal("p1", "Samsung Galaxy A17 8GB 256GB", "smartphone", 79999, 12);
const WASHER = deal("w1", "Haier 8kg Front Load Washing Machine", "washing_machine", 99999, 18);

const at = (path) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<p>home page</p>} />
        <Route path="deals" element={<Deals />} />
        <Route path="product/:id" element={<p>product page</p>} />
      </Route>
    </Routes>
  </MemoryRouter>,
);

beforeEach(() => {
  vi.mocked(api.getDeals).mockReset().mockResolvedValue({ deals: [WASHER, PHONE], generatedAt: new Date().toISOString() });
});

describe("Verified deals page", () => {
  it("lists every deal with its price and saving, and the biggest saving in the header", async () => {
    at("/deals");
    expect(await screen.findByText("Haier 8kg Front Load Washing Machine")).toBeInTheDocument();
    expect(screen.getByText("Samsung Galaxy A17 8GB 256GB")).toBeInTheDocument();
    expect(screen.getByText("18% below typical")).toBeInTheDocument();
    expect(screen.getByText("18% below")).toBeInTheDocument();
    expect(screen.getByText(/2 deals, biggest saving first/)).toBeInTheDocument();
    expect(api.getDeals).toHaveBeenLastCalledWith(expect.objectContaining({ category: undefined, limit: 48 }));
  });

  it("narrows to one category from the address and from a chip", async () => {
    at("/deals?category=smartphone");
    await screen.findByText("Samsung Galaxy A17 8GB 256GB");
    expect(api.getDeals).toHaveBeenLastCalledWith(expect.objectContaining({ category: "smartphone" }));
    fireEvent.click(within(screen.getByRole("navigation", { name: "Category" })).getByRole("link", { name: /Washing machines/ }));
    await waitFor(() => expect(api.getDeals).toHaveBeenLastCalledWith(expect.objectContaining({ category: "washing_machine" })));
  });

  it("says so when no deal passes the checks, and points to the price drops", async () => {
    vi.mocked(api.getDeals).mockResolvedValue({ deals: [], generatedAt: null });
    at("/deals?category=tv");
    expect(await screen.findByText(/No tvs deal passes our checks|No tv/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "price drops" })).toHaveAttribute("href", "/drops?category=tv");
  });

  it("shows an error with a way to try again", async () => {
    vi.mocked(api.getDeals).mockRejectedValueOnce(new ApiError({ status: 0, code: "NETWORK_ERROR" }));
    at("/deals");
    fireEvent.click(await screen.findByRole("button", { name: /try again/i }));
    expect(await screen.findByText("Samsung Galaxy A17 8GB 256GB")).toBeInTheDocument();
  });

  it("is where the header's Deals link goes", async () => {
    at("/");
    const link = screen.getAllByRole("link", { name: "Deals" })[0];
    expect(link).toHaveAttribute("href", "/deals");
    fireEvent.click(link);
    expect(await screen.findByRole("heading", { name: "Verified deals", level: 1 })).toBeInTheDocument();
  });
});
