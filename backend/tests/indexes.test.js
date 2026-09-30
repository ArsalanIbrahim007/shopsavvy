import { describe, it, expect, vi } from "vitest";

import { ensureIndexes } from "../src/config/indexes.js";
import { retryOnDuplicateKey } from "../src/services/retryOnDuplicateKey.js";
import Listing from "../src/models/listing.model.js";

describe("Listing unique index", () => {
  it("declares one listing per platform and product URL, exempting empty URLs", () => {
    const [keys, options] = Listing.schema.indexes().find(([k]) => k.platform === 1 && k.sourceUrl === 1);
    expect(keys).toEqual({ platform: 1, sourceUrl: 1 });
    expect(options.unique).toBe(true);
    // Hand-made listings without a URL default to "" and must not collide.
    expect(options.partialFilterExpression).toEqual({ sourceUrl: { $gt: "" } });
  });
});

describe("ensureIndexes", () => {
  it("reports an index that cannot be built, with what to do, and never throws", async () => {
    const error = Object.assign(new Error("E11000 duplicate key error"), { code: 11000 });
    const bad = { modelName: "Listing", init: vi.fn().mockRejectedValue(error) };
    const good = { modelName: "PriceAlert", init: vi.fn().mockResolvedValue() };
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const failures = await ensureIndexes([bad, good]);

    expect(failures).toEqual([{ model: "Listing", error: "E11000 duplicate key error" }]);
    expect(good.init).toHaveBeenCalled();
    expect(log.mock.calls[0][0]).toMatch(/merge-duplicate-listings\.js/);
    log.mockRestore();
  });

  it("returns no failures when every index builds", async () => {
    const ok = { modelName: "Listing", init: vi.fn().mockResolvedValue() };
    expect(await ensureIndexes([ok])).toEqual([]);
  });
});

describe("retryOnDuplicateKey", () => {
  const duplicate = () => Object.assign(new Error("E11000"), { code: 11000 });

  it("runs the operation once when it succeeds", async () => {
    const op = vi.fn().mockResolvedValue("saved");
    expect(await retryOnDuplicateKey(op)).toBe("saved");
    expect(op).toHaveBeenCalledTimes(1);
  });

  it("runs it again after a duplicate-key error, so the second attempt updates the winner", async () => {
    const op = vi.fn().mockRejectedValueOnce(duplicate()).mockResolvedValueOnce("updated");
    expect(await retryOnDuplicateKey(op)).toBe("updated");
    expect(op).toHaveBeenCalledTimes(2);
  });

  it("does not retry other errors, and gives up after one retry", async () => {
    const other = vi.fn().mockRejectedValue(new Error("network"));
    await expect(retryOnDuplicateKey(other)).rejects.toThrow("network");
    expect(other).toHaveBeenCalledTimes(1);

    const stubborn = vi.fn().mockRejectedValue(duplicate());
    await expect(retryOnDuplicateKey(stubborn)).rejects.toMatchObject({ code: 11000 });
    expect(stubborn).toHaveBeenCalledTimes(2);
  });
});
