import { describe, it, expect } from "vitest";

import { detectCategory } from "../src/scrapers/productCategory.js";
import { applianceCodeKeys, attributeConflict, sharedApplianceCode, withoutSellerTag } from "../src/services/similarity.service.js";

const cat = (title) => detectCategory(title).category;

describe("replicas and accessories out of device categories (audit S-002, S-003)", () => {
  it("files replicas under other", () => {
    expect(cat("Apple AirPods Pro 2 Anc Hengxuan Wireless Bluetooth Earphone Active Noise Cancellation Best Quality")).toBe("other");
    expect(cat("Airpods Pro 2 With Slicon Pouch TWS Wireless Earbuds")).toBe("other");
    expect(cat("Apple AirPods Pro 2nd Generation")).toBe("headphones");
  });

  it("makes what is made for a device an accessory, and keeps a watch with its band a watch", () => {
    expect(cat("UNIQ Valencia Case for Apple Watch Series 10 46mm – Black")).toBe("accessory");
    expect(cat("UNIQ Glase Lock Case with Magnetic Lid for AirPods Pro Gen 1 & 2 – Orange")).toBe("accessory");
    expect(cat("Spigen Galaxy Watch 5 Pro Glass Protector EZ Fit–AGL05346–Clear–2 PACK")).toBe("accessory");
    expect(cat("Apple Watch Series 10 42mm with Sport Band (Silver)")).toBe("smartwatch");
  });

  it("does not take a water dispenser for a refrigerator, unless the fridge has one", () => {
    expect(cat("PEL Water Dispenser 215 Pearl Without Refrigerator | 1year warranty")).toBe("appliance");
    expect(cat("Samsung 635L SBS No Frost Refrigerator with Water Dispenser (RS70F64K1TAE)")).toBe("refrigerator");
  });
});

describe("one machine, one product (audit S-004, S-005)", () => {
  it("reads a code written with a space, so two models stay apart", () => {
    expect(attributeConflict("Haier HWM 80-1217E 8KG Single Tub", "Haier HWM 80-60 8KG Single Tub Washing Machine")).toBe(true);
    expect(attributeConflict("Haier Top Load Washing Machine 15KG HWM 150-826", "Haier Top Load Washing Machine 15KG HWM150-826")).toBe(false);
  });

  it("finds the appliance code two titles share, the maker's prefix and a one-letter suffix dropped", () => {
    expect([...applianceCodeKeys("Haier HWM 80-1217E 8KG")]).toEqual(["80-1217"]);
    expect(sharedApplianceCode("Haier HWM 80-1217E 8KG Single Tub", "HAIER 8KG SINGLE TUB WASHING MACHINE Model HWM 80-1217")).toBe("80-1217");
    expect(sharedApplianceCode("Haier HWM 80-1217E 8KG", "Haier HWM 80-60 8KG")).toBe(null);
    expect([...applianceCodeKeys("Gree Pular GS-12PITH11W 1 Ton")]).toEqual([]); // not two numeric parts: left to the other rules
  });

  it("leaves a seller's numbered tag out of the comparison", () => {
    expect(withoutSellerTag("Haier HWM-80-1217 Washing Machine Brand Warranty-By TechHouse336")).toBe("Haier HWM-80-1217 Washing Machine Brand Warranty");
    expect(withoutSellerTag("Haier Ac 1.5-Ton Model Hsu-19Lf Air Conditioner ByTech House84")).toBe("Haier Ac 1.5-Ton Model Hsu-19Lf Air Conditioner");
    expect(attributeConflict("Haier HWM-80-1217 Washing Machine-By TechHouse336", "Haier HWM-80-1217 Washing Machine-By Tech House316")).toBe(false);
  });
});

describe("the live review of 'AirPods Pro 2' (2026-11-18)", () => {
  it("files nameless 'Airpods' as other, keeps a maker's own earbuds and Apple's", () => {
    expect(cat("A9 Pro Airpods")).toBe("other");
    expect(cat("Lunar Airpods Pro Wireless Earbuds")).toBe("other");
    expect(cat("Login True wireless Airpods (LT-WB2)")).toBe("headphones");
    expect(cat("AirPods Pro 3")).toBe("headphones");
    expect(cat("Apple AirPods Pro 2 with MagSafe Charging Case (USB-C)")).toBe("headphones");
  });

  it("makes an accessory maker's product and a described case accessories", () => {
    expect(cat("Spigen Apple AirPods Pro Case Rugged Armor ASD00540 Matte Black")).toBe("accessory");
    expect(cat("ESR AirPods Pro 3 Pulse FlickLock Magnetic Case Dark Blue")).toBe("accessory");
    expect(cat("UAG AirPods Pro 2")).toBe("accessory");
    expect(cat("AirPods Pro Leather Case")).toBe("accessory");
  });
});

describe("a free gift is not the product (live review, 2026-11-18)", () => {
  it("files the product, not its gift", () => {
    expect(cat("HP EliteBook 840 G3 Laptop Intel Core i5-6300U, 8GB, (Like New) Free Airpods & Bag (1Month Warranty)")).toBe("laptop");
    expect(cat("Apple iPhone 14 128GB NON PTA Blue- Free Charger and Cover")).toBe("smartphone");
    expect(cat("Dawlance 80085 Semi Automatic Washing Machine (with free gift air buds)")).toBe("washing_machine");
  });

  it("keeps 'free' that is not a gift", () => {
    expect(cat("Haier HRF-276-EPR Free Standing Refrigerator")).toBe("refrigerator");
    expect(cat("Soundpeats Free Dot Earbuds")).toBe("headphones");
    expect(cat("Free Delivery Dawlance 9193 Refrigerator")).toBe("refrigerator");
  });
});

describe("two prefixes on the same numbers are two models (review, 2026-11-18)", () => {
  it("does not merge PEL's PDIN 70-100 with its PDF-70-100, and still merges Haier's HWM 80-1217E with HWM-80-1217", () => {
    expect(sharedApplianceCode("PEL Deep Freezer (PDIN70-100) Arctic Inverter On", "PEL | 10 CUFT | PDF-70-100 | Arctic On | Single Door")).toBe(null);
    expect(sharedApplianceCode("Haier HWM 80-1217E 8KG Single Tub", "Haier HWM-80-1217 Top Load Semi Auto")).toBe("80-1217");
    expect(sharedApplianceCode("Haier 80-1217E 8KG Single Tub", "Haier HWM 80-1217 8 kg")).toBe("80-1217"); // one states no prefix
  });
});
