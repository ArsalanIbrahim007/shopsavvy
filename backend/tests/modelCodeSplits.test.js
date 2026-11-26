// One appliance as several products (2026-11-26): Dawlance's DW-550-AF air-fryer microwave in 10 products (27 listings) and Super
// Asia's SD-550 spinner in 3, because stores write the code "DW-550-AF", "DW-550 AF", "DW550", "Dw 550 Af", "DW-550AF", and no rule
// read a letters-and-number code. Audit: src/scripts/ml/20-audit-code-splits.js.
import { describe, it, expect } from "vitest";

import { attributeConflict, prefixedModelCodes, sharedPrefixedCode } from "../src/services/similarity.service.js";
import { mlMatchStrategy, sharedModelCode } from "../src/services/similarityModel.service.js";
import { groupListingsByProduct } from "../src/services/productGrouping.service.js";
import { detectCategory } from "../src/scrapers/productCategory.js";
import { extractApplianceType } from "../src/services/productAttributes.service.js";

const veto = (a, b) => attributeConflict(a, b, { ignoreUnstatedStorage: true });
const item = (title, price) => ({ title, price });

describe("a maker's letters-and-number code, however a store writes it", () => {
  it.each([
    ["Dawlance MWO DW-550 AF Air Fryer Microwave Oven", "dw550", "af"],
    ["Dawlance Airfryer Series Microwave 30 Ltr (DW-550-AF)", "dw550", "af"],
    ["Dawlance Air Fryer Microwave Oven DW-550AF", "dw550", "af"],
    ["Dawlance Dw 550 Af Air Fryer Microwave Oven", "dw550", "af"],
    ["DAWLANCE MICROWAVE ( AIR FRYER ) 28LTR DW550", "dw550", null],
    ["SUPER ASIA 10KG SPIN DRYER MACHINE Model SD-550", "sd550", null],
    ["Super Asia SD-550 Easy Spin 10kg", "sd550", null], // "Easy" is a word, not a suffix
    ["Haier HRF-538 IFPA", "hrf538", "ifpa"],
  ])("%s -> %s %s", (title, base, suffix) => {
    expect(prefixedModelCodes(title).get(base)).toBe(suffix);
  });

  it("is not a unit, a brand and number, a longer code, or a store's reference", () => {
    for (const title of ["Haier 55 Inch LED", "Dawlance 9178 Avante", "Haier HWM 80-1217E", "Samsung TV (SNS70)", "TCL TV ON INSTALLMENTS-UE001", "Apple Airpods By Tech House26", "Haier 10kg Top Load", "Samsung LED L 500"]) {
      expect([...prefixedModelCodes(title).keys()].filter((k) => !/^hwm/.test(k))).toEqual([]);
    }
    // the seller's ISPK-0509 is not read; VGR's own one-letter code is
    expect([...prefixedModelCodes("VGR V-964 Trimmer - ISPK-0509").keys()]).toEqual(["v964"]);
  });

  it("reads a one-letter code glued or hyphened to three digits or more (LOGIN L-204 / L206, 2026-11-26)", () => {
    expect(prefixedModelCodes("LOGIN WIRELESS BUDS L-204 100% Original").get("l204")).toBeNull();
    expect(veto("LOGIN WIRELESS BUDS L-204", "LOGIN WIRELESS BUDS L206")).toBe(true);
    expect(veto("LOGIN WIRELESS BUDS L-204 Box", "LOGIN BUDS L204")).toBe(false);
    expect(sharedModelCode(item("LOGIN WIRELESS BUDS L207 Original Box Pack ByTech House100", 4499), item("LOGIN WIRELESS BUDS L206 Original Box Pack ByTech House100", 3759))).toBeNull();
  });

  it("joins one product's spellings, and not two versions or two sellers' different products", () => {
    expect(sharedModelCode(item("Dawlance MWO DW-550 AF Air Fryer Microwave Oven", 54499), item("Dawlance Airfryer Series Microwave 30 Ltr (DW-550-AF)", 48250))).toBe("dw550");
    expect(sharedModelCode(item("DAWLANCE MICROWAVE ( AIR FRYER ) DW550", 52900), item("Dawlance Microwave Oven DW-550-AF Air Fryer Black", 50500))).toBe("dw550");
    expect(sharedModelCode(item("Super Asia Easy Spin Dryer Machine 10KG SD-550", 28699), item("SUPER ASIA 10KG SPIN DRYER MACHINE Model SD-550", 34600))).toBe("sd550");
    expect(sharedPrefixedCode("Haier HRF-538 IFPA", "Haier HRF-538IAPA")).toBeNull(); // two finishes
    // a code without its suffix only within 10%
    expect(sharedModelCode(item("Haier HRF-538 Refrigerator", 190000), item("Haier HRF-538IAPA Refrigerator", 230000))).toBeNull();
    expect(sharedModelCode(item("VGR V-964 Trimmer - ISPK-0509", 3349), item("VGR V-129 Clipper - ISPK-0509", 4299))).toBeNull();
  });

  it("groups the DW-550-AF's listings as one product", () => {
    const m = (id, platform, title, price) => ({ _id: id, platform, title, price, productCategory: "appliance", inStock: true });
    const groups = groupListingsByProduct([
      m("1", "shophive", "Dawlance MWO DW-550 AF Air Fryer Microwave Oven", 54499),
      m("2", "ishopping", "Dawlance Airfryer Series Microwave 30 Ltr (DW-550-AF)", 48250),
      m("3", "japanelectronics", "Dawlance Microwave Oven DW-550-AF Air Fryer Black", 45500),
      m("4", "digimall", "Dawlance Air Fryer Microwave Oven DW-550AF", 56249),
      m("5", "jalalelectronics", "DAWLANCE MICROWAVE AIRFRYER DW-550 AF", 49000),
      m("6", "eezepc", "Dawlance DW-550 AF Air Fryer Microwave Oven", 52990),
    ], { matchStrategy: mlMatchStrategy });
    expect(groups).toHaveLength(1);
  });
});

