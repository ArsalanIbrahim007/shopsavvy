import { describe, it, expect, vi } from "vitest";
import mongoose from "mongoose";

import { shutdown } from "../src/config/process.js";

describe("shutdown", () => {
  it("stops jobs, stops accepting requests, closes the database, then exits with the given code", async () => {
    const order = [];
    const exit = vi.spyOn(process, "exit").mockImplementation(() => undefined);
    const closeDb = vi.spyOn(mongoose.connection, "close").mockImplementation(async () => { order.push("database closed"); });

    const jobs = [{ stop: () => order.push("job 1 stopped") }, { stop: () => order.push("job 2 stopped") }];
    const server = {
      close: (callback) => { order.push("server closed"); callback(); },
      closeIdleConnections: () => order.push("idle connections closed"),
    };

    await shutdown({ reason: "test", exitCode: 0, server, jobs, timeoutMs: 5000 });

    // Jobs first (nothing new starts), then the listener, then the database last.
    expect(order[0]).toBe("job 1 stopped");
    expect(order[1]).toBe("job 2 stopped");
    expect(order.indexOf("server closed")).toBeGreaterThan(1);
    expect(order.at(-1)).toBe("database closed");
    expect(exit).toHaveBeenCalledWith(0);

    closeDb.mockRestore();
    exit.mockRestore();
  });
});
