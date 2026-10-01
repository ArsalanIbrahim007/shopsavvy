// productLink.js — "is this cheaper in Pakistan?" A shopper pastes the address of a product on Amazon, AliExpress, Temu,
// Shein, Alibaba, eBay and the like into the search box; we read the product's NAME out of the address and search the
// Pakistani stores for it.
//
// The address is only read as text. Nothing is fetched from the link: no request goes to the other site (which would be
// scraping it, and which those sites block), and the page the shopper pasted is never opened by us. The name comes from
// the readable part of the address (Amazon "/Apple-iPhone-17-Pro-256GB/dp/B0...", Temu ".../xiaomi-14-ultra-g-6010.html",
// Shein ".../Name-p-123-cat-45.html", Alibaba "/product-detail/Name_123.html", eBay "/itm/name/123", Daraz
// "/products/name-i123-s456.html") or from a search-style parameter (?k=, ?keywords=, ?title=, ?q=). An address with no
// readable name (AliExpress "/item/1005006.html", Amazon "/dp/B0ABC" alone, a shortened amzn.to link) is reported as
// unreadable, and the shopper types the name instead.

// Stores a link can come from, by the last two labels of the host (amazon.co.uk, amazon.com.au, ...).
const STORES = [
  { match: /(^|\.)amazon\.[a-z.]+$/, name: "Amazon" },
  { match: /(^|\.)aliexpress\.[a-z.]+$/, name: "AliExpress" },
  { match: /(^|\.)temu\.com$/, name: "Temu" },
  { match: /(^|\.)shein\.[a-z.]+$/, name: "Shein" },
  { match: /(^|\.)alibaba\.com$/, name: "Alibaba" },
  { match: /(^|\.)ebay\.[a-z.]+$/, name: "eBay" },
  { match: /(^|\.)daraz\.[a-z.]+$/, name: "Daraz" },
  { match: /(^|\.)noon\.com$/, name: "Noon" },
  { match: /(^|\.)walmart\.com$/, name: "Walmart" },
  { match: /(^|\.)bestbuy\.com$/, name: "Best Buy" },
];

// Short-link hosts: the address does not contain the product, and opening it would mean following it.
const SHORT_LINK_HOSTS = /(^|\.)(amzn\.to|amzn\.eu|a\.co|temu\.to|s\.click\.aliexpress\.com|a\.aliexpress\.com|bit\.ly|tinyurl\.com|t\.co|shein\.top)$/;

// Words that describe the listing or the URL, not the product.
const NOISE = new Set([
  "dp", "gp", "product", "products", "item", "items", "itm", "ip", "p", "g", "i", "s", "cat", "html", "htm", "php", "aspx",
  "detail", "details", "buy", "online", "price", "prices", "sale", "new", "hot", "original", "official", "free", "shipping",
  "wholesale", "best", "cheap", "store", "shop", "brand", "global", "version", "with", "for", "the", "and", "or", "in", "of",
  "a", "an", "to", "on", "unlocked", "smartphone", "smartphones", "phone", "mobile", "cellphone", "cell", "international",
]);

const CAPACITY = /^\d{1,4}\s?(gb|tb)$/i;
const MAX_WORDS = 6; // brand, model and the capacity; more words only make a search find nothing
const MAX_LINK_LENGTH = 2000;

const storeOf = (host) => STORES.find((store) => store.match.test(host))?.name ?? null;

/** A URL object for text that looks like a web address ("https://...", "www.amazon.com/..."), else null. */
function asUrl(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed || /\s/.test(trimmed) || trimmed.length > MAX_LINK_LENGTH) return null;
  if (!/^https?:\/\//i.test(trimmed) && !/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+\/\S*$/i.test(trimmed)) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return /^https?:$/.test(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

/** True when the text is an address, so the search box can tell a pasted link from something typed. */
export const looksLikeLink = (text) => asUrl(text) !== null;

/** Drops ids and file extensions from one path segment and returns its words. */
function wordsOf(segment) {
  let text;
  try {
    text = decodeURIComponent(segment);
  } catch {
    text = segment;
  }
  text = text
    .replace(/\.(html?|php|aspx?)$/i, "")
    .replace(/-g-\d+$/i, "") // Temu
    .replace(/-p-\d+(-cat-\d+)?$/i, "") // Shein
    .replace(/-i\d+(-s\d+)?$/i, "") // Daraz
    .replace(/_\d{6,}$/i, ""); // Alibaba
  return text
    .split(/[-_+\s]+/)
    .map((word) => word.trim())
    .filter((word) => word && !/^\d{6,}$/.test(word) && !(/\d/.test(word) && /[a-z]/i.test(word) && word.length >= 9 && !/^\d+(gb|tb)$/i.test(word)))
    .filter((word) => !NOISE.has(word.toLowerCase()));
}

/** The product words in an address: from a search-style parameter, else from the most name-like path segment. */
function nameWords(url) {
  for (const key of ["k", "keywords", "keyword", "title", "name", "q", "query", "SearchText", "searchText"]) {
    const value = url.searchParams.get(key);
    if (value && value.trim().split(/\s+/).length >= 1 && /[a-z]{2,}/i.test(value)) return value.trim().split(/\s+/);
  }
  const candidates = url.pathname.split("/").filter(Boolean).map(wordsOf).filter((words) => words.length >= 2 && words.some((w) => /[a-z]{2,}/i.test(w)));
  // the segment with the most words is the product name; a short one is a category ("mobiles", "electronics")
  candidates.sort((a, b) => b.length - a.length);
  return candidates[0] ?? [];
}

/**
 * What to do with text pasted into the search box.
 * @returns {{kind: "text"} | {kind: "link", query: string, capacities: string[], store: string|null, host: string} | {kind: "unreadable", store: string|null, host: string, reason: "short" | "no-name"}}
 *   "text": not an address, search it as typed; "link": a name was read from it; "unreadable": an address with no name in it.
 *   A capacity in the name ("256GB") is taken out of the search and returned separately: most Pakistani stores leave it out of
 *   their titles, so searching for it hid their offers (PriceOye, iShopping, Telemart for an iPhone). The results page says which
 *   capacity the link was for, and the shopper checks it against each product.
 */
export function parseProductLink(text) {
  const url = asUrl(text);
  if (!url) return { kind: "text" };

  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  const store = storeOf(host);
  if (SHORT_LINK_HOSTS.test(host)) return { kind: "unreadable", store, host, reason: "short" };

  const words = nameWords(url).slice(0, MAX_WORDS);
  const capacities = words.filter((word) => CAPACITY.test(word)).map((word) => word.toUpperCase());
  const query = words.filter((word) => !CAPACITY.test(word)).join(" ").replace(/\s+/g, " ").trim();
  // nothing but a capacity left is not a name (a search for "256GB" alone finds everything)
  if (query.length < 3 || !/[a-z]{2,}/i.test(query)) return { kind: "unreadable", store, host, reason: "no-name" };
  return { kind: "link", query: query.slice(0, 100), capacities, store, host };
}

/** The store's name for a host shown on the results page (from=amazon.com), or null for one we do not know. */
export const linkStoreName = (host) => storeOf(String(host ?? "").replace(/^www\./, "").toLowerCase());

/** What to tell a shopper whose pasted address had no product name in it. */
export function unreadableMessage({ store, reason }) {
  if (reason === "short") {
    return "That is a shortened link, so it does not show the product. Open it, copy the address from your browser's address bar, or type the product name instead.";
  }
  return `We could not find a product name in that link${store ? ` (${store} links often have none)` : ""}. Type the product name instead.`;
}
