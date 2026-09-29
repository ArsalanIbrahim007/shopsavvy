import { normalizeTitle, extractStorage } from "./normalizeTitle.service.js";
import { isSimilarProduct, attributeConflict } from "./similarity.service.js";
import { calculateDealScores } from "../ranking/dealScore.js";

/**
 * How far a listing's price may sit from a group's prices before it is treated
 * as a different variant. Observed data puts the same handset within a few per
 * cent across stores, while a capacity step is tens of per cent.
 */
const PRICE_PROXIMITY = 0.15;

/**
 * Default matching decision: rule-based (attribute constraints + Jaccard
 * threshold), reproducing the system's original behaviour exactly. Kept as a
 * standalone function so an alternative strategy (e.g. the trained classifier
 * in similarityModel.service.js) can be swapped in without touching the
 * clustering loop itself.
 */
function ruleMatchStrategy(rawTitle, group, listing, listingStorage) {
  if (isSimilarProduct(rawTitle, group.rawGroupKey, 0.7)) return true;

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
  const capacityUnstated = listingStorage === null || group.storage === null;

  if (capacityUnstated && isSimilarProduct(rawTitle, group.rawGroupKey, 0.7, {
    ignoreUnstatedStorage: true,
  })) {
    const reference = (group.lowestPrice + group.highestPrice) / 2;
    const drift = Math.abs(listing.price - reference) / reference;
    return drift <= PRICE_PROXIMITY;
  }

  return false;
}

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
 *
 * `matchStrategy` decides whether a listing belongs to an existing group; it
 * defaults to the rule-based approach above so existing callers are
 * unaffected. Passing a different strategy (same signature) swaps the
 * matching logic without changing the clustering loop.
 */
export function groupListingsByProduct(listings = [], { matchStrategy = ruleMatchStrategy } = {}) {
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

      /*
       * The match strategy only compares against the group's representative
       * title, so a vague member can bridge listings that contradict each
       * other: a bare "Samsung Galaxy S25 Ultra" (PTA unstated) matched both
       * a NON PTA and a PTA Approved unit and put them in one comparison.
       * A listing may only join a group it has no hard conflict with any
       * member of. Checked after the strategy agrees, so it only runs on
       * candidate matches. Unstated storage is left to the strategy, as the
       * rule path's price-proximity tiebreak already handles it.
       */
      if (
        matchStrategy(rawTitle, group, listing, listingStorage) &&
        !group.offers.some((member) =>
          attributeConflict(rawTitle, member.title || member.normalizedTitle || "", { ignoreUnstatedStorage: true })
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