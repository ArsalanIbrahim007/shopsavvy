// suggestions.service.js — search-box suggestions built from the listings we
// actually hold, so every suggestion is something a search can find. This
// replaces a hard-coded list of a few dozen phrases in the frontend.
//
// A listing title is far too specific to suggest ("Samsung Galaxy A17 8GB RAM
// 256GB Storage PTA Approved - Dual Sim With Official Warranty"). Each title is
// reduced to a short product name (brand and model, at most four words, storage
// and marketing noise removed), and suggestions are those names ranked by how
// many listings share them, so popular products come first.

import Listing from "../models/listing.model.js";
import { VISIBLE_PLATFORMS_FILTER } from "../config/platforms.js";
import { modelTokens } from "./normalizeTitle.service.js";
import { escapeRegex, buildSpaceTolerantPattern } from "./searchMatching.service.js";

const MAX_WORDS = 5;
const MIN_QUERY_LENGTH = 2;
const CANDIDATE_LIMIT = 400;

// modelTokens strips capacities but leaves a stray "ram" or "storage" behind
// ("8GB RAM 256GB Storage"); on their own they mean nothing in a product name.
const STRAY_WORDS = new Set(["ram", "storage"]);

// Words that cannot end a product name. A name cut at the word limit can stop on one
// ("ThinkPad E16 Gen", "Vivo Y31d With", "MacBook Neo SSD"), which reads as a fragment.
const DANGLING_WORDS = new Set(["gen", "generation", "with", "and", "for", "in", "inch", "inches", "ssd", "hdd", "series", "the"]);

// A size or spec on the end ("40mm", "55inch", "144hz") describes a variant, not the
// product: 40mm and 44mm watches are the same suggestion.
const TRAILING_SPEC = /^[0-9]+(mm|inch|inches|hz|mah|w|kg|ton|st|nd|rd|th)$/;

/** Removes words that would leave the name ending mid-phrase, including a number that only repeats the model ("E14 14"). */
function trimEnding(words) {
  const trimmed = [...words];
  for (;;) {
    const last = trimmed[trimmed.length - 1];
    const previous = trimmed[trimmed.length - 2];
    const isNumber = (word) => /^[0-9]+$/.test(word || "");
    const repeatsModel = isNumber(last) && previous && previous.endsWith(last) && previous !== last;
    // The tail of a decimal size that was split on its point: "15.6 inches" became "15 6".
    const decimalFragment = isNumber(last) && isNumber(previous);
    if (trimmed.length > 1 && (DANGLING_WORDS.has(last) || TRAILING_SPEC.test(last || "") || repeatsModel || decimalFragment)) trimmed.pop();
    else break;
  }
  return trimmed;
}

const clean = (word) => word.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * "Samsung Galaxy A17 8GB RAM 256GB Storage PTA Approved" ->
 * { key: "samsung galaxy a17", text: "Samsung Galaxy A17" }
 * `key` groups equal products; `text` restores the casing a store used.
 */
export function productNameFromTitle(title = "") {
  const words = trimEnding(
    modelTokens(title)
      .split(" ")
      .filter((word) => word && !STRAY_WORDS.has(word))
      .slice(0, MAX_WORDS)
  );
  if (words.length === 0) return null;

  const original = String(title).split(/\s+/);
  const text = words
    .map((word) => original.find((token) => clean(token) === word)?.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "") || word)
    .join(" ");

  return { key: words.join(" "), text };
}

/**
 * @param {Array<{title:string, productCategory?:string}>} rows listings that matched the typed text
 * @param {string} query what the user typed
 * @returns {Array<{text:string, category:string, count:number}>} best suggestion first
 */
export function buildSuggestions(rows, query, { limit = 8 } = {}) {
  const tokens = String(query).toLowerCase().split(/\s+/).filter(Boolean);
  const byKey = new Map();

  for (const row of rows) {
    const name = productNameFromTitle(row.title);
    if (!name) continue;

    // Every typed piece must be the START of a word in the suggestion (typeahead completes
    // words; it does not match letters inside them: "a" must not match "watch").
    const nameWords = name.key.split(" ");
    if (!tokens.every((token) => nameWords.some((word) => word.startsWith(token)))) continue;

    const entry = byKey.get(name.key) || { text: name.text, count: 0, categories: new Map() };
    entry.count++;
    const category = row.productCategory || "other";
    entry.categories.set(category, (entry.categories.get(category) || 0) + 1);
    byKey.set(name.key, entry);
  }

  const typed = tokens.join(" ");

  return [...byKey.entries()]
    .map(([key, entry]) => ({
      key,
      text: entry.text,
      count: entry.count,
      category: [...entry.categories.entries()].sort((a, b) => b[1] - a[1])[0][0],
      startsWithTyped: key.startsWith(typed),
    }))
    .sort((a, b) => Number(b.startsWithTyped) - Number(a.startsWithTyped) || b.count - a.count || a.key.length - b.key.length)
    .slice(0, limit)
    .map(({ text, category, count }) => ({ text, category, count }));
}

/** Suggestions for what the user has typed so far. Under two characters there is nothing useful to say. */
export async function getSuggestions(query, { limit = 8 } = {}) {
  const text = String(query || "").trim();
  if (text.length < MIN_QUERY_LENGTH) return [];

  const pattern = buildSpaceTolerantPattern(text);

  const rows = await Listing.find({
    ...VISIBLE_PLATFORMS_FILTER,
    // Accessories and uncategorised items would crowd out the products people search for.
    productCategory: { $nin: ["accessory", "other"] },
    $or: [
      { title: { $regex: pattern, $options: "i" } },
      { normalizedTitle: { $regex: escapeRegex(text.toLowerCase()), $options: "i" } },
    ],
  })
    .select("title productCategory")
    .limit(CANDIDATE_LIMIT)
    .lean();

  return buildSuggestions(rows, text, { limit });
}
