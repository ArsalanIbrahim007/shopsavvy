import { normalizeTitle, extractStorage, modelTokens } from "./normalizeTitle.service.js";
import { isSimilarProduct, attributeConflict, tokenize, VARIANT_TOKENS } from "./similarity.service.js";
import { calculateDealScores } from "../ranking/dealScore.js";
import { currentOffers } from "./offerFreshness.service.js";
import { COLOURS, extractNetworkGeneration, extractPtaStatus, networkFamilyKey } from "./productAttributes.service.js";

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
/**
 * A store that lists two phones whose titles differ only in "5G" / "4G" is telling us they are different
 * products: Galaxy A17 and Galaxy A17 5G are both on PriceOye, at PKR 65,699 and PKR 96,599. That is evidence
 * a title-only comparison cannot see when ANOTHER store leaves the generation out, so the titles that
 * store used become "split families" for this grouping run: within a split family, listings that state a
 * different generation (or one states it and the other does not) are never grouped together.
 *
 * A family is the title without its generation words (networkFamilyKey). A listing belongs to it when its
 * own key is the same, or continues it only with store wording that does not name a different model:
 * capacities, colours, "PTA approved", "dual sim with official warranty". "samsung galaxy a17" therefore
 * covers "samsung galaxy a17 8gb ram 256gb pta approved", but "oppo reno" does NOT cover "oppo reno 15" (a
 * different, newer phone): without that limit one store's "Reno" / "Reno 5G" pair split every Reno model.
 */
function splitNetworkFamilies(listings) {
  const seen = new Map(); // "platform|familyKey" -> set of generations that store lists
  for (const listing of listings) {
    const title = listing.title || listing.normalizedTitle || "";
    const key = `${listing.platform}|${networkFamilyKey(title)}`;
    if (!seen.has(key)) seen.set(key, new Set());
    seen.get(key).add(extractNetworkGeneration(title));
  }
  const families = new Set();
  for (const [key, generations] of seen) {
    if (generations.size > 1) families.add(key.slice(key.indexOf("|") + 1));
  }
  return [...families];
}

// Words stores add to a title that describe the listing, not which model it is.
const WORDING = new Set([
  "ram", "rom", "storage", "memory", "pta", "approved", "non", "with", "official", "warranty", "dual", "single", "sim",
  "nano", "esim", "global", "version", "international", "edition", "official", "pakistan", "activated", "mobile", "phone",
  "smartphone", "new", "brand", "original", "sealed", "box", "and", "free", "gift", "black", "white", "silver", "gold", "grey",
  "gray", "blue", "green", "red", "pink", "purple", "yellow", "orange", "teal", "cream", "beige", "bronze", "copper", "navy",
  "mint", "graphite", "midnight", "starlight", "titanium", "lavender", "ultramarine", "natural", "desert", "space",
]);
for (const colour of COLOURS) for (const word of colour.split(" ")) WORDING.add(word);
const isWording = (token) => WORDING.has(token) || /^\d{1,4}(gb|tb)$/.test(token);

const inFamily = (key, family) =>
  key === family || (key.startsWith(`${family} `) && key.slice(family.length + 1).split(" ").every(isWording));

function isNetworkSplit(titleA, titleB, families) {
  if (families.length === 0) return false;
  if (extractNetworkGeneration(titleA) === extractNetworkGeneration(titleB)) return false;
  const keyA = networkFamilyKey(titleA);
  const keyB = networkFamilyKey(titleB);
  return families.some((family) => inFamily(keyA, family) && inFamily(keyB, family));
}

/**
 * The PTA status of a listing as far as we know it: what its title says, else what its store's own product page said (the nightly
 * page read stores that in `ptaStatus`). Titles are silent for most stores, so the stored status is often all there is.
 */
const ptaOf = (listing) => {
  const stated = extractPtaStatus(listing.title || listing.normalizedTitle || "");
  return stated !== "unknown" ? stated : listing.ptaStatus ?? "unknown";
};

/**
 * True when both listings are known to differ on PTA approval. Like every attribute veto this needs BOTH to say, so an unstated
 * offer never blocks a match. It uses ptaOf, not the title alone as attributeConflict does: a listing whose title says nothing but
 * whose page says "non-PTA" (Mega: "Apple iPhone 17" at PKR 284,999 beside PTA-approved units at PKR 370,000 and up) must not join a
 * group of approved ones, whatever its bare title looks like.
 */
