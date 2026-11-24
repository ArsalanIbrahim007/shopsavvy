// The product page's Storage / RAM / PTA rows (lib/variants.js) and the chart's "which store had it" (lib/outlook.js bestOfferOn),
// 2026-11-21.
import { describe, it, expect } from "vitest";

import { modelName, variantRows } from "../src/lib/variants.js";
import { bestOfferOn } from "../src/lib/outlook.js";

const now = new Date().toISOString();
const group = (productName, price, over = {}) => ({
  productName,
  offers: [{ _id: `${productName}-${price}`, platform: "priceoye", price, title: productName, productCategory: "smartphone", inStock: true, lastScrapedAt: now, ...over }],
});

describe("modelName", () => {
  it("cuts a title at its first capacity and drops PTA words", () => {
    expect(modelName("iPhone 17 Pro Max 256GB")).toBe("iPhone 17 Pro Max");
    expect(modelName("Samsung Galaxy A17 6GB RAM 128GB Storage PTA Approved")).toBe("Samsung Galaxy A17");
    expect(modelName("Apple iPhone 16 (128GB) Non-PTA")).toBe("Apple iPhone 16");
  });
});

describe("variantRows", () => {
  const current = group("Samsung Galaxy A17 6GB 128GB", 68490, { storageGb: 128, ramGb: 6, ptaStatus: "pta_approved" });
  const siblings = [
    current,
    group("Galaxy A17 8GB 256GB", 77490, { storageGb: 256, ramGb: 8, ptaStatus: "pta_approved" }),
    group("Samsung Galaxy A17 8GB 256GB Non-PTA", 64000, { storageGb: 256, ramGb: 8, ptaStatus: "non_pta" }),
    group("Samsung Galaxy A17 5G 8GB 256GB", 80945, { storageGb: 256, ramGb: 8 }), // another model
  ];

  it("lists each storage, RAM and PTA option with its lowest price, the current one and the cheapest", () => {
    const rows = variantRows(current, siblings);
    const storage = rows.find((r) => r.key === "storage");
    expect(storage.options.map((o) => [o.label, o.price, o.current, o.best])).toEqual([["128GB", 68490, true, false], ["256GB", 64000, false, true]]);
    expect(rows.find((r) => r.key === "pta").options.map((o) => o.label)).toEqual(["PTA approved", "Non-PTA"]);
  });

  it("opens the version that keeps the other choices (256GB stays PTA approved)", () => {
    const storage = variantRows(current, siblings).find((r) => r.key === "storage");
    expect(storage.options[1].target.title).toBe("Galaxy A17 8GB 256GB");
  });

  it("shows nothing for a model with one version", () => {
    expect(variantRows(current, [current])).toEqual([]);
  });
});

describe("bestOfferOn", () => {
  const at = new Date("2026-11-10T12:00:00+05:00");
  const offer = (platform, price, history) => ({ platform, price, priceHistory: history.map(([day, p]) => ({ price: p, recordedAt: `${day}T08:00:00+05:00` })) });

  it("names the store whose price on that day is the one the chart shows", () => {
    const offers = [offer("mega", 70000, [["2026-11-09", 69000]]), offer("priceoye", 68000, [["2026-11-10", 68500]])];
    expect(bestOfferOn(offers, at, 68500).platform).toBe("priceoye");
    expect(bestOfferOn(offers, at, 69000).platform).toBe("mega");
  });

  it("does not carry a store's price more than three days, and finds no one for a price nobody had", () => {
    const offers = [offer("mega", 70000, [["2026-11-01", 69000]])];
    expect(bestOfferOn(offers, at, 69000)).toBeNull();
    expect(bestOfferOn([offer("mega", 1, [["2026-11-10", 1]])], at, 2)).toBeNull();
  });
});
