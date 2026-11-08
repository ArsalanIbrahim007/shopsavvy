// The shared-model-code rule (similarityModel.service.js sharedModelCode), the hyphened-prefix veto (prefixConflict) and the
// grouping's last pass that joins groups of one model (productGrouping.service.js mergeSameModelGroups). Every case here is a pair
// of live titles from the 2026-11-08 measurement (09-recheck-group-merges.js, 12-recheck-recall.js).
import { describe, it, expect } from "vitest";

import { sharedModelCode, prefixConflict, classifyPairML, mlMatchStrategy } from "../src/services/similarityModel.service.js";
import { groupListingsByProduct } from "../src/services/productGrouping.service.js";

const item = (title, price) => ({ title, price });

describe("sharedModelCode", () => {
  it.each([
    ["TCL 50P79L 50 Inch 4K Smart Google QLED TV", 133299, "TCL - Smart Google TV QLED Premium 50 inch - P79L", 129798, "p79l"],
    ["Samsung 55 Inch 4K UHD Smart Crystal UHD TV (U8000F)", 149168, "SAMSUNG 55\" Crystal UHD U8000F 4K Smart TV (UA55U8000FUSMM)", 156999, "u8000f"],
    ["Haier LED 55 Inch 55S80EUX", 130000, "Haier TV 55S80EUX Smart", 128000, "s80eux"],
    ["Samsung Galaxy Tab S10 Lite 6GB Ram 128GB Rom X400", 98499, "Samsung Galaxy Tab S10 Lite ( X400 ) 6GB RAM 128GB", 99999, "x400"],
  ])("joins %s and %s", (a, pa, b, pb, code) => {
    expect(sharedModelCode(item(a, pa), item(b, pb))).toBe(code);
    expect(classifyPairML(item(a, pa), item(b, pb))).toMatchObject({ isMatch: true, reason: "shared model code" });
  });

  it.each([
    // The brand is not a model code: it joined 3,206 pairs of different A4Tech headsets in the first measurement.
    ["A4Tech Bloody G575 Virtual 7.1 Gaming Headset", 6425, "A4Tech Bloody G260p Neon Gaming Headphone", 4599],
    // Warranty, spec and store-reference codes are not models either.
    ["Redmi Note 15 8GB 256GB Official Pta Approved 1Year", 60000, "Redmi Note 15 Pro 8GB 256GB Pta Approved 1Year Warranty", 61000],
    ["Dawlance Kore+ QLED 43 Inch HDR10 Google TV", 90000, "Dawlance Canvas 43 Inch HDR10 Smart TV", 95000],
    ["Tp-Link Archer BE220 BE3600 Dual-Band Wi-Fi 7 Router", 36500, "Tp-Link Archer BE230 BE3600 Dual-Band Wi-Fi 7 Router", 40000],
    ["Haier - Q-LED Google TV 55 Inches - S80EUX - (SNS67)", 129799, "Haier LED TV 55 Inch K85FUX (SNS67)", 125000],
    // Different brands.
    ["OKTRA 32 Inch Smart HD LED TV (K568S-32)", 33499, "PEL 32 Inch Smart LED TV K568S", 34000],
    // Computers: a processor's code is shared by many laptops.
    ["Dell Latitude 3550 15.6\" Core i7 13th Gen 8GB 512GB", 320149, "Dell Vostro 3530 Core i7 13th Gen 1355U", 310000],
    // Too far apart in price.
    ["Samsung 43 Inch Full HD Smart TV (T5300)", 63000, "Samsung 43 Inch FHD Smart LED TV 43 T5300 - Official Warranty", 107999],
  ])("does not join %s and %s", (a, pa, b, pb) => {
    expect(sharedModelCode(item(a, pa), item(b, pb))).toBeNull();
  });
});

describe("prefixConflict", () => {
  it("tells apart one model number under different hyphened prefixes", () => {
    expect(prefixConflict("Sony WH-1000XM6 Wireless Headphones", "Sony WF-1000XM6 Wireless Headphones")).toBe(true);
    expect(classifyPairML(item("Sony WH-1000XM6 Wireless Headphones", 103499), item("Sony WF-1000XM6 Wireless Headphones", 82999)).isMatch).toBe(false);
  });

  it("does not treat a word before the code as a prefix, nor one title's prefix alone", () => {
    expect(prefixConflict("Haier LED 55S80EUX", "Haier TV 55S80EUX")).toBe(false);
    expect(prefixConflict("Sony WH-1000XM6 Wireless Headphones", "Sony 1000XM6 Headphones")).toBe(false);
    expect(prefixConflict("Sony WH-1000XM6", "Sony 1000X Series Wireless Noise Cancelling Headphone (WH-1000XM6)")).toBe(false);
  });
});

describe("grouping joins the groups of one model the first-match loop left apart", () => {
  const tv = (id, platform, title, price) => ({ _id: id, platform, title, price, productCategory: "tv", inStock: true });

  it("puts every offer naming the model in one group", () => {
    const groups = groupListingsByProduct(
      [
        tv("a", "alfamall", "TCL | 50 Inch | 50P79L | Premium QLED TV | 4K UHD | Smart TV", 139549),
        tv("b", "digimall", "TCL - Smart Google TV QLED Premium 50 inch - P79L", 138999),
        tv("c", "priceoye", "TCL 50P79L 50 Inch 4K Smart Google QLED TV", 133299),
        tv("d", "shophive", "TCL 50 Inch Premium QLED Google TV 4K UHD", 135000),
      ],
      { matchStrategy: mlMatchStrategy },
    );
    const holding = (id) => groups.find((g) => g.offers.some((o) => o._id === id));
    expect(holding("a")).toBe(holding("b"));
    expect(holding("a")).toBe(holding("c"));
  });

  it("keeps groups apart when one of them conflicts, or when the groups' prices are far apart", () => {
    const groups = groupListingsByProduct(
      [
        tv("h1", "priceoye", "Sony WH-1000XM6 Wireless Headphones", 103499),
        tv("h2", "ishopping", "Sony 1000X Series Wireless Noise Cancelling Headphone (WH-1000XM6)", 117999),
        tv("f1", "priceoye", "Sony WF-1000XM6 Wireless Headphones", 82999),
        tv("f2", "shophive", "Sony WF-1000XM6 Active Noise Cancellation Bluetooth Earbuds", 87999),
      ],
      { matchStrategy: mlMatchStrategy },
    );
    const holding = (id) => groups.find((g) => g.offers.some((o) => o._id === id));
    expect(holding("f1")).toBe(holding("f2"));
    expect(holding("h1")).not.toBe(holding("f1"));
  });

  it("is off for the rule strategy, which has no sameModel", () => {
    const groups = groupListingsByProduct([
      tv("a", "alfamall", "TCL | 50 Inch | 50P79L | Premium QLED TV", 139549),
      tv("b", "digimall", "TCL - Smart Google TV QLED Premium 50 inch - P79L - Free Delivery Nationwide", 138999),
    ]);
    expect(groups).toHaveLength(2);
  });
});
