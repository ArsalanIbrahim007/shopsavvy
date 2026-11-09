// The shared-model-code rule (similarityModel.service.js sharedModelCode), the hyphened-prefix veto (prefixConflict) and the
// grouping's last pass that joins groups of one model (productGrouping.service.js mergeSameModelGroups). Every case here is a pair
// of live titles from the 2026-11-08 measurement (09-recheck-group-merges.js, 12-recheck-recall.js).
import { describe, it, expect } from "vitest";

import { sharedModelCode, sameBrand, prefixConflict, classifyPairML, mlMatchStrategy, samePlainTitles, withoutStoreWording } from "../src/services/similarityModel.service.js";
import { extractStorage, ramStorageShorthand } from "../src/services/normalizeTitle.service.js";
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

describe("a TV code with and without its year letter (2026-11-09, labelled pair r089)", () => {
  it("joins 65Q60D and 65Q60, 43F6000F and 43F6000, when both state the screen size and the prices are within 10%", () => {
    expect(sharedModelCode(item("Samsung 65\" 4K Smart QLED TV (65Q60D)", 272480), item("Samsung 65 Inch 4K Smart QLED TV (65Q60)", 298999))).toBe("65q60d");
    expect(sharedModelCode(item("Samsung 43 Inch Full HD Smart LED TV Model 43F6000F", 102900), item("Samsung - Smart TV FHD 43 inch - F6000 - 43F6000", 99999))).toBe("43f6000f");
  });

  it("not across screen sizes, not 10% or more apart, not for a phone's name, and not when the shorter code ends in a letter", () => {
    expect(sharedModelCode(item("Samsung 65\" QLED TV (65Q60D)", 272480), item("Samsung 55 Inch QLED TV (55Q60)", 199999))).toBeNull();
    expect(sharedModelCode(item("Samsung 65\" QLED TV (65Q60D)", 200000), item("Samsung 65 Inch QLED TV (65Q60)", 298999))).toBeNull();
    expect(sharedModelCode(item("Oppo A15 3GB 32GB", 30000), item("Oppo A15s 4GB 64GB", 31000))).toBeNull();
    expect(sharedModelCode(item("TCL 55 Inch QD-Mini LED (55C6K)", 200000), item("TCL 55 Inch (55C6KS)", 205000))).toBeNull();
  });
});

describe("withoutStoreWording (2026-11-09)", () => {
  it.each([
    ["Infinix Note 60 | (256GB - 8GB RAM) | PTA Approved | Official Warranty With Free SURPRISE GIFT | Electro Ease", "Infinix Note 60 | (256GB - 8GB RAM) | PTA Approved"],
    ["Infinix Hot 60 Pro - 8GB RAM - 128GB ROM - Installments (Pak Mobiles)", "Infinix Hot 60 Pro - 8GB RAM - 128GB ROM"],
    ["Oppo A6K 128GB 4GB RAM - ISPK-0624", "Oppo A6K 128GB 4GB RAM"],
    ["Haier - Q-LED Google TV 55 Inches - S80EUX - (SNS67)", "Haier - Q-LED Google TV 55 Inches - S80EUX"],
    ["Samsung Galaxy A17 8GB 256GB (With 10% Markup Upto 6 Months)", "Samsung Galaxy A17 8GB 256GB"],
    ["Samsung Galaxy S24 Ultra (12GB - 256GB) Free Home Delivery", "Samsung Galaxy S24 Ultra (12GB - 256GB)"],
  ])("takes the store's wording out of %s", (title, plain) => {
    expect(withoutStoreWording(title)).toBe(plain);
  });

  it("keeps the condition and PTA status, and leaves a plain title as it is", () => {
    expect(withoutStoreWording("iPhone 15 128GB - 3 Months Warranty (Used)")).toBe("iPhone 15 128GB Used");
    expect(withoutStoreWording("Samsung Galaxy S25 Ultra 12GB 512GB PTA Approved - 3 Month Warranty Like a New")).toBe("Samsung Galaxy S25 Ultra 12GB 512GB PTA Approved Like a New");
    expect(withoutStoreWording("Redmi Note 13 Pro (8GB – 256GB) 8GB – 256GB")).toBe("Redmi Note 13 Pro (8GB – 256GB) 8GB – 256GB");
  });
});

