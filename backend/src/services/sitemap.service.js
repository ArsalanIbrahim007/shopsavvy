// sitemap.service.js — the site's pages for search engines (sitemaps.org protocol), served at GET /sitemap.xml.
//
// A comparison site is found through search engines more than any other way, and the site is a single-page app whose product
// pages exist only as links, so without a sitemap a crawler finds few of them. Listed: the fixed pages, each category's browse
// page, and one page per product that at least two stores sell (a product with one offer has nothing to compare: thin content
// that search engines discount). A product's page is its cheapest current offer's, the one its card links to. Addresses use
// PUBLIC_SITE_URL (the frontend), while this file is served by the API: the frontend's robots.txt names it, which the protocol
// accepts for a sitemap on another host.
//
// Built only from the category catalogs already computed (catalogFeed.service.js, warmed at start-up), never by computing one:
// the first version did, and a crawler's request at start-up then grouped whole categories beside the warm-up until the worker
// timed out (500 after 95 s, found 2026-10-26). A category not computed yet is left out, and a sitemap missing one is kept only
// a few minutes, so the complete one follows; a complete one is kept an hour.

import { CATALOG_CATEGORIES, peekCatalogGroups } from "./catalogFeed.service.js";
import { currentOffers } from "./offerFreshness.service.js";
import { siteUrl } from "./productMatch.service.js";
import { productPath } from "./productPath.js";

const CACHE_TTL_MS = 60 * 60 * 1000;
const PARTIAL_TTL_MS = 5 * 60 * 1000;
// The protocol's ceiling for one file is 50,000 addresses and 50 MB; far above this catalogue, but enforced so a bug cannot
// produce a file every search engine rejects.
export const MAX_URLS = 50000;

const STATIC_PAGES = [
  { path: "/", changefreq: "daily", priority: "1.0" },
  { path: "/drops", changefreq: "daily", priority: "0.8" },
  { path: "/how-it-works", changefreq: "monthly", priority: "0.4" },
  { path: "/honest-prices", changefreq: "weekly", priority: "0.4" },
  { path: "/privacy", changefreq: "yearly", priority: "0.2" },
];

const XML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };
export const escapeXml = (text) => String(text).replace(/[&<>"']/g, (c) => XML_ESCAPES[c]);

const day = (date) => new Date(date).toISOString().slice(0, 10);

const PRE_OWNED = new Set(["used", "refurbished", "open_box"]);

/**
 * The offer a product's page is opened at: the one its card links to and its page names as canonical, by the frontend's rule
 * for "the lowest price" (frontend/src/lib/summary.js, summarizeOffers), step for step, so the sitemap and the page agree: new
 * offers over pre-owned ones, current prices (checked within 14 days), then believable ones (no unusual price), ones whose PTA
 * status is not in doubt and ones in stock, each step kept only when it leaves something; the cheapest of what remains.
 */
export function productPageOffer(group, now = Date.now()) {
  const priced = (group.offers ?? []).filter((offer) => offer?._id && Number(offer.price) > 0);
  const fresh = priced.filter((offer) => !PRE_OWNED.has(offer.condition));
  const offers = currentOffers(fresh.length ? fresh : priced, now);
  const believable = offers.filter((offer) => !offer.priceCheck?.status?.startsWith("suspect"));
  const comparable = believable.filter((offer) => !offer.ptaAssessment);
  const buyable = comparable.filter((offer) => offer.inStock !== false);
  const pool = buyable.length ? buyable : comparable.length ? comparable : believable.length ? believable : offers;
  return pool.reduce((best, offer) => (best === null || offer.price < best.price ? offer : best), null);
}

/** When a product's prices were last checked: the newest lastScrapedAt among its offers, or null. */
function lastChecked(group) {
  const times = (group.offers ?? []).map((offer) => new Date(offer.lastScrapedAt).getTime()).filter(Number.isFinite);
  return times.length ? new Date(Math.max(...times)) : null;
}

/**
 * The sitemap's entries, from each category's grouped products.
 * @param {Object<string, object[]>} groupsByCategory
 * @returns {Array<{loc: string, lastmod?: string, changefreq?: string, priority?: string}>}
 */
export function sitemapEntries(groupsByCategory, { site, now = Date.now() }) {
  const today = day(now);
  const entries = STATIC_PAGES.map(({ path, ...rest }) => ({ loc: `${site}${path}`, lastmod: today, ...rest }));
  const seen = new Set();

  for (const [category, groups] of Object.entries(groupsByCategory)) {
    entries.push({ loc: `${site}/results?category=${encodeURIComponent(category)}`, lastmod: today, changefreq: "daily", priority: "0.7" });
    for (const group of groups) {
      const stores = new Set((group.offers ?? []).map((offer) => offer.platform));
      if (stores.size < 2) continue;
      const offer = productPageOffer(group, now);
      if (!offer || seen.has(String(offer._id))) continue;
      seen.add(String(offer._id));
      const checked = lastChecked(group);
      entries.push({ loc: `${site}${productPath(offer._id, offer.title)}`, ...(checked ? { lastmod: day(checked) } : {}), changefreq: "daily", priority: "0.6" });
    }
  }
  return entries.slice(0, MAX_URLS);
}

/** The XML document for `entries`. */
export function sitemapXml(entries) {
  const urls = entries.map((entry) => {
    const fields = ["loc", "lastmod", "changefreq", "priority"].filter((key) => entry[key]).map((key) => `<${key}>${escapeXml(entry[key])}</${key}>`);
    return `  <url>${fields.join("")}</url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

let cached = null; // { expires, xml, count, missing }

export function clearSitemapCache() {
  cached = null;
}

/**
 * The sitemap for the site: from the cache while it is young enough, else built at once from the catalogs already computed.
 * `missing` lists the categories left out because theirs was not computed yet.
 */
export function getSitemap({ env = process.env, now = Date.now() } = {}) {
  if (cached && cached.expires > now) return cached;

  const groupsByCategory = {};
  const missing = [];
  for (const category of CATALOG_CATEGORIES) {
    const catalog = peekCatalogGroups(category);
    if (catalog) groupsByCategory[category] = catalog.groups;
    else missing.push(category);
  }
  const entries = sitemapEntries(groupsByCategory, { site: siteUrl(env), now });
  cached = { expires: now + (missing.length ? PARTIAL_TTL_MS : CACHE_TTL_MS), xml: sitemapXml(entries), count: entries.length, missing };
  return cached;
}
