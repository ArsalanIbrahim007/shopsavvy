// productMatch.service.js — "which product is this store page?", for the browser extension (GET /api/listings/match).
//
// The extension sends the address, title and shown price of the product page a shopper is looking at, and gets back the same
// product at the other stores, the way the product page shows it. Read-only: nothing is scraped and nothing is written, whatever
// is asked. The page is found in three steps, each stricter about what it claims:
//
//   1. "url"     a stored listing at that address (the query string picks the variant where a store puts it there: eezepc,
//                xcessorieshub), checked against the page title so a page that now shows another variant is not taken for it;
//   2. "title"   the same store's listing with the same title, for an address the store has changed;
//   3. "similar" the page is not stored at all (a store or product we have not scraped): it is grouped, as a temporary offer, with
//                the stored listings of its category by the production matcher, and found only if it lands in a product with them.
//
// The answer is built from productView.service.js, so it cannot disagree with the product page.

import mongoose from "mongoose";

import { DISABLED_PLATFORMS } from "../config/platforms.js";
import Listing from "../models/listing.model.js";
import { detectCategory } from "../scrapers/productCategory.js";
import { extractStorage, normalizeTitle } from "./normalizeTitle.service.js";
import { isOutOfDate } from "./offerFreshness.service.js";
import { lowestBadge } from "./priceOutlook.service.js";
import { isSuspectPrice } from "./pricePlausibility.service.js";
import { extractCondition, extractPtaStatus } from "./productAttributes.service.js";
import { buildProductView } from "./productView.service.js";
import { escapeRegex } from "./searchMatching.service.js";
import { attributeConflict } from "./similarity.service.js";

/** Store web addresses (without "www." or "m.") and the platform name their listings are stored under. */
export const STORE_HOSTS = Object.freeze({
  "priceoye.pk": "priceoye",
  "mega.pk": "mega",
  "shophive.com": "shophive",
  "telemart.pk": "telemart",
  "ishopping.pk": "ishopping",
  "paklap.pk": "paklap",
  "eezepc.com": "eezepc",
  "w11stop.com": "w11stop",
  "xcessorieshub.com": "xcessorieshub",
  "mistore.pk": "mistore",
  "mymart.pk": "mymart",
  "alfatah.pk": "alfatah",
  "ledshop.pk": "ledshop",
  "techroid.com": "techroid",
  "subhanelectronics.pk": "subhanelectronics",
  "jalalelectronics.com": "jalalelectronics",
  "japanelectronics.com.pk": "japanelectronics",
  "zerolifestyle.co": "zerolifestyle",
  "audionic.co": "audionic",
  "ronin.pk": "ronin",
  "baseus.pk": "baseus",
  "infinix.pk": "infinix",
  // Not scraped (switched off, see config/platforms.js), so its pages can only be found as "similar".
  "daraz.pk": "daraz",
});

export const LIMITS = Object.freeze({ url: 2048, title: 300, minPrice: 1, maxPrice: 50_000_000 });
export const SIMILAR_CANDIDATES = 120;

/** The store a page address belongs to, or null for anything that is not an http(s) page of a store we know. */
export function storeOfPage(address) {
  let url;
  try {
    url = new URL(String(address));
  } catch {
    return null;
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) return null;
  const host = url.hostname.toLowerCase().replace(/\.$/, "").replace(/^(www|m)\./, "");
  const platform = STORE_HOSTS[host];
  return platform ? { platform, host, url } : null;
}

/** A stored address is the page's when scheme, "www.", case, a trailing slash and the query string are set aside. */
export function samePagePattern({ host, url }) {
  const path = url.pathname.replace(/\/+$/, "");
  return new RegExp(`^https?://(?:www\\.|m\\.)?${escapeRegex(host)}${escapeRegex(path)}/?(?:[?#].*)?$`, "i");
}

const queryOf = (address) => {
  try {
    return [...new URL(address).searchParams].map(([k, v]) => `${k}=${v}`).sort().join("&");
  } catch {
    return "";
  }
};

/**
 * Of the stored listings at the page's address, the one the page shows, or null. Several listings can share an address (a store
 * that keeps the variant in the query string, or one page per colour). A listing whose title contradicts the page title (another
 * capacity, PTA status, model) is never chosen; of the rest, the one with the same query string, then the one nearest the page's
 * price, then the most recently checked.
 */
