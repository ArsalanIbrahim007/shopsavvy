import { describe, it, expect } from "vitest";
import { parsePagination, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../src/services/pagination.service.js";

describe("parsePagination", () => {
  it("pages even when no limit is given: never the whole collection (audit, 2026-11-12)", () => {
    expect(DEFAULT_PAGE_SIZE).toBe(50);
    expect(parsePagination({})).toEqual({ limit: 50, page: 1, skip: 0 });
    expect(parsePagination({ page: "3" })).toEqual({ limit: 50, page: 3, skip: 100 });
    expect(parsePagination({ limit: "" })).toEqual({ limit: 50, page: 1, skip: 0 });
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