const ptaConflict = (a, b) => {
  const first = ptaOf(a);
  const second = ptaOf(b);
  return first !== "unknown" && second !== "unknown" && first !== second;
};

/**
 * True when an offer of unstated PTA status costs far more than a non-PTA one: it is the PTA-approved unit (B9 found S26 Ultra 12/512
 * non-PTA at PKR 318,999 merged with an unstated one at PKR 446,999, and four more like it). The mirror image of separateLikelyNonPta
 * below, which moves unstated offers priced far BELOW the approved ones; the same 15% gap is used.
 */
const ptaPriceConflict = (a, b) => {
  if (!PTA_SENSITIVE.has(a.productCategory) && !PTA_SENSITIVE.has(b.productCategory)) return false;
  const first = ptaOf(a);
  const second = ptaOf(b);
  if (first === "non_pta" && second === "unknown") return a.price < b.price * NON_PTA_PRICE_RATIO;
  if (second === "non_pta" && first === "unknown") return b.price < a.price * NON_PTA_PRICE_RATIO;
  return false;
};

/**
 * How far apart one store may price two of its own pages for them still to be one product. A store charges one price for one
 * product, so two pages of a model, one stating a capacity and one not, priced apart are two variants: Mega's bare "iPhone 16 Pro
 * Max" at PKR 319,999 beside its "512GB NON PTA" at PKR 344,999 is the cheaper capacity. 5% allows for a page not yet updated.
 */
const SAME_STORE_PRICE_GAP = 0.05;

// Not when either says PTA approved: then the cheaper page is most likely the non-PTA unit, and separateLikelyNonPta moves it out
// and labels it as such for the shopper, which this rule (acting earlier) would prevent.
const sameStoreVariant = (a, b, titleA, titleB) =>
  a.platform === b.platform &&
  ptaOf(a) !== "pta_approved" && ptaOf(b) !== "pta_approved" &&
  (extractStorage(titleA) === null) !== (extractStorage(titleB) === null) &&
  a.price > 0 && b.price > 0 &&
  Math.abs(a.price - b.price) / Math.min(a.price, b.price) > SAME_STORE_PRICE_GAP;

/**
 * The first group in `candidates` the listing may join, or null. The strategy decides whether it looks like the
 * group's product; on top of that it must not conflict with any member (see the comment inside).
 */
function findMatchingGroup(listing, rawTitle, listingStorage, candidates, matchStrategy, networkFamilies) {
  let nearest = null;
  let nearestGap = Infinity;
  for (const group of candidates) {
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
        ptaConflict(listing, member) ||
        ptaPriceConflict(listing, member) ||
        sameStoreVariant(listing, member, rawTitle, member.title || member.normalizedTitle || "") ||
        attributeConflict(rawTitle, member.title || member.normalizedTitle || "", { ignoreUnstatedStorage: true }) ||
        isNetworkSplit(rawTitle, member.title || member.normalizedTitle || "", networkFamilies)
      )
    ) {
      // A listing that states its capacity has one variant to join: the first match, as before. So does one that matches a group
      // with no capacity either, unless it already matched a capacity variant.
      if (listingStorage !== null || (group.storage === null && nearest === null)) return group;
      if (group.storage === null) continue;
      // A bare title ("Redmi Note 15 Pro") can match several capacity variants of its model; it belongs with the one priced
      // nearest it. Taking the first one put PKR 92,000 offers in the 12GB/512GB group at PKR 113,000 beside an 8GB/256GB group
      // at PKR 93,000.
      const gap = Math.abs(listing.price - (group.lowestPrice + group.highestPrice) / 2);
      if (gap < nearestGap) {
        nearest = group;
        nearestGap = gap;
      }
    }
  }
  return nearest;
}

function newGroup(listing, rawTitle, listingStorage) {
  return {
    productName: listing.title,
    normalizedGroupKey: normalizeTitle(rawTitle),
    rawGroupKey: rawTitle,
    storage: listingStorage,
    offerCount: 0,
    lowestPrice: listing.price,
    highestPrice: listing.price,
    bestDeal: null,
    offers: [],
  };
}

