import { normalizeTitle } from "./normalizeTitle.service.js";

export function groupListingsByProduct(listings = []) {
  const groupsMap = {};

  listings.forEach((listing) => {
    const groupKey = normalizeTitle(listing.normalizedTitle || listing.title);

    if (!groupsMap[groupKey]) {
      groupsMap[groupKey] = {
        productName: listing.title,
        normalizedGroupKey: groupKey,
        offerCount: 0,
        lowestPrice: listing.price,
        highestPrice: listing.price,
        bestDeal: listing,
        offers: [],
      };
    }

    const group = groupsMap[groupKey];

    group.offers.push(listing);
    group.offerCount++;

    if (listing.price < group.lowestPrice) {
      group.lowestPrice = listing.price;
      group.bestDeal = listing;
    }

    if (listing.price > group.highestPrice) {
      group.highestPrice = listing.price;
    }
  });

  return Object.values(groupsMap).sort(
    (a, b) => b.offerCount - a.offerCount
  );
}