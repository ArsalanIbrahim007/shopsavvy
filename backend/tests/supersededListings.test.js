import { describe, it, expect } from "vitest";

import { findSuperseded, pageOf } from "../src/services/supersededListings.service.js";
import { VISIBLE_PLATFORMS_FILTER } from "../src/config/platforms.js";

const at = (day) => new Date(`2026-11-${String(day).padStart(2, "0")}T12:00:00Z`);
const l = (platform, sourceUrl, day) => ({ _id: `${platform}${sourceUrl}`, platform, sourceUrl, lastScrapedAt: at(day) });

describe("findSuperseded", () => {
  it("retires a plain-address copy once the same store lists the page's variants, checked later", () => {
    const listings = [
      l("techroid", "https://techroid.com/product/infinix-note-60-pro/", 14),
      l("techroid", "https://techroid.com/product/infinix-note-60-pro/?attribute_storage=8GB%20%E2%80%93%20256GB", 18),
      l("techroid", "https://techroid.com/product/other-phone/", 14),
    ];
    expect(findSuperseded(listings).map((x) => x.sourceUrl)).toEqual(["https://techroid.com/product/infinix-note-60-pro/"]);
  });

  it("keeps it when its variants were checked earlier, or another store lists them", () => {
    expect(findSuperseded([l("eezepc", "https://e.com/p/a/", 18), l("eezepc", "https://e.com/p/a/?x=1", 14)])).toEqual([]);
    expect(findSuperseded([l("eezepc", "https://e.com/p/a/", 14), l("techroid", "https://e.com/p/a/?x=1", 18)])).toEqual([]);
  });

  it("never retires a variant itself", () => {
    expect(findSuperseded([l("s", "https://s.com/p/a/?x=1", 1), l("s", "https://s.com/p/a/?x=2", 9)])).toEqual([]);
  });
});

describe("pageOf", () => {
  it("drops the query and a trailing slash", () => {
    expect(pageOf("https://x.pk/product/a/?q=1")).toBe("x.pk/product/a");
    expect(pageOf("not a url")).toBe(null);
  });
});

describe("VISIBLE_PLATFORMS_FILTER", () => {
  it("hides retired listings, as well as switched-off stores", () => {
    expect(VISIBLE_PLATFORMS_FILTER).toMatchObject({ supersededAt: null });
    expect(VISIBLE_PLATFORMS_FILTER.platform.$nin).toContain("daraz");
  });
});

describe("VISIBLE_PLATFORMS_FILTER and listings a store no longer has (2026-11-18)", () => {
  it("hides them", () => {
    expect(VISIBLE_PLATFORMS_FILTER).toMatchObject({ notInCatalogueSince: null });
  });
});
