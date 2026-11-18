import { describe, it, expect } from "vitest";

import { attributeConflict, lineWords } from "../src/services/similarity.service.js";

// Same-product pairs of the labelled training set that the attribute veto split (found 2026-11-18), and the cases it must still split.
const conflict = (a, b) => attributeConflict(a, b, { ignoreUnstatedStorage: true });

describe("a number glued to the model word is still that number", () => {
  it("joins Buds3 FE and Buds 3 FE", () => {
    expect(conflict("Samsung Galaxy Buds3 FE", "Samsung Galaxy Buds 3 FE")).toBe(false);
  });

  it("still keeps a first generation apart from a numbered one", () => {
    expect(conflict("Samsung Galaxy Buds Pro", "Samsung Galaxy Buds 2 Pro")).toBe(true);
    expect(conflict("Samsung Galaxy Buds3 Pro", "Samsung Galaxy Buds 2 Pro")).toBe(true);
  });
});

describe("a strap or a charger is not a product line", () => {
  it("reads no line word in a watch's sport band or a power adapter", () => {
    expect(lineWords("Samsung Galaxy Watch 7 44mm Silver With Green Sport Band - SM-L310NZ").size).toBe(0);
    expect(lineWords("Apple Watch Series 10 46mm Sports Loop").size).toBe(0);
    expect(lineWords("Samsung EP-T2510 25W 3 Pin Power Adapter").size).toBe(0);
  });

  it("joins the same watch with and without its band described, and the same charger by either name", () => {
    expect(conflict("Samsung Galaxy Watch 7 44mm", "Samsung Galaxy Watch 7 44mm Silver With Green Sport Band - SM-L310NZ")).toBe(false);
    expect(conflict("Samsung 3 Pin 25W Travel Adapter", "Samsung EP-T2510 25W 3 Pin Power Adapter")).toBe(false);
  });

  it("still reads Sport and Power as lines when they name the model", () => {
    expect(conflict("Xiaomi Redmi 9A", "Xiaomi Redmi 9A Sport")).toBe(true);
    expect(conflict("Xiaomi Redmi 9", "Xiaomi Redmi 9 Power")).toBe(true);
    expect(lineWords("Galaxy Watch 8 Classic").has("classic")).toBe(true);
  });
});
