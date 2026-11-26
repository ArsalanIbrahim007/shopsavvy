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

import { extractBrand } from "./productAttributes.service.js";

export const MAX_SEARCH_LISTINGS = 500;

const CURRENT_MS = 14 * 24 * 60 * 60 * 1000;

const words = (text) => String(text ?? "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

// Words as groupRelevance compares them: a model word and its number apart ("gt5" -> "gt", "5"), a plural s dropped.
const modelWords = (text) => words(String(text ?? "").replace(/\bultra[\s-]+(slim|thin|light)/gi, "$1"))
  .flatMap((w) => w.match(/^([a-z]{2,})(\d{1,2})$/)?.slice(1) ?? [w])
  .map((w) => w.replace(/^([a-z]{3,}[^s])s$/, "$1"));
// A word that makes another version of a model: a product with one the search does not ask for is a step further from it
// ("Galaxy Watch 8" and the "Watch 8 Classic", "AirPods 4" and the "AirPods 4 ANC").
const VERSION_WORDS = new Set(["pro", "max", "plus", "ultra", "mini", "lite", "classic", "fe", "se", "active", "anc", "nc", "edge", "prime", "neo", "slide", "fold", "flip"]);
const TITLES_COMPARED = 20;

/**
 * How closely a product (a group of offers) matches what was searched, for the order of the results: the best of its titles. Every
 * searched word in the title counts, all of them more; a searched number right after its word ("GT 5", so the GT 5 Pro, not a
 * "GT 2 Pro" that also says "5 ATM") more again, and each version word the search did not ask for counts against it. "HUAWEI GT 5
 * Pro" showed the GT 6 Pro, 7 Pro and 2 Pro above the GT 5 Pro, ordered only by their number of offers (2026-11-26).
 * @returns {number}
 */
// What the audit of 26 Nov found ranked level with the product searched for: a used or like-new unit ("Galaxy S25 Ultra ... Like a
// New" first for "galaxy s25 ultra"), another maker's product ("Samsung Galaxy Watch Ultra 2" for "apple watch ultra 2"), and a
// case or strap for it ("AirPods 4 Spigen Case", second for "airpods 4"). Each goes below the product unless the search asks for it.
const SECOND_HAND = /\b(used|refurbished|renewed|open box|pre-?owned|like (a )?new|box ?open|non[- ]?active)\b/i;
const ACCESSORY = /\b(case|cover|strap|straps|protector|tempered|glass|skin|holder|ear ?tips|charger|cable)\b/i;
// a case or glass that is part of the product's own description ("Aluminum Case", "Charging Case", "Glass Door")
const PRODUCT_PARTS = /\b(aluminium|aluminum|titanium|steel|ceramic|charging|wireless charging|magsafe|glass door)\s+(case|glass)\b|\bglass door\b|\bwith\s+(free\s+)?\w*\s*(case|cover|strap)/gi;
const AWAY = 8;

export function groupRelevance(group, query) {
  const searched = modelWords(query);
  if (searched.length === 0) return 0;
  const asked = new Set(searched);
  const wantsSecondHand = SECOND_HAND.test(query);
  const wantsAccessory = ACCESSORY.test(query);
  const searchedBrand = extractBrand(String(query).split(/\s+/)[0] ?? "");
  const titles = [...new Set([group.rawGroupKey, group.productName, ...(group.offers ?? []).map((o) => o.title)].filter(Boolean))].slice(0, TITLES_COMPARED);
  let best = -Infinity;
  for (const title of titles) {
    const own = modelWords(title);
    const set = new Set(own);
    const matched = searched.filter((w) => set.has(w)).length;
    let score = matched * 2 + (matched === searched.length ? 5 : 0);
    // each searched number right after the word before it, as searched
    const numbers = searched.map((w, i) => [searched[i - 1], w]).filter(([before, w]) => before && /^\d{1,4}$/.test(w));
    const adjacent = numbers.filter(([before, n]) => own.some((w, i) => w === n && own[i - 1] === before)).length;
    if (numbers.length && adjacent === numbers.length) score += 4;
    score -= 3 * [...new Set(own.filter((w) => VERSION_WORDS.has(w) && !asked.has(w)))].length;
    best = Math.max(best, score);
  }
  if (best === -Infinity) return 0;
  // A product most of whose offers are used, another maker's, or an accessory: below the product searched for.
  const offerTitles = (group.offers ?? []).map((o) => String(o.title ?? "")).filter(Boolean);
  const most = (test) => offerTitles.length > 0 && offerTitles.filter(test).length * 2 > offerTitles.length;
  if (!wantsSecondHand && most((t) => SECOND_HAND.test(t))) best -= AWAY;
  if (!wantsAccessory && most((t) => ACCESSORY.test(t.replace(PRODUCT_PARTS, " ")))) best -= AWAY;
  if (searchedBrand && most((t) => { const b = extractBrand(t); return b !== null && b !== searchedBrand; })) best -= AWAY;
  return best;
}

/** How many stores sell a product: the tie-break after relevance, before the number of offers (one seller listing a phone six
 * times put it above the same phone at three stores, 2026-11-26). */
export const storeCount = (group) => new Set((group.offers ?? []).map((o) => o.platform).filter(Boolean)).size;

/**
 * True when a search that found nothing stored is worth asking every store about. A link, markup, a very long text or one endless
 * word is not a product name: "<script>alert(1)</script>", a 300-letter word, an Amazon link each made a shopper wait 16-24 s
 * while 23 stores were searched (audit 2026-11-18). The site's box turns a pasted link into a product name before searching.
 */
export function worthAskingStores(query) {
  const q = String(query ?? "");
  if (q.length > 80 || /https?:|www\.|[<>{}[\]\\]/i.test(q)) return false;
  return !q.split(/\s+/).some((word) => word.length > 25);
}

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
