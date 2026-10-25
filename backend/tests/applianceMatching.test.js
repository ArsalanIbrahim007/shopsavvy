// Air conditioners, refrigerators, washing machines and monitors as categories of their own (2026-10-22): the category reader, the
// appliance attribute readers and the matching rule built on them. Titles are live ones from the stores unless marked.
import { describe, it, expect } from "vitest";

import { detectCategory, detectQueryCategory } from "../src/scrapers/productCategory.js";
import {
  extractTonnage, extractCapacityKg, extractVolumeLitres, extractInverter, extractApplianceType, extractModelNumbers, isApplianceTitle,
  extractFridgeSeries,
} from "../src/services/productAttributes.service.js";
import { applianceConflict, attributeConflict, hyphenModelCodes } from "../src/services/similarity.service.js";
import { extractModelCodes } from "../src/services/normalizeTitle.service.js";

const category = (title) => detectCategory(title).category;
const conflict = (a, b) => attributeConflict(a, b, { ignoreUnstatedStorage: true });

describe("category reader", () => {
  it("files air conditioners, refrigerators, washing machines and monitors under their own names", () => {
    expect(category("SAMSUNG AR18ASFZGWKY 1.5 TON INVERTER T3 SPLIT AC")).toBe("air_conditioner");
    expect(category("Gree 1 Ton GS-12PITH11W")).toBe("air_conditioner"); // nothing but the tonnage says AC
    expect(category("Dawlance 2.0 Ton Glamour Plus Series Inverter Floor Standing AC")).toBe("air_conditioner");
    expect(category("Samsung 1.5 Ton Wall Mount AC (AR18NSFPFWK2PM)")).toBe("air_conditioner");
    expect(category("Haier E-Star Freezer-On-Top Refrigerator 7 Cu Ft (HRF-246EBS)")).toBe("refrigerator");
    expect(category("Dawlance 10CFT DF-300SD Single Door Inverter Deep Freezer")).toBe("refrigerator");
    expect(category("Dawlance 91999 Digital Pro Double Door Refrigerator Magnetic Red")).toBe("refrigerator");
    expect(category("Samsung WA21CK6745BVRT 21KG Automatic Top Load Washing Machine")).toBe("washing_machine");
    expect(category("Smeg LSF147E washer dryer Freestanding Front-load White E")).toBe("washing_machine");
    expect(category("Super Asia SA 241 Twin Tub Washing Machine (7 KG)")).toBe("washing_machine");
    expect(category("Dahua LM27-E231 27-Inch Full HD 1080p 165Hz Borderless IPS Gaming Monitor (Black, NEW)")).toBe("monitor");
  });

  it("keeps out the accessories and other products named after them", () => {
    expect(category("AC Stabilizer 5000W")).not.toBe("air_conditioner");
    expect(category("AC Remote Control Universal")).not.toBe("air_conditioner");
    expect(category("Samsung Fridge Magnet")).not.toBe("refrigerator");
    expect(category("CoolBell CB-2102 13.3\" Top Load Laptop Bag")).not.toBe("washing_machine");
    expect(category("Bosch Pressure Washer")).not.toBe("washing_machine");
    expect(category("VGR V-201 Rechargeable & LED Display Precision Grooming Kit")).not.toBe("monitor");
    expect(category("Mcdodo CA-3610 Type-C Fast Charging Data Cable with Digital Display")).not.toBe("monitor");
    expect(category("Omron Blood Pressure Monitor HEM-7120")).not.toBe("monitor"); // made up
    expect(category("Dawlance Microwave Oven 30L")).toBe("appliance"); // the rest of the appliances stay where they were
  });

  it("reads searches the same way", () => {
    expect(detectQueryCategory("1.5 ton inverter ac").category).toBe("air_conditioner");
    expect(detectQueryCategory("dawlance refrigerator").category).toBe("refrigerator");
    expect(detectQueryCategory("washing machine").category).toBe("washing_machine");
    expect(detectQueryCategory("gaming monitor").category).toBe("monitor");
  });
});