function addOffer(group, listing) {
  group.offers.push(listing);
  group.offerCount += 1;
  if (listing.price < group.lowestPrice) group.lowestPrice = listing.price;
  if (listing.price > group.highestPrice) group.highestPrice = listing.price;
}

function recount(group) {
  group.offerCount = group.offers.length;
  group.lowestPrice = Math.min(...group.offers.map((o) => o.price));
  group.highestPrice = Math.max(...group.offers.map((o) => o.price));
}

// Phones and tablets are sold in Pakistan both PTA-approved and not, at very different prices.
const PTA_SENSITIVE = new Set(["smartphone", "tablet"]);

/**
 * How far below the cheapest EXPLICITLY PTA-approved offer an unstated one must be to be treated as non-PTA.
 * Most stores do not say whether a phone is PTA-approved, and the ones that sell non-PTA units often list them
 * with a bare title ("Apple iPhone 17" at PKR 284,999 beside PTA-approved ones at PKR 370,000 to 398,000). A
 * title-only match cannot tell them apart, so the cheap one used to become the "best deal" of the PTA product
 * and every saving and verdict was measured against a phone the shopper could not use on a local SIM. Reuses the
 * proximity limit above: the same handset is within about 15% across stores.
 */
const NON_PTA_PRICE_RATIO = 1 - PRICE_PROXIMITY;


/**
 * Moves the unstated-PTA offers that are priced far below every stated-PTA offer of their product into a group
 * of their own (or into an existing non-PTA group of the same product), and labels the offers of PTA-sensitive
 * groups: `ptaAssessment` is "likely_non_pta" for a moved offer and "not_stated" for one that stays without
 * saying. Order does not matter: it runs once the groups are formed.
 */
function separateLikelyNonPta(groups, matchStrategy, networkFamilies) {
  const moved = [];

  for (const group of [...groups]) {
    if (!group.offers.some((o) => PTA_SENSITIVE.has(o.productCategory))) continue;
    const approved = group.offers.filter((o) => ptaOf(o) === "pta_approved").map((o) => o.price);
    if (approved.length === 0) continue;

    const limit = Math.min(...approved) * NON_PTA_PRICE_RATIO;
    const suspects = group.offers.filter((o) => PTA_SENSITIVE.has(o.productCategory) && ptaOf(o) === "unknown" && o.price < limit);
    if (suspects.length === 0) continue;

    group.offers = group.offers.filter((o) => !suspects.includes(o));
    recount(group);
    for (const listing of suspects) moved.push({ listing, from: group });
  }

  // Cheapest first, so the group a moved offer starts is the one a later one is compared against.
  moved.sort((a, b) => a.listing.price - b.listing.price);
  const likelyNonPta = new Set();
  for (const { listing } of moved) {
    const rawTitle = listing.title || listing.normalizedTitle || "";
    const storage = extractStorage(rawTitle);
    const candidates = groups.filter((g) => g.offers.length > 0 && g.offers.every((o) => ptaOf(o) === "non_pta" || likelyNonPta.has(o)));
    let target = findMatchingGroup(listing, rawTitle, storage, candidates, matchStrategy, networkFamilies);
    if (!target) {
      target = newGroup(listing, rawTitle, storage);
      groups.push(target);
    }
    addOffer(target, listing);
    likelyNonPta.add(listing);
  }

  for (const group of groups) {
    if (!group.offers.some((o) => PTA_SENSITIVE.has(o.productCategory))) continue;
    const hasApproved = group.offers.some((o) => ptaOf(o) === "pta_approved");
    group.offers = group.offers.map((o) => {
      const label = likelyNonPta.has(o) ? "likely_non_pta" : hasApproved && ptaOf(o) === "unknown" ? "not_stated" : null;
      return label ? { ...(o.toObject ? o.toObject() : o), ptaAssessment: label } : o;
    });
    group.ptaStatus = group.offers.every((o) => o.ptaAssessment === "likely_non_pta") ? "likely_non_pta"
      : hasApproved ? "pta_approved"
      : group.offers.some((o) => ptaOf(o) === "non_pta") ? "non_pta"
      : "unknown";
  }

  return groups.filter((g) => g.offers.length > 0);
}

