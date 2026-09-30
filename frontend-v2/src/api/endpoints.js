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

/** Homepage headline numbers, without downloading every listing. */
export async function getStats({ signal } = {}) {
  const body = await request("/listings/stats", { signal });
  return { products: body.products, platforms: body.platforms };
}

export async function createAlert({ listingId, email, targetPrice }, { signal } = {}) {
  const body = await request("/alerts", { method: "POST", body: { listingId, email, targetPrice }, signal });
  return body.data;
}

export async function listAlerts(email, { signal } = {}) {
  const body = await request("/alerts", { params: { email }, signal });
  return body.data ?? [];
}

export async function cancelAlert(id, email, { signal } = {}) {
  const body = await request(`/alerts/${encodeURIComponent(id)}`, { method: "DELETE", body: { email }, signal });
  return body.data;
}

/** Readiness: database state and when data was last scraped. Answers 503 (an ApiError) when degraded. */
export async function getHealth({ signal } = {}) {
  return request("/health", { signal, timeoutMs: 5000 });
}
