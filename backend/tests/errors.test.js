import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import express from "express";

import { AppError, ERROR_CODES, codeForStatus } from "../src/errors/AppError.js";
import { classifyError, globalErrorHandler, notFoundHandler } from "../src/middleware/error.middleware.js";
import { requestId } from "../src/middleware/requestId.middleware.js";
import { maskEmail } from "../src/services/maskEmail.js";

describe("AppError", () => {
  it("derives a stable code from the status", () => {
    expect(codeForStatus(400)).toBe(ERROR_CODES.BAD_REQUEST);
    expect(codeForStatus(404)).toBe(ERROR_CODES.NOT_FOUND);
    expect(codeForStatus(429)).toBe(ERROR_CODES.RATE_LIMITED);
    expect(codeForStatus(500)).toBe(ERROR_CODES.INTERNAL_ERROR);
  });

  it("carries status, code, message and details", () => {
    const error = AppError.validation([{ msg: "x" }]);
    expect(error).toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR", details: [{ msg: "x" }] });
    expect(AppError.notFound("Nope")).toMatchObject({ statusCode: 404, code: "NOT_FOUND", message: "Nope" });
    expect(AppError.invalidId()).toMatchObject({ statusCode: 400, code: "INVALID_ID" });
  });
});

describe("classifyError", () => {
  it("passes an AppError through", () => {
    expect(classifyError(AppError.notFound("Listing not found"))).toMatchObject({
      statusCode: 404, code: "NOT_FOUND", message: "Listing not found",
    });
  });

  it("maps database driver errors", () => {
    expect(classifyError(Object.assign(new Error("Cast to ObjectId failed"), { name: "CastError" }))).toMatchObject({
      statusCode: 400, code: "INVALID_ID", message: "Invalid resource ID",
    });

    const validation = Object.assign(new Error("invalid"), {
      name: "ValidationError",
      errors: { title: { path: "title", message: "Title is required" } },
    });
    expect(classifyError(validation)).toMatchObject({
      statusCode: 400, code: "VALIDATION_ERROR", message: "Title is required",
      details: [{ path: "title", msg: "Title is required" }],
    });

    const duplicate = Object.assign(new Error("E11000"), { code: 11000, keyValue: { sourceUrl: "x" } });
    expect(classifyError(duplicate)).toMatchObject({ statusCode: 409, code: "CONFLICT", message: "sourceUrl already exists" });
  });

  it("maps body-parser failures", () => {
    expect(classifyError(Object.assign(new SyntaxError("Unexpected token"), { type: "entity.parse.failed" }))).toMatchObject({
      statusCode: 400, code: "INVALID_JSON",
    });
    expect(classifyError(Object.assign(new Error("too big"), { type: "entity.too.large" }))).toMatchObject({
      statusCode: 413, code: "PAYLOAD_TOO_LARGE",
    });
  });

  it("maps an unreachable database to 503, whatever the driver calls it", () => {
    for (const error of [
      Object.assign(new Error("connect ECONNREFUSED"), { name: "MongoServerSelectionError" }),
      Object.assign(new Error("x"), { name: "MongoNetworkError" }),
      new Error("Operation `listings.find()` buffering timed out after 10000ms"),
    ]) {
      expect(classifyError(error)).toMatchObject({ statusCode: 503, code: "DATABASE_UNAVAILABLE" });
    }
  });

  it("treats anything else as a bug with a generic message", () => {
    const result = classifyError(new Error("password=hunter2 connecting to db.internal:27017"));
    expect(result.statusCode).toBe(500);
    expect(result.code).toBe("INTERNAL_ERROR");
    expect(result.message).not.toMatch(/hunter2|internal/);
  });
});

describe("global handler through a real Express app", () => {
  let server;
  let url;
  const originalEnv = process.env.NODE_ENV;

  beforeAll(async () => {
    const app = express();
    app.use(requestId);
    app.get("/boom", () => { throw new Error("secret detail: connection string mongodb://user:pw@host"); });
    app.get("/known", () => { throw AppError.notFound("Listing not found"); });
    app.get("/async", async () => { throw new Error("async secret"); });
    app.use(notFoundHandler);
    app.use(globalErrorHandler);

    await new Promise((resolve) => {
      server = app.listen(0, () => { url = `http://127.0.0.1:${server.address().port}`; resolve(); });
    });
  });

  afterEach(() => { process.env.NODE_ENV = originalEnv; });
  afterAll(() => new Promise((resolve) => server.close(resolve)));

  it("returns a generic 500 and never the internal message", async () => {
    const res = await fetch(`${url}/boom`);
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body).toMatchObject({ success: false, code: "INTERNAL_ERROR" });
    expect(JSON.stringify(body)).not.toMatch(/secret|mongodb|password|pw@/);
    expect(body.stack).toBeUndefined();
  });

  it("forwards errors thrown in async handlers (Express 5) the same way", async () => {
    const res = await fetch(`${url}/async`);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toMatch(/async secret/);
  });

  it("includes the stack only in development", async () => {
    process.env.NODE_ENV = "development";
    const body = await (await fetch(`${url}/boom`)).json();
    expect(typeof body.stack).toBe("string");
  });

  it("returns deliberate errors with their code and message", async () => {
    const res = await fetch(`${url}/known`);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND", message: "Listing not found" });
  });

  it("puts the same request id in the body and the x-request-id header", async () => {
    const res = await fetch(`${url}/known`);
    const body = await res.json();
    expect(body.requestId).toBeTruthy();
    expect(res.headers.get("x-request-id")).toBe(body.requestId);
  });

  it("reuses a harmless incoming request id and replaces an unsafe one", async () => {
    const good = await fetch(`${url}/known`, { headers: { "x-request-id": "trace-abc_123" } });
    expect(good.headers.get("x-request-id")).toBe("trace-abc_123");

    const bad = await fetch(`${url}/known`, { headers: { "x-request-id": "bad id\twith spaces" } });
    expect(bad.headers.get("x-request-id")).not.toBe("bad id\twith spaces");
    expect(bad.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("never echoes the query string (it can hold an email address) in a 404 message", async () => {
    const res = await fetch(`${url}/nothing-here?email=person@example.com`);
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body.code).toBe("NOT_FOUND");
    expect(body.message).not.toContain("person@example.com");
  });
});

describe("maskEmail", () => {
  it("keeps the first letter and the domain only", () => {
    expect(maskEmail("arsalan@example.com")).toBe("a***@example.com");
  });

  it("does not throw on nonsense", () => {
    expect(maskEmail(undefined)).toBe("***");
    expect(maskEmail("not-an-email")).toBe("***");
  });
});