/**
 * Which groups a listing could join, without asking about every one. Comparing each listing with every group cost listings ×
 * groups full comparisons: 3,146 phones against 1,846 groups took 186 s, past the 90 s the grouping worker allows, so the
 * Smartphones catalog never loaded (found 2026-10-26). Two titles that share no model word (the normalised title without
 * capacities such as "8gb" and tier words such as "pro") are never the same product: the rule strategy needs 70% of exactly
 * those words in common, and the trained one compares them or a member's identical set. Indexing every word instead let "pro"
 * and "8gb" connect nearly every group, which saved little. So the index maps each model word of a group's title and of its
 * members' titles to the group, and a listing is compared only with the groups sharing one with it, in the order the groups
 * were made (the first match still wins). A title with no model word is compared with every group, as before.
 * `blocking: false` in groupListingsByProduct turns this off; the tests compare both, and both were compared on every category
 * of the live catalogue.
 */
function groupIndex() {
  const byWord = new Map();
  const order = new Map();
  const words = (text) => tokenize(modelTokens(text || "")).filter((word) => !VARIANT_TOKENS.has(word));

  return {
    add(group, text) {
      if (!order.has(group)) order.set(group, order.size);
      for (const word of words(text)) {
        if (!byWord.has(word)) byWord.set(word, new Set());
        byWord.get(word).add(group);
      }
    },
    candidates(text, groups) {
      const own = words(text);
      if (own.length === 0) return groups;
      const found = new Set();
      for (const word of own) for (const group of byWord.get(word) ?? []) found.add(group);
      return [...found].sort((a, b) => order.get(a) - order.get(b));
    },
  };
}

export function groupListingsByProduct(listings = [], { matchStrategy = ruleMatchStrategy, blocking = true } = {}) {
  let groups = [];
  const networkFamilies = splitNetworkFamilies(listings);
  const index = groupIndex();

  // Listings that state a capacity go first, so each capacity variant has its group before a bare title has to choose between
  // them (findMatchingGroup). The sort is stable: categories where no title states one (televisions) keep their order.
  const statesCapacity = (listing) => extractStorage(listing.title || listing.normalizedTitle || "") !== null;
  const ordered = [...listings].sort((a, b) => statesCapacity(b) - statesCapacity(a));

  ordered.forEach((listing) => {
    const rawTitle = listing.title || listing.normalizedTitle || "";
    const normalizedListingTitle = normalizeTitle(rawTitle);
    const listingStorage = extractStorage(rawTitle);

    const candidates = blocking ? index.candidates(rawTitle, groups) : groups;
    let matchedGroup = findMatchingGroup(listing, rawTitle, listingStorage, candidates, matchStrategy, networkFamilies);

    if (!matchedGroup) {
      matchedGroup = newGroup(listing, rawTitle, listingStorage);
      groups.push(matchedGroup);
    }

    // Adopt the first stated capacity, and with it the more specific title.
    if (matchedGroup.storage === null && listingStorage !== null) {
      matchedGroup.storage = listingStorage;
      matchedGroup.normalizedGroupKey = normalizedListingTitle;
      matchedGroup.rawGroupKey = rawTitle;
      matchedGroup.productName = listing.title;
    }

    addOffer(matchedGroup, listing);
    // The listing's title covers the group's title too: a new group's is the listing's, and an adopted one is the listing's.
    index.add(matchedGroup, rawTitle);
  });

  groups = separateLikelyNonPta(groups, matchStrategy, networkFamilies);

  return groups
    .map((group) => {
      const rankedOffers = calculateDealScores(group.offers);

      // Where a PTA-approved offer exists, the best deal is one of those: an offer that does not say it is
      // approved cannot be told apart from a non-PTA unit, which is why the deals feed applies the same rule.
      // The unstated offers stay in the list, labelled. An offer whose price has not been checked for two weeks is not the best deal
      // either (offerFreshness.service.js): it stays in the list, labelled.
      const candidates = currentOffers(rankedOffers);
      const bestDeal = group.ptaStatus === "pta_approved"
        ? candidates.find((offer) => ptaOf(offer) === "pta_approved") ?? candidates[0]
        : candidates[0];

      return {
        ...group,
        bestDeal: bestDeal || null,
        offers: rankedOffers,
      };
    })
    .sort((a, b) => b.offerCount - a.offerCount);
}