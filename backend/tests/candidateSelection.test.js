import { describe, it, expect } from "vitest";
import { selectCandidates } from "../src/services/candidateSelection.service.js";

const mk = (id, title, price) => ({ _id: id, title, price });

describe("selectCandidates", () => {
  const target = mk("t", "Apple iPhone 17 Pro Max 256GB Storage NON PTA", 400000);

  it("always includes the listing itself", () => {
    expect(selectCandidates(target, []).map((l) => l._id)).toEqual(["t"]);
  });

  it("keeps listings of the same model and drops unrelated ones", () => {
    const pool = [
      mk("same1", "iPhone 17 Pro Max 256GB", 410000),
      mk("same2", "Apple iPhone 17 Pro Max (256GB) PTA Approved", 450000),
      mk("other", "Samsung Galaxy S25 Ultra 12GB 256GB", 350000),
      mk("case", "Silicone Case for Redmi Note 14", 900),
    ];
    const ids = selectCandidates(target, pool).map((l) => l._id);
    expect(ids).toContain("same1");
    expect(ids).toContain("same2");
    expect(ids).not.toContain("other");
    expect(ids).not.toContain("case");
  });

  it("keeps a store whose title is padded with marketing text", () => {
    const short = mk("s", "vivo Y31d", 66000);
    const padded = mk(
      "p",
      "vivo Y31d - 7200 mAh BlueVolt Battery - Snapdragon 6s Gen 2 4G - OriginOS 6.0 New System - PTA Approved",
      78000
    );
    expect(selectCandidates(short, [padded]).map((l) => l._id)).toContain("p");
  });

  it("orders the result by ascending price, as grouping expects", () => {
    const pool = [mk("b", "iPhone 17 Pro Max 256GB", 450000), mk("a", "iPhone 17 Pro Max 256GB", 380000)];
    const prices = selectCandidates(target, pool).map((l) => l.price);
    expect(prices).toEqual([...prices].sort((x, y) => x - y));
  });

  it("caps the candidate count, keeping the most similar", () => {
    const pool = [
      mk("close", "Apple iPhone 17 Pro Max 256GB Storage NON PTA", 1),
      ...Array.from({ length: 10 }, (_, i) => mk(`far${i}`, `iPhone 17 Pro Max 256GB Deep Purple Edition ${i}`, 2 + i)),
    ];
    const ids = selectCandidates(target, pool, { cap: 3 }).map((l) => l._id);
    expect(ids).toHaveLength(3);
    expect(ids).toContain("t");
    expect(ids).toContain("close");
  });
});
