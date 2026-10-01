import { describe, it, expect, vi, afterEach } from "vitest";
import { request } from "../src/api/client.js";
import { ApiError, describeError, CLIENT_CODES } from "../src/api/errors.js";
import { searchListings, createAlert, confirmAlert, cancelAlert, getStats, getDeals, getSuggestions, getCatalog, getIntegrity, getListing } from "../src/api/endpoints.js";
import * as endpoints from "../src/api/endpoints.js";

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
      .mockResolvedValueOnce(respond(201, { success: true, message: "Check your email", confirmationRequired: true, confirmationSent: true, data: { _id: "alert1", status: "pending" } }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await getStats()).toEqual({ products: 2727, platforms: 8, categories: [] });
    expect(await createAlert({ listingId: "L", email: "a@b.co", targetPrice: 100 })).toEqual({
      alert: { _id: "alert1", status: "pending" },
      message: "Check your email",
      confirmationRequired: true,
      confirmationSent: true,
    });
    expect(new URL(fetchMock.mock.calls[0][0]).pathname).toBe("/api/listings/stats");
    expect(new URL(fetchMock.mock.calls[1][0]).pathname).toBe("/api/alerts");
  });
});

describe("alert confirmation", () => {
  it("createAlert reports honestly that an email was not sent, and defaults safely if fields are missing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(201, { success: true, message: "Alert saved but not active yet.", confirmationRequired: true, confirmationSent: false, data: { _id: "a1", status: "pending" } })));
    const result = await createAlert({ listingId: "L", email: "a@b.co", targetPrice: 100 });
    expect(result).toMatchObject({ confirmationRequired: true, confirmationSent: false });
    expect(result.alert.status).toBe("pending");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(201, { success: true, data: { _id: "a2" } })));
    expect(await createAlert({ listingId: "L", email: "a@b.co", targetPrice: 100 })).toMatchObject({ confirmationRequired: false, confirmationSent: false, message: "" });
  });

  it("confirmAlert and cancelAlert post the token in the body, never in the URL", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(200, { success: true, message: "Alert confirmed.", data: { _id: "a1", status: "active" } }))
      .mockResolvedValueOnce(respond(200, { success: true, message: "Alert cancelled.", data: { _id: "a1", status: "cancelled" } }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await confirmAlert("abc.def")).toEqual({ alert: { _id: "a1", status: "active" }, message: "Alert confirmed." });
    expect(await cancelAlert("abc.def")).toEqual({ alert: { _id: "a1", status: "cancelled" }, message: "Alert cancelled." });

    const [confirmCall, cancelCall] = fetchMock.mock.calls;
    expect(new URL(confirmCall[0]).pathname).toBe("/api/alerts/confirm");
    expect(new URL(cancelCall[0]).pathname).toBe("/api/alerts/cancel");
    for (const [url, init] of fetchMock.mock.calls) {
      expect(url).not.toContain("abc.def");
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body)).toEqual({ token: "abc.def" });
    }
  });

  it("a forged or expired link comes back as a NOT_FOUND ApiError and a cancelled alert as CONFLICT", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(respond(404, { success: false, code: "NOT_FOUND", message: "This link is invalid or has expired.", requestId: "r-1" })));
    await expect(confirmAlert("forged.token")).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(respond(409, { success: false, code: "CONFLICT", message: "This alert was cancelled, so it cannot be confirmed." })));
    const error = await confirmAlert("cancelled.alert").catch((e) => e);
    expect(describeError(error).message).toBe("This alert was cancelled, so it cannot be confirmed.");
    expect(describeError(error).canRetry).toBe(false);
  });

  it("no longer offers a list-by-email or cancel-by-email call (the server removed them)", () => {
    expect(endpoints.listAlerts).toBeUndefined();
    expect(cancelAlert.length).toBeLessThanOrEqual(2); // (token, options), not (id, email)
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
      SERVICE_BUSY: /busy/i,
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

  it("does not show a bare error code as a message when the server sent no text", () => {
    for (const code of ["BAD_REQUEST", "CONFLICT", "RATE_LIMITED"]) {
      const info = describeError(new ApiError({ status: 400, code }));
      expect(info.message, code).not.toBe(code);
      expect(info.message.length, code).toBeGreaterThan(15);
    }
  });

  it("shows the server's own words for a rate limit, so an alert limit is not called a search limit", () => {
    const info = describeError(new ApiError({ status: 429, code: "RATE_LIMITED", message: "This address has alerts waiting to be confirmed.", requestId: "r-2" }));
    expect(info.message).toBe("This address has alerts waiting to be confirmed.");
    expect(info.reference).toBe("Reference: r-2");
    expect(describeError(new ApiError({ status: 429, code: "RATE_LIMITED" })).message).toMatch(/wait a few minutes/i);
  });
});

