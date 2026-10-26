// searchFreshness.js — when a search's stored prices are recent enough not to ask the stores again.

// How old data can be before we re-scrape (in minutes). Set to 30 minutes so rapid repeated searches don't hammer sites.
export const STALE_THRESHOLD_MINUTES = 30;

/**
 * What a search's own results (the listings it would show) say about asking the stores: "fresh" when one was scraped within
 * STALE_THRESHOLD_MINUTES, "stale" when there are some but all older, "missing" when there are none. The search controller decides
 * from this. Judging instead by whether a stored title contained the phrase word for word called "samsung tv" missing even right
 * after 176 Samsung TVs were scraped, so every such search waited ~17 s and asked all 23 stores again (load test, 2026-10-26).
 */
export function resultsState(listings, now = Date.now()) {
  if (!listings?.length) return "missing";
  const freshAfter = now - STALE_THRESHOLD_MINUTES * 60 * 1000;
  return listings.some((listing) => new Date(listing.lastScrapedAt).getTime() >= freshAfter) ? "fresh" : "stale";
}
