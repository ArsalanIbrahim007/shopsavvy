// The price a store's own product page charges (pagePrice.service.js), read 2026-11-12 after Fable's final check.
import { describe, it, expect } from "vitest";

import { extractPagePrice, extractPagePrices, pagePriceMismatch, PAGE_PRICE_TOLERANCE } from "../src/services/pagePrice.service.js";
import { analyzePricePlausibility } from "../src/services/pricePlausibility.service.js";

// iShopping's page for a product sold in colours: the base finalPrice is the cheapest colour's (Meadow Green 82,720; Crimson Red
// 90,445 is the one the page opens on), and it is the price its search results show. Related products' prices come later.
const FRIDGE = `<span id="old-price-646665" data-price-amount="109200" data-price-type="oldPrice" class="price-wrapper">Rs.109,200</span>
  <span id="product-price-646665" data-price-amount="82720" data-price-type="finalPrice" class="price-wrapper">Rs.82,720</span>
  <div class="related"><span data-price-type="finalPrice" data-price-amount="45075">Rs.45,075</span></div>`;

describe("reading the product page's own price", () => {
  it("reads every colour's price from the page's option data", () => {
    const page = `${FRIDGE}<script>{"optionPrices":{"646663":{"oldPrice":{"amount":109200},"finalPrice":{"amount":90445},"tierPrices":[]},"646664":{"oldPrice":{"amount":109200},"finalPrice":{"amount":82720},"tierPrices":[]}},"x":1}</script>`;
    expect(extractPagePrices("ishopping", page)).toEqual({ price: 82720, prices: [82720, 90445] });
  });

  it("takes the first finalPrice on an iShopping page, and nothing for a store not checked", () => {
    expect(extractPagePrice("ishopping", FRIDGE)).toBe(82720);
    expect(extractPagePrice("ishopping", "<p>no price</p>")).toBeNull();
    expect(extractPagePrice("priceoye", FRIDGE)).toBeNull();
  });
});

describe("a listed price the store's page does not charge", () => {
  const now = Date.now();
  const fresh = new Date(now - 86400000).toISOString();

  const read = (price, pagePrice, over = {}) => ({ price, pagePrice, pagePriceAt: fresh, pagePriceListed: price, ...over });

  it(`is a mismatch beyond ${PAGE_PRICE_TOLERANCE * 100}%, from a page read in the last month`, () => {
    expect(pagePriceMismatch(read(107100, 131500), now)).toMatchObject({ pagePrice: 131500 });
    expect(pagePriceMismatch(read(82720, 82720), now)).toBeNull();
    expect(pagePriceMismatch(read(100000, 103000), now)).toBeNull(); // 3%
    expect(pagePriceMismatch(read(107100, 131500, { pagePriceAt: "2026-01-01T00:00:00Z" }), now)).toBeNull(); // too old
    expect(pagePriceMismatch({ price: 107100 }, now)).toBeNull();
  });

  it("never for a price one of the page's colours charges, nor after the listed price changed (Fable's last check)", () => {
    // the page read showed the Crimson Red price, 90,445; our listed 82,720 is Meadow Green's
    expect(pagePriceMismatch(read(82720, 90445, { pagePrices: [90445, 82720] }), now)).toBeNull();
    // a genuine price cut after the page was read: the read is out of date
    expect(pagePriceMismatch(read(99000, 131500, { pagePriceListed: 131500 }), now)).toBeNull();
  });

  it("makes the offer a probable listing error, with the page's price in the reason", () => {
    const offer = { _id: "a", ...read(107100, 131500) };
    const check = analyzePricePlausibility(offer, [offer]);
    expect(check.status).toBe("suspect_page");
    expect(check.reason).toMatch(/131,500/);
  });
});