describe("grouping joins groups of one phone that a store's wording kept apart (labelled pair r243's groups)", () => {
  const phone = (id, platform, title, price, ptaStatus = "unknown") => ({ _id: id, platform, title, price, ptaStatus, productCategory: "smartphone", inStock: true });
  const holding = (groups, id) => groups.find((g) => g.offers.some((o) => o._id === id));

  it("joins them, though the seller's title alone scores below the threshold", () => {
    const seller = "Infinix Note 60 | (256GB - 8GB RAM) | PTA Approved | Official Warranty With Free SURPRISE GIFT | Electro Ease";
    const plain = "Infinix Note 60 256GB 8GB RAM Fizz Blue";
    expect(classifyPairML(item(seller, 118000), item(plain, 110000)).isMatch).toBe(false);
    expect(samePlainTitles(item(seller, 118000), item(plain, 110000))).toBe(true);
    const groups = groupListingsByProduct([phone("a", "alfamall", seller, 118000), phone("b", "ishopping", plain, 110000)], { matchStrategy: mlMatchStrategy });
    expect(holding(groups, "a")).toBe(holding(groups, "b"));
  });

  it("not two titles without store wording, not computers, not a like-new unit with a new one, nor groups priced apart", () => {
    expect(samePlainTitles(item("Infinix Note 60 256GB 8GB RAM", 110000), item("Infinix Note 60 8GB 256GB Blue", 112000))).toBe(false);
    expect(samePlainTitles(
      item("Dell Latitude 7400 14\" Core I5 8th Gen 8GB RAM 256GB M2 SSD Laptop - 3 Months Warranty - ISPK-0622", 60000),
      item("DELL LATITUDE 5400 - CORE I5 8TH GENEARTION - 8GB RAM - 256GB M2 SSD - 14\" - 3 months WARRANTY", 56100),
    )).toBe(false);
    expect(samePlainTitles(item("Samsung Galaxy S25 Ultra 12GB 512GB PTA Approved - 3 Month Warranty Like a New", 325000), item("Samsung Galaxy S25 Ultra 12GB 512GB", 375000))).toBe(false);
    // RAM written short ("8+256GB") is read too: the 8GB Nothing Phone 4a is not the 12GB one.
    expect(samePlainTitles(item("Nothing Phone 4a 8+256GB 1 Year Warranty at 0% markup upto 6 months installments", 184000), item("Nothing Phone 4A 12GB 256GB", 210000))).toBe(false);
    expect(samePlainTitles(item("Nothing Phone 4a 8+256GB 1 Year Warranty at 0% markup upto 6 months installments", 184000), item("Nothing Phone 4A 8GB 256GB", 175000))).toBe(true);
    const groups = groupListingsByProduct(
      [
        phone("a", "alfamall", "Samsung Galaxy A17 | (256GB - 8GB RAM) | PTA Approved | Official Warranty With Free SURPRISE GIFT | Electro Ease", 80000),
        phone("b", "paklap", "Samsung Galaxy A17 - 8GB RAM - 256GB ROM - Installments (Pak Mobiles)", 104000),
      ],
      { matchStrategy: mlMatchStrategy },
    );
    expect(holding(groups, "a")).not.toBe(holding(groups, "b"));
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

describe("the grouping leftovers (2026-11-09)", () => {
  const phone = (id, platform, title, price) => ({ _id: id, platform, title, price, ptaStatus: "unknown", productCategory: "smartphone", inStock: true });
  const holding = (groups, id) => groups.find((g) => g.offers.some((o) => o._id === id));

  it("a line named alone is its maker's brand: A4tech Bloody MR710 and Bloody MR710 (labelled pair r020)", () => {
    expect(sameBrand("A4tech Bloody MR710 Wireless + Wired Multi-Mode RGB Gaming Headphones", "Bloody MR710 RGB Wireless Gaming Bluetooth Headset (Black)")).toBe(true);
    expect(sharedModelCode(item("A4tech Bloody MR710 Wireless + Wired Multi-Mode RGB Gaming Headphones", 11413), item("Bloody MR710 RGB Wireless Gaming Bluetooth Headset (Black)", 12695))).toBe("mr710");
    // A second word of three letters is not a line: "Haier LED" is not the brand "led".
    expect(sameBrand("Haier LED 55 Inch 55S80EUX", "LED 55 Inch 55S80EUX")).toBe(false);
  });

  it("but a variant word after the code is a different product: the R50i NC is not the R50i", () => {
    expect(sharedModelCode(item("Anker Soundcore R50i NC True Wireless Bluetooth Earbuds A3949H12", 7699), item("Soundcore by Anker R50i Earbuds", 7649))).toBeNull();
    expect(sharedModelCode(item("Samsung 75\" QN70F Neo QLED 4K AI Smart TV (2025)", 615000), item("Samsung 75\" Neo QLED 4K Vision AI Smart TV (QA75QN70FAUSMM) QN70F", 600000))).toBe("qn70f");
  });

  it("a TV's code with and without its screen size, 55Q7F and Q7F, only where finished groups join (labelled pair r287)", () => {
    const a = item("Samsung 55\" QLED 4K Vision AI Smart LED TV (55Q7F)", 196980);
    const b = item("SAMSUNG 55\" QLED Q7F 4K Samsung Vision AI Smart TV - hub", 208999);
    expect(mlMatchStrategy.sameModel(a, b)).toBe("q7f");
    expect(sharedModelCode(a, b)).toBeNull(); // not in every pair comparison
    expect(mlMatchStrategy.sameModel(item("TCL 75P8L 75'' Premium Mini QLED TV", 385000), item("TCL P8L 75\" QD-Mini LED Dimming TV", 367000))).toBe("p8l");
    expect(mlMatchStrategy.sameModel(a, item("Samsung 65\" QLED Q7F", 208999))).toBeNull();
    expect(mlMatchStrategy.sameModel(a, item("SAMSUNG 55\" QLED Q7F", 240000))).toBeNull();
  });

  it("reads a seller's 8/256 for the store-wording pass, not for the grouping loop", () => {
    expect(ramStorageShorthand("Infinix Note 60 Pro 8/256 | PTA Approved")).toEqual([8, 256]);
    expect(ramStorageShorthand("Nothing CMF Phone 2 Pro | 8/128 GB | Urban Hub")).toEqual([8, 128]);
    expect(ramStorageShorthand("Mount 1/2 inch")).toBeNull();
    expect(ramStorageShorthand("Support 24/7")).toBeNull();
    expect(extractStorage("Infinix Note 60 Pro 8/256 | PTA Approved")).toBeNull();
    const groups = groupListingsByProduct(
      [
        phone("a", "alfamall", "Xiaomi Redmi Note 15 8/256 | PTA Approved | With Official Warranty | On Installments By 3AZ Mart", 74739),
        phone("b", "priceoye", "Xiaomi Redmi Note 15 8GB 256GB", 74999),
        phone("c", "alfamall", "Tecno Spark Go 3 4/128 | PTA Approved | On Easy Monthly Installments | With 0% Markup Upto 6 Months | Fast Delivery | Electronix Hub", 44229),
        phone("d", "priceoye", "Infinix Smart 20 4GB 128GB", 46999),
      ],
      { matchStrategy: mlMatchStrategy },
    );
    expect(holding(groups, "a")).toBe(holding(groups, "b"));
    expect(holding(groups, "c")).not.toBe(holding(groups, "d"));
  });
});

describe("a TV that names its processor, and a store's UE reference (2026-11-09, labelled pair r287)", () => {
  it("a TV's 'Q4 AI Processor' is not a computer's; a laptop's still is", () => {
    expect(sharedModelCode(
      item("Samsung QN70F Neo QLED 4K Smart TV (NQ4 AI Gen2 Processor & Motion Xcelerator 144Hz) 75 Inch", 599000),
      item("Samsung 75\" QN70F Neo QLED 4K AI Smart TV (2025)", 615000),
    )).toBe("qn70f");
    expect(mlMatchStrategy.sameModel(
      item("Samsung Q7F QLED 4K Vision AI Smart TV (Q4 AI Processor & Quantum HDR) 55 Inch", 208999),
      item("Samsung 55 Inch 4K HD Smart QLED TV (55Q7F)", 214000),
    )).toBe("q7f");
    expect(sharedModelCode(item("HP 250 G10 i5 Processor 8GB 512GB 1335U", 150000), item("HP ProBook 450 G10 Processor 1335U 8GB", 160000))).toBeNull();
  });

  it("an instalment seller's 'UE001' is not a model: a TCL P6L and T6D shared only that", () => {
    expect(sharedModelCode(
      item("TCL 65-Inch 65P6L 4K Google TV – Smart UHD Google TV with AiPQ Processor (Latest 2026 Model) 0% Markup 0% Processing ON INSTALLMENTS-UE001", 199990),
      item("TCL 65T6D 65 Inch 4K QLED Smart Google TV 0% Markup 0% Processing ON INSTALLMENTS-UE001", 217399),
    )).toBeNull();
  });
});
