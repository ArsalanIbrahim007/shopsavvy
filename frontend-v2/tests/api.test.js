import { describe, it, expect, vi, afterEach } from "vitest";
import { request } from "../src/api/client.js";
import { ApiError, describeError, CLIENT_CODES } from "../src/api/errors.js";
import { searchListings, createAlert, getStats } from "../src/api/endpoints.js";

// A minimal Response stand-in: enough of the fetch API for the client.
const respond = (status, body, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name) => headers[name.toLowerCase()] ?? null },
  json: async () => {
    if (body === undefined) throw new SyntaxError("no body");
    return body;
  },
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("request", () => {
  it("returns the parsed body of a successful response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(200, { success: true, x: 1 })));
    await expect(request("/thing")).resolves.toEqual({ success: true, x: 1 });
  });

  it("builds the query string, dropping empty values", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(200, {}));
    vi.stubGlobal("fetch", fetchMock);
    await request("/listings/search", { params: { q: "iphone 17", category: undefined, empty: "", zero: 0 } });
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe("/api/listings/search");
    expect(url.searchParams.get("q")).toBe("iphone 17");
    expect(url.searchParams.has("category")).toBe(false);
    expect(url.searchParams.has("empty")).toBe(false);
    expect(url.searchParams.get("zero")).toBe("0");
  });

  it("sends a JSON body with the right header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(201, { success: true }));
    vi.stubGlobal("fetch", fetchMock);
    await request("/alerts", { method: "POST", body: { email: "a@b.co" } });
    const init = fetchMock.mock.calls[0][1];
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({ email: "a@b.co" });
  });

  it("turns the backend's error body into an ApiError with code, request id and field errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        respond(400, { success: false, code: "VALIDATION_ERROR", message: "Validation failed", requestId: "req-1", errors: [{ path: "email", msg: "email must be a valid email address" }] })
      )
    );
    const error = await request("/alerts", { method: "POST", body: {} }).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, code: "VALIDATION_ERROR", requestId: "req-1" });
    expect(error.details[0].path).toBe("email");
  });

  it("copes with an error status and no readable body, using the request id header", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(502, undefined, { "x-request-id": "hdr-9" })));
    const error = await request("/x").catch((e) => e);
    expect(error).toMatchObject({ status: 502, code: "HTTP_502", requestId: "hdr-9" });
  });

  it("reports a network failure as NETWORK_ERROR", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const error = await request("/x").catch((e) => e);
    expect(error).toMatchObject({ code: CLIENT_CODES.NETWORK_ERROR, status: 0 });
  });

  it("reports an unreadable 2xx body as INVALID_RESPONSE", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(200, undefined)));
    const error = await request("/x").catch((e) => e);
    expect(error.code).toBe(CLIENT_CODES.INVALID_RESPONSE);
  });

  it("times out with TIMEOUT when the server is too slow", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn((url, { signal }) => new Promise((resolve, reject) => signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))))),
    );
    const pending = request("/slow", { timeoutMs: 1000 }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(1001);
    expect(await pending).toMatchObject({ code: CLIENT_CODES.TIMEOUT });
  });

  it("rethrows an AbortError, not an ApiError, when the caller cancels", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url, { signal }) => new Promise((resolve, reject) => signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))))),
    );
    const controller = new AbortController();
    const pending = request("/x", { signal: controller.signal }).catch((e) => e);
    controller.abort();
    const error = await pending;
    expect(error.name).toBe("AbortError");
    expect(error).not.toBeInstanceOf(ApiError);
  });
});

describe("endpoints", () => {
  it("search returns offers, groups and count in the shape the UI wants", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(200, { success: true, data: [{ _id: "a" }], groups: [{ productName: "P", offers: [{ _id: "a" }] }], groupCount: 1, summary: { platforms: 1 } })));
    const result = await searchListings({ q: "phone" });
    expect(result.offers).toHaveLength(1);
    expect(result.groups[0].productName).toBe("P");
    expect(result.groupCount).toBe(1);
  });

  it("search tolerates missing fields", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(200, { success: true })));
    expect(await searchListings({ q: "x" })).toEqual({ offers: [], groups: [], groupCount: 0, summary: null });
  });

  it("stats and alerts hit the right endpoints", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(200, { success: true, products: 2727, platforms: 8 }))
      .mockResolvedValueOnce(respond(201, { success: true, data: { _id: "alert1" } }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await getStats()).toEqual({ products: 2727, platforms: 8 });
    expect(await createAlert({ listingId: "L", email: "a@b.co", targetPrice: 100 })).toEqual({ _id: "alert1" });
    expect(new URL(fetchMock.mock.calls[0][0]).pathname).toBe("/api/listings/stats");
    expect(new URL(fetchMock.mock.calls[1][0]).pathname).toBe("/api/alerts");
  });
});

describe("describeError", () => {
  it("gives a plain, safe message for each kind of failure", () => {
    const cases = {
      NETWORK_ERROR: /connection/i,
      TIMEOUT: /try again/i,
      RATE_LIMITED: /wait a few minutes/i,
      DATABASE_UNAVAILABLE: /temporarily unavailable/i,
      NOT_FOUND: /couldn't find/i,
      INVALID_ID: /doesn't look right/i,
    };
    for (const [code, pattern] of Object.entries(cases)) {
      const info = describeError(new ApiError({ code, status: 500 }));
      expect(`${info.title} ${info.message}`).toMatch(pattern);
    }
  });

  it("never shows the server's text for an unexpected 5xx", () => {
    const info = describeError(new ApiError({ status: 500, code: "INTERNAL_ERROR", message: "connect ECONNREFUSED 10.0.0.5:27017", requestId: "r-7" }));
    expect(info.message).not.toMatch(/ECONNREFUSED|10\.0\.0\.5/);
    expect(info.reference).toBe("Reference: r-7");
    expect(info.canRetry).toBe(true);
  });

  it("shows field messages for a validation error", () => {
    const info = describeError(new ApiError({ status: 400, code: "VALIDATION_ERROR", details: [{ msg: "email must be valid" }, { msg: "targetPrice must be greater than zero" }] }));
    expect(info.message).toBe("email must be valid. targetPrice must be greater than zero");
    expect(info.canRetry).toBe(false);
  });

  it("handles a non-ApiError", () => {
    expect(describeError(new Error("boom")).canRetry).toBe(true);
  });

  it("does not offer a retry when rate limited", () => {
    expect(describeError(new ApiError({ status: 429, code: "RATE_LIMITED" })).canRetry).toBe(false);
  });
});
