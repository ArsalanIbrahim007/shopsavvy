// The price a store's own product page charges (pagePrice.service.js), read 2026-11-12 after Fable's final check.
import { describe, it, expect } from "vitest";

import { extractPagePrice, pagePriceMismatch, PAGE_PRICE_TOLERANCE } from "../src/services/pagePrice.service.js";
import { analyzePricePlausibility } from "../src/services/pricePlausibility.service.js";

// iShopping's page for a product sold in colours: the base finalPrice is the cheapest colour's (Meadow Green 82,720; Crimson Red
// 90,445 is the one the page opens on), and it is the price its search results show. Related products' prices come later.
const FRIDGE = `<span id="old-price-646665" data-price-amount="109200" data-price-type="oldPrice" class="price-wrapper">Rs.109,200</span>
  <span id="product-price-646665" data-price-amount="82720" data-price-type="finalPrice" class="price-wrapper">Rs.82,720</span>
  <div class="related"><span data-price-type="finalPrice" data-price-amount="45075">Rs.45,075</span></div>`;

describe("reading the product page's own price", () => {
  it("takes the first finalPrice on an iShopping page, and nothing for a store not checked", () => {
    expect(extractPagePrice("ishopping", FRIDGE)).toBe(82720);
    expect(extractPagePrice("ishopping", "<p>no price</p>")).toBeNull();
    expect(extractPagePrice("priceoye", FRIDGE)).toBeNull();
  });
});

describe("a listed price the store's page does not charge", () => {
  const now = Date.now();
  const fresh = new Date(now - 86400000).toISOString();

  it(`is a mismatch beyond ${PAGE_PRICE_TOLERANCE * 100}%, from a page read in the last month`, () => {
    expect(pagePriceMismatch({ price: 107100, pagePrice: 131500, pagePriceAt: fresh }, now)).toMatchObject({ pagePrice: 131500 });
    expect(pagePriceMismatch({ price: 82720, pagePrice: 82720, pagePriceAt: fresh }, now)).toBeNull();
    expect(pagePriceMismatch({ price: 100000, pagePrice: 103000, pagePriceAt: fresh }, now)).toBeNull(); // 3%
    expect(pagePriceMismatch({ price: 107100, pagePrice: 131500, pagePriceAt: "2026-01-01T00:00:00Z" }, now)).toBeNull(); // too old
    expect(pagePriceMismatch({ price: 107100 }, now)).toBeNull();
  });

  it("makes the offer a probable listing error, with the page's price in the reason", () => {
    const offer = { _id: "a", price: 107100, pagePrice: 131500, pagePriceAt: fresh };
    const check = analyzePricePlausibility(offer, [offer]);
    expect(check.status).toBe("suspect_page");
    expect(check.reason).toMatch(/131,500/);
  });
});
