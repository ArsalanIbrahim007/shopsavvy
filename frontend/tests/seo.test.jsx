// What the site tells search engines (2026-10-26): robots.txt naming the sitemap, and on a product page its schema.org Product,
// canonical address and description. Every price stated must be one the page shows.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

vi.mock("../src/api/endpoints.js", () => ({
  getSuggestions: vi.fn(async () => []),
  getHealth: vi.fn(async () => ({ status: "ok" })),
  getListing: vi.fn(),
}));

import * as api from "../src/api/endpoints.js";
import Product from "../src/pages/Product.jsx";
import { robotsTxt, sitemapAddress } from "../scripts/robots.js";
import { jsonLdText, productDescription, productJsonLd } from "../src/lib/structuredData.js";

const NOW = new Date().toISOString();
const offer = (id, platform, price, over = {}) => ({
  _id: id, platform, price, title: "Samsung Galaxy A17 256GB", productCategory: "smartphone", imageUrl: `https://img.example.com/${id}.jpg`,
  lastScrapedAt: NOW, inStock: true, condition: "new", productUrl: `https://${platform}.example.com/${id}`, dealScore: 70,
  recommendation: { action: "FAIR_PRICE", reason: "fine" }, ...over,
});
const OFFERS = [offer("p1", "priceoye", 64000), offer("p2", "mega", 65500), offer("p3", "shophive", 67000)];

describe("robots.txt", () => {
  it("names the sitemap on the API's host, from VITE_API_URL or SITEMAP_URL", () => {
    expect(sitemapAddress({ VITE_API_URL: "https://api.shopsavvy.example/api" })).toBe("https://api.shopsavvy.example/sitemap.xml");
    expect(sitemapAddress({ SITEMAP_URL: "https://cdn.example/s.xml", VITE_API_URL: "https://api.x/api" })).toBe("https://cdn.example/s.xml");
    expect(robotsTxt({ VITE_API_URL: "https://api.shopsavvy.example/api" }))
      .toBe("User-agent: *\nAllow: /\n\nSitemap: https://api.shopsavvy.example/sitemap.xml\n");
  });

  it("leaves the line out when there is no full address (a relative API path, local development)", () => {
    for (const env of [{}, { VITE_API_URL: "/api" }, { VITE_API_URL: "ftp://x.example/api" }, { SITEMAP_URL: "sitemap.xml" }]) {
      expect(sitemapAddress(env), JSON.stringify(env)).toBeNull();
    }
    expect(robotsTxt({})).toBe("User-agent: *\nAllow: /\n");
  });
});

describe("productJsonLd", () => {
  it("states the price range and offer count the page shows", () => {
    expect(productJsonLd({ name: "Samsung Galaxy A17 256GB", offers: OFFERS, url: "https://s.example/product/p1" })).toEqual({
      "@context": "https://schema.org",
      "@type": "Product",
      name: "Samsung Galaxy A17 256GB",
      image: ["https://img.example.com/p1.jpg", "https://img.example.com/p2.jpg", "https://img.example.com/p3.jpg"],
      category: "Smartphones",
      url: "https://s.example/product/p1",
      offers: { "@type": "AggregateOffer", priceCurrency: "PKR", lowPrice: 64000, highPrice: 67000, offerCount: 3 },
    });
  });

  it("never advertises an unusual, out-of-date, used or sold-out price", () => {
    const offers = [
      ...OFFERS,
      offer("x1", "eezepc", 6400, { priceCheck: { status: "suspect_low" } }),
      offer("x2", "mega", 99000, { lastScrapedAt: "2026-01-01T00:00:00Z" }),
      offer("x3", "techroid", 40000, { condition: "used" }),
      offer("x4", "alfamall", 90000, { inStock: false }),
    ];
    expect(productJsonLd({ name: "Phone", offers }).offers).toEqual({ "@type": "AggregateOffer", priceCurrency: "PKR", lowPrice: 64000, highPrice: 67000, offerCount: 3 });
  });

  it("names a brand when a store gives one, keeps only full image addresses, and says nothing without a price", () => {
    const data = productJsonLd({ name: "Phone", offers: [offer("b1", "mega", 1000, { brand: "Samsung", imageUrl: "/relative.jpg" })] });
    expect(data.brand).toEqual({ "@type": "Brand", name: "Samsung" });
    // the stores' all-lowercase brands are written as people write them (live: "apple"); a name with its own capitals is kept
    expect(productJsonLd({ name: "Phone", offers: [offer("b2", "mega", 1000, { brand: "apple" })] }).brand.name).toBe("Apple");
    expect(productJsonLd({ name: "Phone", offers: [offer("b3", "mega", 1000, { brand: "tp-link" })] }).brand.name).toBe("Tp-Link");
    expect(productJsonLd({ name: "Phone", offers: [offer("b4", "mega", 1000, { brand: "OnePlus" })] }).brand.name).toBe("OnePlus");
    expect(data.image).toBeUndefined();
    expect(data.offers).toMatchObject({ lowPrice: 1000, highPrice: 1000, offerCount: 1 });
    expect(productJsonLd({ name: "Phone", offers: [] })).toBeNull();
    expect(productJsonLd({ name: "", offers: OFFERS })).toBeNull();
  });

  it("cannot be broken out of: a title holding </script> stays inside the script", () => {
    const text = jsonLdText({ name: "Evil </script><img src=x onerror=alert(1)>" });
    expect(text).not.toContain("<");
    expect(JSON.parse(text).name).toBe("Evil </script><img src=x onerror=alert(1)>");
  });
});

describe("productDescription", () => {
  it("gives the product, its lowest price and where, and how many stores", () => {
    expect(productDescription({ name: "Samsung Galaxy A17 256GB", offers: OFFERS })).toBe(
      "Samsung Galaxy A17 256GB: lowest price PKR 64,000 at PriceOye, compared across 3 Pakistani stores, with price history and a check of every discount.",
    );
    expect(productDescription({ name: "X", offers: [] })).toBeNull();
  });
});

describe("Product page: what it tells search engines", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  function renderAt(id) {
    vi.mocked(api.getListing).mockReset().mockResolvedValue({
      listing: OFFERS.find((o) => o._id === id), offers: OFFERS, summary: null, productGroup: { productName: "Samsung Galaxy A17 256GB" },
    });
    return render(
      <MemoryRouter initialEntries={[`/product/${id}`]}>
        <Routes><Route path="/product/:id" element={<Product />} /></Routes>
      </MemoryRouter>,
    );
  }

  it("carries its schema.org Product, a description, and one canonical address whichever offer it was opened at", async () => {
    const { container, unmount } = renderAt("p3"); // opened at the dearest offer
    await screen.findByRole("heading", { level: 1, name: "Samsung Galaxy A17 256GB" });

    const script = container.querySelector('script[type="application/ld+json"]');
    expect(JSON.parse(script.textContent)).toMatchObject({ "@type": "Product", offers: { lowPrice: 64000, highPrice: 67000, offerCount: 3 } });

    const canonical = `${window.location.origin}/product/samsung-galaxy-a17-256gb-p1`; // readable: the offer's title, then its id
    await waitFor(() => expect(document.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(canonical));
    expect(JSON.parse(script.textContent).url).toBe(canonical);
    expect(document.querySelector('meta[name="description"]').getAttribute("content")).toMatch(/^Samsung Galaxy A17 256GB: lowest price PKR 64,000 at PriceOye/);

    unmount(); // leaving the page takes its canonical address with it
    expect(document.querySelectorAll('link[rel="canonical"]')).toHaveLength(0);
  });
});
