// specs.js — the specification rows for a product, built from what the listing states. Most stores
// publish specifications only inside the title, so these are "derived from the title" and the page says so.
// A row is left out when the value is missing, so nothing is ever shown as "unknown".

import { categoryName } from "./categories.js";
import { formatBrand, formatCapacity, formatCondition, formatPta, formatScreen } from "./format.js";

/** @returns {Array<[string, string]>} label / value pairs, in display order */
export function buildSpecs(listing) {
  if (!listing) return [];
  const rows = [];
  const add = (label, value) => {
    if (value !== undefined && value !== null && value !== "") rows.push([label, String(value)]);
  };

  add("Brand", formatBrand(listing.brand));
  if (listing.productCategory && listing.productCategory !== "other") add("Category", categoryName(listing.productCategory));
  if (listing.storageGb) add("Storage", formatCapacity(listing.storageGb));
  if (listing.ramGb) add("Memory", `${listing.ramGb} GB RAM`);
  if (listing.screenInches) add("Screen size", formatScreen(listing.screenInches));
  add("Resolution", listing.resolution);
  add("Colour", listing.colour);
  add("Condition", listing.condition ? formatCondition(listing.condition) : "");
  // "unknown" is the absence of a statement, not a property of the product.
  if (listing.ptaStatus && listing.ptaStatus !== "unknown") add("PTA status", formatPta(listing.ptaStatus));
  return rows;
}
