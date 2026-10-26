// priceStats.js — the lowest, highest and average of a set of prices, for the summary of a search and of a product page.

/**
 * @param {number[]} prices  positive, finite prices
 * @returns {{lowestPrice: number|null, highestPrice: number|null, averagePrice: number|null}}  all null for no prices
 */
export function priceStats(prices) {
  if (!prices.length) return { lowestPrice: null, highestPrice: null, averagePrice: null };
  return {
    lowestPrice: Math.min(...prices),
    highestPrice: Math.max(...prices),
    averagePrice: Math.round(prices.reduce((sum, price) => sum + price, 0) / prices.length),
  };
}