describe("appliance attribute readers", () => {
  it("tonnage, with decimals and the ways stores write it", () => {
    expect(extractTonnage("Samsung 1.5 Ton Inverter AC")).toBe(1.5);
    expect(extractTonnage("HAIER HSU-13HFCS W 1.0 TON TRIPLE INVERTER")).toBe(1);
    expect(extractTonnage("Haier 2-Ton Split")).toBe(2);
    expect(extractTonnage("Dawlance 4.0 Ton Designer Plus")).toBe(4);
    expect(extractTonnage("Samsung 55 Inch TV")).toBeNull();
    expect(extractTonnage("Gree 12 Tons")).toBeNull(); // not an AC size
  });

  it("drum weight: one value, or two for a washer-dryer", () => {
    expect(extractCapacityKg("Haier 11.5KG Front Load Washing Machine")).toEqual([11.5]);
    expect(extractCapacityKg("Samsung Front Load Washer+Dryer 11.5KG+8KG WD11BB")).toEqual([8, 11.5]);
    expect(extractCapacityKg("Super Asia SA 241 Twin Tub Washing Machine (7 KG)")).toEqual([7]);
    expect(extractCapacityKg("Washing Machine")).toBeNull();
    expect(extractCapacityKg("Dumbbell 2kg")).toBeNull(); // not a drum
  });

  it("volume in litres, from litres or cubic feet", () => {
    expect(extractVolumeLitres("Samsung RR39M73107F/SG Digital Inverter 375 Ltr Refrigerator")).toBe(375);
    expect(extractVolumeLitres("Samsung Top Mount Freezer with Twin Cooling, 540L-RT53DG7B10B1FA")).toBe(540);
    expect(extractVolumeLitres("Haier HRF-276 EBS 11 Cuft Top Mount Refrigerator")).toBe(Math.round(11 * 28.3168));
    expect(extractVolumeLitres("Dawlance 20 CFT Top Mount Inverter Refrigerator")).toBe(Math.round(20 * 28.3168));
    expect(extractVolumeLitres("Haier 9 cu ft Refrigerator")).toBe(Math.round(9 * 28.3168));
    expect(extractVolumeLitres("Samsung 43 LED TV")).toBeNull();
  });

  it("inverter or not, and the kind within the category", () => {
    expect(extractInverter("Gree 1 Ton Non-Inverter")).toBe("non_inverter");
    expect(extractInverter("Haier 1.5 Ton DC Inverter")).toBe("inverter");
    expect(extractInverter("Gree 1 Ton GS-12PITH11W")).toBeNull();
    expect(extractApplianceType("Orient Window AC 1 Ton")).toBe("window");
    expect(extractApplianceType("Haier 1.5 Ton DC Inverter Split AC")).toBe("split");
    expect(extractApplianceType("Samsung 21KG Automatic Top Load Washing Machine")).toBe("top");
    expect(extractApplianceType("Super Asia SA-244 8KG semi automatic twin-tub washing machine")).toBe("twin");
    expect(extractApplianceType("Dawlance 91999 Avante+ Double Door Refrigerator")).toBe("double_door");
    expect(extractApplianceType("Dawlance 10CFT DF-300SD Deep Freezer")).toBe("freezer");
    expect(extractApplianceType("Split or Window AC 1 Ton")).toBeNull(); // names both: unknown
  });
});

