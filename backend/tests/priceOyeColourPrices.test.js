// Each colour's own price at PriceOye (2026-11-21): its page's window.product_data table, colour -> storage -> price and stock.
import { describe, it, expect } from "vitest";

import { priceOyeColourPrices } from "../src/services/colourPage.service.js";

const entry = (price, availability = "In Stock") => [{ product_price: price, product_availability: availability, note: "a \"quoted\" {brace}" }];
const page = (dataPrices) => `<html><body><div>…</div><script>
  // Share the packages with the client script through a JS variable
  window.product_data = ${JSON.stringify({ product_config: { dataPrices } })};
</script></body></html>`;

// the iPhone 17 Pro Max as PriceOye listed it on 21 Nov 2026
const iphone = page({
  refined_silver: { "256gb": entry("494,945"), "512gb": entry("565,645") },
  deep_blue: { "256gb": entry("499,995"), "512gb": entry("544,999", "Out of Stock") },
  cosmic_orange: { "256gb": entry("474,745"), "512gb": entry("550,495") },
});

describe("priceOyeColourPrices", () => {
  it("reads each colour's price for the storage whose prices include the listing's (its cheapest)", () => {
    expect(priceOyeColourPrices(iphone, { price: 474745 })).toEqual([
      { colour: "Silver", price: 494945, inStock: true },
      { colour: "Blue", price: 499995, inStock: true },
      { colour: "Orange", price: 474745, inStock: true },
    ]);
  });

  it("uses the listing's own storage when it states one, with each colour's stock", () => {
    expect(priceOyeColourPrices(iphone, { storageGb: 512 })).toEqual([
      { colour: "Silver", price: 565645, inStock: true },
      { colour: "Blue", price: 544999, inStock: false },
      { colour: "Orange", price: 550495, inStock: true },
    ]);
  });

  it("gives each colour the address of that colour and storage at PriceOye, from the listing's address", () => {
    const [silver] = priceOyeColourPrices(iphone, { price: 474745, url: "https://priceoye.pk/mobiles/apple/apple-iphone-17-pro-max/" });
    expect(silver.link).toBe("https://priceoye.pk/mobiles/apple/apple-iphone-17-pro-max/ppc/refined_silver/256gb");
    expect(priceOyeColourPrices(iphone, { price: 474745, url: "https://evil.example/x" })[0].link).toBeUndefined();
  });

  it("falls back to the smallest storage, and says nothing for a page without the table", () => {
    expect(priceOyeColourPrices(iphone, { price: 1 })[0]).toEqual({ colour: "Silver", price: 494945, inStock: true });
    expect(priceOyeColourPrices("<html>no data</html>", { price: 1 })).toEqual([]);
    expect(priceOyeColourPrices("window.product_data = {broken", { price: 1 })).toEqual([]);
  });
});
