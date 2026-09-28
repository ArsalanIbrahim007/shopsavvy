import { describe, it, expect } from "vitest";
import { calculateAvailabilityScore } from "../../src/ranking/scores/availabilityScore.js";

describe("calculateAvailabilityScore", () => {
  it("gives full marks for in_stock (string form)", () => {
    expect(calculateAvailabilityScore({ availability: "in_stock" }, 10)).toBe(10);
  });

  it("gives zero for out_of_stock (string form)", () => {
    expect(calculateAvailabilityScore({ availability: "out_of_stock" }, 10)).toBe(0);
  });

  it("gives partial credit for limited_stock", () => {
    expect(calculateAvailabilityScore({ availability: "limited_stock" }, 10)).toBe(7);
  });

  it("falls back to the boolean inStock field when availability string is absent", () => {
    expect(calculateAvailabilityScore({ inStock: true }, 10)).toBe(10);
    expect(calculateAvailabilityScore({ inStock: false }, 10)).toBe(0);
  });

  it("gives a neutral score, not full marks, when stock state is entirely unknown", () => {
    // Documented in the source: an unknown stock state previously defaulted
    // to full marks, which is not the same as confirmed availability.
    expect(calculateAvailabilityScore({}, 10)).toBe(5);
    expect(calculateAvailabilityScore({ availability: "unknown" }, 10)).toBe(5);
  });

  it("forces zero when the listing itself is marked inactive, regardless of stock state", () => {
    expect(calculateAvailabilityScore({ isActive: false, inStock: true }, 10)).toBe(0);
  });
});
