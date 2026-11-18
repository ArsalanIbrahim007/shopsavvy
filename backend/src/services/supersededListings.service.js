// supersededListings.service.js — retires a store's old plain-address copy of a product it now lists under its variants' addresses.
//
// WooCommerce stores (techroid, eezepc, xcessorieshub, ledshop, infinix.pk) are read one listing per variant since about 2026-11-12:
// "https://techroid.com/product/infinix-note-60-pro/?attribute_storage=8GB – 256GB". The listing saved before that, at the plain
// address, is never returned again, so it stayed beside the variant's as a second, older offer of the same store ("old and new both
// shown", 2026-11-18): 83 such copies, last checked days before their variants.
//
// A plain-address listing is retired when the same store holds listings at that address with a query (its variants) and the newest
// of them was checked after it. Retired listings are hidden everywhere (config/platforms.js VISIBLE_PLATFORMS_FILTER) and keep their
// history; a search that finds the plain address again brings it back (scraper.service.js toListingDoc clears supersededAt).

import Listing from "../models/listing.model.js";

/** "https://x.pk/product/a/?q=1" -> "x.pk/product/a"; null for something that is not an address. */
export function pageOf(url) {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

const hasQuery = (url) => {
  try {
    return new URL(url).search.length > 1;
  } catch {
    return false;
  }
};

/**
 * The plain-address listings to retire among `listings` ({_id, platform, sourceUrl, lastScrapedAt}): those whose page the same store
 * also lists with a query, checked more recently.
 */
export function findSuperseded(listings) {
  const newestVariant = new Map(); // platform|page -> newest check of a listing at that page with a query
  for (const l of listings) {
    if (!hasQuery(l.sourceUrl)) continue;
    const key = `${l.platform}|${pageOf(l.sourceUrl)}`;
    const at = new Date(l.lastScrapedAt ?? 0).getTime();
    if (!newestVariant.has(key) || at > newestVariant.get(key)) newestVariant.set(key, at);
  }
  return listings.filter((l) => {
    if (hasQuery(l.sourceUrl) || !pageOf(l.sourceUrl)) return false;
    const newest = newestVariant.get(`${l.platform}|${pageOf(l.sourceUrl)}`);
    return newest !== undefined && newest > new Date(l.lastScrapedAt ?? 0).getTime();
  });
}

/** Finds and (unless dryRun) retires them. Returns { checked, retired, byStore, examples }. */
export async function retireSupersededListings({ dryRun = false, now = new Date(), model = Listing } = {}) {
  const listings = await model.find({ supersededAt: null }, { platform: 1, sourceUrl: 1, lastScrapedAt: 1, title: 1, price: 1 }).lean();
  const superseded = findSuperseded(listings);
  if (!dryRun && superseded.length) {
    await model.updateMany({ _id: { $in: superseded.map((l) => l._id) } }, { $set: { supersededAt: now } });
  }
  const byStore = {};
  for (const l of superseded) byStore[l.platform] = (byStore[l.platform] ?? 0) + 1;
  return { checked: listings.length, retired: superseded.length, byStore, examples: superseded.slice(0, 5).map((l) => `${l.platform}: ${l.title} (${l.price})`), dryRun };
}
