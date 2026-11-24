// The product page's Storage / RAM / PTA rows (lib/variants.js) and the chart's "which store had it" (lib/outlook.js bestOfferOn),
// 2026-11-21.
import { describe, it, expect } from "vitest";

import * as require_variants from "../src/lib/variants.js";
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

  it("lists each option with the price of the version it opens, the current one and the cheapest", () => {
    const rows = variantRows(current, siblings);
    const storage = rows.find((r) => r.key === "storage");
    // 256GB opens the PTA-approved 256GB (PKR 77,490), not the cheaper non-PTA one (2026-11-24: it showed PKR 64,000)
    expect(storage.options.map((o) => [o.label, o.price, o.current, o.best])).toEqual([["128GB", 68490, true, true], ["256GB", 77490, false, false]]);
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

// CI, 2026-11-24: a search that answered with nothing (a test's bare mock) crashed the product page.
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";

vi.mock("../src/api/endpoints.js", () => ({ searchListings: vi.fn(async () => undefined) }));
const { default: VariantPicker } = await import("../src/components/product/VariantPicker.jsx");

describe("VariantPicker", () => {
  it("shows nothing, and does not crash, when the search answers with nothing", async () => {
    const { container } = render(<MemoryRouter><VariantPicker group={group("Samsung Galaxy A17 6GB 128GB", 68490)} category="smartphone" /></MemoryRouter>);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container.querySelector(".variant-picker")).toBeNull();
  });
});

describe("VariantPicker remembers a model's versions (2026-11-24)", () => {
  it("shows the rows at once, with no second search, when this visit has looked the model up", async () => {
    const { rememberVariants, forgetVariants, modelKey } = await import("../src/lib/variants.js");
    const { searchListings } = await import("../src/api/endpoints.js");
    forgetVariants();
    const current = group("Samsung Galaxy A17 6GB 128GB", 68490, { storageGb: 128, ramGb: 6 });
    // remembered from another version, spelt without the maker: one model, one key
    rememberVariants(modelKey("Galaxy A17 8GB 256GB"), [current, group("Samsung Galaxy A17 8GB 256GB", 77490, { storageGb: 256, ramGb: 8 })]);
    searchListings.mockClear();
    const { container } = render(<MemoryRouter><VariantPicker group={current} category="smartphone" /></MemoryRouter>);
    expect(container.querySelector(".variant-picker__row")).not.toBeNull(); // in the first render, not after a search
    expect(searchListings).not.toHaveBeenCalled();
    forgetVariants();
  });
});

describe("modelKey", () => {
  it("is the same for every version of a model, however a store spells it", () => {
    const { modelKey } = require_variants;
    expect(modelKey("iPhone 17 Pro Max 256GB")).toBe("iphone 17 pro max");
    expect(modelKey("Apple iPhone 17 Pro Max 512GB")).toBe("iphone 17 pro max");
    expect(modelKey("Apple iPhone 17 Pro Max (Blue) 512 GB Factory Unlocked PTA Approved")).toBe("iphone 17 pro max");
    expect(modelKey("Apple iPhone 17 Pro Max 256GB Storage NON PTA")).toBe("iphone 17 pro max");
  });
});
