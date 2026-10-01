import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { STALE_LOCK_MS, isDoneToday, markDone, markFailed, pktDay, pktHour, tryStart } from "../src/jobs/scrapeState.js";
import { isWithinWindow } from "../src/jobs/priceHistoryJob.js";

let dir;
let file;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "scrape-state-"));
  file = join(dir, "state.json");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const at = (iso) => new Date(iso);
const saved = () => JSON.parse(readFileSync(file, "utf8"));
const alive = () => true;
const dead = () => false;

describe("Pakistan day and hour", () => {
  it("counts the day in Pakistan time (UTC+5), whatever the machine's time zone", () => {
    expect(pktDay(at("2026-09-30T18:59:00Z"))).toBe("2026-09-30"); // 23:59 in Pakistan
    expect(pktDay(at("2026-09-30T19:00:00Z"))).toBe("2026-10-01"); // midnight in Pakistan
    expect(pktHour(at("2026-09-30T17:00:00Z"))).toBe(22);
    expect(pktHour(at("2026-09-30T19:00:00Z"))).toBe(0);
  });

  it("the nightly window is 10 to 11 PM in Pakistan", () => {
    expect(isWithinWindow(at("2026-09-30T16:59:00Z"))).toBe(false); // 21:59
    expect(isWithinWindow(at("2026-09-30T17:00:00Z"))).toBe(true); // 22:00
    expect(isWithinWindow(at("2026-09-30T17:59:00Z"))).toBe(true); // 22:59
    expect(isWithinWindow(at("2026-09-30T18:00:00Z"))).toBe(false); // 23:00
  });
});

describe("tryStart / markDone / markFailed", () => {
  const now = at("2026-09-30T17:05:00Z");

  it("lets the first caller claim the day and tells a second caller to wait", () => {
    expect(tryStart({ now, file, pid: 100 })).toEqual({ ok: true });
    expect(saved()).toMatchObject({ pid: 100, runningSince: now.toISOString() });
    expect(tryStart({ now, file, pid: 200, isAlive: alive })).toEqual({ ok: false, reason: "running" });
  });

  it("does not start a second scrape on a day that is already done", () => {
    markDone({ now, file });
    expect(saved()).toEqual({ lastRunDate: "2026-09-30" });
    expect(isDoneToday({ now, file })).toBe(true);
    expect(tryStart({ now: at("2026-09-30T17:30:00Z"), file, pid: 100 })).toEqual({ ok: false, reason: "done-today" });
  });

  it("starts again the next Pakistan day", () => {
    markDone({ now, file });
    expect(isDoneToday({ now: at("2026-09-30T19:30:00Z"), file })).toBe(false); // 00:30 on 1 Oct in Pakistan
    expect(tryStart({ now: at("2026-10-01T17:05:00Z"), file, pid: 100 })).toEqual({ ok: true });
  });

  it("takes over a claim whose process no longer exists (for example the backend restarted mid-run)", () => {
    tryStart({ now, file, pid: 100 });
    expect(tryStart({ now: at("2026-09-30T17:20:00Z"), file, pid: 200, isAlive: dead })).toEqual({ ok: true });
    expect(saved().pid).toBe(200);
  });

  it("takes over a claim that is older than the time limit, even if the process id is still in use", () => {
    tryStart({ now, file, pid: 100 });
    const later = new Date(now.getTime() + STALE_LOCK_MS + 1000);
    expect(tryStart({ now: later, file, pid: 200, isAlive: alive })).toEqual({ ok: true });
  });

  it("lets the same process claim again", () => {
    tryStart({ now, file, pid: 100 });
    expect(tryStart({ now, file, pid: 100, isAlive: alive })).toEqual({ ok: true });
  });

  it("markFailed releases the claim and keeps the last day that really finished", () => {
    markDone({ now: at("2026-09-29T17:05:00Z"), file });
    tryStart({ now, file, pid: 100 });
    markFailed({ file });
    expect(saved()).toEqual({ lastRunDate: "2026-09-29" });
    expect(tryStart({ now: at("2026-09-30T17:15:00Z"), file, pid: 200, isAlive: alive })).toEqual({ ok: true });
  });

  it("copes with a missing, empty or corrupt file, and with the old format", () => {
    expect(isDoneToday({ now, file })).toBe(false);
    writeFileSync(file, "not json");
    expect(tryStart({ now, file, pid: 100 })).toEqual({ ok: true });
    writeFileSync(file, JSON.stringify({ lastRunDate: "2026-09-30" })); // the format before this change
    expect(isDoneToday({ now, file })).toBe(true);
    writeFileSync(file, "null");
    expect(isDoneToday({ now, file })).toBe(false);
  });
});

describe("run-scheduled-scrape.js skips a day that is already covered", () => {
  const script = fileURLToPath(new URL("../src/scripts/run-scheduled-scrape.js", import.meta.url));
  const run = (state) => {
    writeFileSync(file, JSON.stringify(state));
    // MONGO_URI points nowhere: a run that does not skip would fail to connect, so a pass proves it never tried.
    return spawnSync(process.execPath, [script], { encoding: "utf8", timeout: 20000, env: { ...process.env, SCRAPE_STATE_FILE: file, MONGO_URI: "mongodb://127.0.0.1:1/none" } });
  };

  it("exits quietly, with success, when today's scrape already ran", () => {
    const out = run({ lastRunDate: pktDay() });
    expect(out.status).toBe(0);
    expect(out.stdout).toMatch(/already run/i);
  });

  it("exits quietly, with success, when another process is scraping right now", () => {
    const out = run({ lastRunDate: "2000-01-01", runningSince: new Date().toISOString(), pid: process.pid });
    expect(out.status).toBe(0);
    expect(out.stdout).toMatch(/already running/i);
  });

  it("exits with failure, and releases its claim, when the scrape cannot run (here: no database)", () => {
    writeFileSync(file, JSON.stringify({ lastRunDate: "2000-01-01" }));
    const out = spawnSync(process.execPath, [script], {
      encoding: "utf8", timeout: 30000,
      env: { ...process.env, SCRAPE_STATE_FILE: file, MONGO_URI: "mongodb://127.0.0.1:1/none?serverSelectionTimeoutMS=500&connectTimeoutMS=500" },
    });
    expect(out.status).toBe(1);
    expect(out.stderr).toMatch(/scheduled scrape failed/i);
    expect(saved()).toEqual({ lastRunDate: "2000-01-01" }); // not marked done, not left "running"
  });
});
