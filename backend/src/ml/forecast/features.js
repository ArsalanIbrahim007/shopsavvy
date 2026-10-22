// features.js — R2, "will this price drop in the next 7 days?": turning a listing's recorded prices into training samples.
//
// A sample is one recorded day of one listing. Its features use only the records up to and including that day; its label says
// whether the price fell by DROP (3%) or more at any record in the following WINDOW_DAYS (7). A day is a sample only when the
// listing has at least MIN_HISTORY_DAYS of records before it and the following week was seen: a record at least MIN_SEEN_DAYS
// into it. Several records on one calendar day (Pakistan time) count as one, the last.
//
// Pure functions: no database. src/scripts/ml/forecast/01-build-dataset.js feeds them the price histories.

export const FORECAST = Object.freeze({
  DROP: 0.03, // a fall of 3% or more (the same move the outlook backtest and the market summary count)
  WINDOW_DAYS: 7,
  MIN_SEEN_DAYS: 5,
  MIN_HISTORY_DAYS: 7,
  LOOKBACK_DAYS: 30,
  // A recorded price more than this far from the sample day's (below half, above double) is a listing or reading error, or a
  // different variant on the same page, not a price move: such samples are left out.
  ERROR_RATIO: 2,
});

export const CATEGORIES = Object.freeze(["smartphone", "laptop", "tv", "tablet", "smartwatch", "headphones"]);

export const FEATURE_NAMES = Object.freeze([
  "change7", // price now / last price at least 7 days before - 1 (0 when there is none)
  "change14",
  "rangePosition", // where the price sits in its own range over the last 30 days: 0 at the lowest, 1 at the highest (0.5 when flat)
  "vsMedian", // price / median of the last 30 days - 1
  "daysSinceChange", // days since the price last moved (capped at 30)
  "changes30", // how many times it moved in the last 30 days
  "volatility", // standard deviation of the day-to-day relative moves over the last 30 days
  "claimedDiscount", // the store's crossed-out price / price - 1, when it shows one (0 otherwise)
  "historyDays", // log(1 + days since the first record)
  "logPrice",
  "inStock", // 1 or 0
  "storeFell7", // share of the same store's listings whose price fell 3%+ in the 7 days up to this day (store-wide sales)
  ...CATEGORIES.map((c) => `is_${c}`),
]);

const DAY = 86_400_000;
const PK_OFFSET = 5 * 3600 * 1000;

/** The calendar day in Pakistan, as a whole number of days. */
export const pkDay = (time) => Math.floor((new Date(time).getTime() + PK_OFFSET) / DAY);

/**
 * One point per calendar day (the last record of the day), oldest first.
 * @param {{price: number, originalPrice?: number|null, inStock?: boolean, recordedAt: Date|string}[]} entries
 * @returns {{day: number, price: number, originalPrice: number|null, inStock: boolean}[]}
 */
export function dailySeries(entries = []) {
  const byDay = new Map();
  const sorted = entries
    .filter((e) => e && Number(e.price) > 0 && e.recordedAt && !Number.isNaN(new Date(e.recordedAt).getTime()))
    .sort((a, b) => new Date(a.recordedAt) - new Date(b.recordedAt));
  for (const e of sorted) {
    byDay.set(pkDay(e.recordedAt), { day: pkDay(e.recordedAt), price: Number(e.price), originalPrice: Number(e.originalPrice) > 0 ? Number(e.originalPrice) : null, inStock: e.inStock !== false });
  }
  return [...byDay.values()].sort((a, b) => a.day - b.day);
}