describe("matching", () => {
  it("separates appliances that differ in tonnage, drum, volume, inverter type or kind", () => {
    expect(conflict("Haier 1.0 Ton Inverter Series AC (HSU12HNI)", "Haier 1.5 Ton Inverter Series AC (HSU12HNI)")).toBe(true);
    expect(conflict("Dawlance DW 6550 W Twin Tub Washing Machine 8Kg", "Dawlance DW 6550 W Twin Tub Washing Machine 10Kg")).toBe(true);
    expect(conflict("Samsung Washer Dryer 11.5KG+8KG WD11BB", "Samsung Washer Dryer 11.5KG WD11BB")).toBe(true);
    expect(conflict("Haier Refrigerator 350 Ltr HRF-336", "Haier Refrigerator 450 Ltr HRF-336")).toBe(true);
    expect(conflict("Gree 1 Ton Inverter Pular", "Gree 1 Ton Non-Inverter Pular")).toBe(true);
    expect(conflict("Orient 1 Ton Window AC Ultron", "Orient 1 Ton Split AC Ultron")).toBe(true);
  });

  it("keeps together the same appliance written differently", () => {
    expect(applianceConflict("Haier 1.5 Ton Inverter AC", "Haier 1.5 ton DC Inverter Split AC")).toBe(false); // split stated once
    expect(applianceConflict("Haier HRF-276 11 Cuft Refrigerator", "Haier HRF-276 Refrigerator 311 Ltr")).toBe(false); // 11 cu ft = 311 L
    expect(applianceConflict("Samsung 8KG Washing Machine", "Samsung 8 kg Top Load Washing Machine")).toBe(false);
    expect(applianceConflict("Samsung 1.5 Ton AC", "Samsung AC AR18")).toBe(false); // one side silent
  });

  it("no longer takes a drum weight for a model code", () => {
    expect([...extractModelCodes("Haier 11.5KG Front Load Washing Machine HWM 115")]).not.toContain("5kg");
    expect([...extractModelCodes("Samsung Top Mount Freezer 540L-RT53DG7B10B1FA")]).not.toContain("540l");
  });
});