describe("getDeals", () => {
  it("passes category and limit as query parameters and unwraps the response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(200, { success: true, count: 1, generatedAt: "2026-09-30T10:00:00Z", maxAgeHours: 72, data: [{ productName: "Galaxy A17" }] }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await getDeals({ category: "smartphone", limit: 6 });
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe("/api/listings/deals");
    expect(url.searchParams.get("category")).toBe("smartphone");
    expect(url.searchParams.get("limit")).toBe("6");
    expect(result).toEqual({ deals: [{ productName: "Galaxy A17" }], generatedAt: "2026-09-30T10:00:00Z", maxAgeHours: 72 });
  });

  it("returns an empty list, not an error, when there are no deals", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(200, { success: true, count: 0, data: [] })));
    await expect(getDeals()).resolves.toEqual({ deals: [], generatedAt: null, maxAgeHours: null });
  });

  it("surfaces an unknown category as an ApiError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(400, { success: false, code: "BAD_REQUEST", message: "category must be one of: smartphone" })));
    await expect(getDeals({ category: "toaster" })).rejects.toMatchObject({ code: "BAD_REQUEST", status: 400 });
  });
});

describe("getSuggestions", () => {
  it("asks the server with the trimmed text and returns the suggestions", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(200, { success: true, count: 1, data: [{ text: "Samsung Galaxy A17", category: "smartphone", count: 9 }] }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await getSuggestions("  galaxy a  ", { limit: 5 });
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe("/api/listings/suggest");
    expect(url.searchParams.get("q")).toBe("galaxy a");
    expect(url.searchParams.get("limit")).toBe("5");
    expect(result).toEqual([{ text: "Samsung Galaxy A17", category: "smartphone", count: 9 }]);
  });

  it("does not call the server for text shorter than two characters", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    for (const q of ["", " ", "a", " a ", undefined, null]) await expect(getSuggestions(q)).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("getStats categories and getCatalog", () => {
  it("getStats passes the category counts through", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(200, { success: true, products: 3219, platforms: 7, categories: [{ category: "tv", count: 571 }] })));
    expect(await getStats()).toEqual({ products: 3219, platforms: 7, categories: [{ category: "tv", count: 571 }] });
  });

  it("getCatalog asks for one category page, with a longer time limit, and unwraps the answer", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(200, { success: true, total: 1034, offset: 24, generatedAt: "2026-09-30T10:00:00Z", data: [{ productName: "Galaxy A17", offers: [] }] }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await getCatalog({ category: "smartphone", limit: 24, offset: 24 });
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe("/api/listings/catalog");
    expect(url.searchParams.get("category")).toBe("smartphone");
    expect(url.searchParams.get("offset")).toBe("24");
    expect(result).toEqual({ groups: [{ productName: "Galaxy A17", offers: [] }], total: 1034, offset: 24, generatedAt: "2026-09-30T10:00:00Z" });
  });

  it("getIntegrity asks for the report with a long time limit and passes its three parts through", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(200, { success: true, generatedAt: "2026-10-01T09:00:00Z", live: { offers: 3095 }, evaluation: { matcher: { heldOutPairs: 105 }, discount: null } }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await getIntegrity();
    expect(new URL(fetchMock.mock.calls[0][0]).pathname).toBe("/api/integrity");
    expect(result).toEqual({ generatedAt: "2026-10-01T09:00:00Z", live: { offers: 3095 }, evaluation: { matcher: { heldOutPairs: 105 }, discount: null } });
  });

  it("getIntegrity waits well past the usual limit, because the first count after a server restart takes about a minute", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn((url, { signal }) => new Promise((resolve, reject) => signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))))),
    );
    const pending = getIntegrity().catch((e) => e);
    let settled = false;
    pending.then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(90000);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(10001);
    expect(await pending).toMatchObject({ code: CLIENT_CODES.TIMEOUT });
  });

  it("getListing passes the wait-or-buy outlook through, and gives null when the server sent none", async () => {
    const body = { success: true, listing: { _id: "a1" }, offers: [{ _id: "a1" }], summary: null, productGroup: null, outlook: { verdict: "at_low" } };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(200, body)));
    expect((await getListing("a1")).outlook).toEqual({ verdict: "at_low" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(200, { ...body, outlook: undefined })));
    expect((await getListing("a1")).outlook).toBeNull();
  });

  it("getIntegrity gives null and empty parts, never made-up numbers, when the server leaves them out", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(200, { success: true })));
    expect(await getIntegrity()).toEqual({ generatedAt: null, live: null, evaluation: { matcher: null, discount: null } });
  });

  it("getCatalog reports an unknown category as an ApiError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(400, { success: false, code: "BAD_REQUEST", message: "category is required and must be one of: smartphone" })));
    await expect(getCatalog({ category: "toaster" })).rejects.toMatchObject({ status: 400, code: "BAD_REQUEST" });
  });
});
