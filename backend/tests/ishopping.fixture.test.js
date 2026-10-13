import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { parseIShoppingHtml } from "../src/scrapers/ishopping.scraper.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(
  join(__dirname, "fixtures/ishopping/search-samsung-galaxy.html"),
  "utf8"
);

describe("iShopping parser (fixture)", () => {
  it("returns at least one listing", () => {
    const listings = parseIShoppingHtml(html);
    expect(listings.length).toBeGreaterThan(0);
  });

  it("every listing has a title, price and sourceUrl", () => {
    const listings = parseIShoppingHtml(html);
    for (const l of listings) {
      expect(typeof l.title).toBe("string");
      expect(l.title.length).toBeGreaterThan(0);
      expect(typeof l.price).toBe("number");
      expect(l.price).toBeGreaterThan(0);
      expect(typeof l.sourceUrl).toBe("string");
      expect(l.sourceUrl).toMatch(/^https:\/\/www\.ishopping\.pk/);
    }
  });

  it("platform is ishopping on every listing", () => {
    const listings = parseIShoppingHtml(html);
    for (const l of listings) {
      expect(l.platform).toBe("ishopping");
    }
  });

  it("at least one listing captures a was-price", () => {
    const listings = parseIShoppingHtml(html);
    const withWas = listings.filter((l) => l.originalPrice !== null);
    expect(withWas.length).toBeGreaterThan(0);
  });

  it("no was-price is below or equal to the current price", () => {
    const listings = parseIShoppingHtml(html);
    for (const l of listings) {
      if (l.originalPrice !== null) {
        expect(l.originalPrice).toBeGreaterThan(l.price);
      }
    }
  });

  it("no listing has a price below PKR 100", () => {
    const listings = parseIShoppingHtml(html);
    for (const l of listings) {
      expect(l.price).toBeGreaterThanOrEqual(100);
    }
  });
});