describe("the veto no longer splits one product", () => {
  it("reads 'DW-550AF' and 'DW-550' as one code in either order", () => {
    expect(veto("Dawlance DW-550AF", "Dawlance DW-550 AF")).toBe(false);
    expect(veto("Dawlance DW-550AF", "Dawlance DW-550")).toBe(false);
    expect(veto("Haier HRF-538IFPA", "Haier HRF-538 IFPA")).toBe(false);
    expect(veto("DWT-1470", "DWT-1480")).toBe(true);
  });
  it("an air fryer is not an Air model, and 'Power Full Motor' is no Power line", () => {
    expect(veto("Dawlance MWO DW-550 AF Air Fryer Microwave Oven", "Dawlance Airfryer Series Microwave 30 Ltr (DW-550-AF)")).toBe(false);
    expect(veto("Apple iPad Air 11", "Apple iPad 11")).toBe(true);
    expect(veto("Super Asia SD-550 Easy Spin 10kg Spin Dryer", "Super Asia SD-550 Spin Power Full Spinner 10KG Power Full Motor")).toBe(false);
    expect(veto("Redmi 9 Power", "Redmi 9")).toBe(true);
  });
});

describe("a spinner is laundry", () => {
  it("files spin dryers with washing machines, not hair dryers or toys", () => {
    expect(detectCategory("Super Asia SD-550 Spin Power Full Spinner 10KG").category).toBe("washing_machine");
    expect(detectCategory("SUPER ASIA 10KG SPIN DRYER MACHINE Model SD-550").category).toBe("washing_machine");
    expect(detectCategory("Dansi Hair Dryer").category).not.toBe("washing_machine");
    expect(detectCategory("Fidget Spinner Toy").category).not.toBe("washing_machine");
  });
});

