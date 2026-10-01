// marketMovement.service.js — how prices have moved across every tracked listing (see summarizeMovement), cached ten minutes.
//
// This is context on a product page, so it must never hold the page up or break it: it gives null if the history cannot be read, and
// null if the answer is not ready within a few seconds (the work carries on in the background and the next request gets it).

import PriceHistory from "../models/priceHistory.model.js";
import { summarizeMovement } from "./priceOutlook.service.js";

const CACHE_TTL_MS = 10 * 60 * 1000;
const WAIT_MS = 3000;

let cache = null;
let inFlight = null;

export function clearMarketMovementCache() {
  cache = null;
  inFlight = null;
}

async function compute(now) {
  const documents = await PriceHistory.find({}).select("platform entries").lean();
  return summarizeMovement(documents, { now });
}

function start(now) {
  inFlight = compute(now)
    .then((value) => {
      cache = { expires: now + CACHE_TTL_MS, value };
      return value;
    })
    .catch((error) => {
      console.error("[marketMovement] could not read price history:", error.message);
      return null;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/**
 * @param {object} [options]
 * @param {number} [options.now]  epoch ms
 * @param {number} [options.waitMs]  how long a caller waits before getting null
 * @returns {Promise<object|null>}
 */
export async function getMarketMovement({ now = Date.now(), waitMs = WAIT_MS } = {}) {
  if (cache && cache.expires > now) return cache.value;

  const pending = inFlight ?? start(now);
  let timer;
  const patience = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), waitMs);
  });
  try {
    return await Promise.race([pending, patience]);
  } finally {
    clearTimeout(timer);
  }
}
