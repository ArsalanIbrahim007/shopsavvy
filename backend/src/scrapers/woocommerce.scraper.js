// woocommerce.scraper.js — one adapter for every store built on WooCommerce (XcessoriesHub, eezepc, LEDshop...).
// WooCommerce publishes a product search for its storefront blocks at /wp-json/wc/store/v1/products; this reads that, so
// there is no page to download and no markup to keep up with. Prices come as whole numbers in the currency's smallest unit
// (currency_minor_unit says how many decimals).
//
// A phone is usually ONE "variable" product covering every capacity and colour (XcessoriesHub's iPhone 17 Pro Max is a single
// product priced PKR 479,999 to 898,499). Reading only that would compare the cheapest capacity's price against every capacity
// elsewhere, so a variable product is expanded into its variations (products?type=variation&parent=ID), each a listing with its
// own price and its capacity in the title ("Apple iPhone 17 Pro Max PTA Approved 256GB"). Colours are NOT made separate
// listings: a capacity at one price is one listing, however many colours it comes in (the colours and their pictures are read
// from the product page, see colourPage.service.js). Only when a product has no capacity or other option to tell the variations
// apart are they kept one by one. To keep the request count small, only the variable products that look like what was searched
// for are expanded (at most MAX_EXPANDED).

import * as cheerio from "cheerio";

import { colourOptionsFromList } from "../services/colourPage.service.js";
import { makeListing } from "./scraper.schema.js";
import { cleanText, safeMap } from "./scraper.utils.js";
import { fetchJson as politeFetchJson } from "./politeJson.js";

// A store's own search ranks the accessories made for a phone ahead of the phone, so the product itself can be on page 2 or 3.
// Further pages are read only while fewer than MIN_PRODUCTS real products (not accessories) have been found.
const PER_PAGE = 50;
const MAX_PAGES = 3;
const MIN_PRODUCTS = 2;
const VARIATIONS_PER_PAGE = 50;
const MAX_EXPANDED = 3;

// Words that name a kind of product, not a model: a store's search needs "samsung", not "samsung tv" (a search for both
// words finds nothing on a store whose titles say "Smart TV" but not "tv" in the way its search indexes).
const GENERIC = new Set(["tv", "tvs", "led", "laptop", "laptops", "phone", "phones", "mobile", "mobiles", "smartphone", "smartphones", "tablet", "tablets"]);

/** The text of a title that arrives HTML-escaped ("43&#8243; Samsung", "Cases &amp; Covers"). */
const decode = (text) => cleanText(cheerio.load(`<p>${String(text ?? "")}</p>`)("p").text());

/** A price in whole rupees from the store's minor-unit integer, or null when there is none. */
function rupees(amount, minorUnit) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value / 10 ** (Number(minorUnit) || 0));
}

/** The search text to send: the query without words that only name a kind of product, unless that leaves nothing. */
export function searchTerm(query) {
  const words = String(query ?? "").trim().split(/\s+/).filter(Boolean);
  const kept = words.filter((word) => !GENERIC.has(word.toLowerCase()));
  return (kept.length > 0 ? kept : words).join(" ");
}

/** "Color: Deep Blue, Storage: 256 GB" -> [{ name: "Color", value: "Deep Blue" }, { name: "Storage", value: "256GB" }]. */
function variationOptions(variation) {
  return String(variation ?? "")
    .split(",")
    .map((part) => {
      const [name, ...rest] = part.split(":");
      return { name: name.trim(), value: decode(rest.join(":")).replace(/(\d)\s+(GB|TB)\b/gi, "$1$2") };
    })
    .filter((option) => option.name && option.value);
}

const isColour = (option) => /^colou?r$/i.test(option.name);

function toListing(platform, product, { title, colourOptions = null }) {
  const prices = product.prices ?? {};
  const minor = prices.currency_minor_unit;
  const price = rupees(prices.price_range?.min_amount ?? prices.price, minor);
  if (price === null) return null; // no price: a placeholder page, not something to compare

  const regular = rupees(prices.regular_price, minor);
  const rating = Number(product.average_rating);
  const reviews = Number(product.review_count);
  return makeListing({
    platform,
    sourceUrl: product.permalink,
    title,
    price,
    originalPrice: regular !== null && regular > price ? regular : null,
    imageUrl: product.images?.[0]?.src ?? null,
    inStock: product.is_in_stock !== false,
    rating: rating > 0 ? rating : null, // 0 means "no reviews", not "rated zero stars"
    reviewCount: reviews > 0 ? reviews : null,
    colourOptions,
  });
}

/**
 * The listings for a variable product's variations: one per capacity (or other non-colour option) and price, with the
 * colours folded into it. Without any non-colour option the variations are kept as they are, colour in the title.
 */
