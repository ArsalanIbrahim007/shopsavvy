// dealsRanking.service.js — turns grouped, scored offers into a ranked list of
// "deals": products where buying at the cheapest store saves real money against
// what other stores charge.
//
// Pure functions only (no database, no I/O), so the same code runs in a worker
// thread in production (see dealsFeed.service.js) and directly in tests.
//
// What counts as a deal, and why this measure:
//  - It is cross-store: the saving is the gap between the cheapest offer and the
//    MEDIAN of the other believable offers for the same product. A store's own
//    "was" price is not used to rank, because claimed discounts can be fake.
//  - Only fresh offers count (scraped within maxAgeHours). A deal built on a
//    price last seen weeks ago would be advertising something that may be gone.
//  - Only in-stock offers whose price the plausibility check did not flag. A
//    probable listing error must never be presented as a bargain.
//  - Only NEW offers that are not explicitly non-PTA. A used, refurbished, open-box
//    or non-PTA unit is a different product for most buyers at a genuinely lower
//    price, so comparing it with new PTA-approved ones would advertise a "saving"
//    that is really a downgrade.
//  - For phones and tablets the cheapest offer must be EXPLICITLY PTA-approved.
//    Most stores do not state PTA status, and the ones that sell non-PTA units
//    often list them with a bare title. Checked against the live catalogue: the
//    top "deals" were Mega phones priced identically to their siblings labelled
//    "NON PTA", i.e. the same unit. A cheap price with PTA status unstated is
//    indistinguishable from a non-PTA price, so it is not advertised.
//  - The offers must be plausibly one product: if the dearest is more than
//    MAX_PRICE_SPREAD times the cheapest, the group is probably mixed variants
//    (a 1TB and a 2TB phone) and is skipped rather than guessed at.
//  - At least MIN_OFFERS offers from at least two different stores. With only two
//    offers a "saving" is one price against one price and there is no way to tell
//    which is the outlier, so it is not advertised.
//  - A meaningful saving: at least minSavingPercent AND minSavingAmount, so a
//    PKR 300 difference on a phone is not a "deal".

import { groupListingsByProduct } from "./productGrouping.service.js";
import { mlMatchStrategy } from "./similarityModel.service.js";
import { attachRecommendationsToGroups } from "./recommendation/recommendation.service.js";
import { isSuspectPrice } from "./pricePlausibility.service.js";

export const DEFAULT_MAX_AGE_HOURS = 72;
export const MIN_SAVING_PERCENT = 5;
export const MIN_SAVING_AMOUNT = 1000;
export const MAX_PRICE_SPREAD = 1.6;
export const MIN_OFFERS = 3;

// Categories where PTA approval changes what the buyer gets.
export const PTA_SENSITIVE_CATEGORIES = ["smartphone", "tablet"];

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

const round1 = (n) => Math.round(n * 10) / 10;

function claimedDiscountPercent(offer) {
  if (!offer.originalPrice || offer.originalPrice <= offer.price) return 0;
  return ((offer.originalPrice - offer.price) / offer.originalPrice) * 100;
}

const isDoubtfulDiscount = (offer) =>
  Boolean(offer.discountAnalysis?.isFakeDiscount || offer.discountAnomaly?.isAnomalous || isSuspectPrice(offer));

/**
 * @param {Array<{productName:string, offers:object[]}>} groups grouped offers with deal scores, price checks and recommendations
 * @param {object} [options]
 * @param {number} [options.now]            epoch ms; injectable for tests
 * @param {number} [options.maxAgeHours]
 * @returns {object[]} deals, best saving first (not limited)
 */
export function rankDealGroups(groups, { now = Date.now(), maxAgeHours = DEFAULT_MAX_AGE_HOURS } = {}) {
  const cutoff = now - maxAgeHours * 3600 * 1000;
  const deals = [];

  for (const group of groups) {
    const considered = (group.offers || []).filter(
      (offer) =>
        offer.price > 0 &&
        offer.inStock !== false &&
        (offer.condition ?? "new") === "new" &&
        offer.ptaStatus !== "non_pta" &&
        !isSuspectPrice(offer) &&
        new Date(offer.lastScrapedAt || 0).getTime() >= cutoff
    );

    const stores = new Set(considered.map((o) => String(o.platform).toLowerCase()));
    if (considered.length < MIN_OFFERS || stores.size < 2) continue;

    const prices = considered.map((o) => o.price);
    if (Math.max(...prices) / Math.min(...prices) > MAX_PRICE_SPREAD) continue;

    const referencePrice = Math.round(median(prices));
    const lowest = considered.reduce((best, o) => (o.price < best.price || (o.price === best.price && (o.dealScore || 0) > (best.dealScore || 0)) ? o : best));

    if (PTA_SENSITIVE_CATEGORIES.includes(lowest.productCategory) && lowest.ptaStatus !== "pta_approved") continue;

    const savingAmount = referencePrice - lowest.price;
    const savingPercent = (savingAmount / referencePrice) * 100;
    if (savingPercent < MIN_SAVING_PERCENT || savingAmount < MIN_SAVING_AMOUNT) continue;

    const newest = Math.max(...considered.map((o) => new Date(o.lastScrapedAt).getTime()));
    const verified = isDoubtfulDiscount(lowest) ? 0 : claimedDiscountPercent(lowest);

    deals.push({
      productName: group.productName,
      category: lowest.productCategory || "other",
      imageUrl: lowest.imageUrl || considered.find((o) => o.imageUrl)?.imageUrl || "",
      offerCount: considered.length,
      storeCount: stores.size,
      lowest: {
        _id: String(lowest._id),
        platform: lowest.platform,
        price: lowest.price,
        ptaStatus: lowest.ptaStatus ?? "unknown",
        productUrl: lowest.productUrl || lowest.sourceUrl || "",
      },
      referencePrice,
      savingAmount,
      savingPercent: round1(savingPercent),
      verifiedDiscountPercent: verified >= 1 ? Math.round(verified) : null,
      recommendation: lowest.recommendation?.action ?? null,
      dealScore: lowest.dealScore ?? null,
      updatedAt: new Date(newest).toISOString(),
    });
  }

  return deals.sort((a, b) => b.savingPercent - a.savingPercent || b.savingAmount - a.savingAmount);
}

/**
 * The full pipeline for one category's listings: group by product, attach
 * recommendations, rank. CPU-heavy (grouping compares listings pairwise), which
 * is why production runs it in a worker thread.
 */
export function computeCategoryDeals(listings, options) {
  const groups = attachRecommendationsToGroups(groupListingsByProduct(listings, { matchStrategy: mlMatchStrategy }));
  return rankDealGroups(groups, options);
}
