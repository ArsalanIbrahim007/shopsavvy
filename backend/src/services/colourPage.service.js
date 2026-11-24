// colourPage.service.js — the colours a store says it sells a product in, and a picture of each, read from the store's own
// product page. Pure: HTML in, colour choices out; fetching and saving live in pageEnrichment.service.js.
//
// Why: most store titles leave the colour out ("Apple iPhone 17 Pro", "Samsung Galaxy A17"), so the product page is the only
// place that says the phone comes in Black, Ice Blue and Grey, and shows what each looks like. Without it a colour picker
// has nothing to offer for exactly the phones shoppers search most.
//
// Only structures that belong to THIS product are read, never loose colour words (a page also shows accessories and other
// products in other colours):
//   - Magento attribute lists: {"code":"color","label":"Color","options":[{"label":"Black"}, ...]} with the swatch pictures
//     in jsonSwatchConfig (iShopping);
//   - PriceOye's colour swatches: <ul class="colors">, one <li> per colour with its thumbnail;
//   - Shopify variants: "option1":"6GB/128GB","option2":"Black" with the variant's featured_image (Telemart),
//     keeping only the values that are colour names.
// Each value is mapped to the same colour names the title reader uses (Blue, Space grey, Natural titanium...), so a
// shade such as "Ice Blue" counts as Blue and a colour found on the page matches a colour found in a title.

import * as cheerio from "cheerio";

import { extractColour } from "./productAttributes.service.js";

const MAX_COLOURS = 12; // a product page listing more than this is not describing one product's colours
const MAX_VALUE_LENGTH = 40;

function normalise(value) {
  // PriceOye writes marketing names with underscores ("refined_silver", "cosmic_orange"), which a word match would not see
  const text = String(value ?? "").replace(/\\\//g, "/").replace(/_+/g, " ").replace(/\s+/g, " ").trim();
  if (!text || text.length > MAX_VALUE_LENGTH) return null;
  return extractColour(text);
}

/** An absolute http(s) address for a picture, or null. */
function imageUrl(value) {
  const text = String(value ?? "").replace(/\\\//g, "/").trim();
  const absolute = text.startsWith("//") ? `https:${text}` : text;
  return /^https?:\/\/[^\s"'<>]+$/i.test(absolute) ? absolute : null;
}

/** The text of the {...} that starts at `start` (a "{"), or null when it never closes. */
function balancedObject(text, start) {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

/** Magento: colour attribute options, with their swatch pictures from jsonSwatchConfig. */
function magentoChoices(html) {
  // attribute id -> { label -> picture }
  const pictures = new Map();
  const config = /"jsonSwatchConfig"\s*:\s*/.exec(html);
  if (config) {
    const body = balancedObject(html, config.index + config[0].length);
    try {
      for (const [attributeId, options] of Object.entries(JSON.parse(body ?? "{}"))) {
        const byLabel = new Map();
        for (const option of Object.values(options ?? {})) {
          if (option?.label) byLabel.set(String(option.label), imageUrl(option.thumb) ?? imageUrl(option.value));
        }
        pictures.set(attributeId, byLabel);
      }
    } catch {
      /* swatch data that is not valid JSON: the colours are still read, without pictures */
    }
  }

  const found = [];
  const re = /"id"\s*:\s*"(\d+)"\s*,\s*"code"\s*:\s*"[^"]*"\s*,\s*"label"\s*:\s*"([^"]*)"\s*,\s*"options"\s*:\s*\[((?:[^\][]|\[[^\]]*\])*)\]/gi;
  let m;
  while ((m = re.exec(html))) {
    if (!/^colou?rs?$/i.test(m[2].trim())) continue;
    for (const option of m[3].matchAll(/"label"\s*:\s*"([^"]*)"/g)) {
      found.push({ colour: normalise(option[1]), image: pictures.get(m[1])?.get(option[1]) ?? null });
    }
  }
  return found;
}

/** PriceOye: one <li> per colour, with its thumbnail. */
function swatchChoices($) {
  return $("ul.colors li")
    .map((_, li) => {
      const colour = normalise($(li).find("a[data-tooltip-template]").attr("data-tooltip-template"));
      return { colour, image: imageUrl($(li).find("img").attr("src")) };
    })
    .get();
}

/** Shopify variants: every option value that is a colour, with the picture of the first variant that has it. */
function shopifyChoices(html) {
  const found = [];
  for (const m of html.matchAll(/"option([123])"\s*:\s*"([^"]{1,60})"/g)) {
    const colour = normalise(m[2]);
    if (!colour) continue;
    // the picture belongs to this variant: look only as far as the next variant starts
    const from = m.index + m[0].length;
    const nextVariant = html.indexOf('"option1"', from);
    const end = Math.min(nextVariant === -1 ? Infinity : nextVariant, from + 1500);
    const picture = /"featured_image"\s*:\s*\{[^}]*?"src"\s*:\s*"([^"]+)"/.exec(html.slice(from, end));
    found.push({ colour, image: picture ? imageUrl(picture[1]) : null });
  }
  // A JSON array of short strings: each value is followed by one comma or the end, so the whitespace around a value can only be
  // matched one way (the earlier form, with optional whitespace on both sides of every value, could take quadratic time on a page of spaces).
  for (const m of html.matchAll(/"options"\s*:\s*\[\s*("[^"\]]{1,60}"(?:\s*,\s*"[^"\]]{1,60}")*)\s*\]/g)) {
    for (const value of m[1].matchAll(/"([^"]+)"/g)) found.push({ colour: normalise(value[1]), image: null });
  }
  return found;
}

