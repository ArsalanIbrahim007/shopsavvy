// Readable product addresses and link previews (2026-10-26): /product/<words of the title>-<id>, the Share button (the API's share
// page, whose card shows the product), and the site's own preview tags.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";

vi.mock("../src/api/endpoints.js", () => ({
  getSuggestions: vi.fn(async () => []),
  getHealth: vi.fn(async () => ({ status: "ok" })),
  getListing: vi.fn(),
}));

import * as api from "../src/api/endpoints.js";
import Product from "../src/pages/Product.jsx";
import { shareAddress } from "../src/lib/share.js";
import { listingIdFromParam, MAX_SLUG_LENGTH, productPath, productSlug } from "../src/lib/productPath.js";
import { socialTags } from "../scripts/socialMeta.js";

const ID = (n) => `6a78a2af9c96f297ede776${String(n).padStart(2, "0")}`;
const NOW = new Date().toISOString();
const offer = (n, platform, price) => ({
  _id: ID(n), platform, price, title: "Samsung Galaxy A17 8GB 256GB", productCategory: "smartphone", imageUrl: null, lastScrapedAt: NOW,
  inStock: true, condition: "new", productUrl: `https://${platform}.example.com/${n}`, dealScore: 70, recommendation: { action: "FAIR_PRICE", reason: "fine" },
});
const OFFERS = [offer(1, "priceoye", 64000), offer(2, "mega", 63000)];

describe("productPath (the same rule as backend/src/services/productPath.js)", () => {
  it("puts the title's words before the id, and reads the id back from any address", () => {
    expect(productSlug("Samsung Galaxy A17 (8GB/256GB) – Blue")).toBe("samsung-galaxy-a17-8gb-256gb-blue");
    expect(productSlug("Café Crème")).toBe("cafe-creme");
    expect(productSlug("ASUS ROG Strix G16 G615LM - Arrow Lake - Intel Core Ultra 7 255HX 20-Core Processor 16-GB 512-GB SSD").length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
    expect(productPath(ID(1), "Apple iPhone 17 Pro 256GB")).toBe(`/product/apple-iphone-17-pro-256gb-${ID(1)}`);
    expect(productPath(ID(1), "")).toBe(`/product/${ID(1)}`);
    expect(listingIdFromParam(`apple-iphone-17-pro-256gb-${ID(1)}`)).toBe(ID(1));
    expect(listingIdFromParam(ID(1))).toBe(ID(1)); // an old address
    expect(listingIdFromParam("not-an-id")).toBe("not-an-id");
  });
});

function Address() {
  const { pathname, search } = useLocation();
  return <output data-testid="address">{pathname + search}</output>;
}

function renderAt(path) {
  vi.mocked(api.getListing).mockReset().mockResolvedValue({ listing: OFFERS[0], offers: OFFERS, summary: null, productGroup: { productName: "Samsung Galaxy A17 8GB 256GB" } });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="/product/:id" element={<><Product /><Address /></>} /></Routes>
    </MemoryRouter>,
  );
}

describe("Product page address", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  it("opens from an old address (a bare id) and shows the readable one, keeping the chosen colour", async () => {
    renderAt(`/product/${ID(1)}?colour=Blue`);
    await waitFor(() => expect(screen.getByTestId("address").textContent).toBe(`/product/samsung-galaxy-a17-8gb-256gb-${ID(1)}?colour=Blue`));
    expect(api.getListing).toHaveBeenCalledTimes(1); // the same page: not loaded again
    expect(vi.mocked(api.getListing).mock.calls[0][0]).toBe(ID(1));
  });

  it("asks the API for the id at the end of a readable address", async () => {
    renderAt(`/product/samsung-galaxy-a17-8gb-256gb-${ID(1)}`);
    await screen.findByRole("heading", { level: 1, name: "Samsung Galaxy A17 8GB 256GB" });
    expect(vi.mocked(api.getListing).mock.calls[0][0]).toBe(ID(1));
    expect(screen.getByTestId("address").textContent).toBe(`/product/samsung-galaxy-a17-8gb-256gb-${ID(1)}`);
  });
});

describe("Share button", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete navigator.share;
  });

  it("links to the API's share page for the product's lowest price, so the preview shows the product", () => {
    expect(shareAddress(ID(2), "Samsung Galaxy A17 8GB 256GB", "https://api.shopsavvy.example/api"))
      .toBe(`https://api.shopsavvy.example/share/product/samsung-galaxy-a17-8gb-256gb-${ID(2)}`);
    expect(shareAddress(ID(2), "x", "/api")).toBe(`${window.location.origin}/share/product/x-${ID(2)}`); // the API on this site's host
  });

  it("copies the link where there is no share sheet, and says so", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderAt(`/product/samsung-galaxy-a17-8gb-256gb-${ID(1)}`);
    fireEvent.click(await screen.findByRole("button", { name: "Share" }));
    await screen.findByText("Link copied");
    expect(writeText).toHaveBeenCalledWith(`http://localhost:5000/share/product/samsung-galaxy-a17-8gb-256gb-${ID(2)}`); // mega's is lowest
  });

  it("uses the phone's share sheet when there is one", async () => {
    navigator.share = vi.fn(async () => {});
    renderAt(`/product/samsung-galaxy-a17-8gb-256gb-${ID(1)}`);
    fireEvent.click(await screen.findByRole("button", { name: "Share" }));
    await waitFor(() => expect(navigator.share).toHaveBeenCalledWith({ title: "Samsung Galaxy A17 8GB 256GB", url: expect.stringContaining(`/share/product/samsung-galaxy-a17-8gb-256gb-${ID(2)}`) }));
  });

  it("shows the link to copy by hand when copying is not allowed", async () => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn(async () => { throw new Error("denied"); }) }, configurable: true });
    renderAt(`/product/samsung-galaxy-a17-8gb-256gb-${ID(1)}`);
    fireEvent.click(await screen.findByRole("button", { name: "Share" }));
    expect(await screen.findByText(/^Copy this link: http:\/\/localhost:5000\/share\/product\//)).toBeTruthy();
  });
});

describe("the site's own preview tags (scripts/socialMeta.js)", () => {
  it("gives the picture and address as full addresses from SITE_URL, and nothing without it", () => {
    const tags = socialTags({ SITE_URL: "https://shopsavvy.example/" });
    expect(tags).toContain('<meta property="og:image" content="https://shopsavvy.example/og-image.png" />');
    expect(tags).toContain('<meta property="og:url" content="https://shopsavvy.example/" />');
    expect(socialTags({})).toBe("");
    expect(socialTags({ SITE_URL: "shopsavvy.example" })).toBe(""); // not a full address
  });
});
