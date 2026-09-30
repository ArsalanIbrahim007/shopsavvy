// storeLogos.js — which stores have a logo file bundled with the app (public/stores/<id>.png).
// A store without one gets a monogram badge in its brand colour, so the list can grow one file at a time.
// Logos are served from our own files, never hot-linked from the stores: hot-linking tells every store
// which product page a shopper is looking at, and breaks whenever a store moves its favicon.

import { canonicalPlatform } from "./platforms.js";

export const STORES_WITH_LOGO = [];

/** The address of the store's bundled logo, or null when there is none. */
export function logoSrc(platform) {
  const id = canonicalPlatform(platform);
  return STORES_WITH_LOGO.includes(id) ? `/stores/${id}.png` : null;
}
