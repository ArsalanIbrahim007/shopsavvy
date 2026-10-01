// politeJson.js — asks a store's own public search endpoint for JSON, politely.
//
// Used by the store adapters that read an endpoint the store itself publishes for its storefront (Shopify's
// /search/suggest.json, WooCommerce's /wp-json/wc/store/v1/products), which is lighter than downloading and parsing
// whole HTML pages. Conduct: an honest User-Agent that says who is asking, at most one request per store every
// MIN_GAP_MS even when several searches run together, a short time limit, and no retries of a refusal (a 403 or 429 is
// an answer, not a glitch to hammer).

import axios from "axios";

export const USER_AGENT = "ShopSavvyBot/1.0 (student price-comparison project; searches a store's public product search)";
export const MIN_GAP_MS = 1500;
const TIMEOUT_MS = 15000;

const nextFree = new Map(); // host -> epoch ms when the next request to it may start

/**
 * Waits for this host's turn. Exported for tests, which pass their own clock.
 * @returns {Promise<void>}
 */
export async function waitForTurn(host, { gapMs = MIN_GAP_MS, now = Date.now, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
  const start = Math.max(now(), nextFree.get(host) ?? 0);
  nextFree.set(host, start + gapMs); // claimed before waiting, so callers that arrive together queue up in order
  const wait = start - now();
  if (wait > 0) await sleep(wait);
}

/** GET a JSON document. Throws an Error with the HTTP status when the store refuses. */
export async function fetchJson(url) {
  await waitForTurn(new URL(url).host);
  try {
    const response = await axios.get(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      timeout: TIMEOUT_MS,
      maxRedirects: 3,
      responseType: "json",
      validateStatus: (status) => status >= 200 && status < 300,
    });
    return response.data;
  } catch (err) {
    const status = err.response?.status;
    throw new Error(`${new URL(url).host}: ${status ? `HTTP ${status}` : err.message}`);
  }
}
