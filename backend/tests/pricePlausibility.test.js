import { describe, it, expect } from "vitest";

import {
  analyzePricePlausibility,
  isSuspectPrice,
  LOW_RATIO,
  HIGH_RATIO,
} from "../src/services/pricePlausibility.service.js";
import { sanitizePrices, MIN_PLAUSIBLE_PRICE } from "../src/services/priceSanity.service.js";
import { calculateDealScores } from "../src/ranking/dealScore.js";

const offer = (id, price, platform = "priceoye") => ({ _id: id, price, platform, inStock: true, lastScrapedAt: new Date() });

describe("analyzePricePlausibility", () => {
  const group = [offer("a", 50000), offer("b", 51000), offer("c", 49000)];

  it("calls an offer in line with the others plausible", () => {
    const result = analyzePricePlausibility(group[0], group);
    expect(result.status).toBe("plausible");
    expect(result.comparators).toBe(2);
  });

  it("flags a price far below the others as suspect_low, with a plain reason", () => {
    const cheap = offer("d", 5000);
    const result = analyzePricePlausibility(cheap, [...group, cheap]);
    expect(result.status).toBe("suspect_low");
    expect(result.ratio).toBeLessThan(LOW_RATIO);
    expect(result.reason).toMatch(/unusually low/);
    expect(result.referencePrice).toBe(50000);
  });

  it("flags a price far above the others as suspect_high", () => {
    const dear = offer("d", 150000);
    const result = analyzePricePlausibility(dear, [...group, dear]);
    expect(result.status).toBe("suspect_high");
    expect(result.ratio).toBeGreaterThan(HIGH_RATIO);
  });

  it("does not flag ordinary variation (a store 25% cheaper is not an error)", () => {
    const cheaper = offer("d", 37500);
    expect(analyzePricePlausibility(cheaper, [...group, cheaper]).status).toBe("plausible");
  });

  it("does not let the offer's own price move the reference", () => {
    // If the offer counted itself, a value this extreme would drag the median and look less odd.
    const extreme = offer("d", 1000);
    const result = analyzePricePlausibility(extreme, [...group, extreme]);
    expect(result.referencePrice).toBe(50000);
  });

  it("abstains with fewer than two other offers", () => {
    const two = [offer("a", 50000), offer("b", 5000)];
    const result = analyzePricePlausibility(two[1], two);
    expect(result.status).toBe("not_comparable");
    expect(result.reason).toMatch(/at least 2 other/);
    expect(analyzePricePlausibility(two[0], [two[0]]).status).toBe("not_comparable");
  });

  it("abstains when the other offers disagree with each other (mixed variants)", () => {
    const mixed = [offer("a", 30000), offer("b", 90000), offer("c", 5000)];
    const result = analyzePricePlausibility(mixed[2], mixed);
    expect(result.status).toBe("not_comparable");
    expect(result.reason).toMatch(/differ too much/);
  });

  it("abstains for an offer with no valid price", () => {
    expect(analyzePricePlausibility({ _id: "x", price: null }, group).status).toBe("not_comparable");
  });

  it("isSuspectPrice reads the flag", () => {
    expect(isSuspectPrice({ priceCheck: { status: "suspect_low" } })).toBe(true);
    expect(isSuspectPrice({ priceCheck: { status: "suspect_high" } })).toBe(true);
    expect(isSuspectPrice({ priceCheck: { status: "plausible" } })).toBe(false);
    expect(isSuspectPrice({})).toBe(false);
  });
});

describe("deal score with a suspect price", () => {
  const honest = [offer("a", 50000, "priceoye"), offer("b", 51000, "mega"), offer("c", 49000, "shophive")];

  it("does not crown an implausibly cheap offer the best deal", () => {
    const withBogus = calculateDealScores([...honest, offer("d", 5000, "telemart")]);
    const bogus = withBogus.find((o) => o._id === "d");

    expect(bogus.priceCheck.status).toBe("suspect_low");
    expect(bogus.scoreBreakdown.price).toBe(0);
    expect(withBogus[0]._id).not.toBe("d");
  });

  it("does not let the bogus price change how the honest offers score on price", () => {
    const alone = calculateDealScores(honest);
    const withBogus = calculateDealScores([...honest, offer("d", 5000, "telemart")]);

    for (const id of ["a", "b", "c"]) {
      const before = alone.find((o) => o._id === id).scoreBreakdown.price;
      const after = withBogus.find((o) => o._id === id).scoreBreakdown.price;
      expect(after).toBe(before);
    }
  });

  it("attaches a priceCheck to every offer and changes nothing for ordinary groups", () => {
    const scored = calculateDealScores(honest);
    expect(scored.every((o) => o.priceCheck?.status === "plausible")).toBe(true);
    expect(scored[0].scoreBreakdown.price).toBeGreaterThan(0);
  });
});

describe("sanitizePrices", () => {
  it("keeps a sound price and a was-price above it", () => {
    expect(sanitizePrices({ price: 50000, originalPrice: 60000 })).toEqual({
      ok: true, price: 50000, originalPrice: 60000, changes: [],
    });
  });

  it("drops a was-price that is not above the current price: that is not a discount", () => {
    for (const was of [50000, 45000, 0, -5, "abc", NaN]) {
      const result = sanitizePrices({ price: 50000, originalPrice: was });
      expect(result.ok).toBe(true);
      expect(result.originalPrice).toBeNull();
      expect(result.changes.length).toBe(1);
    }
  });

  it("leaves a missing was-price alone", () => {
    for (const was of [null, undefined, ""]) {
      expect(sanitizePrices({ price: 50000, originalPrice: was })).toMatchObject({ ok: true, originalPrice: null, changes: [] });
    }
  });

  it("does not hide a suspiciously large was-price: judging that is the discount checks' job", () => {
    expect(sanitizePrices({ price: 151999, originalPrice: 528500 }).originalPrice).toBe(528500);
  });

  it("rejects a price that cannot be a real electronics price", () => {
    for (const price of [0, 20, MIN_PLAUSIBLE_PRICE - 1, null, undefined, NaN, "x"]) {
      expect(sanitizePrices({ price }).ok).toBe(false);
    }
    expect(sanitizePrices({ price: MIN_PLAUSIBLE_PRICE }).ok).toBe(true);
  });
});
