import { normalizeTitle, extractStorage, modelTokens, extractModelCodes, extractScreenInches, ramStorageShorthand } from "./normalizeTitle.service.js";
import { isSimilarProduct, attributeConflict, tokenize, VARIANT_TOKENS } from "./similarity.service.js";
import { calculateDealScores } from "../ranking/dealScore.js";
import { SHARED_CODE_LENGTH, SHARED_CODE_PRICE_GAP, brandOf, prefixConflict, sameBrand, withoutStoreWording } from "./similarityModel.service.js";
import { headlineOffers } from "./offerFreshness.service.js";
import { COLOURS, extractBrand, extractNetworkGeneration, extractPtaStatus, networkFamilyKey } from "./productAttributes.service.js";

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

// Not when one says PTA approved and the other does not say the same: then the cheaper page is most likely the non-PTA unit, and
// separateLikelyNonPta moves it out and labels it as such for the shopper, which this rule (acting earlier) would prevent. When both
// are approved the price gap cannot be the PTA status: PriceOye's bare "Infinix Note 60 Pro" (PKR 95,999) and its own "(8GB-256GB)"
// (PKR 118,999), both approved, were one product, and the bare page became the 8/256's lowest price (audit, 2026-11-12).
const ptaExplainsGap = (a, b) => ptaOf(a) !== ptaOf(b) && (ptaOf(a) === "pta_approved" || ptaOf(b) === "pta_approved");
const sameStoreVariant = (a, b, titleA, titleB) =>
  a.platform === b.platform &&
  !ptaExplainsGap(a, b) &&
  (extractStorage(titleA) === null) !== (extractStorage(titleB) === null) &&
  a.price > 0 && b.price > 0 &&
  Math.abs(a.price - b.price) / Math.min(a.price, b.price) > SAME_STORE_PRICE_GAP;

/**
 * Two makers' products are never one product (audit, 2026-11-12). AlfaMall sellers write one long text after every phone ("6GB 128GB
 * Official Pta Approved 1Year Official Warranty_On Installment By Future Cell At 0% Markup"), and that shared text outweighed the
 * model names: a "Samsung Galaxy A17" product held a Redmi 15C, a Tecno Spark 50 and an Infinix Hot 70, its lowest price the Redmi's
 * (21 phone products, 158 offers; 7 laptop products mixed Dell, HP and Lenovo). Only when both titles name a maker we know.
 * Huawei sold Honor phones under its own name ("Huawei Honor 9X"), so those two are one maker here.
 */
const ONE_MAKER = new Map([["honor", "huawei"]]);
// Both are asked about the same titles thousands of times in one grouping run: read once per title.
const perTitle = (read) => {
  const cache = new Map();
  return (title) => {
    if (!cache.has(title)) {
      if (cache.size > 50_000) cache.clear();
      cache.set(title, read(title));
    }
    return cache.get(title);
  };
};
const makerOf = perTitle((title) => {
  const brand = extractBrand(title);
  return brand ? ONE_MAKER.get(brand) ?? brand : null;
});
const makerConflict = (titleA, titleB) => {
  const a = makerOf(titleA);
  const b = makerOf(titleB);
  return a !== null && b !== null && a !== b;
};

/**
 * The numbers in the model part of a title: what comes before its capacity, specification or store wording, without a screen size
 * or a network generation. "Redmi 15C 6GB 128GB ..." -> {15}; "DELL Latitude 5400 (Touchscreen) | Core i5 ..." -> {5400};
 * "Tecno Spark Go 3 4GB 64GB" -> {3}; "HP Probook 640 G4 14\" Core I5" -> {640, 4}. Digits are compared, not words, so "A6-S" and
 * "A6s", or "15-fd2100tu" and "15 FD2100TU", agree.
 */
