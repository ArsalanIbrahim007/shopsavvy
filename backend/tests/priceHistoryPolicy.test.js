import { describe, it, expect } from "vitest";
import { shouldAppendEntry } from "../src/models/priceHistory.model.js";

const at = (iso) => new Date(iso);

describe("shouldAppendEntry", () => {
  const last = { price: 1000, originalPrice: 1200, recordedAt: at("2026-09-29T06:00:00Z") };

  it("records the first observation", () => {
    expect(shouldAppendEntry(undefined, { price: 1000, recordedAt: at("2026-09-29T06:00:00Z") })).toBe(true);
  });

  it("skips a repeat scrape on the same day at the same price", () => {
    const next = { price: 1000, originalPrice: 1200, recordedAt: at("2026-09-29T10:00:00Z") };
    expect(shouldAppendEntry(last, next)).toBe(false);
  });

  it("records an unchanged price on a later day, so history accumulates", () => {
    const next = { price: 1000, originalPrice: 1200, recordedAt: at("2026-09-30T06:00:00Z") };
    expect(shouldAppendEntry(last, next)).toBe(true);
  });

  it("records a price change even within the same day", () => {
    const next = { price: 900, originalPrice: 1200, recordedAt: at("2026-09-29T07:00:00Z") };
    expect(shouldAppendEntry(last, next)).toBe(true);
  });

  it("records a change in the claimed original price", () => {
    const next = { price: 1000, originalPrice: 1500, recordedAt: at("2026-09-29T07:00:00Z") };
    expect(shouldAppendEntry(last, next)).toBe(true);
  });

  it("treats a missing original price as null on both sides", () => {
    const bare = { price: 1000, recordedAt: at("2026-09-29T06:00:00Z") };
    const next = { price: 1000, originalPrice: null, recordedAt: at("2026-09-29T08:00:00Z") };
    expect(shouldAppendEntry(bare, next)).toBe(false);
  });

  it("uses the Pakistan calendar day, not UTC, for the boundary", () => {
    // 18:30 UTC is 23:30 PKT on the 29th; 19:30 UTC is 00:30 PKT on the 30th.
    const before = { price: 1000, recordedAt: at("2026-09-29T18:30:00Z") };
    const after = { price: 1000, recordedAt: at("2026-09-29T19:30:00Z") };
    expect(shouldAppendEntry(before, after)).toBe(true);
    // Same UTC hour range, same PKT day: no new entry.
    const early = { price: 1000, recordedAt: at("2026-09-29T00:10:00Z") };
    const later = { price: 1000, recordedAt: at("2026-09-29T18:00:00Z") };
    expect(shouldAppendEntry(early, later)).toBe(false);
  });
});
