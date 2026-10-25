// usePageTitle.js — what a page says about itself in the document head: the browser tab's title ("<title> · ShopSavvy", or the
// site's own title when there is none: the home page), the meta description search engines show under the link, and the
// canonical address. Every page used to keep the site title, so a shopper with several tabs open could not tell them apart, and
// bookmarks and history all read the same.

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

// index.html's own description, put back when a page that set its own is left.
const descriptionTag = () => document.querySelector('meta[name="description"]');
const SITE_DESCRIPTION = typeof document === "undefined" ? "" : descriptionTag()?.getAttribute("content") ?? "";

/** Sets the meta description while the page is shown; null or empty leaves the site's own. */
export function usePageDescription(description) {
  useEffect(() => {
    if (!description) return undefined;
    let tag = descriptionTag();
    if (!tag) {
      tag = document.createElement("meta");
      tag.setAttribute("name", "description");
      document.head.appendChild(tag);
    }
    tag.setAttribute("content", description);
    return () => tag.setAttribute("content", SITE_DESCRIPTION);
  }, [description]);
}

/**
 * Names the page's canonical address while it is shown (link rel="canonical"), and removes it when the page is left. A product
 * can be opened from any of its offers (/product/<any of them>), and every such address shows the same page: the canonical one
 * tells a search engine which to list, the same one the sitemap lists.
 */
export function useCanonical(url) {
  useEffect(() => {
    if (!url) return undefined;
    const link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    link.setAttribute("href", url);
    document.head.appendChild(link);
    return () => link.remove();
  }, [url]);
}
