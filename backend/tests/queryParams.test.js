import { describe, it, expect } from "vitest";
import { textParam, numberParam } from "../src/services/queryParams.service.js";

describe("textParam", () => {
  it("returns a trimmed string", () => {
    expect(textParam("  black ")).toBe("black");
  });

  it("ignores values that are not plain strings, so a Mongo operator cannot get into a filter", () => {
    // What Express produces for ?colour[$ne]=x and ?colour=a&colour=b
    expect(textParam({ $ne: "x" })).toBeUndefined();
    expect(textParam(["a", "b"])).toBeUndefined();
    expect(textParam(undefined)).toBeUndefined();
    expect(textParam("   ")).toBeUndefined();
  });
});

describe("numberParam", () => {
  it("parses a positive number", () => {
    expect(numberParam("256")).toBe(256);
  });

  it("ignores non-numeric, non-positive and non-string values", () => {
    expect(numberParam("abc")).toBeUndefined();
    expect(numberParam("-5")).toBeUndefined();
    expect(numberParam("0")).toBeUndefined();
    expect(numberParam({ $gt: "0" })).toBeUndefined();
    expect(numberParam(["256"])).toBeUndefined();
  });
});
