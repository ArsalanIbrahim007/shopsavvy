import { describe, it, expect } from "vitest";
import { allowedPlatforms, STORE_ROUTING } from "../src/scrapers/storeRouting.js";

describe("allowedPlatforms", () => {
  it("returns null for 'other' (unrestricted)", () => {
    expect(allowedPlatforms("other")).toBeNull();
  });

  it("returns null for an unknown category (unrestricted)", () => {
    expect(allowedPlatforms("unknown_xyz")).toBeNull();
  });

  it("smartphone excludes ishopping, paklap, telemart", () => {
    const set = allowedPlatforms("smartphone");
    expect(set).not.toBeNull();
    expect(set.has("ishopping")).toBe(false);
    expect(set.has("paklap")).toBe(false);
    expect(set.has("telemart")).toBe(false);
  });

  it("smartphone includes priceoye, mega, shophive, w11stop", () => {
    const set = allowedPlatforms("smartphone");
    expect(set.has("priceoye")).toBe(true);
    expect(set.has("mega")).toBe(true);
    expect(set.has("shophive")).toBe(true);
    expect(set.has("w11stop")).toBe(true);
  });

  it("headphones includes all platforms (none skipped)", () => {
    const set = allowedPlatforms("headphones");
    const all = ["priceoye", "mega", "shophive", "w11stop", "eezepc", "ishopping", "paklap", "telemart"];
    all.forEach((p) => expect(set.has(p)).toBe(true));
  });

  it("every category in STORE_ROUTING returns a non-empty Set", () => {
    for (const [cat, set] of Object.entries(STORE_ROUTING)) {
      expect(set.size).toBeGreaterThan(0, `${cat} has empty platform set`);
    }
  });
});