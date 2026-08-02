// scraper.schema.js
// This is the CONTRACT every scraper must follow. Whatever platform-specific
// mess exists in the raw HTML, each scraper's output array must be made of
// objects matching this shape before being handed to the normalization layer.
//
// This isn't a runtime-enforced schema (no Joi/Zod yet) — just a reference
// + a factory function so all three scrapers build objects consistently.
// Swap in a real validator later if needed.

/**
 * @typedef {Object} ScrapedListing
 * @property {string} platform        - e.g. "priceoye" | "mega" | "shophive"
 * @property {string} sourceUrl       - product page URL
 * @property {string} title           - raw product title as scraped
 * @property {number|null} price      - current price (parsed integer, PKR)
 * @property {number|null} originalPrice - pre-discount price if shown, else null
 * @property {string|null} imageUrl   - main product image
 * @property {string|null} brand      - if extractable from title/page
 * @property {boolean} inStock        - availability if determinable, default true
 * @property {string} scrapedAt       - ISO timestamp of when this was scraped
 */

function makeListing({
  platform,
  sourceUrl,
  title,
  price = null,
  originalPrice = null,
  imageUrl = null,
  brand = null,
  inStock = true,
}) {
  if (!platform || !sourceUrl || !title) {
    throw new Error("makeListing: platform, sourceUrl, and title are required");
  }
  return {
    platform,
    sourceUrl,
    title,
    price,
    originalPrice,
    imageUrl,
    brand,
    inStock,
    scrapedAt: new Date().toISOString(),
  };
}

export { makeListing };
