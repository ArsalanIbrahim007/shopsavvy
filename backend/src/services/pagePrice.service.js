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

/**
 * The prices a store's product page charges: its own price (the first finalPrice; related products' prices come later) and, for a
 * product sold in colours or capacities, each option's (Magento's "optionPrices"). A page opens on one option, and its script can show
 * that option's price instead of the base one (Fable's last check, 2026-11-12: the fridge's raw page says 82,720, the shown price
 * 90,445), so a listed price is believed when it matches any of them. Null when the page states none.
 * @returns {{price: number, prices: number[]}|null}
 */
export function extractPagePrices(platform, html) {
  if (!PAGE_PRICE_STORES.has(String(platform).toLowerCase())) return null;
  const text = String(html ?? "");
  let price = null;
  for (const tag of text.match(/<[^>]*data-price-type=["']finalPrice["'][^>]*>/gi) ?? []) {
    const amount = Number(tag.match(/data-price-amount=["']([\d.]+)["']/i)?.[1]);
    if (Number.isFinite(amount) && amount >= 100) { price = Math.round(amount); break; }
  }
  const options = balancedObjectAfter(text, '"optionPrices"');
  const optionPrices = [...options.matchAll(/"finalPrice"\s*:\s*\{\s*"amount"\s*:\s*([\d.]+)/g)].map((m) => Math.round(Number(m[1]))).filter((n) => n >= 100);
  if (price === null && optionPrices.length === 0) return null;
  const prices = [...new Set([...(price === null ? [] : [price]), ...optionPrices])];
  return { price: price ?? prices[0], prices };
}

/** The text of the JSON object that follows `key` in `text` (up to its matching closing brace), or "". */
function balancedObjectAfter(text, key) {
  const at = text.indexOf(key);
  if (at < 0) return "";
  const start = text.indexOf("{", at + key.length);
  if (start < 0) return "";
  let depth = 0;
  for (let i = start; i < text.length && i < start + 50_000; i++) {
    if (text[i] === "{") depth += 1;
    else if (text[i] === "}" && --depth === 0) return text.slice(start, i + 1);
  }
  return "";
}

/** The page's own price alone (extractPagePrices), or null. */
export const extractPagePrice = (platform, html) => extractPagePrices(platform, html)?.price ?? null;

/**
 * {pagePrice, gap} when the offer's listed price is more than PAGE_PRICE_TOLERANCE from every price its page was found to charge;
 * otherwise null. Only from a page read in the last PAGE_PRICE_MAX_AGE_DAYS while the listing showed the price it shows now
 * (`pagePriceListed`): a genuine price change after the page was read is not called a listing error (Fable's last check).
 */
export function pagePriceMismatch(offer, now = Date.now()) {
  const page = Number(offer?.pagePrice);
  const price = Number(offer?.price);
  if (!(page > 0) || !(price > 0)) return null;
  const at = Date.parse(offer.pagePriceAt ?? "");
  if (!Number.isFinite(at) || now - at > PAGE_PRICE_MAX_AGE_DAYS * DAY_MS) return null;
  if (Number(offer.pagePriceListed) !== price) return null;
  const known = [page, ...(Array.isArray(offer.pagePrices) ? offer.pagePrices.map(Number) : [])].filter((p) => p > 0);
  if (known.some((p) => Math.abs(price - p) / p <= PAGE_PRICE_TOLERANCE)) return null;
  return { pagePrice: page, gap: Math.abs(price - page) / page };
}
