// The feeds kept on disk across restarts (2026-11-08): the honest-prices report took 83 s after a restart, and the home page's rows
// waited for whole categories to be grouped again.
import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { MAX_AGE_MS, readSnapshot, writeSnapshot } from "../src/services/snapshot.service.js";

const dir = mkdtempSync(join(tmpdir(), "ss-snap-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const env = { CACHE_DIR: dir };

describe("snapshot.service", () => {
  it("reads back what it wrote, and leaves no temporary file behind", async () => {
    expect(await writeSnapshot("deals-tv", { deals: [1, 2] }, { env })).toBe(true);
    expect(await readSnapshot("deals-tv", { env })).toEqual({ deals: [1, 2] });
    expect(readdirSync(dir).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });

  it("serves nothing older than two days, nothing unreadable, and nothing that was never saved", async () => {
    const now = Date.now();
    await writeSnapshot("old", { x: 1 }, { env, now: now - MAX_AGE_MS - 1000 });
    expect(await readSnapshot("old", { env, now })).toBeNull();
    writeFileSync(join(dir, "broken.json"), "{ not json");
    expect(await readSnapshot("broken", { env })).toBeNull();
    expect(await readSnapshot("never", { env })).toBeNull();
  });

  it("is off under tests and when CACHE_DIR is off, so tests never read or leave files", async () => {
    expect(await writeSnapshot("x", { a: 1 }, { env: { VITEST: "true" } })).toBe(false);
    expect(await readSnapshot("deals-tv", { env: { CACHE_DIR: "off" } })).toBeNull();
  });

  it("keeps a name to a plain file name", async () => {
    await writeSnapshot("../../escape", { a: 1 }, { env });
    expect(readdirSync(dir)).toContain("______escape.json"); // the dots and slashes become underscores: it stays in the folder
  });
});