const median = (values) => {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** The last point at or before `day`, or null. `series` is oldest first. */
function lastAtOrBefore(series, day) {
  let found = null;
  for (const point of series) {
    if (point.day > day) break;
    found = point;
  }
  return found;
}

/**
 * The features of `series[index]`, from series[0..index] only.
 * @param {object[]} series   dailySeries output
 * @param {number} index
 * @param {{category?: string, storeFell7?: number}} context
 * @returns {number[]} in FEATURE_NAMES order
 */
export function featuresAt(series, index, { category = "other", storeFell7 = 0 } = {}) {
  const now = series[index];
  const past = series.slice(0, index + 1);
  const recent = past.filter((p) => p.day > now.day - FORECAST.LOOKBACK_DAYS);
  const change = (days) => {
    const before = lastAtOrBefore(past, now.day - days);
    return before ? now.price / before.price - 1 : 0;
  };
  const prices = recent.map((p) => p.price);
  const low = Math.min(...prices);
  const high = Math.max(...prices);

  let lastChange = past[0].day;
  let changes = 0;
  const moves = [];
  for (let i = 1; i < past.length; i++) {
    if (past[i].price !== past[i - 1].price) lastChange = past[i].day;
    if (past[i].day > now.day - FORECAST.LOOKBACK_DAYS) {
      if (past[i].price !== past[i - 1].price) changes += 1;
      moves.push(past[i].price / past[i - 1].price - 1);
    }
  }
  const mean = moves.length ? moves.reduce((a, b) => a + b, 0) / moves.length : 0;
  const volatility = moves.length ? Math.sqrt(moves.reduce((s, m) => s + (m - mean) ** 2, 0) / moves.length) : 0;

  return [
    change(7),
    change(14),
    high > low ? (now.price - low) / (high - low) : 0.5,
    now.price / median(prices) - 1,
    Math.min(now.day - lastChange, FORECAST.LOOKBACK_DAYS),
    changes,
    volatility,
    now.originalPrice && now.originalPrice > now.price ? now.originalPrice / now.price - 1 : 0,
    Math.log1p(now.day - past[0].day),
    Math.log(now.price),
    now.inStock ? 1 : 0,
    storeFell7,
    ...CATEGORIES.map((c) => (c === category ? 1 : 0)),
  ];
}

/**
 * The label of `series[index]`: 1 when a later record within WINDOW_DAYS is DROP or more below it, 0 when none is, and null when
 * the week was not seen (no record at least MIN_SEEN_DAYS on) or contains an error-sized price.
 */
export function labelAt(series, index) {
  const now = series[index];
  const window = series.filter((p) => p.day > now.day && p.day <= now.day + FORECAST.WINDOW_DAYS);
  if (window.length === 0 || window.at(-1).day < now.day + FORECAST.MIN_SEEN_DAYS) return null;
  if (window.some((p) => p.price > now.price * FORECAST.ERROR_RATIO || p.price < now.price / FORECAST.ERROR_RATIO)) return null;
  return window.some((p) => p.price <= now.price * (1 - FORECAST.DROP)) ? 1 : 0;
}

/** True when the listing fell DROP or more over the 7 days up to `day` (for the store-wide share). */
export function fellInWeekTo(series, day) {
  const now = lastAtOrBefore(series, day);
  const before = now && lastAtOrBefore(series, day - FORECAST.WINDOW_DAYS);
  if (!now || !before || now.day <= day - FORECAST.WINDOW_DAYS) return null; // nothing recorded in the week: unknown
  return now.price <= before.price * (1 - FORECAST.DROP);
}

/**
 * Every sample of every listing.
 * @param {{key: string, platform: string, category?: string, entries: object[]}[]} histories
 * @returns {{key: string, platform: string, category: string, day: number, price: number, features: number[], label: 0|1}[]}
 */
export function buildSamples(histories) {
  const prepared = histories.map((h) => ({ ...h, series: dailySeries(h.entries) })).filter((h) => h.series.length >= 2);

  // Store-wide share of listings that fell in the week up to each day, from every listing of the store (past records only).
  const byStore = new Map();
  for (const h of prepared) {
    if (!byStore.has(h.platform)) byStore.set(h.platform, []);
    byStore.get(h.platform).push(h.series);
  }
  const shareCache = new Map();
  const storeFell7 = (platform, day) => {
    const key = `${platform}|${day}`;
    if (!shareCache.has(key)) {
      let known = 0;
      let fell = 0;
      for (const series of byStore.get(platform)) {
        const result = fellInWeekTo(series, day);
        if (result === null) continue;
        known += 1;
        if (result) fell += 1;
      }
      shareCache.set(key, known ? fell / known : 0);
    }
    return shareCache.get(key);
  };

  const samples = [];
  for (const h of prepared) {
    const { series } = h;
    for (let i = 0; i < series.length; i++) {
      if (series[i].day - series[0].day < FORECAST.MIN_HISTORY_DAYS) continue;
      const label = labelAt(series, i);
      if (label === null) continue;
      samples.push({
        key: h.key,
        platform: h.platform,
        category: h.category ?? "other",
        day: series[i].day,
        price: series[i].price,
        features: featuresAt(series, i, { category: h.category, storeFell7: storeFell7(h.platform, series[i].day) }),
        label,
      });
    }
  }
  return samples;
}
