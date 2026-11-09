// extractors.js — a store's product page in, its specifications as label/value pairs out ({ "Processor": "Apple A19", ... }).
//
// Readers for the stores whose pages were read and found to state specifications (2026-11-09, phones, tablets and laptops):
//   - PriceOye keeps the whole sheet as JSON in the page (window.product_data, "specification": groups such as "Display" and
//     "Memory", each a list of label/value objects). The visible tab is drawn from it by script, so the JSON is what is read.
//   - iShopping and DigiMall write a two-column table into the product description ("Processor | Exynos 1330").
//   - Paklap and Shophive (Magento) have the attribute table "#product-attribute-specs-table" ("Installed RAM | 8 GB").
//   - Techroid (WooCommerce) has the attribute table, eezepc a specification table of its own; both two columns.
// So beyond PriceOye's JSON one reader serves them all: every two-column table row and every <dl> pair on the page. What a label
// means is worked out by normalize.js, which keeps only the labels it knows, so a size chart or a delivery table adds nothing.
// Not read (checked the same day): Mega's tables are marketing copy ("Processor | Apple latest generation chip", no battery
// anywhere); AlfaMall's pages state no specifications. A store gets a reader after the same check.

import * as cheerio from "cheerio";

const clean = (text) => String(text ?? "").replace(/\s+/g, " ").trim();
const MAX_LABEL = 60;
const MAX_VALUE = 300;

function add(out, label, value) {
  const key = clean(label).replace(/[:：]\s*$/, "");
  const text = clean(value);
  if (!key || !text || key.length > MAX_LABEL || text.length > MAX_VALUE) return;
  if (!(key in out)) out[key] = text; // the first statement of a label wins (the product's own table comes before related products)
}

/** Every row of exactly two cells, and every <dt>/<dd> pair. */
export function tablePairs(html) {
  const $ = cheerio.load(String(html ?? ""));
  const out = {};
  $("tr").each((_, row) => {
    const cells = $(row).children("td, th");
    if (cells.length === 2) add(out, $(cells[0]).text(), $(cells[1]).text());
  });
  $("dl").each((_, dl) => {
    const terms = $(dl).children("dt");
    const definitions = $(dl).children("dd");
    terms.each((i, dt) => add(out, $(dt).text(), $(definitions[i]).text()));
  });
  return out;
}

/** PriceOye's "specification" JSON: its groups flattened into one label/value object, or {} when the page has none. */
export function priceoyePairs(html) {
  const match = String(html ?? "").match(/"specification"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (!match) return {};
  try {
    const groups = JSON.parse(JSON.parse(`"${match[1]}"`));
    const out = {};
    for (const [group, entries] of Object.entries(groups ?? {})) {
      for (const entry of Array.isArray(entries) ? entries : [entries]) {
        for (const [label, value] of Object.entries(entry ?? {})) {
          if (typeof value !== "string" && typeof value !== "number") continue;
          // A label that means nothing alone keeps its group: the battery is { "Battery": [{ "Type": "3692 mAh" }] }.
          add(out, /^type$/i.test(label.trim()) ? `${group} ${label}` : label, String(value));
        }
      }
    }
    return out;
  } catch {
    return {};
  }
}

const EXTRACTORS = {
  priceoye: (html) => ({ ...tablePairs(html), ...priceoyePairs(html) }), // the JSON wins where both say
  ishopping: tablePairs,
  digimall: tablePairs,
  paklap: tablePairs,
  shophive: tablePairs,
  techroid: tablePairs,
  eezepc: tablePairs,
};

/** The stores with a reader (pageEnrichment reads their pages' specifications). */
export const SPEC_STORES = Object.freeze(Object.keys(EXTRACTORS));

export function extractSpecs(platform, html) {
  const read = EXTRACTORS[String(platform).toLowerCase()];
  if (!read) return null;
  const raw = read(html);
  return Object.keys(raw).length > 0 ? raw : null;
}
