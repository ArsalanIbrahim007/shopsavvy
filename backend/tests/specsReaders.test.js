// The Specs engine on the shapes real store pages use (read 2026-11-09): PriceOye's JSON, description tables (iShopping, DigiMall),
// Magento's attribute table (Paklap, Shophive), WooCommerce's (Techroid), eezepc's combined labels. Each snippet is cut from a real page.
import { describe, it, expect } from "vitest";

import { extractSpecs, SPEC_STORES } from "../src/specs/extractors.js";
import { chipsetTier, normalizeSpecs } from "../src/specs/normalize.js";
import { sanitizeSpecSheet, withStatedCapacity } from "../src/services/specsEngine.service.js";

const sheetOf = (platform, html) => sanitizeSpecSheet(normalizeSpecs(extractSpecs(platform, html) ?? {}));
const rows = (pairs) => `<table><tbody>${pairs.map(([k, v]) => `<tr><td><p><strong>${k}</strong></p></td><td><p>${v}</p></td></tr>`).join("")}</tbody></table>`;

describe("readers", () => {
  it("PriceOye: the specification JSON in window.product_data, its battery 'Type' kept with its group", () => {
    const spec = JSON.stringify({
      "General Features": [{ "Phone Weight": "177 g", "Operating System": "IOS 26" }],
      Display: [{ "Screen Size": "6.3 inches", "Screen Type": "LTPO Super Retina XDR OLED, 120Hz" }],
      Memory: [{ "Internal Memory": "256GB / 512GB", RAM: "8GB" }],
      Performance: [{ Processor: "Apple A19" }],
      Battery: [{ Type: "3692 mAh" }],
      Camera: [{ "Front Camera": "18 MP", "Back Camera": "48 + 48 MP" }],
      Connectivity: [{ "5G": "Yes", NFC: "Yes" }],
    });
    const html = `<script>window.product_data = {"title":"Apple Iphone 17","specification":${JSON.stringify(spec)}};</script>`;
    expect(extractSpecs("priceoye", html)["Battery Type"]).toBe("3692 mAh");
    expect(sheetOf("priceoye", html)).toEqual({
      chipset: "Apple A19", chipsetTier: "flagship", ramGb: 8, displayInches: 6.3, refreshHz: 120, displayType: "OLED",
      batteryMah: 3692, mainCameraMp: 48, frontCameraMp: 18, os: "IOS 26", has5g: true, nfc: true, weightG: 177,
    }); // no storage: the page lists two variants
  });

  it("iShopping: a two-column table in the description", () => {
    const html = rows([["Screen Size", "6.7 Inches"], ["Screen Type", "AMOLED (90HZ)"], ["Processor", "Exynos 1330 (5 nm)"], ["Battery Type", "5000 mAh"], ["Back Camera", "50 MP + 5 MP + 2 MP"], ["5G", "No"]]);
    expect(sheetOf("ishopping", html)).toMatchObject({ chipset: "Exynos 1330", chipsetTier: "mid", displayInches: 6.7, displayType: "AMOLED", refreshHz: 90, batteryMah: 5000, mainCameraMp: 50, has5g: false });
  });

  it("Paklap: Magento's attribute table for a laptop, its weight in kg and the webcam not a camera", () => {
    const html = `<table id="product-attribute-specs-table">${rows([["Processor Type", "Intel® Core™ i5-12450H Processor (8 core, 12MB Intel Smart Cache)"], ["Installed RAM", "8 GB"], ["Hard drive size", "512 GB SSD"], ["Screen size", "15.6-Inch WUXGA (1920 × 1200) Display"], ["Weight", "1.83kg"], ["Camera", "2.0 MP Full HD (1080p) Webcam"]]).replace(/<\/?table>/g, "")}</table>`;
    expect(sheetOf("paklap", html)).toEqual({ chipset: "Intel Core i5-12450H", chipsetTier: "mid", ramGb: 8, storageGb: 512, displayInches: 15.6, weightG: 1830 });
  });

  it("eezepc and Techroid: several fields in one value, read by their units", () => {
    expect(sheetOf("eezepc", rows([["Display", "6.67\" AMOLED, 2400 x 1080 resolution, 120Hz refresh rate"], ["Battery & Charging", "5500mAh (typ), 45W Turbo Charging"]])))
      .toMatchObject({ displayInches: 6.67, displayType: "AMOLED", refreshHz: 120, batteryMah: 5500, chargingW: 45 });
    expect(sheetOf("techroid", rows([["Battery", "5500mAh, 45W Turbo Charging (0-100% in ~50 mins)"], ["Rear Cameras", "200MP Main Camera, 8MP Ultra-Wide"]])))
      .toMatchObject({ batteryMah: 5500, chargingW: 45, mainCameraMp: 200 });
  });

  it("never a capacity from a value listing several variants, nor from a variant picker's text", () => {
    expect(sheetOf("priceoye", rows([["RAM", "4/6 GB"], ["Internal Memory", "64/128 GB"], ["Processor", "Mediatek Helio G85"], ["Screen Size", "6.7 Inches"]]))).toEqual({ chipset: "Mediatek Helio G85", chipsetTier: "mid", displayInches: 6.7 });
    expect(sheetOf("techroid", rows([["storage", "Choose an option8GB - 256GBClear"]]))).toBeNull();
    expect(sheetOf("techroid", rows([["Storage", "8GB - 256GB 12GB - 512GB"]]))).toBeNull();
  });

  it("only the stores whose pages were checked; Mega's marketing tables and AlfaMall are not read", () => {
    expect(SPEC_STORES).toEqual(["priceoye", "ishopping", "digimall", "paklap", "shophive", "techroid", "eezepc"]);
    expect(extractSpecs("mega", rows([["Processor", "Apple latest generation chip"]]))).toBeNull();
    expect(extractSpecs("alfamall", rows([["RAM", "8GB"]]))).toBeNull();
  });
});

