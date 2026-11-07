// searchRanking.service.js — which of a search's stored listings are grouped and shown, when there are too many to group quickly.
//
// Grouping compares listings with each other, so its time grows faster than their number. Measured on 64,500 listings
// (2026-11-07): "galaxy a17" (122 listings) 0.1 s, "laptop" (526) 0.6 s, "samsung galaxy" (1,389) 3.3 s, "samsung" (2,947)
// 13.4 s, "tv" (5,117) 33.9 s; a one-letter search ("a") matched 16,600 and ran into the 90 s worker limit, so a shopper waited
// 95 s for an error, and a few such requests could block every search. A search now groups at most MAX_SEARCH_LISTINGS, the most
// relevant, and says how many matched, so the shopper can narrow it ("samsung tv 55").
//
// Relevance, highest first: every word of the search in the title, the words together as typed, the category the search names
// (and not an accessory, unless asked for), a product more stores sell (most compared first, as the category pages), a current
// price (checked within 14 days), in stock. Ties keep the order the database gave (cheapest first), as does the final list.

export const MAX_SEARCH_LISTINGS = 500;

const CURRENT_MS = 14 * 24 * 60 * 60 * 1000;

const words = (text) => String(text ?? "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/** True when the search holds something to look for: a run of at least two letters or digits ("tv", "i7"; not "a", "1", "?+"). */
export function isSearchable(query) {
  return /[a-z0-9]{2}/i.test(String(query ?? ""));
}

/**
 * @param {object[]} listings  the search's stored listings, in the database's order
 * @param {{query: string, category?: string, limit?: number, now?: number}} options  `category`: the category the search names
 * @returns {{listings: object[], matched: number}}  the chosen listings, in their original order, and how many there were
 */
export function selectSearchListings(listings, { query, category, limit = MAX_SEARCH_LISTINGS, now = Date.now() }) {
  if (listings.length <= limit) return { listings, matched: listings.length };

  const queryWords = words(query);
  const phrase = queryWords.join(" ");
  const wantsAccessory = category === "accessory";

  // How many stores sell each title (as normalised), for "most compared first".
  const storesByTitle = new Map();
  for (const listing of listings) {
    const key = listing.normalizedTitle || String(listing.title ?? "").toLowerCase();
    if (!storesByTitle.has(key)) storesByTitle.set(key, new Set());
    storesByTitle.get(key).add(listing.platform);
  }

  const score = (listing) => {
    const titleWords = words(listing.title);
    const titleSet = new Set(titleWords);
    let s = 0;
    if (queryWords.length && queryWords.every((w) => titleSet.has(w))) s += 4;
    if (phrase && titleWords.join(" ").includes(phrase)) s += 2;
    if (category && category !== "other" && listing.productCategory === category) s += 3;
    if (!wantsAccessory && (listing.productCategory === "accessory" || listing.productCategory === "other")) s -= 3;
    const stores = storesByTitle.get(listing.normalizedTitle || String(listing.title ?? "").toLowerCase())?.size ?? 1;
    s += Math.min(stores - 1, 3);
    if (now - new Date(listing.lastScrapedAt).getTime() <= CURRENT_MS) s += 2;
    if (listing.inStock !== false) s += 1;
    return s;
  };

  const chosen = new Set(
    listings
      .map((listing, index) => ({ listing, index, s: score(listing) }))
      .sort((a, b) => b.s - a.s || a.index - b.index)
      .slice(0, limit)
      .map(({ listing }) => listing),
  );
  return { listings: listings.filter((listing) => chosen.has(listing)), matched: listings.length };
}
