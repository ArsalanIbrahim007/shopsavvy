// colours.js — the colours a product comes in, and choosing one. Two kinds of evidence reach us:
//
//  - a listing that IS one colour: the store lists the iPad Air once per colour and the title says which (Paklap), so
//    `offer.colour` is set and `offer.imageUrl` shows that colour;
//  - a listing that OFFERS several colours: the title names none ("Samsung Galaxy A17") but the store's product page lists
//    them, each with a picture, and the backend reads that into `offer.colourOptions` ([{colour, image}]).
//
// The backend groups every colour of a product together, because a colour is not a different product. Shown as they
// arrive, the colour copies read as "4 offers from 1 store". This file turns them into what a shopper means:
//
//  - collapseVariants: one row per store and price, carrying the colours it is sold in;
//  - coloursOf / offersInColour: the colours to choose from (with a picture where we have one), and what choosing one keeps.
//
// A store that says nothing about colour keeps its offer while a colour is chosen: the colour is usually picked at checkout
// there, and hiding the offer would hide real prices. It is marked "Colour not stated".

import { canonicalPlatform } from "./platforms.js";
import { safeExternalUrl } from "./safeLink.js";

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

/** The colour an offer's own title states, or null. */
export const colourOf = (offer) => (offer?.colour ? String(offer.colour) : null);

/** The colours a store's page says an offer comes in: [{colour, image}]; tolerates older data (plain names) and junk. */
function optionsOf(offer) {
  const options = Array.isArray(offer?.colourOptions) ? offer.colourOptions : [];
  return options
    .map((option) => (typeof option === "string" ? { colour: option, image: null } : { colour: option?.colour, image: option?.image ?? null, price: option?.price, inStock: option?.inStock, link: option?.link }))
    .filter((option) => typeof option.colour === "string" && option.colour.trim() !== "")
    .map((option) => ({
      colour: option.colour.trim(),
      image: safeExternalUrl(option.image) || null,
      // a store that prices each colour on its own says so (PriceOye, backend colourPage.service.js priceOyeColourPrices)
      price: Number(option.price) > 0 ? Number(option.price) : null,
      inStock: typeof option.inStock === "boolean" ? option.inStock : null,
      // and the store's page for that colour ("…/ppc/cosmic_orange/256gb"), so "View deal" opens the variant chosen
      link: safeExternalUrl(option.link) || null,
    }));
}

/**
 * The offer as it is in one colour (2026-11-21): a store that prices each colour on its own (PriceOye: the iPhone 17 Pro Max is
 * PKR 474,745 in orange, 494,945 in silver) gives that colour's price and stock; any other offer is unchanged.
 */
export function inColour(offer, colour) {
  const options = colour ? optionsOf(offer) : [];
  const option = options.find((o) => o.colour === colour);
  if (!option?.price) return offer;
  // The colour prices are read with the product page (every two weeks); the offer's price every night. They are used only while
  // they still agree: the cheapest colour is the offer's price today. Otherwise the store's prices have moved since, and a colour's
  // old price would be shown as today's.
  const cheapestColour = Math.min(...options.map((o) => o.price).filter((p) => p > 0));
  if (cheapestColour !== offer.price) return offer;
  return {
    ...offer,
    price: option.price,
    ...(option.inStock !== null ? { inStock: option.inStock } : {}),
    ...(option.link ? { productUrl: option.link } : {}),
    colourPriced: true,
  };
}

/** Every colour one offer is sold in: the ones its page lists, plus its own title's. */
export function coloursOfOffer(offer) {
  const names = optionsOf(offer).map((option) => option.colour);
  const own = colourOf(offer);
  if (own && !names.includes(own)) names.push(own);
  return names;
}

/**
 * The colours the offers come in: [{colour, count, image}] where count is the number of offers sold in it and image is
 * a picture of that colour (from a store's page, else from the listing that is that colour), or null.
 * Most offers first, then by name. Offers that state no colour are not counted.
 */
export function coloursOf(offers) {
  const found = new Map();
  const add = (colour, image) => {
    if (!found.has(colour)) found.set(colour, { colour, count: 0, image: null });
    if (!found.get(colour).image && image) found.get(colour).image = image;
  };

  for (const offer of offers ?? []) {
    for (const option of optionsOf(offer)) add(option.colour, option.image);
    const own = colourOf(offer);
    if (own) add(own, safeExternalUrl(offer.imageUrl) || null);
    for (const name of coloursOfOffer(offer)) found.get(name).count += 1;
  }
  return [...found.values()].sort((a, b) => b.count - a.count || a.colour.localeCompare(b.colour));
}

/**
 * What choosing `colour` keeps: offers sold in that colour, and offers that say nothing about colour. An offer whose page
 * lists colours without this one is left out: the store does not sell it. No colour chosen keeps everything.
 */
export function offersInColour(offers, colour) {
  if (!colour) return offers ?? [];
  return (offers ?? [])
    .filter((offer) => {
      const sold = coloursOfOffer(offer);
      return sold.length === 0 || sold.includes(colour);
    })
    .map((offer) => inColour(offer, colour)); // that colour's own price where the store gives one
}

/** How many offers state no colour at all (they stay when a colour is chosen, and the page says so). */
export function unstatedColourCount(offers) {
  return (offers ?? []).filter((offer) => coloursOfOffer(offer).length === 0).length;
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
    const colours = [...new Set(variants.flatMap(coloursOfOffer))];
    return { offer: representative, variants, colours };
  });
}

/** The number of offers a shopper would count: one per store and price, not one per colour. */
export const offerCount = (offers) => collapseVariants(offers).length;