describe("chipset tiers and the listing's own capacity", () => {
  it.each([
    ["Snapdragon 8 Elite", "flagship"], ["Apple M4", "flagship"], ["Intel Core i7-13620H", "upper-mid"], ["Intel Core Ultra 5 225U", "mid"],
    ["Helio G100", "mid"], ["Exynos 1330", "mid"], ["Dimensity 7300", "mid"], ["Unisoc T606", "entry"], ["Intel Core i3-1215U", "entry"],
  ])("%s is %s", (name, tier) => {
    expect(chipsetTier(name)).toBe(tier);
  });

  it("the title's RAM and storage name the variant sold, over a page's", () => {
    expect(withStatedCapacity({ ramGb: 6, batteryMah: 5000 }, { ramGb: 8, storageGb: 256 })).toEqual({ ramGb: 8, batteryMah: 5000, storageGb: 256 });
    expect(withStatedCapacity(null, { ramGb: null, storageGb: 128 })).toEqual({ storageGb: 128 });
    expect(withStatedCapacity(null, {})).toBeNull();
  });
});

describe("one vote per store when stores' pages disagree", () => {
  it("a marketplace listing one phone through three sellers does not outvote another store", async () => {
    const { mergeSpecSheets } = await import("../src/services/specsEngine.service.js");
    const offer = (id, platform, chipset) => ({ _id: id, platform, specSheet: { chipset } });
    const merged = mergeSpecSheets([
      offer("d1", "digimall", "Dimensity 7200 Pro / Dimensity 7300"),
      offer("d2", "digimall", "Dimensity 7200 Pro / Dimensity 7300"),
      offer("d3", "digimall", "Dimensity 7200 Pro / Dimensity 7300"),
      offer("p1", "priceoye", "Mediatek Dimensity 7300 Pro"),
    ], { preferId: "p1" });
    expect(merged.specs.chipset).toBe("Mediatek Dimensity 7300 Pro"); // one store each: the tie goes to the page's own listing
  });
});

describe("one model's specifications for all its variants (2026-11-10: three of four iPhones compared were nearly blank)", () => {
  it("variants of one model share a key; a Pro and a Pro Max, or a 4G and a 5G phone, do not", async () => {
    const { modelKeyOf } = await import("../src/services/specsEngine.service.js");
    const key = (t) => modelKeyOf(t, "smartphone");
    expect(key("Apple iPhone 17 Pro 256 GB PTA Approved")).toBe(key("APPLE IPHONE 17 PRO 512GB Cosmic Orange NON PTA"));
    expect(key("Apple iPhone 17 Pro")).toBe(key("Apple iPhone 17 Pro 1TB"));
    expect(key("Apple iPhone 17 Pro")).not.toBe(key("Apple iPhone 17 Pro Max 256GB"));
    expect(key("Samsung Galaxy A17 5G 8GB RAM 256GB")).not.toBe(key("Samsung Galaxy A17 8GB 256GB"));
    expect(key("Samsung Galaxy A17 8/256 | PTA Approved | Electronix Hub")).toBe(key("Samsung Galaxy A17 6GB RAM 128GB Storage PTA Approved"));
  });

  it("fills only what a variant's own sheet lacks, never its RAM or storage, and names the stores that added something", async () => {
    const { withModelSpecs, clearModelIndex } = await import("../src/services/specsEngine.service.js");
    clearModelIndex();
    const rows = [
      { title: "Apple iPhone 17 Pro", platform: "priceoye", productCategory: "smartphone", specSheet: { chipset: "Apple A19 Pro", chipsetTier: "flagship", batteryMah: 4252, ramGb: 12, storageGb: 256, displayInches: 6.3 } },
      { title: "Apple iPhone 17 Pro Max 256GB", platform: "priceoye", productCategory: "smartphone", specSheet: { batteryMah: 4832 } },
    ];
    const model = { find: () => ({ lean: async () => rows }) };
    const listing = { title: "Apple iPhone 17 Pro 512GB PTA Approved", productCategory: "smartphone" };
    const { specs, from } = await withModelSpecs({ displayInches: 6.3, mainCameraMp: 48 }, ["shophive"], listing, { model });
    expect(specs).toEqual({ displayInches: 6.3, mainCameraMp: 48, chipset: "Apple A19 Pro", chipsetTier: "flagship", batteryMah: 4252 }); // not the Pro Max's battery
    expect(from).toEqual(["shophive", "priceoye"]);
    clearModelIndex();
  });

  it("reads a thousands comma as part of the number, and a core count is no chip (the iPhone 17's '3,692 mAh', '6-core CPU')", () => {
    expect(normalizeSpecs({ Battery: "3,692 mAh" }).batteryMah).toBe(3692);
    expect(normalizeSpecs({ Processor: "6-core CPU" }).chipset).toBeUndefined();
    expect(normalizeSpecs({ Processor: "Octa-Core" }).chipset).toBeUndefined();
    expect(normalizeSpecs({ Processor: "6 Core Apple A18 Pro" })).toMatchObject({ chipset: "Apple A18 Pro", chipsetTier: "flagship" });
    expect(normalizeSpecs({ Processor: "Helio G100 (6nm)" }).chipset).toBe("Helio G100");
  });
});
