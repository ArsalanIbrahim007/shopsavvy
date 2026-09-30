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
    summary: body.summary ?? null,
  };
}

/** One listing with the other offers for the same product. */
export async function getListing(id, { signal } = {}) {
  const body = await request(`/listings/${encodeURIComponent(id)}`, { signal });
  return {
    listing: body.listing,
    offers: body.offers ?? [],
    summary: body.summary ?? null,
    productGroup: body.productGroup ?? null,
  };
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
 * Browse one category without searching: its products, most compared first. The server groups a
 * category once and caches it, so the very first request after a server restart can take half a
 * minute; every later one is instant, hence the longer time limit.
 * @param {object} options
 * @param {string} options.category  smartphone, laptop, tv, tablet, smartwatch or headphones
 * @returns {Promise<{groups: object[], total: number, offset: number, generatedAt: string|null}>}
 */
export async function getCatalog({ category, limit, offset, signal }) {
  const body = await request("/listings/catalog", { params: { category, limit, offset }, signal, timeoutMs: 45000 });
  return { groups: body.data ?? [], total: body.total ?? 0, offset: body.offset ?? 0, generatedAt: body.generatedAt ?? null };
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
