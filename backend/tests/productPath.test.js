// Readable product addresses (2026-10-26): /product/<words of the title>-<id>, the same rule as frontend/src/lib/productPath.js.
import { describe, it, expect } from "vitest";

import { listingIdFromParam, MAX_SLUG_LENGTH, productPath, productSlug } from "../src/services/productPath.js";
import { sitemapEntries } from "../src/services/sitemap.service.js";

const ID = "6a78a2af9c96f297ede77401";

describe("productSlug", () => {
  it("keeps the title's letters and digits as lowercase words joined by hyphens", () => {
    expect(productSlug("Samsung Galaxy A17 (8GB/256GB) – Blue")).toBe("samsung-galaxy-a17-8gb-256gb-blue");
    expect(productSlug("Haier 1.5 Ton DC Inverter AC HSU-18HFPAAS")).toBe("haier-1-5-ton-dc-inverter-ac-hsu-18hfpaas");
    expect(productSlug("Café Crème")).toBe("cafe-creme");
  });

  it("cuts a long title at a whole word, and gives nothing for a title with no letters or digits", () => {
    const long = productSlug("ASUS ROG Strix G16 G615LM - Arrow Lake - Intel Core Ultra 7 255HX 20-Core Processor 16-GB 512-GB SSD 8 GB NVIDIA");
    expect(long.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
    expect(long).toBe("asus-rog-strix-g16-g615lm-arrow-lake-intel-core-ultra-7-255hx-20-core");
    expect(productSlug("—")).toBe("");
    expect(productSlug(undefined)).toBe("");
  });
});

describe("productPath and listingIdFromParam", () => {
  it("builds the address from the title and the id, and reads the id back", () => {
    expect(productPath(ID, "Apple iPhone 17 Pro 256GB")).toBe(`/product/apple-iphone-17-pro-256gb-${ID}`);
    expect(productPath(ID, "")).toBe(`/product/${ID}`);
    expect(listingIdFromParam(`apple-iphone-17-pro-256gb-${ID}`)).toBe(ID);
  });

  it("still reads an old address (a bare id), and one whose words were cut or changed", () => {
    expect(listingIdFromParam(ID)).toBe(ID);
    expect(listingIdFromParam(`apple-iph-${ID}`)).toBe(ID);
    expect(listingIdFromParam(`whatever-${ID.toUpperCase()}`)).toBe(ID.toUpperCase());
  });

  it("does not invent an id: anything else is passed on as given (and refused as an id later)", () => {
    expect(listingIdFromParam("not-an-id")).toBe("not-an-id");
    expect(listingIdFromParam(`x${ID}`)).toBe(`x${ID}`); // the id must be its own part
  });
});

describe("the sitemap uses the readable address", () => {
  it("lists a product at its page's address with the offer's own title", () => {
    const offer = (id, platform, price) => ({ _id: id, platform, price, title: "Samsung Galaxy A17 8GB 256GB", inStock: true, lastScrapedAt: "2026-10-25T21:00:00Z" });
    const entries = sitemapEntries({ smartphone: [{ offers: [offer("a1", "priceoye", 64000), offer("a2", "mega", 63000)] }] },
      { site: "https://s.example", now: Date.parse("2026-10-26T12:00:00Z") });
    expect(entries.map((e) => e.loc)).toContain("https://s.example/product/samsung-galaxy-a17-8gb-256gb-a2");
  });
});
