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
