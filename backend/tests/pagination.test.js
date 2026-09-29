import { describe, it, expect } from "vitest";
import { parsePagination, MAX_PAGE_SIZE } from "../src/services/pagination.service.js";

describe("parsePagination", () => {
  it("is off unless a limit is given, so existing callers get everything", () => {
    expect(parsePagination({})).toBeNull();
    expect(parsePagination({ page: "3" })).toBeNull();
    expect(parsePagination({ limit: "" })).toBeNull();
  });

  it("turns page and limit into a skip", () => {
    expect(parsePagination({ limit: "20", page: "3" })).toEqual({ limit: 20, page: 3, skip: 40 });
  });

  it("defaults to the first page", () => {
    expect(parsePagination({ limit: "10" })).toEqual({ limit: 10, page: 1, skip: 0 });
  });

  it("clamps oversized and nonsensical values", () => {
    expect(parsePagination({ limit: "100000" }).limit).toBe(MAX_PAGE_SIZE);
    expect(parsePagination({ limit: "-4" }).limit).toBe(1);
    expect(parsePagination({ limit: "abc" }).limit).toBe(1);
    expect(parsePagination({ limit: "5", page: "-2" }).page).toBe(1);
  });
});
