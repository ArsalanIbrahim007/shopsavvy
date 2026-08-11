import { normalizeTitle, extractStorage } from "./normalizeTitle.service.js";
import { isSimilarProduct } from "./similarity.service.js";
import { calculateDealScores } from "../ranking/dealScore.js";

/**
 * Clusters listings from different platforms into single products.
 *
 * Each group records the storage capacity of the first member that states one.
 * Without this, a listing whose title omits the capacity ("Apple iPhone 17
 * Pro") matches every capacity variant and pulls unrelated models into one
 * group, because the pairwise check has nothing to compare against.
 *
 * Once a group has a capacity, a listing declaring a different one starts its
 * own group. Listings that state no capacity join the first compatible group,
 * which is the best available assumption when the store has not specified it.
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