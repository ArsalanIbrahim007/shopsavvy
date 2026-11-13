// pagePrice.service.js — the price a store's own product page charges, where it differs from the price its listings show.
//
// iShopping's search results carry one price and its product page another: the Dawlance Acce Pro refrigerator (9193-WB) is
// finalPrice 82,720 in the search results and on the page's meta tag, while the page itself shows "Was Rs.109,200 Now Rs.90,445" (read
// 2026-11-12, Fable's final check). We read the search results, so the home page's top "Verified deal" was a price the store does not
// charge. The page check (pageEnrichment.service.js) now reads the product page's own price for the stores listed here, and an offer
// whose listed price is more than PAGE_PRICE_TOLERANCE away from it is a probable listing error (pricePlausibility "suspect_page"):
// still listed, labelled, never a lowest price, a best deal or a price drop.

export const PAGE_PRICE_STORES = new Set(["ishopping"]);
export const PAGE_PRICE_TOLERANCE = 0.05;
// A page price read longer ago than this says nothing about today's listed price.
export const PAGE_PRICE_MAX_AGE_DAYS = 30;
const DAY_MS = 24 * 3600 * 1000;

/** The product's own price on a store's product page (Magento's finalPrice amount on iShopping), or null. */
export function extractPagePrice(platform, html) {
  if (!PAGE_PRICE_STORES.has(String(platform).toLowerCase())) return null;
  // The first finalPrice is the product's; related products' prices come later in the page.
  for (const tag of String(html ?? "").match(/<[^>]*data-price-type=["']finalPrice["'][^>]*>/gi) ?? []) {
    const amount = Number(tag.match(/data-price-amount=["']([\d.]+)["']/i)?.[1]);
    if (Number.isFinite(amount) && amount >= 100) return Math.round(amount);
  }
  return null;
}

/** {pagePrice, gap} when the offer's listed price is more than PAGE_PRICE_TOLERANCE from a recent page price; otherwise null. */
export function pagePriceMismatch(offer, now = Date.now()) {
  const page = Number(offer?.pagePrice);
  const price = Number(offer?.price);
  if (!(page > 0) || !(price > 0)) return null;
  const at = Date.parse(offer.pagePriceAt ?? "");
  if (!Number.isFinite(at) || now - at > PAGE_PRICE_MAX_AGE_DAYS * DAY_MS) return null;
  const gap = Math.abs(price - page) / page;
  return gap > PAGE_PRICE_TOLERANCE ? { pagePrice: page, gap } : null;
}
