// share.js — the address a product's Share button hands out: the API's share page (backend/src/services/sharePage.service.js).
//
// Not the site's own address: WhatsApp and the rest build a preview card without running scripts, and every address of this
// single-page site returns the same page, so its own link would show only ShopSavvy's card. The share page carries the product's
// name, price and photo, and moves straight on to the product's page here.

import { BASE_URL } from "../api/client.js";
import { productPath } from "./productPath.js";

/** The share page's address for a listing: on the API's host (VITE_API_URL), at /share/product/<slug>-<id>. */
export function shareAddress(id, title, base = BASE_URL) {
  let origin;
  try {
    origin = new URL(base).origin;
  } catch {
    origin = window.location.origin; // a relative API address: the API is on this site's host
  }
  return `${origin}/share${productPath(id, title)}`;
}
