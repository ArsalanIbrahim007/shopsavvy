// usePageTitle.js — the browser tab's title for a page: "<title> · ShopSavvy", or the site's own title when there is none
// (the home page). Every page used to keep the site title, so a shopper with several tabs open could not tell them apart,
// and bookmarks and history all read the same.

import { useEffect } from "react";

export const SITE_TITLE = "ShopSavvy - Compare Prices in Pakistan";

/** The title for `title`: "<title> · ShopSavvy", or SITE_TITLE when empty. */
export function pageTitle(title) {
  const text = typeof title === "string" ? title.trim() : "";
  return text ? `${text} · ShopSavvy` : SITE_TITLE;
}

/** Sets the document title while the page is shown; null leaves it unchanged (a page still loading). */
export function usePageTitle(title) {
  useEffect(() => {
    if (title === null) return;
    document.title = pageTitle(title);
  }, [title]);
}