// The wrong merges the appliance evaluation found (2026-10-22, GROUPING_EVALUATION_APPLIANCES.md), and the same products written
// differently, which must stay together. Titles are the labelled or live ones unless marked.
describe("model codes, model numbers and series (evaluation fixes, 2026-10-26)", () => {
  it("reads hyphenated model codes that normalisation splits", () => {
    expect([...hyphenModelCodes("PEL PRLP-21860 Life Pro 12 CFT Top Mount Refrigerator")]).toEqual(["prlp-21860"]);
    expect([...hyphenModelCodes("Haier Top Load Automatic Dryer Machine 6KG (HD-60-50)")]).toEqual(["hd-60-50"]);
    expect([...hyphenModelCodes("Lenovo ThinkVision T24-4v 23.8-Inch FHD")]).toEqual(["t24-4v"]);
  });

  it("does not take a capacity, a tier word or a seller's code for one", () => {
    expect(hyphenModelCodes("Haier-10 kg-Fully Automatic-Top Loading Washing Machine").size).toBe(0);
    expect(hyphenModelCodes("Samsung Galaxy S24-256GB").size).toBe(0);
    expect(hyphenModelCodes("TCL 12T3-PRO-11 Breeze In Series").size).toBe(0);
    expect(hyphenModelCodes("Dawlance Aura 15 Inverter Split Air Conditioner 1.0 Ton White - ISPK-0577").size).toBe(0);
    expect(hyphenModelCodes("Lenovo Yoga 2-in-1 Laptop").size).toBe(0); // made up
  });

  it("splits appliances whose model codes differ", () => {
    expect(conflict("PEL PRLP-21860 Life Pro 12 CFT Top Mount Refrigerator", "PEL PRLP-6460 Life Pro 12 CFT Top Mount Refrigerator")).toBe(true);
    expect(conflict(
      "Dawlance Chrome Pro Inv Freezer-On-Top Refrigerator (REF-9149)", "Dawlance Chrome Pro Inv Freezer-On-Top Refrigerator (REF-9140)",
    )).toBe(true);
    expect(conflict("DAWLANCE WASHING MACHINE DW-10095 GB TWIN TUB BLACK LID", "Dawlance Twin Tub Washing Machine (DW-6550W)")).toBe(true);
    expect(conflict(
      "Lenovo ThinkVision T24-40 23.8-Inch FHD 1080p 120Hz IPS Panel Monitor", "Lenovo ThinkVision T24-4v 23.8-Inch FHD 1080p 120Hz IPS Panel Monitor",
    )).toBe(true);
  });

  it("keeps one model together across a unit version, a dropped suffix, a colour letter or another store prefix", () => {
    expect(conflict("TCL 1.5 Ton Miracle Series AC (TAC-18T3B-2)", "TCL 1.5 Ton Miracle Series AC (TAC-18T3B)")).toBe(false);
    expect(conflict("Haier 1.0 Ton Turbo Cool Series(HSU-12CFCM-013L(W)", "Haier 1.0 Ton Turbo Cool (HSU-12CFCM/013L(W))")).toBe(false);
    expect(conflict("Haier Single Door Inverter Deep Freezer HDF-465 - 18 CFT", "Haier Single Door Inverter Deep Freezer HDF-465INV")).toBe(false);
    expect(conflict("Dawlance Top Load Automatic Washing Machine AWM DWT-1470 PL", "Dawlance Top-Load Automatic Washing Machine (DWT-1470PL)")).toBe(false);
    expect(conflict("Dawlance Twin Tub Washing Machine (DW-6550C)", "Dawlance Twin Tub Washing Machine (DW-6550W)")).toBe(false);
    expect(conflict(
      "Haier Twin Tub Top Load Semi Automatic Washing Machine 10KG (HTW-100-196E)", "HAIER W.M (HWM-100-196E) TWIN TUB",
    )).toBe(false);
  });

  it("reads an appliance's model numbers however the code is written", () => {
    expect([...extractModelNumbers("Dawlance DWT 9560 Top Load Washing Machine 10 KG Capacity")]).toEqual(["9560"]);
    expect([...extractModelNumbers("HWM 100-826S6 / Haier -10kg/ Quick Wash Series / 10 Years Brand Warranty")]).toEqual(["100", "826"]);
    expect([...extractModelNumbers("Dawlance Chrome FH Refrigerator 12.5 Cu Ft (9169-WB-FH) - ISPK-0577")]).toEqual(["9169"]);
    expect([...extractModelNumbers("Dawlance DW 10500 Semi Automatic Washing Machine Brand New Box Pack 100% Original")]).toEqual(["10500"]);
    expect([...extractModelNumbers("TCL FreshIN 3.0 Series Inverter Split Air Conditioner 1.0 Ton (2025)")]).toEqual([]);
  });

  it("splits two appliances whose model numbers differ, and not one whose numbers the other contains", () => {
    expect(conflict("DAWLANCE DWT-1165PL TOP LOAD WASHING MACHINE", "Dawlance DWT 9560 Top Load Washing Machine 10 KG Capacity")).toBe(true);
    expect(conflict(
      "DAWLANCE Acce Pro Glass Door Inverter Freezer-on-top Refrigerator (9173-WB)-Crimson Red",
      "DAWLANCE Acce Pro Glass Door Inverter Freezer-on-top Refrigerator (9193-WB)-Crimson Red",
    )).toBe(true);
    expect(conflict(
      "Haier Fully Automatic Top load Washing Machine 10 Kg (HWM 100-826)", "Haier Top Load Automatic Washing Machine (HWM-100-1269)",
    )).toBe(true); // 100 (the drum) shared, 826 against 1269
    expect(conflict("Dawlance DW 6550 C Twin Tub Semi Automatic Washing Machine", "Dawlance Twin Tub Washing Machine (DW-6550C)")).toBe(false);
    expect(conflict(
      "Haier Top Load Fully Automatic Washing Machine 15KG HWM 150-826", "Haier Top Load fully Automatic Washing Machine 15KG HWM150-826",
    )).toBe(false);
  });

  it("compares model numbers only between two appliance titles", () => {
    expect(isApplianceTitle("Dawlance Acce Pro Glass Door Inverter Freezer-on-top Refrigerator (9173-WB)")).toBe(true);
    expect(isApplianceTitle("Dell Latitude 5440 Laptop Core i5 1335U")).toBe(false);
    expect(applianceConflict("Dell Latitude 5440 Laptop", "Dell Latitude 5540 Laptop")).toBe(false); // left to the other rules
  });

  it("splits two air conditioners of different series", () => {
    expect(conflict(
      "Dawlance 1.5 Ton Magna T3 Milky White Textured Series Inverter Split AC", "Dawlance 1.5 Ton Hyper T3 White Series Inverter Split AC",
    )).toBe(true);
    expect(conflict(
      "Dawlance Sprinter X 30 1.5 Ton Inverter Split Air Conditioner", "Dawlance Elegance X Inverter Split Air Conditioner 1.5 Ton",
    )).toBe(true);
    expect(conflict(
      "TCL 18T5 SMT-C BreezeIN Smart 1.5 Ton Inverter Air Conditioner", "TCL TAC-18T5 FreshIN 3.0 1.5 Ton Inverter Split Air Conditioner (2025)",
    )).toBe(true); // the short code 18T5 is shared, the series is not
    expect(conflict("Dawlance 1.0 Ton Infinity Plus Series AC (15)", "Dawlance 1.0 Ton Designer Plus Series Inverter AC (15)")).toBe(true);
  });

  it("keeps one series together, and leaves a title naming no series or two alone", () => {
    expect(conflict(
      "Dawlance 1.0 Ton Powercon X Series Inverter Split AC", "Dawlance Powercon X DC Inverter Split AC 1 Ton Powercon X 15 (T3)",
    )).toBe(false);
    expect(conflict(
      "TCL 12T5 FreshIN 3.0 1Ton Inverter Air Conditioner", "TCL FreshIN 3.0 Series Inverter Split Air Conditioner 1.0 Ton (TAC-12T5)",
    )).toBe(false);
    expect(conflict(
      "Dawlance (SPRINTER X INVERTER 15) T3 Inverter 1 Ton Inverter Split AC", "Dawlance 1 Ton Sprinter/Powercon 15 T3 Inverter AC",
    )).toBe(false);
    expect(conflict("Dawlance 1.5 Ton Inverter Split AC", "Dawlance 1.5 Ton Magna T3 Inverter Split AC")).toBe(false); // made up
    // The same full model code outranks a series word one store got wrong.
    expect(conflict("TCL 1.0 Ton Elite Series AC (TAC-12T3-Pro)", "TCL 1.0 Ton T-Pro Series AC (TAC-12T3-PRO-2)")).toBe(false);
    expect(applianceConflict("Dawlance Magna Wall Clock", "Dawlance Hyper Wall Clock")).toBe(false); // made up: no tonnage, not ACs
  });

  it("splits refrigerators of different series at the same size", () => {
    expect(extractFridgeSeries("Dawlance 9178LF 14 Cu Ft Avante+ Refrigerator")).toEqual(new Set(["avanteplus"]));
    expect(extractFridgeSeries("Dawlance Avante Noir Freezer-On-Top Refrigerator 14 CFT (9178LF)")).toEqual(new Set(["avante"]));
    expect(conflict("Dawlance 9178LF 14 Cu Ft Acce Refrigerator", "Dawlance 9178LF 14 Cu Ft Chrome Refrigerator")).toBe(true);
    expect(conflict("Dawlance 9193LF 18 Cu Ft Avante Refrigerator", "Dawlance 9193LF 18 Cu Ft Avante+ Refrigerator")).toBe(true);
    expect(conflict("DAWLANCE REFRIGERATOR 9191WB CHROME PEARL COPPER", "Dawlance Refrigerator 9191WB Chrome")).toBe(false);
  });
});
