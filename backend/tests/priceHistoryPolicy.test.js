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

// 2026-11-08: the catalogue refresh records tens of thousands of prices a night, in batches.
describe("PriceHistory.recordPrices", () => {
  it("reads the histories in one query, and per listing appends by the same rule, keeps the lowest and highest, or creates it", async () => {
    const { default: PriceHistory } = await import("../src/models/priceHistory.model.js");
    const { vi } = await import("vitest");
    const yesterday = { _id: "h1", platform: "mega", sourceUrl: "https://mega.pk/a", entries: [{ price: 1000, originalPrice: null, recordedAt: at("2026-11-07T06:00:00Z") }] };
    const today = { _id: "h2", platform: "mega", sourceUrl: "https://mega.pk/b", entries: [{ price: 2000, originalPrice: null, recordedAt: at("2026-11-08T05:00:00Z") }] };
    const find = vi.spyOn(PriceHistory, "find").mockReturnValue({ lean: async () => [yesterday, today] });
    const bulkWrite = vi.spyOn(PriceHistory, "bulkWrite").mockResolvedValue({});

    const result = await PriceHistory.recordPrices([
      { platform: "mega", sourceUrl: "https://mega.pk/a", title: "A", price: 1000 }, // a new day, same price: appended
      { platform: "mega", sourceUrl: "https://mega.pk/b", title: "B", price: 2000 }, // the same day, same price: not appended
      { platform: "mega", sourceUrl: "https://mega.pk/c", title: "C", price: 3000 }, // no history yet: created
      { platform: "mega", sourceUrl: "https://mega.pk/d", title: "D", price: 0 }, // no price: ignored
    ], at("2026-11-08T07:00:00Z"));

    expect(find).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ appended: 1, created: 1 });
    const [a, b, c] = bulkWrite.mock.calls[0][0].map((op) => op.updateOne);
    expect(a.update.$push.entries).toMatchObject({ price: 1000 });
    expect(a.update).toMatchObject({ $min: { lowestPrice: 1000 }, $max: { highestPrice: 1000 } });
    expect(b.update.$push).toBeUndefined();
    expect(c).toMatchObject({ upsert: true, update: { $setOnInsert: { lowestPrice: 3000, highestPrice: 3000 } } });
    vi.restoreAllMocks();
  });
});
