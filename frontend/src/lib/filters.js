// filters.js — everything about narrowing and ordering search results, as pure
// functions with no React in them. That is what makes it testable, and it is the
// logic the results page used to keep tangled up in fifteen pieces of state.
//
// Filter state lives in the URL (see filtersToParams / parseFilters), so a
// filtered view can be bookmarked, shared and survives a reload, and the back
// button steps through it.

import { canonicalPlatform, platformName } from "./platforms.js";
import { DEFAULT_FACETS, FACETS_BY_CATEGORY, RESOLUTION_ORDER } from "./categories.js";
import { formatBrand, formatCapacity, formatCondition, formatPta, formatScreen } from "./format.js";

export const SORTS = [
  { id: "recommended", label: "Best deal", hint: "Recommended" },
  { id: "lowestPrice", label: "Lowest price" },
  { id: "bestScore", label: "Best deal score" },
  { id: "highestDiscount", label: "Highest verified discount" },
];
export const DEFAULT_SORT = "recommended";
const SORT_IDS = new Set(SORTS.map((s) => s.id));

// A filter facet: which offer field it reads, how its options are ordered and labelled.
export const FACET_DEFS = {
  // Stores write a brand in any case ("SAMSUNG", "Samsung"): one option each (2026-11-10).
  // Not "Nothing" as an option: the phone maker's name read as "no brand" in the phones' brand filter, and Arsalan asked for it to go
  // (2026-11-10). Its phones are still listed and found by search ("nothing phone").
  brand: { title: "Brand", field: "brand", order: "count", format: formatBrand, normalize: (v) => String(v).trim().toLowerCase(), exclude: ["nothing"] },
  storage: { title: "Storage", field: "storageGb", numeric: true, order: "value", format: formatCapacity },
  ram: { title: "RAM", field: "ramGb", numeric: true, order: "value", format: formatCapacity },
  screen: { title: "Screen size", field: "screenInches", numeric: true, order: "value", format: formatScreen },
  resolution: { title: "Resolution", field: "resolution", order: "resolution" },
  colour: { title: "Colour", field: "colour", order: "count" },
  condition: { title: "Condition", field: "condition", order: "count", format: formatCondition },
  // Most stores do not state PTA status, and "we don't know" is not a useful choice.
  pta: { title: "PTA status", field: "ptaStatus", order: "count", format: formatPta, exclude: ["unknown"] },
};
const FACET_KEYS = Object.keys(FACET_DEFS);
/** The facet keys, for clearing every facet choice at once (when the category changes). */
export const FACET_KEYS_FOR_RESET = FACET_KEYS;

export function emptyFilters() {
  return {
    category: "all",
    platforms: null, // null = every platform
    minPrice: null, // null = no lower bound
    maxPrice: null,
    sort: DEFAULT_SORT,
    ...Object.fromEntries(FACET_KEYS.map((key) => [key, []])),
  };
}

// ---------------------------------------------------------------- URL <-> state

const list = (value) => (value ? value.split(",").map((v) => v.trim()).filter(Boolean) : []);

function positiveNumber(value) {
  const number = Number(value);
  return value !== null && value !== "" && Number.isFinite(number) && number >= 0 ? number : null;
}

/** Reads filter state from URLSearchParams. Unknown or malformed values are ignored. */
export function parseFilters(params) {
  const filters = emptyFilters();

  filters.category = params.get("category") || "all";
  const platforms = list(params.get("platforms")).map(canonicalPlatform);
  filters.platforms = platforms.length ? platforms : null;
  filters.minPrice = positiveNumber(params.get("minPrice"));
  filters.maxPrice = positiveNumber(params.get("maxPrice"));
  filters.sort = SORT_IDS.has(params.get("sort")) ? params.get("sort") : DEFAULT_SORT;

  for (const key of FACET_KEYS) {
    const values = list(params.get(key));
    filters[key] = FACET_DEFS[key].numeric ? values.map(Number).filter(Number.isFinite) : values;
  }
  return filters;
}

/** Writes filter state to URLSearchParams, leaving defaults out so URLs stay short. */
export function filtersToParams(filters, q) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (filters.category && filters.category !== "all") params.set("category", filters.category);
  if (filters.platforms?.length) params.set("platforms", filters.platforms.join(","));
  if (filters.minPrice !== null) params.set("minPrice", String(filters.minPrice));
  if (filters.maxPrice !== null) params.set("maxPrice", String(filters.maxPrice));
  if (filters.sort !== DEFAULT_SORT) params.set("sort", filters.sort);
  for (const key of FACET_KEYS) {
    if (filters[key].length) params.set(key, filters[key].join(","));
  }
  return params;
}