function listingsFromVariations(platform, parent, name, variations) {
  const entries = variations.map((variation) => ({ variation, options: variationOptions(variation.variation) }));
  const hasOtherOption = entries.some((entry) => entry.options.some((option) => !isColour(option)));

  if (!hasOtherOption) {
    return safeMap(
      entries,
      ({ variation, options }) => toListing(platform, variation, { title: decode(`${variation.name || name} ${options.map((o) => o.value).join(" ")}`) }),
      platform
    );
  }

  // one entry per capacity and price; the first variation of each stands for its colours, which are kept with the store's
  // picture of each (the variation's own image)
  const groups = new Map();
  for (const entry of entries) {
    const others = entry.options.filter((option) => !isColour(option));
    const price = rupees(entry.variation.prices?.price, entry.variation.prices?.currency_minor_unit);
    const capacity = others.map((o) => o.value).join(" ");
    const key = `${capacity}|${price}`;
    if (!groups.has(key)) groups.set(key, { others, capacity, entry, colourName: null, colours: [] });
    const group = groups.get(key);
    const colour = entry.options.find(isColour);
    if (colour) {
      group.colourName ??= colour.name;
      group.colours.push({ name: colour.value, image: entry.variation.images?.[0]?.src ?? null });
    }
  }

  // A capacity sold at more than one price (a colour that costs more) becomes more than one listing. Listings are keyed on
  // their address, so those must differ or each scrape would overwrite the other: the colours go into the address.
  const pricesPerCapacity = new Map();
  for (const group of groups.values()) pricesPerCapacity.set(group.capacity, (pricesPerCapacity.get(group.capacity) ?? 0) + 1);

  const permalink = String(parent.permalink).split("?")[0];
  return safeMap(
    [...groups.values()],
    ({ others, capacity, entry, colourName, colours }) => {
      const parts = others.map((option) => `attribute_${option.name.toLowerCase()}=${encodeURIComponent(option.value)}`);
      if (pricesPerCapacity.get(capacity) > 1 && colourName) {
        parts.push(`attribute_${colourName.toLowerCase()}=${colours.map((c) => encodeURIComponent(c.name)).join(",")}`);
      }
      const query = parts.join("&");
      return toListing(platform, { ...entry.variation, permalink: query ? `${permalink}?${query}` : permalink }, {
        title: decode(`${entry.variation.name || name} ${others.map((o) => o.value).join(" ")}`),
        colourOptions: colourOptionsFromList(colours),
      });
    },
    platform
  );
}

// Names of things made FOR a phone ("Torras Ostand Q3 Air for iPhone 17 Pro Max") contain every word of a phone search too,
// and come first in a store's own search, so they would use up the few expansions before the phone itself is reached.
const ACCESSORY_NAME = /\bfor\b|\b(case|cover|protector|charger|cable|glass|strap|stand|holder|adapter|skin|band|pouch|sleeve|bag|mount|dock|cooler)\b/i;

/** True when the product name contains every word of the search (so it is what was asked for, not a loose match). */
function looksRelevant(name, term) {
  const text = name.toLowerCase();
  return term.toLowerCase().split(/\s+/).filter((word) => word.length > 2).every((word) => text.includes(word));
}

/**
 * @param {object} store
 * @param {string} store.platform  the platform id listings are saved under
 * @param {string} store.baseUrl   e.g. "https://xcessorieshub.com"
 * @param {string} query
 * @param {object} [options]
 * @param {Function} [options.fetchJson]  (url) => parsed JSON; injectable for tests
 * @returns {Promise<import('./scraper.schema').ScrapedListing[]>}
 */
export async function scrapeWooSearch({ platform, baseUrl }, query, { fetchJson = politeFetchJson } = {}) {
  const term = searchTerm(query);
  const api = `${baseUrl}/wp-json/wc/store/v1/products`;
  const products = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const batch = await fetchJson(`${api}?search=${encodeURIComponent(term)}&per_page=${PER_PAGE}&page=${page}`);
    if (!Array.isArray(batch)) {
      if (page === 1) throw new Error(`${platform}: unexpected search response`);
      break;
    }
    products.push(...batch);
    const real = products.filter((product) => looksRelevant(decode(product.name), term) && !ACCESSORY_NAME.test(decode(product.name)));
    if (batch.length < PER_PAGE || real.length >= MIN_PRODUCTS) break; // the last page, or enough real products found
  }

  // Which variable products to expand: the ones whose names look like the thing searched for, the closest names first (the
  // phone's name is shorter than the names of the accessories that mention it), and no more than MAX_EXPANDED.
  const toExpand = new Set(
    products
      .filter((product) => product.type === "variable" && product.permalink)
      .map((product) => ({ product, name: decode(product.name) }))
      .filter(({ name }) => name && looksRelevant(name, term) && !ACCESSORY_NAME.test(name))
      .sort((a, b) => a.name.length - b.name.length)
      .slice(0, MAX_EXPANDED)
      .map(({ product }) => product.id)
  );

  const listings = [];
  for (const product of products) {
    const name = decode(product.name);
    if (!name || !product.permalink) continue;

    if (toExpand.has(product.id)) {
      try {
        const variations = await fetchJson(`${api}?type=variation&parent=${encodeURIComponent(product.id)}&per_page=${VARIATIONS_PER_PAGE}`);
        if (Array.isArray(variations) && variations.length > 0) {
          listings.push(...listingsFromVariations(platform, product, name, variations));
          continue;
        }
      } catch (err) {
        console.warn(`[${platform}] could not read the variations of "${name}": ${err.message}`);
      }
    }
    // a simple product, a variable one that was not expanded, or one whose variations could not be read: its own (lowest) price
    listings.push(...safeMap([product], (p) => toListing(platform, p, { title: name }), platform));
  }
  return listings;
}
