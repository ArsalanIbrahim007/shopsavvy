import { describe, it, expect } from "vitest";

import { findDrop } from "../src/services/priceDrops.service.js";

const at = (d, price) => ({ price, recordedAt: new Date(`2026-11-${String(d).padStart(2, "0")}T10:00:00Z`) });
const now = Date.parse("2026-11-18T12:00:00Z");

describe("a price returning after a spike is not a drop (audit S-007, 2026-11-18)", () => {
  it("drops a fall back to a price seen in the 14 days before", () => {
    expect(findDrop([at(14, 121999), at(16, 141499), at(18, 121999)], { now })).toBeNull();
    expect(findDrop([at(12, 103100), at(14, 75899), at(16, 103100), at(18, 75899)], { now })).toBeNull();
  });

  it("keeps a fall below everything seen in those 14 days", () => {
    expect(findDrop([at(10, 69500), at(14, 69500), at(17, 69500), at(18, 49900)], { now })).toMatchObject({ price: 49900, before: 69500 });
  });
});
