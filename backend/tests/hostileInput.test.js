import { describe, it, expect, vi, afterEach } from "vitest";
import { format } from "node:util";

import { quote } from "../src/config/logSafe.js";
import { extractColourOptions } from "../src/services/colourPage.service.js";
import { normalizeTitle } from "../src/services/normalizeTitle.service.js";
import Listing from "../src/models/listing.model.js";
import PriceAlert from "../src/models/priceAlert.model.js";
import { createAlert, AlertServiceError } from "../src/services/priceAlert.service.js";

// Things CodeQL found on 2026-10-03, each pinned so it cannot come back.

afterEach(() => vi.restoreAllMocks());

describe("quote (text from a visitor, as one safe piece of a log line)", () => {
  it("writes it as one JSON string, so a newline cannot start a forged log line", () => {
    const text = quote("iphone\n[req 1] GET /admin 200 1ms");
    expect(text).not.toMatch(/[\n\r]/);
    expect(text).toBe('"iphone\\n[req 1] GET /admin 200 1ms"');
  });

  it("escapes quotes and other control characters", () => {
    expect(quote('say "hi"')).toBe('"say \\"hi\\""');
    expect(quote("a\tb\u0000c")).toBe('"a\\tb\\u0000c"');
  });

  it("cuts a very long text short, and handles nothing", () => {
    expect(quote("x".repeat(500))).toBe(`"${"x".repeat(200)}..."`);
    expect(quote(`${"x".repeat(200)}`)).toBe(`"${"x".repeat(200)}"`); // exactly the limit is not cut
    expect(quote(null)).toBe('""');
    expect(quote(undefined)).toBe('""');
    expect(quote(42)).toBe('"42"');
  });

  it("leaves a format specifier in the text as plain text when it is passed as an argument", () => {
    // what util.format (console.log) does: with a constant format, "%s %d %o" in the visitor's text is just text
    const line = format("[scraperService] Running live scrapers for: %s", quote("%s %d %o %%"));
    expect(line).toBe('[scraperService] Running live scrapers for: "%s %d %o %%"');
  });
});

describe("a hostile page or title cannot hold the server", () => {
  const since = (start) => Date.now() - start;

  it("reads a colour list from a page that is mostly whitespace and quotes without taking exponential time", () => {
    // the old pattern took 92 seconds at 14 values like this, and doubled for each one more
    const page = `"options":[${'"a"    '.repeat(40)}x`;
    const start = Date.now();
    expect(extractColourOptions(page)).toEqual([]);
    expect(since(start)).toBeLessThan(500);
    const long = `"options":[${'"a"    '.repeat(5000)}x`;
    const second = Date.now();
    extractColourOptions(long);
    expect(since(second)).toBeLessThan(500);
  });

  it("still reads an ordinary colour list: with or without spaces, line breaks, or a single value", () => {
    const names = (html) => extractColourOptions(html).map((c) => c.colour);
    expect(names('{"options":["Black","Blue","Red"]}')).toEqual(["Black", "Blue", "Red"]);
    expect(names('{"options" : [ "Black" , "Blue" ,\n  "Red" ]}')).toEqual(["Black", "Blue", "Red"]);
    expect(names('{"options":["Black"]}')).toEqual(["Black"]);
    expect(names('{"options":[]}')).toEqual([]);
  });

  it("removes a tag from a title in linear time, however many '<' there are", () => {
    const start = Date.now();
    normalizeTitle("<".repeat(100000));
    expect(since(start)).toBeLessThan(500);
  });

  it("still removes ordinary tags from a title", () => {
    expect(normalizeTitle("Samsung <b>Galaxy</b> A17")).toBe(normalizeTitle("Samsung Galaxy A17"));
    expect(normalizeTitle("Galaxy <span class='x'>A17</span>")).toBe(normalizeTitle("Galaxy A17"));
    expect(normalizeTitle("A <<b>> B")).not.toMatch(/[<>]/);
    expect(normalizeTitle("5 < 6 and 7 > 6")).toContain("5");
  });
});

describe("createAlert only builds a query from plain values", () => {
  const valid = { listingId: "6a78a2af9c96f297ede77301", email: "shopper@example.com", targetPrice: 50000 };

  it("refuses an object where a string belongs (a query operator), and never touches the database", async () => {
    const findById = vi.spyOn(Listing, "findById").mockResolvedValue(null);
    const count = vi.spyOn(PriceAlert, "countDocuments").mockResolvedValue(0);
    for (const bad of [
      { ...valid, email: { $ne: "" } },
      { ...valid, listingId: { $gt: "" } },
      { ...valid, email: ["a@b.c"] },
      { ...valid, targetPrice: "50000" },
      { ...valid, targetPrice: { $gt: 0 } },
      { ...valid, email: undefined },
      { ...valid, listingId: null },
    ]) {
      await expect(createAlert(bad)).rejects.toMatchObject({ statusCode: 400, message: "Invalid alert request." });
    }
    expect(findById).not.toHaveBeenCalled();
    expect(count).not.toHaveBeenCalled();
  });

  it("throws the service's own error type, so the handler answers it with a 400 and a code", async () => {
    await expect(createAlert({ ...valid, email: {} })).rejects.toBeInstanceOf(AlertServiceError);
  });

  it("lets a plain request through to the lookup", async () => {
    const findById = vi.spyOn(Listing, "findById").mockResolvedValue(null);
    await expect(createAlert(valid)).rejects.toMatchObject({ statusCode: 404, message: "Listing not found" });
    expect(findById).toHaveBeenCalledWith(valid.listingId);
  });
});
