// prefetch.js — start loading a product page before it is clicked: on hover, keyboard focus or the first touch of its card, the
// product's data (api/endpoints.js prefetchListing) and the page's code are fetched, so the page usually opens without a wait.
// Spread the handlers onto the card's link: <Link {...prefetchProps(id)} ...>.

import { prefetchListing } from "../api/endpoints.js";

let pageCode = null;
const loadPageCode = () => {
  pageCode ??= import("../pages/Product.jsx").catch(() => {
    pageCode = null; // try again next time
  });
};

export function prefetchProduct(id) {
  prefetchListing(id);
  loadPageCode();
}

export function prefetchProps(id) {
  const start = () => prefetchProduct(id);
  return { onMouseEnter: start, onFocus: start, onTouchStart: start };
}
