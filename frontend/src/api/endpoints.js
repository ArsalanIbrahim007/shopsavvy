// endpoints.js — one function per backend endpoint the app uses, returning data in
// the shape the UI wants. Pages and hooks never build URLs or read raw bodies.
//
// The contract is documented by the backend at /api-docs.

import { request } from "./client.js";

// A search for something not scraped in the last 30 minutes runs live scrapers
// (about 15-25 s cold), so it gets a longer limit than everything else.
const SEARCH_TIMEOUT_MS = 60000;

/**
 * Search, grouped by product.
 * @returns {Promise<{offers: object[], groups: object[], groupCount: number, summary: object|null}>}
 */
export async function searchListings({ q, category, signal }) {
  const body = await request("/listings/search", {
    params: { q, category },
    signal,
    timeoutMs: SEARCH_TIMEOUT_MS,
  });

  return {
    offers: body.data ?? [],
    groups: body.groups ?? [],
    groupCount: body.groupCount ?? (body.groups ?? []).length,
    // How many stored listings matched, and how many of them (the most relevant) were grouped: a broad search shows only some.
    matched: body.matched ?? (body.data ?? []).length,
    // "exact", "words" or "spelling" (only close spellings of the search were found), null for nothing
    matchedBy: body.matchedBy ?? null,
    grouped: body.count ?? (body.data ?? []).length,
    summary: body.summary ?? null,
    // The server answered from stored prices and is fetching new ones from the stores; asking again shortly returns them.
    refreshing: body.refresh?.refreshing === true,
  };
}

/**
 * One listing with the other offers for the same product, and `outlook`: what the product's own recorded prices say about waiting
 * (see lib/outlook.js). `outlook` is null when the server could not work it out; the page then shows nothing about it.
 */
// A product's answer asked for ahead of the click (prefetchListing: the shopper hovered or touched its card), kept PREFETCH_MS.
// getListing takes it from here instead of asking again, so the product page often opens with its data already here (2026-11-08).
export const PREFETCH_MS = 30 * 1000;
const prefetched = new Map(); // id -> { at, promise } (the promise gives the body, or null if it failed)

export function prefetchListing(id) {
  const key = String(id ?? "");
  if (!key) return;
  const hit = prefetched.get(key);
  if (hit && Date.now() - hit.at < PREFETCH_MS) return;
  prefetched.set(key, { at: Date.now(), promise: request(`/listings/${encodeURIComponent(key)}`).catch(() => null) });
}

export function clearPrefetched() {
  prefetched.clear();
}

export async function getListing(id, { signal } = {}) {
  const hit = prefetched.get(String(id));
  const early = hit && Date.now() - hit.at < PREFETCH_MS ? await hit.promise : null;
  const body = early ?? (await request(`/listings/${encodeURIComponent(id)}`, { signal }));
  return {
    listing: body.listing,
    offers: body.offers ?? [],
    summary: body.summary ?? null,
    productGroup: body.productGroup ?? null,
    outlook: body.outlook ?? null,
    // The trained drop forecast: the stores whose price is among those it ranks most likely to fall this week (often none).
    dropChances: body.dropChances ?? [],
    // What the stores' own pages state about the product ({ sheet, from, score }), or null when no page did.
    specs: body.specs ?? null,
  };
}

/**
 * 2 to 4 products side by side (GET /api/listings/compare): for each, its best offer, lowest current price, the specifications
 * its stores' pages state, their score and where that ranks among products priced like it.
 * @param {string[]} ids  listing ids
 * @returns {Promise<{products: object[]}>}
 */
export async function compareProducts(ids, { signal } = {}) {
  const body = await request("/listings/compare", { params: { ids: ids.join(",") }, signal, timeoutMs: 60000 });
  return { products: body.products ?? [] };
}

/**
 * Top deals from stored data (no scraping, cached by the server for ten minutes). The list is
 * short by design: the server only reports a saving it can stand behind, so the UI must look
 * right with a handful of cards and hide the section when it is empty.
 * @param {object} [options]
 * @param {string} [options.category]  smartphone, laptop, tv, tablet, smartwatch or headphones; omitted means all
 * @param {number} [options.limit]     1-50, default 12
 * @returns {Promise<{deals: object[], generatedAt: string|null, maxAgeHours: number|null}>}
 */
export async function getDeals({ category, limit, signal } = {}) {
  const body = await request("/listings/deals", { params: { category, limit }, signal });
  return { deals: body.data ?? [], generatedAt: body.generatedAt ?? null, maxAgeHours: body.maxAgeHours ?? null };
}

/**
 * Offers whose price just came down, from the recorded price history (no scraping). Each item is a listing with a `drop`:
 * { price, before, day, beforeDay, rupees, percent }. `rules` repeats the thresholds the server used, so the page can state them.
 * @param {object} [options]
 * @param {string} [options.category]  smartphone, laptop, tv, tablet, smartwatch or headphones; omitted means all
 * @param {number} [options.limit]     1-50, default 24
 * @returns {Promise<{drops: object[], generatedAt: string|null, rules: object|null}>}
 */
/**
 * "Deals we didn't show you": how many fake discounts, above-market "was" prices and unusual prices the checks caught, and up to
 * four examples with their evidence (backend/src/services/caughtFeed.service.js).
 */
