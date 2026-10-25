// structuredData.js — what a product page tells search engines about itself, as schema.org JSON-LD, and its meta description.
//
// A search engine that reads a Product with an AggregateOffer can show the price range and the number of stores in its result
// ("PKR 439,999 – 520,490 · 13 offers"), which is what a shopper looking for a price clicks. Google accepts AggregateOffer for
// pages that list several sellers' offers, as this one does. Every figure is one the page itself shows: the lowest is the page's
// "lowest price" (summarizeOffers), the highest and the count come from the same prices "you can save" uses (believablePrices),
// so an unusual price, an out-of-date one or a used unit's is never advertised. No price we believe: nothing is said.

import { categoryName } from "./categories.js";
import { formatPrice } from "./format.js";
import { platformName } from "./platforms.js";
import { believablePrices, summarizeOffers } from "./summary.js";

const ABSOLUTE = /^https?:\/\//i;

/** A brand as people write it: the stores' all-lowercase "apple" becomes "Apple"; a name with capitals of its own is kept. */
const brandName = (brand) => {
  const text = String(brand ?? "").trim();
  if (!text) return null;
  return text === text.toLowerCase() ? text.replace(/\b\p{L}/gu, (letter) => letter.toUpperCase()) : text;
};

/**
 * The page's schema.org Product, or null.
 * @param {{ name: string, offers: object[], url?: string }} product  url: the page's canonical address
 */
export function productJsonLd({ name, offers, url }) {
  const lowest = summarizeOffers(offers).lowest;
  if (!name || !lowest || !(lowest.price > 0)) return null;

  const prices = believablePrices(offers);
  const highest = Math.max(lowest.price, ...prices);
  const offerCount = Math.max(prices.length, 1);
  const images = [...new Set(offers.map((offer) => offer.imageUrl).filter((src) => ABSOLUTE.test(src ?? "")))].slice(0, 3);
  const brand = brandName(lowest.brand || offers.find((offer) => offer.brand)?.brand);

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    ...(images.length ? { image: images } : {}),
    ...(brand ? { brand: { "@type": "Brand", name: brand } } : {}),
    ...(lowest.productCategory ? { category: categoryName(lowest.productCategory) } : {}),
    ...(url ? { url } : {}),
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "PKR",
      lowPrice: lowest.price,
      highPrice: highest,
      offerCount,
    },
  };
}

/**
 * The JSON for a <script type="application/ld+json">. "<" is escaped: a store's title containing "</script>" must not end
 * the script element and let the rest run as HTML.
 */
export function jsonLdText(data) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** The page's meta description: the product, its lowest price and where, and how many stores were compared. */
export function productDescription({ name, offers }) {
  const summary = summarizeOffers(offers);
  if (!name || !summary.lowest) return null;
  const stores = summary.platformCount;
  return `${name}: lowest price ${formatPrice(summary.lowest.price)} at ${platformName(summary.lowest.platform)}, compared across ` +
    `${stores} Pakistani ${stores === 1 ? "store" : "stores"}, with price history and a check of every discount.`;
}
