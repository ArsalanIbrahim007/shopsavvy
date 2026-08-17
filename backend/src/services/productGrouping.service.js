import { normalizeTitle, extractStorage } from "./normalizeTitle.service.js";
import { isSimilarProduct } from "./similarity.service.js";
import { calculateDealScores } from "../ranking/dealScore.js";

/**
 * How far a listing's price may sit from a group's prices before it is treated
 * as a different variant. Observed data puts the same handset within a few per
 * cent across stores, while a capacity step is tens of per cent.
 */
const PRICE_PROXIMITY = 0.15;

/**
 * Clusters listings from different platforms into single products.
 *
 * Each group records the storage capacity of the first member that states one.
 * Without this, a listing whose title omits the capacity matches every capacity
 * variant and pulls unrelated models into one group, because the pairwise check
 * has nothing to compare against.
 *
 * Comparison uses the raw title rather than the normalised one. Normalisation
 * deliberately removes compliance terms such as "PTA Approved" and punctuation
 * including inch marks, and those are exactly the attributes that decide
 * product identity.
 */
export function groupListingsByProduct(listings = []) {
  const groups = [];

  listings.forEach((listing) => {
    const rawTitle = listing.title || listing.normalizedTitle || "";
    const normalizedListingTitle = normalizeTitle(rawTitle);
    const listingStorage = extractStorage(rawTitle);

    let matchedGroup = null;

    for (const group of groups) {
      const capacityConflict =
        group.storage !== null &&
        listingStorage !== null &&
        group.storage !== listingStorage;

      if (capacityConflict) continue;

      if (isSimilarProduct(rawTitle, group.rawGroupKey, 0.7)) {
        matchedGroup = group;
        break;
      }

      /*
       * Some stores omit the storage capacity from the title. Rejecting those
       * outright split the same handset across platforms, but accepting them
       * unconditionally compared a bare "iPhone 16 Pro Max" against a 256GB
       * unit at a difference of PKR 140,000.
       *
       * Price is used as the tiebreaker. A different capacity of the same model
       * carries a materially different price, so a listing whose capacity is
       * unstated joins the group only when its price is close to the prices
       * already in it.
       */
      const capacityUnstated =
        listingStorage === null || group.storage === null;

      if (capacityUnstated && isSimilarProduct(rawTitle, group.rawGroupKey, 0.7, {
        ignoreUnstatedStorage: true,
      })) {
        const reference = (group.lowestPrice + group.highestPrice) / 2;
        const drift = Math.abs(listing.price - reference) / reference;

        if (drift <= PRICE_PROXIMITY) {
          matchedGroup = group;
          break;
        }
      }
    }

    if (!matchedGroup) {
      matchedGroup = {
        productName: listing.title,
        normalizedGroupKey: normalizedListingTitle,
        rawGroupKey: rawTitle,
        storage: listingStorage,
        offerCount: 0,
        lowestPrice: listing.price,
        highestPrice: listing.price,
        bestDeal: null,
        offers: [],
      };

      groups.push(matchedGroup);
    }

    // Adopt the first stated capacity, and with it the more specific title.
    if (matchedGroup.storage === null && listingStorage !== null) {
      matchedGroup.storage = listingStorage;
      matchedGroup.normalizedGroupKey = normalizedListingTitle;
      matchedGroup.rawGroupKey = rawTitle;
      matchedGroup.productName = listing.title;
    }

    matchedGroup.offers.push(listing);
    matchedGroup.offerCount += 1;

    if (listing.price < matchedGroup.lowestPrice) matchedGroup.lowestPrice = listing.price;
    if (listing.price > matchedGroup.highestPrice) matchedGroup.highestPrice = listing.price;
  });

  return groups
    .map((group) => {
      const rankedOffers = calculateDealScores(group.offers);

      return {
        ...group,
        bestDeal: rankedOffers[0] || null,
        offers: rankedOffers,
      };
    })
    .sort((a, b) => b.offerCount - a.offerCount);
}