const MODEL_PART_END =
  /\b(\d+\s*(gb|tb)|\d{1,2}\s*\/\s*\d{2,4}|ram|rom|storage|pta|non[- ]?pta|official|core|intel|amd|ryzen|i[3579]|celeron|pentium|processor|with|dual|single|refurbished|used|like|warranty|price)\b|[|(,–—]|\s-\s/i;
const modelNumbers = perTitle((title) => {
  const text = String(title).toLowerCase();
  const end = MODEL_PART_END.exec(text);
  const part = (end ? text.slice(0, end.index) : text)
    .replace(/\d+(\.\d+)?\s*(["”″]|''|-?\s*inch(es)?\b|-?\s*in\b)/g, " ") // a screen size
    // Numbers that are not the model's (the recall samples' TV and headset pairs, 2026-11-12): a network generation, a brand with
    // a digit ("A4tech"), a resolution ("4K", "1080p"), a year ("Smart TV 2025"), a rating ("120Hz", "45W", "5000mAh", "50MP"), a
    // processor generation ("8th"), a channel count ("2.1ch").
    .replace(/\b([2-5]g|a4tech|ps[45]|\d+k|\d{3,4}p|(19|20)\d\d|\d+(hz|w|mah|mp|th|st|nd|rd)|\d+(\.\d+)?\s*ch)\b/g, " ");
  return new Set(part.match(/\d+/g) ?? []);
});

/**
 * The same maker's different models (audit, 2026-11-12): "DELL Latitude 7400" held a Latitude 5400 and an E5490, "Tecno Spark Go
 * 3" a Spark 50. When both titles' model parts carry numbers and they share none, the models differ. A title whose model part has
 * no number ("TCL - Smart Google TV QLED 75 inch - P79L" ends at its first " - ") never vetoes.
 */
const modelNumberConflict = (titleA, titleB) => {
  const a = modelNumbers(titleA);
  const b = modelNumbers(titleB);
  if (a.size === 0 || b.size === 0) return false;
  for (const n of a) if (b.has(n)) return false;
  return true;
};

/**
 * How far below a capacity variant's cheapest offer that states the capacity a page that states none may be priced and still join
 * it. A store's page without a capacity carries its cheapest variant's price: PriceOye's bare "Samsung Galaxy A37 5G" (PKR 122,495)
 * joined the 8GB/256GB product (cheapest stated offer 133,499), "Nothing Phone 3a" (138,995) the 12GB/256GB (155,499), and each became
 * that variant's lowest price (audit, 2026-11-12). The same variant across stores is within a few per cent: S25 at 3.5% below, iPhone
 * 17 at 2%. A page further below is left out of the variant, in a product of its own.
 */
const BARE_BELOW_STATED = 0.05;
const titleStatesCapacity = perTitle((title) => extractStorage(title) !== null);
function belowStatedVariant(listing, group) {
  // A phone page that does not say whether it is PTA approved, priced below approved ones, is more likely the non-PTA unit:
  // separateLikelyNonPta moves it out later and labels it so for the shopper, which this check (acting earlier) would prevent.
  if (PTA_SENSITIVE.has(listing.productCategory) && ptaOf(listing) === "unknown") return false;
  let lowest = Infinity;
  for (const offer of group.offers) {
    if (offer.price > 0 && offer.price < lowest && titleStatesCapacity(offer.title || offer.normalizedTitle || "")) lowest = offer.price;
  }
  return lowest !== Infinity && listing.price < lowest * (1 - BARE_BELOW_STATED);
}

/** A hard reason the listing may not share a group with this member, whatever the titles' similarity says. */
function conflictsWithMember(listing, rawTitle, member, networkFamilies) {
  const memberTitle = member.title || member.normalizedTitle || "";
  return (
    makerConflict(rawTitle, memberTitle) ||
    modelNumberConflict(rawTitle, memberTitle) ||
    ptaConflict(listing, member) ||
    ptaPriceConflict(listing, member) ||
    sameStoreVariant(listing, member, rawTitle, memberTitle) ||
    attributeConflict(rawTitle, memberTitle, { ignoreUnstatedStorage: true }) ||
    isNetworkSplit(rawTitle, memberTitle, networkFamilies) ||
    prefixConflict(rawTitle, memberTitle)
  );
}

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
    if (listingStorage === null && group.storage !== null && belowStatedVariant(listing, group)) continue;

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
      !group.offers.some((member) => conflictsWithMember(listing, rawTitle, member, networkFamilies))
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

/**
 * Joins groups the first-match loop left apart although their titles name the same model. A listing joins the first group that
 * matches, so two offers of one TV ("TCL 75" 75P79L" and "TCL - Smart Google TV QLED Premium 75 inch - P79L") could each settle in
 * a different group of that TV, the second with offers whose titles carry no code at all. `sameModel` is the pair rule
 * (similarityModel.service.js sharedModelCode: same brand, the same distinctive model code, prices within 25%); two groups join
 * when it holds for an offer of each (comparing only the groups' own titles rejoined 35 of 396 pairs the rule had split), their
 * capacities agree, and none of the joining offers conflicts with any offer already there (the checks findMatchingGroup makes).
 * Groups are looked up by their offers' codes, a leading screen size dropped ("55u8000f" also files under "u8000f"), so only
 * groups that share one are compared.
 */
function mergeSameModelGroups(groups, sameModel, networkFamilies) {
  const titleOf = (offer) => offer.title || offer.normalizedTitle || "";
  const keys = (title) => {
    const codes = [...extractModelCodes(title, { minCodeLength: 4 })];
    // A TV title's three-character codes too ("Q7F"), for the rule's "55Q7F" / "Q7F" case (sameTvShortCode).
    const short = extractScreenInches(title) !== null ? [...extractModelCodes(title, { minCodeLength: 3 })].filter((code) => code.length === 3) : [];
    return [...codes, ...codes.map((code) => code.replace(/^\d{2,3}(?=[a-z][a-z0-9]{2,}$)/, "")), ...short];
  };
  // One offer per distinct title and price is enough to ask the rule about (a store lists one TV many times).
  const distinctOffers = (group) => [...new Map(group.offers.map((o) => [`${titleOf(o)}|${o.price}`, o])).values()];
  const byKey = new Map();
  const groupKeys = groups.map((group, i) => {
    const own = new Set(group.offers.flatMap((offer) => keys(titleOf(offer))));
    for (const key of own) {
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(i);
    }
    return own;
  });
  const middle = (group) => (group.lowestPrice + group.highestPrice) / 2;
  const absorbed = new Set();

  groups.forEach((group, i) => {
    if (absorbed.has(i)) return;
    const others = new Set();
    for (const key of groupKeys[i]) for (const j of byKey.get(key) ?? []) if (j > i && !absorbed.has(j)) others.add(j);
    for (const j of [...others].sort((a, b) => a - b)) {
      const other = groups[j];
      if (group.storage !== null && other.storage !== null && group.storage !== other.storage) continue;
      // The groups as wholes must agree too: one pair of offers alone chained Sony's WH-1000XM6 headphones (PKR 129,000) to its
      // WF-1000XM6 earbuds (PKR 88,000), and an OKTRA TV to a PEL one.
      if (!sameBrand(group.rawGroupKey, other.rawGroupKey)) continue;
      if (Math.abs(middle(group) - middle(other)) / Math.max(middle(group), middle(other)) > SHARED_CODE_PRICE_GAP) continue;
      const mine = distinctOffers(group);
      let named = null;
      for (const b of distinctOffers(other)) {
        named = mine.map((a) => sameModel({ title: titleOf(a), price: a.price }, { title: titleOf(b), price: b.price })).find(Boolean) ?? null;
        if (named) break;
      }
      if (!named) continue;
      // A three-character TV code ("55Q7F" / "Q7F", sameTvShortCode) must name the groups themselves too: through one offer it joined
      // a group of Dawlance KORE TVs that also held two E3A offers to the E3A's group, and a TCL C6 to a P6K (2026-11-09).
      if (named.length < SHARED_CODE_LENGTH &&
        // (the groups' prices were compared above, so the titles are asked at one price)
        !sameModel({ title: group.rawGroupKey, price: 1 }, { title: other.rawGroupKey, price: 1 })) continue;
      const clash = other.offers.some((listing) => {
        const title = listing.title || listing.normalizedTitle || "";
        return group.offers.some((member) => conflictsWithMember(listing, title, member, networkFamilies));
      });
      if (clash) continue;
      // Nor may a page without a capacity come in this way below the variant it would join (BARE_BELOW_STATED).
      const [bare, stated] = group.storage === null ? [group, other] : [other, group];
      if (bare.storage === null && stated.storage !== null && bare.offers.some((listing) =>
        !titleStatesCapacity(listing.title || listing.normalizedTitle || "") && belowStatedVariant(listing, stated))) continue;
      for (const listing of other.offers) addOffer(group, listing);
      if (group.storage === null && other.storage !== null) {
        group.storage = other.storage;
        group.normalizedGroupKey = other.normalizedGroupKey;
        group.rawGroupKey = other.rawGroupKey;
        group.productName = other.productName;
      }
      absorbed.add(j);
    }
  });
  return groups.filter((_, i) => !absorbed.has(i));
}

/**
 * Joins two groups of one phone that a store's wording kept apart (2026-11-09). A group is compared by one title, and when that
 * title is an AlfaMall seller's ("Infinix Note 60 | (256GB - 8GB RAM) | PTA Approved | Official Warranty With Free SURPRISE GIFT |
 * Electro Ease") the same phone's plain titles scored 0.32 against it and formed a second group. `samePlainTitles` is the strategy's
 * test of two group titles without that wording (similarityModel.service.js). Two groups join only when both state the same
 * capacity, have the same brand, sit within PRICE_PROXIMITY of each other, the test holds, and no offer of one conflicts with any
 * offer of the other (the checks findMatchingGroup makes). It runs on finished groups and only joins them: letting offers try the
 * plain titles while groups were still forming put many offers in different groups and was no better (GROUPING_RECALL.md).
 * Each group is compared by its own title only, so a joined group does not reach further through the titles it took in.
 */
function mergeStoreWordedGroups(groups, samePlainTitles, networkFamilies) {
  // Each group's price as it was before this pass: a group that has taken in others spans more, and reached a dearer one through
  // them (a PKR 103,000 instalment listing reached an 83,000 group through a 91,000 one).
  const middles = new Map(groups.map((group) => [group, (group.lowestPrice + group.highestPrice) / 2]));
  const middle = (group) => middles.get(group);
  const plainTitles = new Map();
  const plainOf = (listing) => {
    if (!plainTitles.has(listing)) plainTitles.set(listing, withoutStoreWording(listing.title || listing.normalizedTitle || ""));
    return plainTitles.get(listing);
  };
  const byVariant = new Map();
  groups.forEach((group, i) => {
    // The capacity as the grouping read it, or as a seller's "8/256" states it (ramStorageShorthand), which the grouping loop does
    // not read (see extractStorage).
    const storage = group.storage ?? ramStorageShorthand(group.rawGroupKey)?.[1] ?? null;
    if (storage === null) return;
    const key = `${brandOf(group.rawGroupKey)}|${storage}`;
    if (!byVariant.has(key)) byVariant.set(key, []);
    byVariant.get(key).push(i);
  });
  const absorbed = new Set();
  for (const members of byVariant.values()) {
    for (const i of members) {
      if (absorbed.has(i)) continue;
      const group = groups[i];
      for (const j of members) {
        if (j <= i || absorbed.has(j)) continue;
        const other = groups[j];
        if (Math.abs(middle(group) - middle(other)) / Math.max(middle(group), middle(other)) > PRICE_PROXIMITY) continue;
        if (!samePlainTitles({ title: group.rawGroupKey, price: middle(group) }, { title: other.rawGroupKey, price: middle(other) })) continue;
        // The 4G/5G families are checked on the titles without store wording as well: Microtel's "Samsung Galaxy A17 8GB 256GB Pta
        // Approved With Official Warranty At 0% Markup ... By Microtel Trading" is not read as one of the A17 family with its
        // wording, and joined the A17 5G when tried.
        const clash = other.offers.some((listing) => {
          const title = listing.title || listing.normalizedTitle || "";
          return group.offers.some((member) => conflictsWithMember(listing, title, member, networkFamilies) ||
            isNetworkSplit(plainOf(listing), plainOf(member), networkFamilies));
        });
        if (clash) continue;
        for (const listing of other.offers) addOffer(group, listing);
        absorbed.add(j);
      }
    }
  }
  return groups.filter((_, i) => !absorbed.has(i));
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

export function groupListingsByProduct(listings = [], { matchStrategy = ruleMatchStrategy, blocking = true, sameModel = matchStrategy.sameModel ?? null } = {}) {
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

  if (sameModel) groups = mergeSameModelGroups(groups, sameModel, networkFamilies);
  if (matchStrategy.samePlainTitles) groups = mergeStoreWordedGroups(groups, matchStrategy.samePlainTitles, networkFamilies);
  groups = separateLikelyNonPta(groups, matchStrategy, networkFamilies);

  return flagPriceErrors(groups
    .map((group) => {
      const rankedOffers = calculateDealScores(group.offers);

      // Where a PTA-approved offer exists, the best deal is one of those: an offer that does not say it is
      // approved cannot be told apart from a non-PTA unit, which is why the deals feed applies the same rule.
      // The unstated offers stay in the list, labelled. The best deal, the lowest and the highest price come from the offers the
      // site's pages would use (offerFreshness.service.js headlineOffers: new, current, believable, in stock); the rest stay in the
      // list, labelled. The prices used while grouping were every offer's, as they must be to compare offers.
      const candidates = headlineOffers(rankedOffers);
      const bestDeal = group.ptaStatus === "pta_approved"
        ? candidates.find((offer) => ptaOf(offer) === "pta_approved") ?? candidates[0]
        : candidates[0];
      const prices = candidates.map((offer) => Number(offer.price)).filter((price) => price > 0);

      return {
        ...group,
        ...(prices.length && { lowestPrice: Math.min(...prices), highestPrice: Math.max(...prices) }),
        bestDeal: bestDeal || null,
        offers: rankedOffers,
      };
    })
    .sort((a, b) => b.offerCount - a.offerCount));
}

/**
 * How many times the same model's usual price a product sold by one store may cost before its price is called a listing error.
 * AlfaMall's "Xiaomi 15T Pro 12GB 512GB" at PKR 9,999,999 and "Lenovo ThinkPad E16 Gen 3" at 3,099,999 were each a product of their
 * own (too far from the same model's other offers to join them), so the price check had no other store to compare with and
 * abstained, and they topped the dearest end of their categories (audit, 2026-11-12, finding 7). The same model at other stores is
 * a few hundred thousand.
 */
const PRICE_ERROR_RATIO = 3;

/**
 * Marks the offers of a one-store product priced over PRICE_ERROR_RATIO times the median price of the same model's other products
 * (same maker, model numbers and capacity: makerOf, modelNumbers) as a probable listing error, the way the price check marks one
 * against other stores (pricePlausibility "suspect_high"): it stays listed, labelled, and is never a lowest or highest price.
 */
function flagPriceErrors(groups) {
  const keyOf = (group) => {
    const maker = makerOf(group.rawGroupKey);
    const numbers = [...modelNumbers(group.rawGroupKey)].sort().join(",");
    return maker && numbers ? `${group.offers[0]?.productCategory}|${maker}|${numbers}|${group.storage ?? ""}` : null;
  };
  const byKey = new Map();
  for (const group of groups) {
    const key = keyOf(group);
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(group);
  }
  for (const group of groups) {
    if (new Set(group.offers.map((offer) => offer.platform)).size !== 1) continue;
    const others = (byKey.get(keyOf(group)) ?? []).filter((other) => other !== group).map((other) => other.lowestPrice).filter((p) => p > 0);
    if (others.length === 0) continue;
    const sorted = others.sort((a, b) => a - b);
    const reference = sorted[Math.floor(sorted.length / 2)];
    if (!(group.lowestPrice > reference * PRICE_ERROR_RATIO)) continue;
    const ratio = group.lowestPrice / reference;
    group.offers = group.offers.map((offer) => ({
      ...offer,
      priceCheck: {
        status: "suspect_high",
        ratio: Number(ratio.toFixed(2)),
        referencePrice: reference,
        comparators: others.length,
        reason: `This price is ${ratio.toFixed(1)} times what the same model costs elsewhere (PKR ${reference.toLocaleString()}), which is unusually high and may be a listing error.`,
      },
    }));
  }
  return groups;
}