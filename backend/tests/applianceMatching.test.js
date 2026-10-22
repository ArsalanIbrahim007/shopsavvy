// Air conditioners, refrigerators, washing machines and monitors as categories of their own (2026-10-22): the category reader, the
// appliance attribute readers and the matching rule built on them. Titles are live ones from the stores unless marked.
import { describe, it, expect } from "vitest";

import { detectCategory, detectQueryCategory } from "../src/scrapers/productCategory.js";
import {
  extractTonnage, extractCapacityKg, extractVolumeLitres, extractInverter, extractApplianceType,
} from "../src/services/productAttributes.service.js";
import { applianceConflict, attributeConflict } from "../src/services/similarity.service.js";
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
