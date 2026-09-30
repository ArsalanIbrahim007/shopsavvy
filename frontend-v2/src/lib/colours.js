// colours.js — colour variants of one product. Stores often list the same phone or tablet once per colour
// (Paklap has the iPad Air in Space Grey, Starlight, Purple and Blue, each at PKR 275,000), and the backend
// groups them as one product because a colour is not a different product. Shown as they arrive, that read as
// "4 offers from 1 store". This file turns them into what a shopper means:
//
//  - collapseVariants: one row per store and price, carrying the colours it is sold in;
//  - coloursOf / offersInColour: the colours to choose from, and what choosing one keeps.
//
// A store that does not say which colour (most of PriceOye and Mega's titles) keeps its offer while a colour is
// chosen: the colour is usually picked at checkout there, and hiding the offer would hide real prices. It is marked.

import { canonicalPlatform } from "./platforms.js";

// Approximate colour for a small swatch next to the colour's name. The name is always shown too, so the swatch
// only helps; it never carries the meaning alone.
const SWATCHES = {
  black: "#1f2328", white: "#f4f4f2", silver: "#c9ccd1", gold: "#d8b873", grey: "#8a8f98", "space grey": "#53565c",
  blue: "#2f6fd6", "sky blue": "#8ec5f0", ultramarine: "#3b4cc0", navy: "#1f2f5a", teal: "#1f8a8a", mint: "#9fe0c4",
  green: "#3f9b5a", red: "#d33a3a", pink: "#f0a3bd", purple: "#8a63c7", lavender: "#c6b4ec", yellow: "#f2d04a",
  orange: "#ee7b2b", cream: "#f3ead3", beige: "#d9c7a8", bronze: "#a06a3a", copper: "#b8693d", graphite: "#45484d",
  midnight: "#1d2230", starlight: "#ece3d4", titanium: "#a9a59d", "natural titanium": "#b9b2a6", "desert titanium": "#c4a88a",
};

/** A CSS colour for a colour name, or null for one we have no swatch for. */
export function swatchFor(name) {
  return SWATCHES[String(name ?? "").toLowerCase()] ?? null;
}

/** The colour an offer states, or null. */
export const colourOf = (offer) => (offer?.colour ? String(offer.colour) : null);

/**
 * The colours the offers come in: [{colour, count}], most offers first, then by name. Offers that state no colour
 * are not counted.
 */
export function coloursOf(offers) {
  const counts = new Map();
  for (const offer of offers ?? []) {
    const colour = colourOf(offer);
    if (colour) counts.set(colour, (counts.get(colour) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([colour, count]) => ({ colour, count }))
    .sort((a, b) => b.count - a.count || a.colour.localeCompare(b.colour));
}

/**
 * What choosing `colour` keeps: offers in that colour, and offers that state none. No colour chosen keeps everything.
 */
export function offersInColour(offers, colour) {
  if (!colour) return offers ?? [];
  return (offers ?? []).filter((offer) => !colourOf(offer) || colourOf(offer) === colour);
}

/** How many offers state no colour (they stay when a colour is chosen, and the page says so). */
export function unstatedColourCount(offers) {
  return (offers ?? []).filter((offer) => !colourOf(offer)).length;
}

/**
 * One entry per store and price. Colour variants of one store at one price become a single entry that lists its
 * colours; the same store at a different price stays separate, because a colour that costs more is worth knowing.
 *
 * @param {object[]} offers
 * @param {object} [options]
 * @param {string} [options.colour]     the chosen colour: its listing represents an entry that has it
 * @param {string} [options.currentId]  the listing the shopper opened: represents its entry
 * @returns {Array<{offer: object, variants: object[], colours: string[]}>} in order of first appearance
 */
export function collapseVariants(offers, { colour = null, currentId = null } = {}) {
  const entries = new Map();
  for (const offer of offers ?? []) {
    const key = `${canonicalPlatform(offer.platform)}|${offer.price}`;
    if (!entries.has(key)) entries.set(key, []);
    entries.get(key).push(offer);
  }
  return [...entries.values()].map((variants) => {
    const representative =
      variants.find((v) => v._id === currentId) ??
      (colour ? variants.find((v) => colourOf(v) === colour) : null) ??
      variants[0];
    const colours = [...new Set(variants.map(colourOf).filter(Boolean))];
    return { offer: representative, variants, colours };
  });
}

/** The number of offers a shopper would count: one per store and price, not one per colour. */
export const offerCount = (offers) => collapseVariants(offers).length;