describe("two models of one maker stay apart (the extension's HWM 80 CS, 2026-11-26)", () => {
  it("a code going on differently, the same letters on another number, a combo", () => {
    const daraz = "Haier 8 Kg- Twin Tub Semi Automatic Washing Machine- HWM 80 CS - 10 Years Brand Warranty";
    expect(veto(daraz, "Haier Semi Automatic Single Tub Washing Machine 8KG (HWM-80-60) - Best Price - With FREE SURPRISE GIFT - HomeCart")).toBe(true);
    expect(veto(daraz, "Haier HWM80-CS 8KG Twin Tub Semi Automatic Washing Machine")).toBe(false);
    expect(veto("Westpoint Drum Type Dry Vacuum Cleaner with Blower WF-103 0% PROCESSING FEES 0% MARKUP", "Westpoint Air Fryer WF 5254 0% PROCESSING FEES 0% MARKUP")).toBe(true);
    expect(veto("Haier 12 Kg HW120-BP12357S8 Front Load", "Haier Front Load Automatic Washing Machine (HW-90-BP12357-S8)")).toBe(true);
    expect(veto("Gaba National 3 in 1 Blender GN-8224/GN-8324", "Gaba National Blender GN-8324")).toBe(false);
    expect(veto("Westpoint WF-142 Ceramic Cooker + WF-5350 Rice Cooker 11.11 Combo Deal", "Westpoint Professional Rice Cooker WF-5350")).toBe(true);
  });

  it("but one product's listings agree, whatever else their titles say", () => {
    expect(veto("Haier 20L - HMW-20DGS - 20L Digital Grill Microwave Oven 0% Markup 0%Processing On Installments", "Haier 20 Ltr Grill Series HMW-20DGS Microwave Oven")).toBe(false);
    expect(veto("Haier 20 Liters Microwave Grill Oven HMW20DGS", "HAIER MICROWAVE HMW-20DGS SILVER 20LTR,1300WATT,WITH GRILL")).toBe(false);
    expect(veto("Haier Air Fryer HAF50MB 5 Liter 1500W | 360 Hot Air Circulation", "Haier Manual Air Fryer 5 Ltr (HAF50MB)")).toBe(false);
    expect(veto("Haier- Manual Air Fryer 5L - HAF-50MB - (SNS36)", "Haier Manual Air Fryer 5 Ltr (HAF50MB)")).toBe(false);
    expect(veto("Haier HWM 80 CS 8 kg Twin Tub Semi Automatic Washing Machine ON INSTALLMENT-UE002", "HAIER HWM80-CS WASHING MACHINE TWIN TUB 8KG WHITE")).toBe(false);
    expect(veto("Dawlance - Top Load Water Dispenser - 3.5L Cold Tank, 1.6L Hot Tank - WD-1051 HC - Glass Door", "Dawlance 2 Taps Water Dispenser White - (WD-1051 HC)")).toBe(false);
    expect(veto("Sony WH1000XM6 Wireless", "Sony WH-1000XM6 Wireless Noise Cancelling")).toBe(false);
    // and still not two different ones
    expect(veto("Haier HMW-20DGS Microwave", "Haier HMW-20MBS Microwave")).toBe(true);
    expect(veto("Apple iPad Air 11", "Apple iPad 11")).toBe(true);
    expect(veto("Galaxy Z Fold 5", "Galaxy Z Fold 7")).toBe(true);
  });

  it("reads a single tub apart from a twin tub", () => {
    expect(extractApplianceType("Haier Semi Automatic Single Tub Washing Machine 8KG")).toBe("single");
    expect(extractApplianceType("Haier 8 Kg Twin Tub Semi Automatic Washing Machine")).toBe("twin");
    expect(extractApplianceType("Haier Semi Automatic Washing Machine 8KG")).toBe("twin");
  });
});
