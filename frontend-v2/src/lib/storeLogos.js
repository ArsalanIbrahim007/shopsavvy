// storeLogos.js — which stores have a logo file bundled with the app (public/stores/).
// A store without one gets a monogram badge in its brand colour, so the list can grow one file at a time.
// Logos are served from our own files, never hot-linked from the stores: hot-linking tells every store
// which product a shopper is looking at, and breaks whenever a store moves its favicon.
//
// The files are each store's own public icon, downloaded once with Arsalan's permission (first six on 2026-09-30, the
// six stores added on 2026-10-01 the day after). Mymart and Mi Store's icons are only 32 and 48 px and look soft at 28 px.
// iShopping has none: its site refuses scripted downloads and has no favicon at the usual address, so it
// keeps the monogram. Telemart's site now redirects to telex.pk, and its icon is the Telex one.

import { canonicalPlatform } from "./platforms.js";

export const STORE_LOGO_FILES = {
  priceoye: "priceoye.ico",
  mega: "mega.png",
  shophive: "shophive.ico",
  w11stop: "w11stop.png",
  telemart: "telemart.png",
  paklap: "paklap.png",
  mistore: "mistore.png",
  mymart: "mymart.png",
  alfatah: "alfatah.png",
  xcessorieshub: "xcessorieshub.png",
  eezepc: "eezepc.webp",
  ledshop: "ledshop.png",
};

/** The address of the store's bundled logo, or null when there is none. */
export function logoSrc(platform) {
  const file = STORE_LOGO_FILES[canonicalPlatform(platform)];
  return file ? `/stores/${file}` : null;
}
