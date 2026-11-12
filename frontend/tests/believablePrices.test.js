// Sorting and the price slider use prices that can be believed (audit, 2026-11-12, finding 7).
import { describe, it, expect } from "vitest";
import { believableOffers, priceBounds, sortGroups } from "../src/lib/filters.js";

const offer = (price, over = {}) => ({ _id: String(price), price, inStock: true, priceCheck: { status: "plausible" }, ...over });

describe("believable prices", () => {
  it("leaves out a flagged price and an out-of-stock one while another offer is in stock", () => {
    const offers = [offer(9999999, { priceCheck: { status: "suspect_high" } }), offer(900, { inStock: false }), offer(200000)];
    expect(believableOffers(offers).map((o) => o.price)).toEqual([200000]);
    expect(priceBounds(offers)).toEqual({ min: 200000, max: 200000 });
  });

  it("'Lowest price' sorts by believable prices, and a product whose only price is flagged goes last", () => {
    const groups = [
      { productName: "placeholder", offers: [offer(9999999, { priceCheck: { status: "suspect_high" } })] },
      { productName: "real", offers: [offer(150000), offer(100, { inStock: false })] },
      { productName: "cheaper", offers: [offer(120000)] },
    ];
    expect(sortGroups(groups, "lowestPrice").map((g) => g.productName)).toEqual(["cheaper", "real", "placeholder"]);
  });
});

describe("the headline lowest price: in stock before the PTA label", async () => {
  const { summarizeOffers } = await import("../src/lib/summary.js");
  it("an in-stock offer that does not state PTA is the lowest before an out-of-stock approved one", () => {
    const fresh = new Date().toISOString();
    const summary = summarizeOffers([
      { _id: "a", platform: "techroid", price: 123000, inStock: false, ptaStatus: "pta_approved", lastScrapedAt: fresh },
      { _id: "b", platform: "alfamall", price: 141801, inStock: true, ptaAssessment: "not_stated", lastScrapedAt: fresh },
    ]);
    expect(summary.lowest.price).toBe(141801);
  });
});