export async function getCaught({ signal } = {}) {
  const body = await request("/listings/caught", { signal });
  return {
    counts: body.counts ?? { fakeDiscount: 0, aboveMarket: 0, unusualPrice: 0 },
    examples: body.examples ?? [],
    generatedAt: body.generatedAt ?? null,
  };
}

export async function getPriceDrops({ category, limit, signal } = {}) {
  const body = await request("/listings/drops", { params: { category, limit }, signal });
  return { drops: body.data ?? [], generatedAt: body.generatedAt ?? null, rules: body.rules ?? null };
}

/**
 * Browse one category without searching: its products, most compared first. The server groups a
 * category once and caches it in the background (shoppers' searches and product pages go first), so the
 * very first request after a server restart can take over a minute; every later one is instant, hence
 * the long time limit (the server gives up on a job at 90 s).
 * @param {object} options
 * @param {string} options.category  smartphone, laptop, tv, tablet, smartwatch or headphones
 * @returns {Promise<{groups: object[], total: number, offset: number, generatedAt: string|null}>}
 */
export async function getCatalog({ category, brand, limit, offset, signal }) {
  const body = await request("/listings/catalog", { params: { category, brand, limit, offset }, signal, timeoutMs: 100000 });
  return {
    groups: body.data ?? [], total: body.total ?? 0, offset: body.offset ?? 0, generatedAt: body.generatedAt ?? null,
    // How many products of the whole category each brand has ([{ brand, count }], most first), for the brand filter; null when the
    // server answered from its saved first page.
    brands: Array.isArray(body.brands) ? body.brands : null,
  };
}

/**
 * What ShopSavvy's own checks found in the data it holds, and how the trained models scored on pairs they never saw.
 * Counted by the server from its cached catalog (cached ten minutes); the first request after a restart can take about a minute.
 * @returns {Promise<{generatedAt: string, live: object, evaluation: {matcher: object|null, discount: object|null}}>}
 */
export async function getIntegrity({ signal } = {}) {
  const body = await request("/integrity", { signal, timeoutMs: 100000 });
  return { generatedAt: body.generatedAt ?? null, live: body.live ?? null, evaluation: body.evaluation ?? { matcher: null, discount: null } };
}

// The server answers an empty list below this length; not asking saves a request per keystroke.
export const MIN_SUGGEST_LENGTH = 2;

/**
 * Search-box suggestions: clean product names from the listings we hold, best first.
 * @returns {Promise<{text: string, category: string, count: number}[]>}
 */
export async function getSuggestions(q, { limit, signal } = {}) {
  const text = (q ?? "").trim();
  if (text.length < MIN_SUGGEST_LENGTH) return [];
  const body = await request("/listings/suggest", { params: { q: text, limit }, signal });
  return body.data ?? [];
}

/** Homepage headline numbers, without downloading every listing. */
export async function getStats({ signal } = {}) {
  const body = await request("/listings/stats", { signal });
  return { products: body.products, platforms: body.platforms, categories: body.categories ?? [] };
}

/**
 * Price alerts use double opt-in: a new alert is `pending` and does nothing until the link in the
 * confirmation email is followed, because nothing proves the person typing an address owns it.
 * Show `message`: it says whether the confirmation email was sent, or that this server cannot
 * send email yet (the alert is then saved but inactive).
 * @returns {Promise<{alert: object, message: string, confirmationRequired: boolean, confirmationSent: boolean}>}
 */
export async function createAlert({ listingId, email, targetPrice }, { signal } = {}) {
  const body = await request("/alerts", { method: "POST", body: { listingId, email, targetPrice }, signal });
  return {
    alert: body.data,
    message: body.message ?? "",
    confirmationRequired: body.confirmationRequired === true,
    confirmationSent: body.confirmationSent === true,
  };
}

// The links in alert emails open pages served by the API itself (/alerts/confirm and /alerts/cancel),
// so these two are only needed if the frontend hosts those pages instead. The token is the secret
// from the link. A forged, unknown or expired token is a 404 (the same answer for all three).
// There is deliberately no "list my alerts" or "cancel by email": those let anyone enumerate or
// cancel another person's alerts.

/** Activates a pending alert. Safe to repeat. */
export async function confirmAlert(token, { signal } = {}) {
  const body = await request("/alerts/confirm", { method: "POST", body: { token }, signal });
  return { alert: body.data, message: body.message ?? "" };
}

/** Cancels an alert. Safe to repeat. */
export async function cancelAlert(token, { signal } = {}) {
  const body = await request("/alerts/cancel", { method: "POST", body: { token }, signal });
  return { alert: body.data, message: body.message ?? "" };
}

/** Readiness: database state and when data was last scraped. Answers 503 (an ApiError) when degraded. */
export async function getHealth({ signal } = {}) {
  return request("/health", { signal, timeoutMs: 5000 });
}

/**
 * Sends one person's answers to the user acceptance test (/try page, lib/uat.js toUatResponse). Anonymous.
 * @returns {Promise<{susScore: number}>}
 */
export async function submitUatResponse(response, { signal } = {}) {
  const body = await request("/uat/responses", { method: "POST", body: response, signal });
  return { susScore: body.susScore };
}