export function choosePageListing(candidates, { address, title, price }) {
  let pool = candidates;
  if (title) pool = pool.filter((c) => !attributeConflict(title, c.title || "", { ignoreUnstatedStorage: true }));
  if (pool.length === 0) return null;

  const query = queryOf(address);
  const sameQuery = pool.filter((c) => queryOf(c.sourceUrl || c.productUrl || "") === query);
  if (sameQuery.length > 0) pool = sameQuery;

  const checked = (c) => new Date(c.lastScrapedAt || 0).getTime();
  return [...pool].sort((a, b) =>
    (price > 0 ? Math.abs(a.price - price) - Math.abs(b.price - price) : 0) || checked(b) - checked(a),
  )[0];
}

// How far the page's price may be from our record of that page before the page is taken to show another variant.
export const VARIANT_PRICE_GAP = 0.15;

/**
 * True when the page shows another variant than the stored listing at its address. Some stores serve every capacity from one
 * address (PriceOye's "apple-iphone-17" sells 256GB and 512GB; our record is the 256GB at PKR 406,899): a shopper viewing the 512GB
 * at PKR 480,000 must not be told the 256GB offers are "cheaper elsewhere". The page says so by stating another capacity than the
 * product it was matched to, or by a price more than VARIANT_PRICE_GAP from our record.
 */
export function showsAnotherVariant(view, listing, { title, price }) {
  const pageCapacity = title ? extractStorage(title) : null;
  const productCapacity = view.selectedGroup?.storage ?? extractStorage(listing.title || "");
  if (pageCapacity !== null && productCapacity !== null && pageCapacity !== productCapacity) return true;
  return price > 0 && listing.price > 0 && Math.abs(price - listing.price) / listing.price > VARIANT_PRICE_GAP;
}

/** The PTA status as far as we know it: the title first, else what the store's page said (as productGrouping's ptaOf). */
const ptaOf = (offer) => {
  const stated = extractPtaStatus(offer.title || "");
  return stated !== "unknown" ? stated : offer.ptaStatus ?? "unknown";
};

const idOf = (offer) => offer?._id?.toString();

function offerSummary(offer, now) {
  return {
    id: idOf(offer),
    platform: offer.platform,
    title: offer.title,
    price: offer.price,
    originalPrice: offer.originalPrice ?? null,
    url: offer.productUrl || offer.sourceUrl || null,
    inStock: offer.inStock !== false,
    lastScrapedAt: offer.lastScrapedAt ?? null,
    outOfDate: isOutOfDate(offer, now),
    unusualPrice: isSuspectPrice(offer),
    ptaStatus: ptaOf(offer),
    ptaAssessment: offer.ptaAssessment ?? null,
    condition: offer.condition ?? "new",
  };
}

/**
 * The cheapest offer at ANOTHER store a shopper could act on: in stock, checked within two weeks, not an implausible price, and, for
 * a product sold PTA-approved, one that says it is approved (the same rule the product page uses for its best deal). The same
 * store's other pages (another colour) stay in the offers but are not "elsewhere".
 */
export function cheapestElsewhere(others, { productPta, platform }) {
  let usable = others.filter((o) => o.platform !== platform && o.inStock && !o.outOfDate && !o.unusualPrice);
  if (productPta === "pta_approved") usable = usable.filter((o) => o.ptaStatus === "pta_approved");
  return usable.reduce((best, o) => (best === null || o.price < best.price ? o : best), null);
}

function discountVerdictOf(offer) {
  const discount = offer.discountAnalysis;
  const market = offer.discountAnomaly;
  return {
    // The history-based check of the store's crossed-out price (the site's labels: frontend/src/lib/verdicts.js).
    discount: discount && discount.classification !== "no_claimed_discount"
      ? { classification: discount.classification, reason: discount.reason ?? "" }
      : null,
    // The cross-store check: is the crossed-out price above what the other stores charge?
    market: market ? { status: market.status, reason: market.reason ?? "" } : null,
    // The price itself looks like a listing error next to the other stores.
    price: isSuspectPrice(offer) ? { status: offer.priceCheck.status, reason: offer.priceCheck.reason ?? "" } : null,
  };
}

/** Where the site lives, for links back to it. */
export function siteUrl(env = process.env) {
  const configured = String(env.PUBLIC_SITE_URL ?? "").trim().replace(/\/+$/, "");
  return /^https?:\/\/[^\s/]+/.test(configured) ? configured : "http://localhost:5173";
}

const notFound = (reason, { title, site }) => ({
  found: false,
  reason,
  matchedBy: null,
  listing: null,
  offers: [],
  cheapest: null,
  atLow: null,
  discountVerdict: null,
  advice: null,
  pta: null,
  productUrl: null,
  searchUrl: title ? `${site}/results?q=${encodeURIComponent(title)}` : null,
});

