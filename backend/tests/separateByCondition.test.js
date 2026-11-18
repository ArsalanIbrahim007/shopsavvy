import { describe, it, expect } from "vitest";

import { separateByCondition, groupListingsByProduct } from "../src/services/productGrouping.service.js";

const offer = (id, platform, price, condition = "new") => ({ _id: id, platform, title: "Apple iPhone 15 Pro Max 256GB", price, condition, productCategory: "smartphone" });

describe("separateByCondition (2026-11-18)", () => {
  it("moves a used offer whose condition came from its page out of the new phone's group", () => {
    const group = { productName: "Apple iPhone 15 Pro Max 256GB", storage: 256, offers: [offer("t", "techroid", 258825), offer("i", "ishopping", 270300, "used")], offerCount: 2 };
    const out = separateByCondition([group]);
    expect(out.map((g) => g.offers.map((o) => o._id))).toEqual([["t"], ["i"]]);
    expect(out[1]).toMatchObject({ offerCount: 1, lowestPrice: 270300, storage: 256 });
  });

  it("leaves a group of one condition alone, and keeps the commoner condition in place", () => {
    const same = { offers: [offer("a", "s", 1), offer("b", "t", 2)] };
    expect(separateByCondition([same])).toEqual([same]);
    const mostlyUsed = { offers: [offer("a", "s", 1, "used"), offer("b", "t", 2, "used"), offer("c", "u", 3)] };
    expect(separateByCondition([mostlyUsed]).map((g) => g.offers.map((o) => o._id))).toEqual([["a", "b"], ["c"]]);
  });

  it("is part of grouping", () => {
    const groups = groupListingsByProduct([offer("t", "techroid", 258825), offer("i", "ishopping", 270300, "used")]);
    expect(groups.every((g) => new Set(g.offers.map((o) => o.condition)).size === 1)).toBe(true);
  });
});

describe("the name follows the offers that stay (audit S-012)", () => {
  it("takes a kept offer's title when the name came from a moved one", () => {
    const group = { productName: "Apple iPhone 15 Pro Max 256GB PTA Approved", storage: 256, offers: [
      { _id: "t", platform: "techroid", title: "Apple iPhone 15 Pro Max 256GB", price: 258825, condition: "new" },
      { _id: "i", platform: "ishopping", title: "Apple iPhone 15 Pro Max 256GB PTA Approved", price: 270300, condition: "used" },
      { _id: "x", platform: "x", title: "Apple iPhone 15 Pro Max 256GB", price: 260000, condition: "new" },
    ] };
    const [kept, moved] = separateByCondition([group]);
    expect(kept.productName).toBe("Apple iPhone 15 Pro Max 256GB");
    expect(moved.productName).toBe("Apple iPhone 15 Pro Max 256GB PTA Approved");
  });
});