/** True when anything other than the default view is selected (drives the "Reset" control). */
export function isFiltered(filters) {
  return (
    filters.category !== "all" ||
    Boolean(filters.platforms?.length) ||
    filters.minPrice !== null ||
    filters.maxPrice !== null ||
    FACET_KEYS.some((key) => filters[key].length > 0)
  );
}

// ---------------------------------------------------------------- discounts

/** Claimed discount as a fraction of the original price, 0 when there is none. */
export function claimedDiscount(offer) {
  if (!offer?.originalPrice || offer.originalPrice <= offer.price) return 0;
  return (offer.originalPrice - offer.price) / offer.originalPrice;
}

/** True if any check says this discount, or this price, cannot be trusted. */
export function isDiscountDoubtful(offer) {
  return Boolean(
    offer?.discountAnalysis?.isFakeDiscount ||
      offer?.discountAnomaly?.isAnomalous ||
      offer?.priceCheck?.status?.startsWith("suspect")
  );
}

/** The discount to rank by: a doubtful discount counts as none, so a fake one cannot top the list. */
export function verifiedDiscount(offer) {
  return isDiscountDoubtful(offer) ? 0 : claimedDiscount(offer);
}

// ---------------------------------------------------------------- filtering

const categoryOf = (offer) => offer.productCategory || "other";

/** The offers of one category ("other" for those without one). */
export function inCategory(offers, category) {
  return offers.filter((offer) => categoryOf(offer) === category);
}

/** An offer's value for a facet, normalised where the facet says so (a brand in one case). */
function facetValue(offer, def) {
  const value = offer[def.field];
  return def.normalize && value !== null && value !== undefined && value !== "" ? def.normalize(value) : value;
}

/** Offers that satisfy every selected filter. An empty selection means "no constraint". */
export function applyFilters(offers, filters) {
  const platforms = filters.platforms?.length ? new Set(filters.platforms) : null;

  return offers.filter((offer) => {
    if (filters.category !== "all" && categoryOf(offer) !== filters.category) return false;
    if (platforms && !platforms.has(canonicalPlatform(offer.platform))) return false;
    if (filters.minPrice !== null && offer.price < filters.minPrice) return false;
    if (filters.maxPrice !== null && offer.price > filters.maxPrice) return false;

    for (const key of FACET_KEYS) {
      const selected = filters[key];
      if (selected.length && !selected.includes(facetValue(offer, FACET_DEFS[key]))) return false;
    }
    return true;
  });
}

// ---------------------------------------------------------------- sorting

/** Offers in the chosen order. "recommended" keeps the order the API returned. */
export function sortOffers(offers, sort) {
  const sorted = [...offers];
  if (sort === "lowestPrice") sorted.sort((a, b) => a.price - b.price);
  else if (sort === "bestScore") sorted.sort((a, b) => (b.dealScore || 0) - (a.dealScore || 0));
  else if (sort === "highestDiscount") {
    sorted.sort((a, b) => verifiedDiscount(b) - verifiedDiscount(a) || a.price - b.price);
  }
  return sorted;
}

// ---------------------------------------------------------------- groups

/** A stable React key for a product group (product names are not unique). */
export const groupKey = (group) => String(group.offers?.[0]?._id ?? group.productName);

/**
 * The backend decided which offers are one product. Filtering rebuilds the groups
 * from the offers that survived, so a comparison is only ever shown between offers
 * of the same product, and drops groups left empty.
 */
export function filterGroups(groups, keptOffers) {
  const keep = new Set(keptOffers.map((offer) => offer._id));
  return groups
    .map((group) => ({ ...group, offers: (group.offers || []).filter((offer) => keep.has(offer._id)) }))
    .filter((group) => group.offers.length > 0);
}

/**
 * The offers whose price can be believed, for sorting and the price slider: not flagged as a probable listing error (the server's
 * priceCheck), and in stock when any is. An empty list when every price is flagged. A book about the iPhone at PKR 900, an
 * out-of-stock offer, or a "Xiaomi 15T Pro" at PKR 9,999,999 stretched the ends of a category (audit, 2026-11-12, finding 7).
 */
export function believableOffers(offers = []) {
  const unflagged = offers.filter((o) => !String(o?.priceCheck?.status ?? "").startsWith("suspect") && Number.isFinite(o?.price) && o.price > 0);
  const inStock = unflagged.filter((o) => o.inStock !== false);
  return inStock.length ? inStock : unflagged;
}

