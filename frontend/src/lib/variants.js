// variants.js — the other versions of the same model (storage, RAM, PTA approved or not), for the product page's selector rows
// (components/product/VariantPicker.jsx), the way Qeemat shows them (2026-11-21). Each storage / RAM / PTA version is its own
// product here (grouped from the stores' listings); this finds a product's siblings among a search for its model and says, for each
// option, the lowest price and which sibling it opens.

import { summarizeOffers } from "./summary.js";

/** "Samsung Galaxy A17 6GB RAM 128GB Storage PTA Approved" -> "Samsung Galaxy A17": the name up to its first capacity. */
export function modelName(name) {
  // a colour or note in brackets is not the model: "Apple iPhone 17 Pro Max (Blue) 512 GB" is "Apple iPhone 17 Pro Max"
  const text = String(name ?? "").replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  const cut = text.split(/\s(?=\d+\s?(?:gb|tb)\b)/i)[0];
  return cut.replace(/\b(pta|non[- ]?pta|approved|official|warranty)\b.*$/i, "").replace(/[\s,(–-]+$/, "").trim();
}

// The model as a key: lower case, without a leading maker's name ("Apple iPhone 17 Pro Max" and "iPhone 17 Pro Max" are one model).
// ("Redmi" is a line, not a maker: "Xiaomi Redmi Note 15" and "Redmi Note 15" both become "redmi note 15".)
const BRANDS = /^(apple|samsung|xiaomi|tecno|infinix|oppo|vivo|realme|google|oneplus|nokia|motorola|honor|huawei|itel|zte|nothing|lenovo|hp|dell|asus|acer|msi)\s+/;
export const modelKey = (name) => {
  const key = modelName(name).toLowerCase();
  const bare = key.replace(BRANDS, "");
  return bare.split(" ").length >= 2 ? bare : key; // "Xiaomi 15": keep the maker when one word would be left
};

// Storage sizes only: a size followed by "RAM" is the RAM ("Samsung A17 5G 8GB RAM" states no storage, and its 8GB showed as a storage
// option beside 256GB, 2026-11-27).
const capacities = (text) => [...String(text ?? "").matchAll(/(\d+)\s?(gb|tb)\b(?!\s*ram\b)/gi)].map((m) => Number(m[1]) * (m[2].toLowerCase() === "tb" ? 1024 : 1));

/** A product's storage, RAM and PTA status, from its lowest offer's fields, else its name. */
export function variantOf(group) {
  const lowest = summarizeOffers(group.offers ?? []).lowest;
  if (!lowest) return null;
  const name = group.productName ?? lowest.title ?? "";
  const sizes = capacities(name);
  const ramInName = Number(name.match(/(\d+)\s?gb\s?ram\b/i)?.[1]) || (sizes.length >= 2 ? Math.min(...sizes) : null);
  // (with RAM named, the sizes left are storage; with two sizes and no "RAM", the smaller is the RAM as before)
  const storage = Number(lowest.storageGb) || (sizes.length ? Math.max(...sizes) : null);
  const ram = Number(lowest.ramGb) || (ramInName && ramInName !== storage ? ramInName : null);
  const pta = lowest.ptaStatus === "non_pta" || /\bnon[- ]?pta\b/i.test(name) ? "non_pta" : lowest.ptaStatus === "pta_approved" ? "pta_approved" : null;
  return { group, lowest, price: lowest.price, model: modelKey(name), category: lowest.productCategory, storage, ram, pta };
}

const label = {
  storage: (gb) => (gb >= 1024 ? `${gb / 1024}TB` : `${gb}GB`),
  ram: (gb) => `${gb}GB`,
  pta: (status) => (status === "non_pta" ? "Non-PTA" : "PTA approved"),
};

/**
 * The selector rows for a product: for each of storage, RAM and PTA status that has two or more values among its siblings, the
 * values in order, each with its lowest price, whether it is the current one, the cheapest of its row, and the sibling it opens
 * (the one that keeps the current product's other choices, else the cheapest with that value).
 * @returns {Array<{key: string, title: string, options: Array<{value, label: string, price: number, current: boolean, best: boolean, target: object}>}>}
 */
export function variantRows(current, groups) {
  const self = variantOf(current);
  if (!self || !self.model) return [];
  const siblings = groups.map(variantOf).filter((v) => v && v.model === self.model && v.category === self.category && v.price > 0);
  if (!siblings.some((v) => v.lowest._id === self.lowest._id)) siblings.push(self);

  const rows = [];
  for (const [key, title] of [["storage", "Storage"], ["ram", "RAM"], ["pta", "PTA status"]]) {
    const values = [...new Set(siblings.map((v) => v[key]).filter((x) => x !== null && x !== undefined))];
    if (values.length < 2 || self[key] === null) continue;
    values.sort((a, b) => (key === "pta" ? (a === "pta_approved" ? -1 : 1) : a - b));
    const options = values.map((value) => {
      const withValue = siblings.filter((v) => v[key] === value);
      // the version keeping as many of the current choices as it can, PTA status first (changing the storage should not quietly
      // switch to a non-PTA phone), then the cheapest of those
      const weight = { pta: 4, storage: 2, ram: 1 };
      const kept = (v) => Object.keys(weight).filter((k) => k !== key && v[k] === self[k]).reduce((sum, k) => sum + weight[k], 0);
      const target = [...withValue].sort((a, b) => kept(b) - kept(a) || a.price - b.price)[0];
      // the price of the version the button opens (2026-11-24): on a PTA-approved page, "256GB" showed a non-PTA phone's price
      const price = value === self[key] ? self.price : target.price;
      return { value, label: label[key](value), price, current: value === self[key], target: target.lowest };
    });
    const prices = options.map((o) => o.price);
    const cheapest = Math.min(...prices) < Math.max(...prices) ? Math.min(...prices) : null;
    rows.push({ key, title, options: options.map((o) => ({ ...o, best: o.price === cheapest })) });
  }
  return rows;
}

// Each model's versions, remembered for this visit (2026-11-24): every version of a phone (256GB, 512GB, Non-PTA) searches the same
// model, so a click from one to another found the rows gone for two seconds while the same search ran again. Kept 10 minutes.
const REMEMBER_MS = 10 * 60 * 1000;
const remembered = new Map();

/** The remembered search groups for a model, or null when none (or too old). */
export function rememberedVariants(model, now = Date.now()) {
  const known = model ? remembered.get(model) : null;
  return known && now - known.at < REMEMBER_MS ? known.groups : null;
}

/** Remembers a model's search groups. */
export function rememberVariants(model, groups, now = Date.now()) {
  if (model) remembered.set(model, { at: now, groups: Array.isArray(groups) ? groups : [] });
}

/** For tests: forget what was remembered. */
export function forgetVariants() {
  remembered.clear();
}
