// memoize.js and the cached title readers (2026-10-26): grouping re-read the same titles millions of times.
import { describe, it, expect } from "vitest";

import { memoize, MEMO_LIMIT } from "../src/services/memoize.js";
import { normalizeTitle, extractStorage } from "../src/services/normalizeTitle.service.js";
import { tokenize } from "../src/services/similarity.service.js";

describe("memoize", () => {
  it("computes a text's answer once, and gives the same answer again", () => {
    let calls = 0;
    const length = memoize((text) => { calls++; return text.length; });
    expect(length("abc")).toBe(3);
    expect(length("abc")).toBe(3);
    expect(calls).toBe(1);
    expect(length("abcd")).toBe(4);
    expect(calls).toBe(2);
  });

  it("remembers answers that are null or undefined too, and treats a missing text as empty", () => {
    let calls = 0;
    const nothing = memoize(() => { calls++; return null; });
    nothing("x");
    nothing("x");
    expect(calls).toBe(1);
    const echo = memoize((text) => text);
    expect(echo()).toBe("");
  });

  it("empties itself at its limit, so memory stays bounded", () => {
    let calls = 0;
    const id = memoize((text) => { calls++; return text; }, 3);
    ["a", "b", "c"].forEach(id); // full
    id("d"); // empties, then keeps "d"
    id("a"); // recomputed
    expect(calls).toBe(5);
    expect(MEMO_LIMIT).toBe(10000);
  });
});

describe("cached title readers", () => {
  it("answer exactly as before", () => {
    expect(normalizeTitle("Apple iPhone 17 Pro 256 GB PTA Approved")).toBe("iphone 17 pro 256gb");
    expect(normalizeTitle("Apple iPhone 17 Pro 256 GB PTA Approved")).toBe("iphone 17 pro 256gb");
    expect(extractStorage("Samsung Galaxy A17 8GB RAM 256GB")).toBe(256);
  });

  it("share frozen token lists, so no caller can change another's", () => {
    const tokens = tokenize("galaxy a17 256gb");
    expect(tokens).toEqual(["galaxy", "a17", "256gb"]);
    expect(tokenize("galaxy a17 256gb")).toBe(tokens);
    expect(() => tokens.push("x")).toThrow(TypeError);
  });
});
