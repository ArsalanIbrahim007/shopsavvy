// productPath.js — a product page's readable address: /product/<words of the listing's title>-<listing id>.
//
// "/product/6710c3e2a4b5c6d7e8f90123" told a shopper (and a search engine) nothing about the page; the address now carries the
// product's name, "/product/samsung-galaxy-a17-8gb-256gb-6710c3e2a4b5c6d7e8f90123". Only the id at the end is read, so an old
// address, or one whose words are cut or changed, still opens the page. The words come from that listing's own title (not the
// grouped product's name), so the sitemap, the cards and the page always build the same address for one listing.
//
// The frontend keeps the same rule in frontend/src/lib/productPath.js; change both together.

export const MAX_SLUG_LENGTH = 70;

/** "Samsung Galaxy A17 (8GB/256GB) – Blue" -> "samsung-galaxy-a17-8gb-256gb-blue": whole words only, at most MAX_SLUG_LENGTH. */
export function productSlug(title) {
  const words = String(title ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  let slug = "";
  for (const word of words) {
    const next = slug ? `${slug}-${word}` : word;
    if (next.length > MAX_SLUG_LENGTH) break;
    slug = next;
  }
  return slug;
}

/** The page's path: "/product/<slug>-<id>", or "/product/<id>" for a title with no letters or digits. */
export function productPath(id, title) {
  const slug = productSlug(title);
  const safeId = encodeURIComponent(String(id));
  return `/product/${slug ? `${slug}-` : ""}${safeId}`;
}

/** The listing id in a product address's last part: the 24-character id at its end, or the whole part as it was given. */
export function listingIdFromParam(param) {
  const text = String(param ?? "");
  return /(?:^|-)([0-9a-f]{24})$/i.exec(text)?.[1] ?? text;
}
