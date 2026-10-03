import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { format } from "node:util";

vi.mock("../src/scrapers/index.js", () => ({ scrapeAllPlatforms: vi.fn(async () => []) }));

import Listing from "../src/models/listing.model.js";
import { createApp } from "../src/createApp.js";
import { runScrapersAndSave } from "../src/services/scraper.service.js";

// A visitor's text must never be the FORMAT of a log line (Node's console treats the first argument as one: "%s", "%d", "%o" would be
// interpreted and would swallow the arguments after it). So the first argument of every log call below is a constant.

let server;
let url;
beforeAll(async () => {
  await new Promise((resolve) => {
    server = createApp().listen(0, () => { url = `http://127.0.0.1:${server.address().port}`; resolve(); });
  });
});
afterAll(() => new Promise((resolve) => server.close(resolve)));
afterEach(() => vi.restoreAllMocks());

const firsts = (spy) => spy.mock.calls.map((call) => call[0]);
const lines = (spy) => spy.mock.calls.map((call) => format(...call));
const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

describe("the access log", () => {
  it("has a constant format, and the path is only an argument", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await fetch(`${url}/api/no-such-route-%25s%25d`);
    await settle();
    expect(firsts(log)).toContain("[req %s] %s %s %s %sms");
    expect(lines(log).join("\n")).toMatch(/GET \/api\/no-such-route-%25s%25d 404 \d+ms/);
  });
});

describe("the error handler", () => {
  it("logs an expected error with a constant format", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await fetch(`${url}/api/listings/bad-id-%25s`);
    await settle();
    expect(firsts(warn)).toEqual(["[req %s] %s -> %s %s: %s"]);
    expect(lines(warn)[0]).toMatch(/GET \/api\/listings\/bad-id-%25s -> 400 /);
  });

  it("logs an unexpected error with a constant format and the error itself after it", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(Listing, "countDocuments").mockRejectedValue(new Error("boom %s %d"));
    vi.spyOn(Listing, "distinct").mockResolvedValue([]);
    await fetch(`${url}/api/listings/stats`);
    await settle();
    expect(error.mock.calls[0][0]).toBe("[error] [req %s] %s -> %s %s");
    expect(error.mock.calls[0].at(-1)).toBeInstanceOf(Error); // still passed, so its stack is printed
  });
});

describe("the scraper service log", () => {
  it("quotes the search, so a format specifier or a newline in it is just text", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const hostile = "%s%d%o\n[req 1] GET /admin 200 1ms";
    await runScrapersAndSave(hostile);

    const all = lines(log);
    expect(firsts(log)).toContain("[scraperService] Running live scrapers for: %s");
    expect(all.some((line) => line.includes('"%s%d%o\\n[req 1] GET /admin 200 1ms"'))).toBe(true);
    for (const line of all) expect(line).not.toMatch(/\n\[req 1\]/); // never a forged second line
    for (const first of firsts(log)) expect(first, first).not.toContain("%d%o"); // the search is never part of a format
  });
});
