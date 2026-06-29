function createGroupKey(title = "") {
  return title
    .toLowerCase()
    .replace(/apple/g, "")
    .replace(/pta approved/g, "")
    .replace(/official warranty/g, "")
    .replace(/5g/g, "")
    .replace(/intel/g, "")
    .replace(/generation/g, "gen")
    .replace(/128 gb/g, "128gb")
    .replace(/256 gb/g, "256gb")
    .replace(/512 gb/g, "512gb")
    .replace(/1 tb/g, "1tb")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function groupListingsByProduct(listings = []) {
  const groupsMap = {};

  listings.forEach((listing) => {
    const groupKey = createGroupKey(listing.normalizedTitle || listing.title);

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
    group.offerCount += 1;

    if (listing.price < group.lowestPrice) {
      group.lowestPrice = listing.price;
      group.bestDeal = listing;
    }

    if (listing.price > group.highestPrice) {
      group.highestPrice = listing.price;
    }
  });

  return Object.values(groupsMap).sort((a, b) => b.offerCount - a.offerCount);
}