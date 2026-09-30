// runtimeStats.service.js — how responsive the Node main thread has been.
//
// "Event-loop delay" is how late timers fire because the main thread was busy. When
// it is high, every request is waiting behind something (this is how the product
// page once froze the whole API: /api/health itself timed out). Reported by
// /api/health so a stall shows up as a number instead of a mystery.
//
// The histogram covers a rolling window: it is cleared every WINDOW_MS, so an old
// spike ages out instead of showing forever.

import { monitorEventLoopDelay } from "node:perf_hooks";

const WINDOW_MS = 5 * 60 * 1000;
const RESOLUTION_MS = 10;

let histogram = null;
let resetTimer = null;
let windowStartedAt = 0;

// The histogram records the whole gap between ticks, which includes the sampling interval
// itself; what matters is how much LATER than scheduled the tick ran.
const lagMs = (nanoseconds) => Math.max(0, Math.round((nanoseconds / 1e6 - RESOLUTION_MS) * 10) / 10);

export function startEventLoopMonitor() {
  if (histogram) return;
  histogram = monitorEventLoopDelay({ resolution: RESOLUTION_MS });
  histogram.enable();
  windowStartedAt = Date.now();

  resetTimer = setInterval(() => {
    histogram.reset();
    windowStartedAt = Date.now();
  }, WINDOW_MS);
  resetTimer.unref();
}

export function stopEventLoopMonitor() {
  clearInterval(resetTimer);
  histogram?.disable();
  histogram = null;
  resetTimer = null;
}

/**
 * @returns {{p99Ms: number, maxMs: number, windowSeconds: number} | null}
 *   null when the monitor has not been started. The monitor samples every 10 ms, so a
 *   window with no samples yet reports 0.
 */
export function eventLoopStats() {
  if (!histogram) return null;
  const hasSamples = histogram.count > 0;
  return {
    p99Ms: hasSamples ? lagMs(histogram.percentile(99)) : 0,
    maxMs: hasSamples ? lagMs(histogram.max) : 0,
    windowSeconds: Math.round((Date.now() - windowStartedAt) / 1000),
  };
}
