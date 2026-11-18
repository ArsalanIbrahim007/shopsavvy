// fairPrice.js — how the lowest price sits against the fair price for its specs (components/results/FairPrice.jsx).

/** "8% below", "3% above" or "about the fair price" (within 2%). */
export function fairPriceGap(price, fair) {
  if (!(price > 0) || !(fair?.price > 0)) return null;
  const gap = (price - fair.price) / fair.price;
  if (Math.abs(gap) < 0.02) return { tone: "neutral", text: "about the fair price" };
  const pct = `${Math.round(Math.abs(gap) * 100)}%`;
  // Far below the specs price is usually an older model, not a bargain: the model prices the specifications, not the year, and
  // an iPhone 15 Pro Max at every store was "30% below" a fair price of PKR 369,519 (audit S-016, 2026-11-19). Said so, not in green.
  if (gap <= -0.25) return { tone: "neutral", text: `${pct} below it: priced from the specs, and an older model usually sells below that` };
  return gap < 0 ? { tone: "good", text: `${pct} below it` } : { tone: "caution", text: `${pct} above it` };
}