/**
 * The extension's answer, from a product view (productView.service.js) and the offer that stands for the page.
 * @param {{selectedListing: object, selectedGroup: object|null, offers: object[]}} view
 * @param {{matchedBy: "url"|"title"|"similar", pageId: string, pagePrice?: number, title?: string, site: string, now?: number}} context
 */
export function matchResponse(view, { matchedBy, pageId, pagePrice, title, site, now = Date.now() }) {
  const self = view.offers.find((o) => idOf(o) === pageId) ?? view.selectedListing;
  const stored = matchedBy !== "similar"; // a "similar" page is a temporary offer, not a record of ours
  const others = view.offers.filter((o) => idOf(o) !== pageId).map((o) => offerSummary(o, now)).sort((a, b) => a.price - b.price);
  if (!stored && others.length === 0) return notFound("no_match", { title, site });

  const productPta = view.selectedGroup?.ptaStatus ?? null;
  const cheapest = cheapestElsewhere(others, { productPta, platform: self.platform });
  const price = pagePrice > 0 ? pagePrice : self.price;
  const recorded = stored ? view.offers : view.offers.filter((o) => idOf(o) !== pageId); // a temporary offer has no history
  const productId = stored ? pageId : idOf(view.selectedGroup?.bestDeal) ?? others[0].id;
  // The claim is about the product's cheapest offer; whether THIS page is at that price is said separately (the site's search cards
  // likewise hide the badge on an offer priced above the claim).
  const low = lowestBadge(recorded, { now });

  return {
    found: true,
    matchedBy,
    listing: stored ? offerSummary(self, now) : null,
    offers: others,
    cheapest: cheapest && { ...cheapest, saving: Math.max(0, Math.round(price - cheapest.price)), cheaperThanThisPage: cheapest.price < price },
    atLow: low && { ...low, thisPage: price <= low.price },
    discountVerdict: stored ? discountVerdictOf(self) : null,
    advice: stored && self.recommendation ? { action: self.recommendation.action, reason: self.recommendation.reason ?? "" } : null,
    pta: { product: productPta, thisPage: stored ? self.ptaAssessment ?? ptaOf(self) : extractPtaStatus(title || "") },
    productUrl: `${site}/product/${productId}`,
    searchUrl: `${site}/results?q=${encodeURIComponent(title || self.title || "")}`,
  };
}

/**
 * Finds the product a store page shows. Never scrapes.
 * @param {{url: string, title?: string, price?: number}} page
 * @param {{strategy?: "ml"|"rule", env?: object, now?: number}} [options]
 */
export async function matchPage({ url: address, title, price }, { strategy = "ml", env = process.env, now = Date.now() } = {}) {
  const site = siteUrl(env);
  const store = storeOfPage(address);
  if (!store) return notFound("store_not_covered", { title, site });

  // A switched-off store's listings are hidden everywhere (config/platforms.js), so its pages can only be matched as "similar".
  const stored = !DISABLED_PLATFORMS.includes(store.platform);
  const base = { platform: store.platform };
  let listing = stored
    ? choosePageListing(await Listing.find({ ...base, sourceUrl: samePagePattern(store) }).lean(), { address, title, price })
    : null;
  let matchedBy = "url";

  if (!listing && stored && title) {
    listing = choosePageListing(await Listing.find({ ...base, normalizedTitle: normalizeTitle(title) }).lean(), { address, title, price });
    matchedBy = "title";
  }

  if (listing) {
    const view = await buildProductView(listing, { strategy });
    if (!showsAnotherVariant(view, listing, { title, price })) {
      return matchResponse(view, { matchedBy, pageId: idOf(listing), pagePrice: price, title, site, now });
    }
    // The page shows another variant than our record of its address: placed by its own title and price below.
  }

  // Not stored: where would the matcher put this page? Needs a title and a price (the matcher compares prices).
  if (!title || !(price > 0)) return notFound("not_stored", { title, site });
  const page = {
    _id: new mongoose.Types.ObjectId(), // a fresh id: it matches no stored listing, and is never saved
    platform: store.platform,
    title,
    normalizedTitle: normalizeTitle(title),
    price,
    originalPrice: null,
    productCategory: detectCategory(title).category,
    ptaStatus: extractPtaStatus(title),
    condition: extractCondition(title),
    inStock: true,
    lastScrapedAt: new Date(now).toISOString(),
    sourceUrl: store.url.href,
  };
  // The closest SIMILAR_CANDIDATES listings are enough to place one page; the product page groups up to 300, which took 4 s in a
  // large category (accessories) for a page that matched nothing.
  const view = await buildProductView(page, { strategy, cap: SIMILAR_CANDIDATES });
  return matchResponse(view, { matchedBy: "similar", pageId: idOf(page), pagePrice: price, title, site, now });
}
