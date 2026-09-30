// categories.js — category names and which filters make sense for each. A laptop
// search should offer RAM and screen size; a phone search should offer storage
// and PTA status; neither should offer the other's.

export const CATEGORY_NAMES = {
  smartphone: "Smartphones",
  laptop: "Laptops",
  tablet: "Tablets",
  tv: "TVs",
  headphones: "Headphones",
  smartwatch: "Smartwatches",
  monitor: "Monitors",
  gaming_console: "Gaming consoles",
  accessory: "Accessories",
  appliance: "Appliances",
  camera: "Cameras",
  other: "Other",
};

export const categoryName = (category) => CATEGORY_NAMES[category] || category;

/** True for a category id we have a name for (guards the ?category= value in the URL). */
export const isKnownCategory = (category) => Object.hasOwn(CATEGORY_NAMES, category);

// The categories the site is about, in the order they are offered when counts tie.
// "accessory", "other", "appliance" and the like are stored but are not what a shopper
// comes here to compare, so they are not promoted on the home page.
export const FEATURED_CATEGORIES = ["smartphone", "tv", "laptop", "smartwatch", "tablet", "headphones"];

// A category with fewer listings than this would look empty, so it gets no tile.
export const MIN_TILE_COUNT = 20;

/**
 * The home page's category tiles from the stats endpoint's `categories`
 * ([{category, count}]): featured categories only, biggest first, hiding thin ones.
 * @returns {{category: string, name: string, count: number}[]}
 */
export function featuredCategories(counts = [], { min = MIN_TILE_COUNT } = {}) {
  return counts
    .filter((row) => FEATURED_CATEGORIES.includes(row?.category) && Number(row.count) >= min)
    .map((row) => ({ category: row.category, name: categoryName(row.category), count: Number(row.count) }))
    .sort((a, b) => b.count - a.count || FEATURED_CATEGORIES.indexOf(a.category) - FEATURED_CATEGORIES.indexOf(b.category));
}

export const FACETS_BY_CATEGORY = {
  smartphone: ["storage", "ram", "colour", "condition", "pta"],
  tablet: ["storage", "ram", "colour", "condition", "pta"],
  laptop: ["storage", "ram", "screen", "colour", "condition"],
  tv: ["screen", "resolution", "condition"],
  monitor: ["screen", "resolution", "condition"],
  smartwatch: ["colour", "condition"],
  headphones: ["colour", "condition"],
  camera: ["condition"],
  appliance: ["condition"],
  accessory: ["colour", "condition"],
  other: ["colour", "condition"],
};

export const DEFAULT_FACETS = ["colour", "condition"];

// Best to worst, for the resolution facet.
export const RESOLUTION_ORDER = { "8K": 0, "4K": 1, QHD: 2, FHD: 3, HD: 4 };
