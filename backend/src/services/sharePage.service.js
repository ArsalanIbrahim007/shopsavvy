// sharePage.service.js — the page a shared product link opens: GET /share/product/<slug>-<id>.
//
// WhatsApp, Facebook, X and the rest build a link's preview card from the page's Open Graph tags without running its scripts. The
// site is a single-page app: every address returns the same index.html, so a shared product link showed only the site's own
// card, never the product. This small page, served by the API, carries the product's own card (its name, lowest price, how many
// stores sell it, and a store's photo) and sends a person straight on to the product's page on the site. The product page's
// Share button hands out this address.
//
// Nothing here is cached by the server: the product view comes from the same grouping as the product page (its jobs are shared,
// see grouping.service.js), and the response may be kept 10 minutes by caches.

import mongoose from "mongoose";

import { VISIBLE_PLATFORMS_FILTER } from "../config/platforms.js";
import Listing from "../models/listing.model.js";
import { siteUrl } from "./productMatch.service.js";
import { listingIdFromParam, productPath } from "./productPath.js";
import { buildProductView } from "./productView.service.js";
import { productPageOffer } from "./sitemap.service.js";

const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);

const rupees = (price) => `PKR ${Math.round(Number(price)).toLocaleString("en-US")}`;

/** A photo a preview service can fetch: a full https address, or null. */
const httpsImage = (url) => (typeof url === "string" && /^https:\/\/[^\s"<>]+$/.test(url) ? url : null);

/**
 * What the preview card says, from a product view (productView.service.js).
 * @returns {{title: string, description: string, image: string|null, url: string}}
 */
export function shareCard(view, { site }) {
  const offers = view.offers?.length ? view.offers : [view.selectedListing];
  const page = productPageOffer({ offers }) ?? view.selectedListing;
  const name = view.selectedGroup?.productName || page.title;
  const stores = new Set(offers.map((offer) => offer.platform).filter(Boolean)).size;
  const price = Number(page.price) > 0 ? rupees(page.price) : null;
  const where = stores > 1 ? `at ${stores} stores` : "";
  const description = price
    ? `From ${price} ${where}`.trim() + ". Compare prices, price history and honest discounts on ShopSavvy."
    : "Compare prices, price history and honest discounts on ShopSavvy.";
  return {
    title: price ? `${name}: from ${price}` : name,
    description,
    image: httpsImage(page.imageUrl) ?? offers.map((offer) => httpsImage(offer.imageUrl)).find(Boolean) ?? null,
    url: `${site}${productPath(page._id, page.title)}`,
  };
}

/** The HTML: the card's tags, an immediate move to the product's page, and a link for anyone whose browser does not move. */
export function sharePageHtml(card) {
  const t = escapeHtml(card.title);
  const d = escapeHtml(card.description);
  const u = escapeHtml(card.url);
  const image = card.image ? escapeHtml(card.image) : null;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t} - ShopSavvy</title>
<meta name="description" content="${d}">
<meta name="robots" content="noindex">
<link rel="canonical" href="${u}">
<meta property="og:type" content="product">
<meta property="og:site_name" content="ShopSavvy">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:url" content="${u}">
${image ? `<meta property="og:image" content="${image}">\n` : ""}<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
${image ? `<meta name="twitter:image" content="${image}">\n` : ""}<meta http-equiv="refresh" content="0; url=${u}">
</head>
<body>
<p><a href="${u}">${t}</a></p>
</body>
</html>
`;
}

/**
 * The share page for a product address's last part ("samsung-galaxy-a17-<id>", or a bare id). `{ redirect }` to the site's home
 * when it names no listing the site shows.
 */
export async function sharePage(param, { env = process.env, strategy = "ml" } = {}) {
  const site = siteUrl(env);
  const id = listingIdFromParam(param);
  if (!mongoose.isValidObjectId(id)) return { redirect: `${site}/` };
  const listing = await Listing.findOne({ _id: id, ...VISIBLE_PLATFORMS_FILTER }).lean();
  if (!listing) return { redirect: `${site}/` };
  const view = await buildProductView(listing, { strategy });
  return { html: sharePageHtml(shareCard(view, { site })) };
}
