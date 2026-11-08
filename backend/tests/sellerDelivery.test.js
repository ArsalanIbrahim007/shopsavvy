// Seller and delivery from the marketplaces (2026-11-08): AlfaMall's and DigiMall's search answers say which of their sellers sells a
// product and its delivery window, express delivery and free shipping. The initial report promised seller and delivery details.
import { describe, it, expect } from "vitest";

import { storefrontListing } from "../src/scrapers/storefront.scraper.js";
import { extractExtras, normalizeDelivery, normalizeSeller } from "../src/services/scrapedExtras.service.js";

const STORE = { platform: "alfamall", baseUrl: "https://alfamall.com", productPath: "/" };
const item = (over = {}) => ({
  title: "Xiaomi Redmi Note 15 Pro 256GB 8GB RAM",
  handle: "redmi-note-15-pro",
  variant_detail: { discounted_price: 95930 },
  images: [],
  vendor: { id: 398, name: "Authentico", phone: "+923000000000" },
  delivery_date: "10 Nov - 11 Nov, 2026",
  express_delivery: false,
  free_shipping: true,
  ...over,
});

describe("storefrontListing", () => {
  it("keeps the seller's name and the delivery, and never the seller's phone number", () => {
    const listing = storefrontListing(STORE, item());
    expect(listing.seller).toBe("Authentico");
    expect(listing.delivery).toEqual({ window: "10 Nov - 11 Nov, 2026", express: false, freeShipping: true });
    expect(JSON.stringify(listing)).not.toContain("+92");
  });
});

describe("the seller and delivery on the way to the database", () => {
  it("accepts a plain name and a delivery that says something, and drops the rest", () => {
    expect(normalizeSeller("  Authentico  ")).toBe("Authentico");
    expect(normalizeSeller("x".repeat(81))).toBeNull();
    expect(normalizeSeller(42)).toBeNull();
    expect(normalizeDelivery({ window: null, express: false, freeShipping: false })).toBeNull();
    expect(normalizeDelivery({ window: "Tomorrow", express: true, freeShipping: "yes" })).toEqual({ window: "Tomorrow", express: true, freeShipping: false });
  });

  it("writes them only when the store gave them", () => {
    expect(extractExtras({ seller: "Authentico", delivery: { window: "10 Nov", express: false, freeShipping: true } })).toMatchObject({ seller: "Authentico", delivery: { freeShipping: true } });
    const none = extractExtras({});
    expect(none).not.toHaveProperty("seller");
    expect(none).not.toHaveProperty("delivery");
  });
});
