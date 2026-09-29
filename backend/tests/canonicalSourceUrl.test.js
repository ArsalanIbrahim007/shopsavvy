import { describe, it, expect } from "vitest";
import { canonicalSourceUrl } from "../src/services/scraper.service.js";

describe("canonicalSourceUrl", () => {
  it("collapses Telemart's per-search tracking params to one URL", () => {
    const a = "https://www.telemart.pk/products/apple-iphone-17-air?_pos=6&_sid=8789d81b1&_ss=r";
    const b = "https://www.telemart.pk/products/apple-iphone-17-air?_pos=25&_sid=abf194ab3&_ss=r";
    expect(canonicalSourceUrl(a)).toBe("https://www.telemart.pk/products/apple-iphone-17-air");
    expect(canonicalSourceUrl(a)).toBe(canonicalSourceUrl(b));
  });

  it("keeps params that can identify a different product", () => {
    expect(canonicalSourceUrl("https://shop.pk/products/phone?variant=123&_pos=2"))
      .toBe("https://shop.pk/products/phone?variant=123");
  });

  it("strips utm_* marketing params and fragments", () => {
    expect(canonicalSourceUrl("https://shop.pk/p/1?utm_source=x&utm_medium=y#reviews"))
      .toBe("https://shop.pk/p/1");
  });

  it("leaves clean URLs and unparseable values untouched", () => {
    expect(canonicalSourceUrl("https://priceoye.pk/mobiles/apple/iphone-15"))
      .toBe("https://priceoye.pk/mobiles/apple/iphone-15");
    expect(canonicalSourceUrl("not a url")).toBe("not a url");
    expect(canonicalSourceUrl(null)).toBe(null);
  });
});