/** One entry per colour, in page order, keeping the first picture seen for it. */
function unique(choices) {
  const byColour = new Map();
  for (const { colour, image } of choices) {
    if (!colour) continue;
    if (!byColour.has(colour)) byColour.set(colour, { colour, image: image ?? null });
    else if (!byColour.get(colour).image && image) byColour.get(colour).image = image;
  }
  return [...byColour.values()];
}

/**
 * Colour choices from data a store gives in structured form (WooCommerce variations: the colour's name and the picture of that
 * variation), given as [{ name, image }]. Same rules as a page: names are mapped to the colour names the title reader uses, a
 * picture must be an http(s) address, one entry per colour, and a product listing more than MAX_COLOURS is not describing one
 * product's colours.
 * @returns {Array<{colour: string, image: string|null}>}
 */
export function colourOptionsFromList(items) {
  const choices = unique((Array.isArray(items) ? items : []).map((item) => ({ colour: normalise(item?.name), image: imageUrl(item?.image) })));
  return choices.length <= MAX_COLOURS ? choices : [];
}

/**
 * @param {string} html  a store's product page
 * @returns {Array<{colour: string, image: string|null}>} in the order the page lists them; [] when it says nothing
 */
export function extractColourOptions(html) {
  const page = String(html ?? "");
  if (!page) return [];
  const $ = cheerio.load(page);

  for (const layer of [swatchChoices($), magentoChoices(page), shopifyChoices(page)]) {
    const choices = unique(layer);
    if (choices.length > 0 && choices.length <= MAX_COLOURS) return choices;
  }
  return [];
}

/** The JSON object assigned to `name` in a page's inline script ("window.product_data = {...};"), or null. */
function inlineObject(page, name) {
  const at = page.indexOf(name);
  if (at < 0) return null;
  const start = page.indexOf("{", at);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  for (let i = start; i < page.length; i++) {
    const c = page[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      try {
        return JSON.parse(page.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

const rupees = (text) => {
  const n = Number(String(text ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};
const sizeInGb = (key) => {
  const m = String(key).match(/(\d+)\s*(gb|tb)/i);
  return m ? Number(m[1]) * (m[2].toLowerCase() === "tb" ? 1024 : 1) : null;
};

/**
 * Each colour's own price at PriceOye (2026-11-21). One PriceOye listing covers every colour and storage of a phone, at its cheapest
 * (the iPhone 17 Pro Max: PKR 474,745 is the orange 256 GB; silver is PKR 494,945, blue PKR 499,995). Its page holds the whole table
 * in `window.product_data.product_config.dataPrices` (colour -> storage -> [{ product_price, product_availability }]). The storage
 * read is the listing's own when it says one, else the one whose prices include the listing's price, else the smallest.
 *
 * With the listing's address (`url`), each colour also gets the address of that colour and storage at PriceOye
 * ("<url>/ppc/cosmic_orange/256gb", the form its own colour and storage buttons link to), so "View deal" opens that variant.
 *
 * @returns {Array<{colour: string, price: number, inStock: boolean, link?: string}>} [] when the page has no such table
 */
export function priceOyeColourPrices(html, { storageGb = null, price = null, url = null } = {}) {
  const data = inlineObject(String(html ?? ""), "window.product_data")?.product_config?.dataPrices;
  if (!data || typeof data !== "object") return [];
  const sizes = [...new Set(Object.values(data).flatMap((bySize) => Object.keys(bySize ?? {})))].filter((key) => sizeInGb(key) !== null);
  if (sizes.length === 0) return [];
  const priceAt = (colourKey, size) => rupees(data[colourKey]?.[size]?.[0]?.product_price);
  const size =
    sizes.find((key) => storageGb && sizeInGb(key) === Number(storageGb)) ??
    sizes.find((key) => price && Object.keys(data).some((colourKey) => priceAt(colourKey, key) === price)) ??
    [...sizes].sort((a, b) => sizeInGb(a) - sizeInGb(b))[0];

  const found = new Map();
  for (const colourKey of Object.keys(data)) {
    const colour = normalise(colourKey);
    const entry = data[colourKey]?.[size]?.[0];
    const at = rupees(entry?.product_price);
    if (!colour || !at || found.has(colour)) continue;
    const inStock = !/out of stock|sold out|not available/i.test(String(entry.product_availability ?? ""));
    const page = String(url ?? "").replace(/\/+$/, "");
    const base = /^https:\/\/priceoye\.pk\/[a-z0-9/_-]+$/i.test(page) ? page : null;
    found.set(colour, { colour, price: at, inStock, ...(base ? { link: `${base}/ppc/${encodeURIComponent(colourKey)}/${encodeURIComponent(size)}` } : {}) });
  }
  return [...found.values()];
}
