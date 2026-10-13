import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { parsePaklapHtml } from "../src/scrapers/paklap.scraper.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(
  join(__dirname, "fixtures/paklap/search-laptop.html"),
  "utf8"
);

describe("Paklap parser (fixture)", () => {
  it("returns at least one listing", () => {
    const listings = parsePaklapHtml(html);
    expect(listings.length).toBeGreaterThan(0);
  });

  it("every listing has a title, price and sourceUrl", () => {
    const listings = parsePaklapHtml(html);
    for (const l of listings) {
      expect(typeof l.title).toBe("string");
      expect(l.title.length).toBeGreaterThan(0);
      expect(typeof l.price).toBe("number");
      expect(l.price).toBeGreaterThan(0);
      expect(typeof l.sourceUrl).toBe("string");
      expect(l.sourceUrl).toMatch(/^https:\/\/www\.paklap\.pk/);
    }
  });

  it("platform is paklap on every listing", () => {
    const listings = parsePaklapHtml(html);
    for (const l of listings) {
      expect(l.platform).toBe("paklap");
    }
  });

  it("no listing has a price below PKR 100", () => {
    const listings = parsePaklapHtml(html);
    for (const l of listings) {
      expect(l.price).toBeGreaterThanOrEqual(100);
    }
  });

  it("no was-price is below or equal to the current price", () => {
    const listings = parsePaklapHtml(html);
    for (const l of listings) {
      if (l.originalPrice !== null) {
        expect(l.originalPrice).toBeGreaterThan(l.price);
      }
    }
  });
});