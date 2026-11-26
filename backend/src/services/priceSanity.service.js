// priceSanity.service.js — checks a scraped price before it is stored.
//
// Scrapers read prices from third-party pages, and a bad one poisons everything
// downstream: comparisons, price history, discount checks, alerts. Audit of the
// live data (2026-09-30) found "was" prices BELOW the current price (six
// listings: not a discount, the store's old price was simply lower) and "was"
// prices more than three times the current price, plus a blog article priced at
// PKR 20 that had been filed as a laptop.
//
// This runs on every scraped listing in scraper.service.js:
//  - a price under MIN_PLAUSIBLE_PRICE cannot be a real electronics price
//    (cheapest genuine listings seen are earphones at about PKR 460), so the
//    listing is skipped, not stored;
//  - a "was" price that is not above the current price is not a discount, so it
//    is dropped to null rather than stored as a negative or zero discount.
// A very large "was" price is left alone: judging whether a claimed discount is
// real is the job of the discount checks, and this must not hide a fake one.

export const MIN_PLAUSIBLE_PRICE = 100;
// A price this high is a seller's placeholder, not a price: AlfaMall listed an iPad 11, an iPhone 17 Pro Max 512GB and a Galaxy A36
// at PKR 99,999,999, and they showed in their products' price ranges (audit A-04, 2026-11-26). The dearest real listings seen are
// large TVs at a few million.
export const MAX_PLAUSIBLE_PRICE = 10_000_000;
export const isPlaceholderPrice = (price) => Number(price) >= MAX_PLAUSIBLE_PRICE;

/**
 * @param {{price:number, originalPrice?:number|null}} scraped
 * @returns {{ok:false, reason:string} | {ok:true, price:number, originalPrice:number|null, changes:string[]}}
 */
export function sanitizePrices({ price, originalPrice } = {}) {
  const current = Number(price);

  if (!Number.isFinite(current) || current < MIN_PLAUSIBLE_PRICE) {
    return { ok: false, reason: `price ${price} is below the minimum plausible price (PKR ${MIN_PLAUSIBLE_PRICE})` };
  }
  if (isPlaceholderPrice(current)) {
    return { ok: false, reason: `price ${price} is a placeholder (PKR ${MAX_PLAUSIBLE_PRICE.toLocaleString()} or more)` };
  }

  const changes = [];
  let was = null;

  if (originalPrice !== null && originalPrice !== undefined && originalPrice !== "") {
    const candidate = Number(originalPrice);
    if (!Number.isFinite(candidate) || candidate <= 0) {
      changes.push("was-price was not a valid number");
    } else if (candidate <= current) {
      changes.push("was-price was not above the current price, so it is not a discount");
    } else {
      was = candidate;
    }
  }

  return { ok: true, price: current, originalPrice: was, changes };
}
