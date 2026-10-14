// priceDrops.service.js — "price drops": offers whose price has just come down, read from the price history the nightly scrape
// records. No scraping, no grouping: one pass over recent history, cached for a few minutes.
//
// What counts as a drop (DROPS):
//   - the newest price was recorded in the last RECENT_DAYS days (Pakistan calendar days), so the drop is news, not history;
//   - it is compared with the price recorded on the last EARLIER day, at most BEFORE_MAX_DAYS before it, so a drop is a real
//     step between two checks, not a comparison with a price from months ago;
//   - it is at least MIN_PERCENT and MIN_RUPEES lower, so a rounding change is not a "drop";
//   - it is at most MAX_PERCENT lower. A bigger fall is more often a parsing error or a different product on the same page than a
//     sale (the iShopping was-price fix of 2026-10-08 turned one stored price into another overnight), so it is left out, not shown;
//   - the listing is active, new (not used, refurbished or open box), still priced at the new price, and in a category where
//     comparing stores is the point of the site.
// The page that shows these says what the rules are; nothing here is a prediction.

import { DEAL_CATEGORIES } from "./dealsFeed.service.js";
import { dailyPrices, karachiDay } from "./priceOutlook.service.js";
import Listing from "../models/listing.model.js";
import PriceHistory from "../models/priceHistory.model.js";

export const DROPS = Object.freeze({
  MIN_PERCENT: 5,
  MIN_RUPEES: 500,
  MAX_PERCENT: 50,
  RECENT_DAYS: 2,
  BEFORE_MAX_DAYS: 14,
});

const DAY_MS = 24 * 3600 * 1000;
const CACHE_MS = 10 * 60 * 1000;
const dayNumber = (day) => Math.round(Date.parse(day) / DAY_MS);

/**
 * The drop shown by one listing's recorded prices, or null.
 * @param {{price: number, recordedAt: Date|string}[]} entries
 * @returns {null | {price: number, before: number, day: string, beforeDay: string, rupees: number, percent: number}}
 */
export function findDrop(entries, { now = Date.now() } = {}) {
  const days = dailyPrices(entries);
  if (days.length < 2) return null;

  const latest = days.at(-1);
  const previous = days.at(-2);
  const today = dayNumber(karachiDay(now));
  if (today - dayNumber(latest.day) >= DROPS.RECENT_DAYS) return null; // last seen too long ago to call it news
  if (dayNumber(latest.day) - dayNumber(previous.day) > DROPS.BEFORE_MAX_DAYS) return null; // nothing recent to compare with

  const rupees = previous.price - latest.price;
  const percent = (rupees / previous.price) * 100;
  if (rupees < DROPS.MIN_RUPEES || percent < DROPS.MIN_PERCENT || percent > DROPS.MAX_PERCENT) return null;

  return { price: latest.price, before: previous.price, day: latest.day, beforeDay: previous.day, rupees, percent: Math.round(percent * 10) / 10 };
}

const PRE_OWNED = new Set(["used", "refurbished", "open_box"]);

/**
 * Drops across the stored history, biggest percentage first.
 * @param {{category?: string, limit?: number, now?: number, historyModel?: object, listingModel?: object}} [options]
 */
export async function computePriceDrops({ category, limit = 24, now = Date.now(), historyModel = PriceHistory, listingModel = Listing } = {}) {
  const since = new Date(now - (DROPS.RECENT_DAYS + 1) * DAY_MS);
  // A history is matched to its listing by store and product URL, the pair both are saved under (scraper.service.js): almost no
  // history carries the `listing` reference (46 of 11,630 on 2026-10-15).
  const histories = await historyModel.find({ "entries.recordedAt": { $gte: since } }).select("platform sourceUrl entries").lean();

  const keyOf = (doc) => `${String(doc.platform).toLowerCase()}|${doc.sourceUrl}`;
  const drops = new Map(); // "platform|sourceUrl" -> drop
  for (const history of histories) {
    const drop = findDrop(history.entries, { now });
    if (drop) drops.set(keyOf(history), drop);
  }
  if (drops.size === 0) return [];

  const categories = category ? [category] : DEAL_CATEGORIES;
  const urls = [...new Set(histories.filter((history) => drops.has(keyOf(history))).map((history) => history.sourceUrl))];
  const listings = await listingModel
    .find({ sourceUrl: { $in: urls }, isActive: true, productCategory: { $in: categories } })
    .select("title platform price imageUrl productUrl sourceUrl productCategory condition ptaStatus storageGb lastScrapedAt")
    .lean();

  return listings
    .filter((listing) => drops.has(keyOf(listing)))
    .filter((listing) => !PRE_OWNED.has(listing.condition) && listing.price === drops.get(keyOf(listing)).price) // still at the new price
    .map((listing) => ({ ...listing, _id: String(listing._id), drop: drops.get(keyOf(listing)) }))
    .sort((a, b) => b.drop.percent - a.drop.percent || b.drop.rupees - a.drop.rupees)
    .slice(0, limit);
}

const cache = new Map(); // category or "all" -> { at, drops, pending }

/** Cached for CACHE_MS per category; concurrent requests share one computation. */
export async function getPriceDrops({ category, limit = 24, now = Date.now() } = {}) {
  const key = category || "all";
  const entry = cache.get(key);
  if (entry?.drops && now - entry.at < CACHE_MS) return { drops: entry.drops.slice(0, limit), generatedAt: new Date(entry.at).toISOString() };
  if (entry?.pending) return entry.pending.then(() => getPriceDrops({ category, limit, now }));

  const pending = computePriceDrops({ category, limit: 50, now }).then(
    (drops) => { cache.set(key, { at: now, drops }); return drops; },
    (err) => { cache.delete(key); throw err; },
  );
  cache.set(key, { ...entry, pending });
  const drops = await pending;
  return { drops: drops.slice(0, limit), generatedAt: new Date(now).toISOString() };
}

export function clearPriceDropsCache() {
  cache.clear();
}
