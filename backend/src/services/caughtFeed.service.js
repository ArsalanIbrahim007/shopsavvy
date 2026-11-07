// caughtFeed.service.js — "deals we didn't show you": the discounts and prices our checks caught, for the home page.
//
// A rival's home page advertised "89% off" a solar inverter at Rs 10,000 against Rs 94,000 elsewhere, and a 2TB iPhone 36% off:
// listing errors and unchecked "was" prices shown as the best deals (qeemat.com.pk, 2026-11-07). ShopSavvy checks every offer
// three ways, and this feed shows what those checks caught, with the evidence:
//   - a fake discount: the store's "was" price is above anything its price history shows (ranking/scores/fakeDiscountScore.js);
//   - a "was" price above the market: higher than every other store charges, by the trained anomaly model (discountAnomaly.service.js);
//   - an unusual price: so far from the other stores that it is probably a listing error (pricePlausibility.service.js).
//
// Built only from the category catalogues already computed (catalogFeed.service.js, warmed at start-up), never by computing one,
// as the sitemap is: a category not computed yet is left out until it is.

import { CATALOG_CATEGORIES, peekCatalogGroups } from "./catalogFeed.service.js";

const CACHE_TTL_MS = 10 * 60 * 1000;
// Four: a full row on a wide screen, two rows of two on a tablet (six left one card alone on a second row).
export const MAX_EXAMPLES = 4;
const MAX_PER_STORE = 2;
// A "discount" of a few per cent is not what a shopper is lured by; the examples are claims of at least this much.
const MIN_CLAIMED_PERCENT = 10;

const percentOff = (offer) => (offer.originalPrice > offer.price ? Math.round(((offer.originalPrice - offer.price) / offer.originalPrice) * 100) : 0);
const isSuspect = (offer) => String(offer.priceCheck?.status ?? "").startsWith("suspect");

/** What our checks say against one offer, or null when they say nothing. */
export function caughtOf(offer) {
  const fake = offer.discountAnalysis?.classification === "likely_fake";
  const aboveMarket = offer.discountAnomaly?.status === "anomalous";
  const unusual = isSuspect(offer);
  return fake || aboveMarket || unusual ? { fake, aboveMarket, unusual } : null;
}

/** The lowest believable price the other stores ask for this product, or null. */
function lowestElsewhere(group, offer) {
  const prices = group.offers
    .filter((o) => o.platform !== offer.platform && Number(o.price) > 0 && !isSuspect(o))
    .map((o) => Number(o.price));
  return prices.length ? Math.min(...prices) : null;
}

function example(group, offer, caught, category) {
  const metrics = offer.discountAnalysis?.metrics ?? {};
  return {
    id: String(offer._id),
    title: offer.title,
    productName: group.productName ?? offer.title,
    category,
    platform: offer.platform,
    imageUrl: offer.imageUrl || group.offers.find((o) => o.imageUrl)?.imageUrl || "",
    price: offer.price,
    originalPrice: offer.originalPrice ?? null,
    claimedPercent: percentOff(offer),
    caught,
    // the evidence, as numbers, for the page to put into words
    history: caught.fake ? { highest: metrics.historicalHighest ?? null, checks: metrics.historyCount ?? null } : null,
    market: caught.aboveMarket ? { highest: offer.discountAnomaly.marketMax ?? null, stores: offer.discountAnomaly.comparators ?? null } : null,
    lowestElsewhere: lowestElsewhere(group, offer),
  };
}

/**
 * The feed from each category's grouped products.
 * @param {Object<string, object[]>} groupsByCategory
 * @returns {{counts: {fakeDiscount: number, aboveMarket: number, unusualPrice: number}, examples: object[]}}
 */
export function caughtFromGroups(groupsByCategory) {
  const counts = { fakeDiscount: 0, aboveMarket: 0, unusualPrice: 0 };
  const discounts = [];

  for (const [category, groups] of Object.entries(groupsByCategory)) {
    for (const group of groups) {
      let best = null; // one example per product: its strongest
      for (const offer of group.offers ?? []) {
        const caught = caughtOf(offer);
        if (!caught) continue;
        if (caught.fake) counts.fakeDiscount += 1;
        if (caught.aboveMarket) counts.aboveMarket += 1;
        if (caught.unusual) counts.unusualPrice += 1;
        // An unusual price is counted, not shown as an example: next to products grouped from titles that omit the size, "half
        // the other stores' price" can be another size grouped in, not the store's error (a Samsung S90F OLED, 2026-11-07).
        if (!caught.unusual && (caught.fake || caught.aboveMarket) && percentOff(offer) >= MIN_CLAIMED_PERCENT) {
          // Both checks agreeing is the strongest case, then the bigger claim.
          const strength = (caught.fake ? 1 : 0) + (caught.aboveMarket ? 1 : 0);
          if (!best || strength > best.strength || (strength === best.strength && percentOff(offer) > best.percent)) {
            best = { strength, percent: percentOff(offer), offer, caught };
          }
        }
      }
      if (best) discounts.push({ ...example(group, best.offer, best.caught, category), strength: best.strength });
    }
  }

  // Strongest first; at most MAX_PER_STORE from one store, so the feed is not one store's catalogue.
  discounts.sort((a, b) => b.strength - a.strength || b.claimedPercent - a.claimedPercent);
  const perStore = {};
  const examples = [];
  for (const { strength: _strength, ...item } of discounts) {
    if (examples.length >= MAX_EXAMPLES) break;
    if ((perStore[item.platform] ?? 0) >= MAX_PER_STORE) continue;
    perStore[item.platform] = (perStore[item.platform] ?? 0) + 1;
    examples.push(item);
  }
  return { counts, examples };
}

let cached = null;

export function clearCaughtCache() {
  cached = null;
}

/** The feed, from the cache while it is young enough; `missing` lists categories whose catalogue is not computed yet. */
export function getCaught({ now = Date.now() } = {}) {
  if (cached && cached.expires > now) return cached.value;
  const groupsByCategory = {};
  const missing = [];
  for (const category of CATALOG_CATEGORIES) {
    const catalog = peekCatalogGroups(category);
    if (catalog) groupsByCategory[category] = catalog.groups;
    else missing.push(category);
  }
  const value = { ...caughtFromGroups(groupsByCategory), generatedAt: new Date(now).toISOString(), missing };
  // A feed missing a category is kept only a minute, so the complete one follows soon after start-up.
  cached = { expires: now + (missing.length ? 60 * 1000 : CACHE_TTL_MS), value };
  return value;
}
