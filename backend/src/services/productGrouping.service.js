import { normalizeTitle } from "./normalizeTitle.service.js";
import { isSimilarProduct } from "./similarity.service.js";

export function groupListingsByProduct(listings = []) {
  const groups = [];

  listings.forEach((listing) => {
    const normalizedListingTitle = normalizeTitle(
      listing.normalizedTitle || listing.title
    );

    let matchedGroup = null;

    for (const group of groups) {
      if (
        isSimilarProduct(
          normalizedListingTitle,
          group.normalizedGroupKey,
          0.7
        )
      ) {
        matchedGroup = group;
        break;
      }
    }

    if (!matchedGroup) {
      matchedGroup = {
        productName: listing.title,
        normalizedGroupKey: normalizedListingTitle,
        offerCount: 0,
        lowestPrice: listing.price,
        highestPrice: listing.price,
        bestDeal: listing,
        offers: [],
      };

      groups.push(matchedGroup);
    }

    matchedGroup.offers.push(listing);
    matchedGroup.offerCount++;

    if (listing.price < matchedGroup.lowestPrice) {
      matchedGroup.lowestPrice = listing.price;
      matchedGroup.bestDeal = listing;
    }

    if (listing.price > matchedGroup.highestPrice) {
      matchedGroup.highestPrice = listing.price;
    }
  });

  return groups.sort((a, b) => b.offerCount - a.offerCount);
}