// storeBreaker.js — stops asking a store that is not answering, without giving up on it.
//
// On 2026-10-08 Telemart answered HTTP 429 to all 468 searches of the nightly run, and Paklap and iShopping failed 468 times in a row
// because their browser could not start. Nothing was gained by the other 1,400 requests, and the 429s were requests to a store that
// had already said no.
//
// After FAILURES_TO_OPEN failures in a row a store is paused. When the pause ends ONE request goes out as a probe (other searches
// still skip the store until it answers): a success closes the breaker, a failure pauses again for the next, longer, pause.
// Pauses: 5, 15, then 30 minutes (the last one repeats). So a store that stays down gets about 11 requests in a 2.5-hour run instead
// of about 500, and one that recovers is back within one pause. A search that finds nothing is NOT a failure: only an error is.
//
// State lives in memory, per process: each nightly run starts with every store trusted, and a long-running server forgets a store's
// bad hour by itself. Nothing is written to disk.

export const FAILURES_TO_OPEN = 5;
export const PAUSES_MS = [5 * 60 * 1000, 15 * 60 * 1000, 30 * 60 * 1000];

/**
 * @param {{failuresToOpen?: number, pausesMs?: number[], now?: () => number, log?: (message: string) => void}} [options]
 */
export function createStoreBreaker({ failuresToOpen = FAILURES_TO_OPEN, pausesMs = PAUSES_MS, now = () => Date.now(), log = () => {} } = {}) {
  const stores = new Map(); // platform -> { failures, opened, reopenAt, probing }

  const stateOf = (platform) => {
    if (!stores.has(platform)) stores.set(platform, { failures: 0, opened: 0, reopenAt: 0, probing: false });
    return stores.get(platform);
  };

  return {
    /** Whether a request to this store should go out now. Once its pause has ended, exactly one caller gets true (the probe). */
    allow(platform) {
      const state = stateOf(platform);
      if (state.opened === 0) return true;
      if (state.probing || now() < state.reopenAt) return false;
      state.probing = true;
      log(`[breaker] ${platform}: trying it again after ${state.failures} failures in a row`);
      return true;
    },

    success(platform) {
      const state = stateOf(platform);
      if (state.opened > 0) log(`[breaker] ${platform}: answering again`);
      Object.assign(state, { failures: 0, opened: 0, reopenAt: 0, probing: false });
    },

    failure(platform) {
      const state = stateOf(platform);
      state.failures += 1;
      state.probing = false;
      if (state.failures < failuresToOpen) return;
      state.opened += 1;
      const pause = pausesMs[Math.min(state.opened, pausesMs.length) - 1];
      state.reopenAt = now() + pause;
      log(`[breaker] ${platform}: ${state.failures} failures in a row, paused for ${Math.round(pause / 60000)} min`);
    },

    /** For logs and, later, the health endpoint: which stores are paused and until when. */
    paused() {
      return [...stores].filter(([, s]) => s.opened > 0).map(([platform, s]) => ({ platform, failures: s.failures, until: s.reopenAt }));
    },

    reset() {
      stores.clear();
    },
  };
}

export const storeBreaker = createStoreBreaker({ log: (message) => console.warn(message) });