/** Group order follows the sort mode, so "Lowest price" really surfaces the cheapest products first (by prices that can be believed). */
export function sortGroups(groups, sort) {
  const sorted = [...groups];
  const cheapest = (g) => {
    const prices = believableOffers(g.offers).map((o) => o.price);
    return prices.length ? Math.min(...prices) : Infinity; // a product with no believable price goes last
  };
  const bestScore = (g) => Math.max(...g.offers.map((o) => o.dealScore || 0));
  const bestDiscount = (g) => Math.max(...g.offers.map(verifiedDiscount));

  if (sort === "lowestPrice") sorted.sort((a, b) => cheapest(a) - cheapest(b));
  else if (sort === "bestScore") sorted.sort((a, b) => bestScore(b) - bestScore(a));
  else if (sort === "highestDiscount") sorted.sort((a, b) => bestDiscount(b) - bestDiscount(a) || cheapest(a) - cheapest(b));
  else sorted.sort((a, b) => b.offers.length - a.offers.length);
  return sorted;
}

// ---------------------------------------------------------------- what to offer as filters

/** Number of offers per category, most common first. */
export function categoryCounts(offers) {
  const counts = new Map();
  for (const offer of offers) counts.set(categoryOf(offer), (counts.get(categoryOf(offer)) || 0) + 1);
  return [...counts.entries()].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count);
}

/**
 * Filters are shown for one category at a time: taking the union across every
 * category present meant a TV search could offer a PTA filter because some
 * phones happened to match the query. A selected category wins; otherwise the
 * most common category in the results.
 */
export function activeCategory(offers, selectedCategory) {
  if (selectedCategory && selectedCategory !== "all") return selectedCategory;
  return categoryCounts(offers)[0]?.category || "other";
}

/**
 * The filter groups to show, each with its options and counts. A facet with fewer than two options gives no real choice and is
 * left out. With `filters`, an option's count is of the offers that pass every OTHER chosen filter, so a choice no offer can meet
 * shows 0 (2026-11-10: 64 GB with 12 GB of RAM found nothing, since phones are sold as 4/64, 8/256...; now choosing 64 GB leaves the
 * RAM sizes sold with it). The options and their order come from all the offers, so the list does not jump as filters are chosen.
 * @returns {Array<{key:string, title:string, options:Array<{value, label:string, count:number}>}>}
 */
export function buildFacets(offers, category, filters = null) {
  const scoped = offers.filter((offer) => categoryOf(offer) === category);
  const keys = FACETS_BY_CATEGORY[category] || DEFAULT_FACETS;
  const countBy = (list, def) => {
    const counts = new Map();
    for (const offer of list) {
      const value = facetValue(offer, def);
      if (value === null || value === undefined || value === "" || def.exclude?.includes(value)) continue;
      counts.set(value, (counts.get(value) || 0) + 1);
    }
    return counts;
  };

  return keys
    .map((key) => {
      const def = FACET_DEFS[key];
      const all = countBy(scoped, def);
      const inContext = filters ? countBy(applyFilters(scoped, { ...filters, category, [key]: [] }), def) : all;

      const options = [...all.entries()].map(([value, total]) => ({
        value,
        count: inContext.get(value) || 0,
        total,
        label: def.format ? def.format(value) : String(value),
      }));

      if (def.order === "value") options.sort((a, b) => a.value - b.value);
      else if (def.order === "resolution") options.sort((a, b) => (RESOLUTION_ORDER[a.value] ?? 99) - (RESOLUTION_ORDER[b.value] ?? 99));
      else options.sort((a, b) => b.total - a.total);

      return { key, title: def.title, options: options.map(({ total: _total, ...option }) => option) };
    })
    .filter((facet) => facet.options.length >= 2);
}

/** Stores present in the results, with how many offers each has. */
export function platformOptions(offers) {
  const counts = new Map();
  for (const offer of offers) {
    const id = canonicalPlatform(offer.platform);
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([id, count]) => ({ id, name: platformName(id), count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** Lowest and highest price in a set of offers, for the price slider. */
export function priceBounds(offers) {
  const prices = believableOffers(offers).map((o) => o.price);
  return prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : { min: 0, max: 0 };
}

/**
 * The facets with the brand filter counted over a whole category (the catalog's `brands`: [{ brand, count }]) instead of the
 * products on screen, which are only the most compared. The count is of products.
 */
export function withCategoryBrands(facets, brands) {
  const def = FACET_DEFS.brand;
  const options = brands
    .map(({ brand, count }) => ({ value: def.normalize(brand), count, label: def.format(brand) }))
    .filter(({ value }) => !def.exclude?.includes(value));
  if (options.length < 2) return facets;
  const facet = { key: "brand", title: def.title, options };
  return facets.some((f) => f.key === "brand") ? facets.map((f) => (f.key === "brand" ? facet : f)) : [facet, ...facets];
}
