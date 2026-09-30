// process.js — what happens to the process when things go wrong or it is asked
// to stop.
//
// Without this, Ctrl+C left the headless browser and the database connection
// open, and a promise that rejected with nobody listening either crashed the
// server mid-request (Node's default) or vanished without a trace.
//
// - SIGINT / SIGTERM: shut down in order (stop jobs, stop accepting requests,
//   close the browser, close the database) and exit 0.
// - uncaughtException: the process may be in an unknown state, so log it, shut
//   down cleanly and exit 1 (nodemon or a process manager restarts it).
// - unhandledRejection: logged loudly and the server KEEPS running. A single
//   scraper promise failing late must not take down a live demo; the log line
//   is how it gets noticed and fixed.

import mongoose from "mongoose";

let shuttingDown = false;

/**
 * Stops everything in a sensible order, with a hard deadline so a hung
 * connection cannot keep the process alive forever.
 */
export async function shutdown({ reason, exitCode = 0, server, jobs = [], timeoutMs = 10000 }) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`[process] Shutting down (${reason})...`);

  const deadline = setTimeout(() => {
    console.error("[process] Shutdown took too long, forcing exit.");
    process.exit(exitCode || 1);
  }, timeoutMs);
  deadline.unref();

  try {
    for (const job of jobs) job?.stop?.();

    if (server) {
      await new Promise((resolve) => {
        server.close(() => resolve());
        server.closeIdleConnections?.();
      });
    }

    // The scrapers keep one shared headless browser alive; close it if it was used.
    try {
      const { closeBrowser } = await import("../scrapers/playwrightFetch.js");
      await closeBrowser?.();
    } catch (error) {
      console.warn("[process] Could not close the browser:", error.message);
    }

    await mongoose.connection.close();
    console.log("[process] Clean shutdown complete.");
  } catch (error) {
    console.error("[process] Error during shutdown:", error);
    exitCode = exitCode || 1;
  }

  process.exit(exitCode);
}

export function installProcessHandlers({ server, jobs }) {
  process.on("SIGINT", () => shutdown({ reason: "SIGINT", server, jobs }));
  process.on("SIGTERM", () => shutdown({ reason: "SIGTERM", server, jobs }));

  process.on("unhandledRejection", (reason) => {
    console.error("[process] Unhandled promise rejection (server keeps running):", reason);
  });

  process.on("uncaughtException", (error) => {
    console.error("[process] Uncaught exception:", error);
    shutdown({ reason: "uncaughtException", exitCode: 1, server, jobs });
  });
}
