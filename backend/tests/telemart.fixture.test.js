import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  parseTelemartSuggestJson,
  readCondition,
} from "../src/scrapers/telemart.scraper.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const json = JSON.parse(
  readFileSync(
    join(__dirname, "fixtures/telemart/search-samsung-galaxy.json"),
    "utf8"
  )
);

describe("Telemart suggest JSON parser (fixture)", () => {
  it("returns exactly 3 listings from the fixture", () => {
    const listings = parseTelemartSuggestJson(json);
    expect(listings.length).toBe(3);
  });

  it("first listing has exact title, price, originalPrice and sourceUrl", () => {
    const listings = parseTelemartSuggestJson(json);
    const first = listings[0];
    expect(first.title).toBe("Samsung Galaxy A57 5G Dual Sim With Official Warranty");
    expect(first.price).toBe(149849);
    expect(first.originalPrice).toBe(215000);
    expect(first.sourceUrl).toBe(
      "https://www.telex.pk/products/samsung-galaxy-a57-5g-dual-sim-with-official-warranty"
    );
  });

  it("platform is telemart on every listing", () => {
    const listings = parseTelemartSuggestJson(json);
    for (const l of listings) {
      expect(l.platform).toBe("telemart");
    }
  });

  it("every listing has a positive price and absolute sourceUrl", () => {
    const listings = parseTelemartSuggestJson(json);
    for (const l of listings) {
      expect(l.price).toBeGreaterThanOrEqual(100);
      expect(l.sourceUrl).toMatch(/^https:\/\/www\.telex\.pk\/products\//);
    }
  });

  it("no was-price is below or equal to the current price", () => {
    const listings = parseTelemartSuggestJson(json);
    for (const l of listings) {
      if (l.originalPrice !== null) {
        expect(l.originalPrice).toBeGreaterThan(l.price);
      }
    }
  });

  it("no was-price exceeds 10x the current price", () => {
    const listings = parseTelemartSuggestJson(json);
    for (const l of listings) {
      if (l.originalPrice !== null) {
        expect(l.originalPrice).toBeLessThanOrEqual(l.price * 10);
      }
    }
  });

  it("returns empty array for empty products list", () => {
    const empty = { resources: { results: { products: [] } } };
    expect(parseTelemartSuggestJson(empty)).toEqual([]);
  });

  it("skips a product with a missing handle (broken field)", () => {
    const broken = {
      resources: {
        results: {
          products: [
            // No handle — parser must skip this without throwing
            { title: "Broken Product", price: "50000.00", variants: [] },
            ...json.resources.results.products,
          ],
        },
      },
    };
    const listings = parseTelemartSuggestJson(broken);
    // Broken product skipped, original 3 still parsed
    expect(listings.length).toBe(3);
  });
});

describe("readCondition", () => {
  it("returns null for a new product with no condition tags", () => {
    expect(readCondition(["Samsung Mobiles", "Smart Phones"])).toBeNull();
  });

  it("returns 'used' for a product tagged Used", () => {
    expect(readCondition(["Used", "Samsung Mobiles"])).toBe("used");
  });

  it("returns 'used' for a product tagged Refurbished", () => {
    expect(readCondition(["Refurbished", "Laptops"])).toBe("used");
  });

  it("returns 'open-box' for a product tagged Open Box", () => {
    expect(readCondition(["Open Box", "Samsung Mobiles"])).toBe("open-box");
  });

  it("returns null for an empty tags array", () => {
    expect(readCondition([])).toBeNull();
  });

  it("returns null for a non-array input", () => {
    expect(readCondition(null)).toBeNull();
    expect(readCondition(undefined)).toBeNull();
  });
});