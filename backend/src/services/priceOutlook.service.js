// priceOutlook.service.js — "wait or buy?": what a product's own recorded prices say about whether waiting is likely to pay.
//
// This is NOT a price forecast, and it does not pretend to be one. ShopSavvy has weeks of daily records, not years: when this was
// written the median listing had 2 days of history, none had 14, and only 6% had ever changed price. A model that "predicted" next
// week's price from that would be inventing a signal. What can be said honestly is narrower, and is all this does:
//
//   - too_early    not enough days of records to say anything (most products, for now; says so instead of guessing)
//   - flat         the best price has not moved: there is nothing to wait for
//   - at_low       the best price is at (or within 1% of) the lowest it has been in the records
//   - above_usual  the best price is 5% or more above its usual (median) level, and has been lower
//   - usual        in between: no sign either way
//
// Each verdict comes with the numbers it rests on (days tracked, records, low, usual, current, change over a week), so the page
// can show its evidence, and `strength` says whether the history is "early" (under 4 weeks) or "fair". Whether the verdicts
// actually foreshadow price moves is measured separately (scripts/ml/price-outlook-backtest.js) and is only believable once the
// history is deep enough; until then the page labels the outlook an early estimate.
//
// The unit is the product's BEST price per day: the cheapest believable, new, comparable offer on each day (see productSeries).

const DAY_MS = 24 * 3600 * 1000;

export const OUTLOOK = Object.freeze({
  MIN_DAYS: 7, // first record to last record, inclusive, in calendar days (Pakistan time)
  MIN_RECORD_DAYS: 5, // distinct days with a record
  STALE_DAYS: 3, // the newest record must be this recent, or the history says nothing about today
  CARRY_DAYS: 3, // a store's last record counts on a later day only if it is at most this old
  FLAT: 0.01, // best price within 1% from lowest to highest: it has not moved
  NEAR_LOW: 0.01, // within 1% of the lowest record
  ABOVE_USUAL: 0.05, // 5% or more above the median
  CHANGE: 0.005, // a move of 0.5% or more counts as a change
  FAIR_DAYS: 28, // history this long, with FAIR_RECORDS records, is "fair" rather than "early"
  FAIR_RECORDS: 20,
  SERIES_POINTS: 120, // the best-price-per-day points sent for the page to draw: the newest this many
});

/** The thresholds a page needs to show how close a product is to a verdict, sent with every outlook so the page never has its own copy. */
const LIMITS = Object.freeze({
  minDays: OUTLOOK.MIN_DAYS, minRecords: OUTLOOK.MIN_RECORD_DAYS, fairDays: OUTLOOK.FAIR_DAYS, fairRecords: OUTLOOK.FAIR_RECORDS, staleDays: OUTLOOK.STALE_DAYS,
});

const PRE_OWNED = new Set(["used", "refurbished", "open_box"]);

const DAY_FORMAT = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" });

/** "2026-10-01": the calendar day in Pakistan, which is when a shopper there sees the price. */
export const karachiDay = (date) => DAY_FORMAT.format(new Date(date));

const dayIndex = (day) => Math.round(Date.parse(day) / DAY_MS);

/**
 * One price per calendar day (the last one recorded that day) from a list of { price, recordedAt }.
 * @returns {{day: string, price: number}[]} oldest first
 */
export function dailyPrices(entries) {
  const byDay = new Map();
  const sorted = (Array.isArray(entries) ? entries : [])
    .filter((entry) => Number(entry?.price) > 0 && Number.isFinite(new Date(entry?.recordedAt).getTime()))
    .sort((a, b) => new Date(a.recordedAt) - new Date(b.recordedAt));
  for (const entry of sorted) byDay.set(karachiDay(entry.recordedAt), Number(entry.price));
  return [...byDay.entries()].map(([day, price]) => ({ day, price }));
}

/**
 * The offers whose price a comparison may use: not flagged as a probable listing error, not marked on PTA status, and new (or, when
 * none is new, all of them, so a product that is only sold used or refurbished is compared with its own kind).
 */
export function comparableOffers(offers) {
  const usable = (Array.isArray(offers) ? offers : []).filter((offer) => !offer?.priceCheck?.status?.startsWith("suspect") && !offer?.ptaAssessment);
  const fresh = usable.filter((offer) => !PRE_OWNED.has(offer?.condition));
  return fresh.length > 0 ? fresh : usable;
}

/**
 * The product's best price on each day it has a record: the lowest of its comparable offers' prices, where an offer counts on a
 * day only if its latest record is at most CARRY_DAYS old (an old price from a store that has not been seen since is not today's).
 * @param {object[]} offers  offers with a `priceHistory` of { price, recordedAt }
 * @returns {{day: string, price: number}[]} oldest first
 */
export function productSeries(offers) {
  const perOffer = comparableOffers(offers).map((offer) => dailyPrices(offer.priceHistory)).filter((s) => s.length > 0);
  const days = [...new Set(perOffer.flatMap((series) => series.map((point) => point.day)))].sort();

  return days.map((day) => {
    const today = dayIndex(day);
    const prices = [];
    for (const series of perOffer) {
      let latest = null;
      for (const point of series) {
        if (point.day <= day) latest = point;
        else break;
      }
      if (latest && today - dayIndex(latest.day) <= OUTLOOK.CARRY_DAYS) prices.push(latest.price);
    }
    return { day, price: Math.min(...prices) };
  });
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const pct = (from, to) => Math.round(((to - from) / from) * 1000) / 10;

/**
 * What the series says. Pure: the same series and `now` always give the same answer.
 * @param {{day: string, price: number}[]} series  oldest first (see productSeries)
 * @param {object} [options]
 * @param {number} [options.now]  epoch ms
 * @returns {{verdict: string, why: string|null, basis: object, stats: object|null, strength: string|null, series: {day: string, price: number}[], limits: object}}
 *   `series` is the best price on each recorded day (the newest SERIES_POINTS of them), for the page to draw; `limits` the thresholds above
 */
export function assessOutlook(series, { now = Date.now() } = {}) {
  const points = Array.isArray(series) ? series : [];
  const first = points[0];
  const last = points[points.length - 1];
  const span = first ? dayIndex(last.day) - dayIndex(first.day) + 1 : 0;
  const age = last ? dayIndex(karachiDay(now)) - dayIndex(last.day) : null;
  const basis = { firstDay: first?.day ?? null, lastDay: last?.day ?? null, days: span, records: points.length };
  const shown = points.slice(-OUTLOOK.SERIES_POINTS);

  const enough = span >= OUTLOOK.MIN_DAYS && points.length >= OUTLOOK.MIN_RECORD_DAYS && age !== null && age <= OUTLOOK.STALE_DAYS;
  if (!enough) {
    const why = points.length === 0 ? "no_records" : age > OUTLOOK.STALE_DAYS ? "stale" : "short";
    return { verdict: "too_early", why, basis, stats: null, strength: null, series: shown, limits: LIMITS };
  }

  const prices = points.map((point) => point.price);
  const current = last.price;
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const usual = median(prices);

  // the best price a week ago: the latest record at least 7 days before the newest one
  const weekAgo = [...points].reverse().find((point) => dayIndex(last.day) - dayIndex(point.day) >= 7);
  let changedOn = null;
  for (let i = points.length - 1; i > 0; i -= 1) {
    if (Math.abs(points[i].price - points[i - 1].price) / points[i - 1].price >= OUTLOOK.CHANGE) {
      changedOn = points[i].day;
      break;
    }
  }

  const stats = {
    current,
    low,
    high,
    usual: Math.round(usual),
    vsUsualPct: pct(usual, current),
    changeWeekPct: weekAgo ? pct(weekAgo.price, current) : null,
    daysSinceChange: changedOn ? dayIndex(last.day) - dayIndex(changedOn) : null,
    daysBelow: points.filter((point) => point.price < current).length,
  };

  let verdict;
  if ((high - low) / low <= OUTLOOK.FLAT) verdict = "flat";
  else if (current <= low * (1 + OUTLOOK.NEAR_LOW)) verdict = "at_low";
  else if (current >= usual * (1 + OUTLOOK.ABOVE_USUAL)) verdict = "above_usual";
  else verdict = "usual";

  const strength = span >= OUTLOOK.FAIR_DAYS && points.length >= OUTLOOK.FAIR_RECORDS ? "fair" : "early";
  return { verdict, why: null, basis, stats, strength, series: shown, limits: LIMITS };
}

/** The outlook for a product's offers. */
export const outlookForOffers = (offers, { now = Date.now() } = {}) => assessOutlook(productSeries(offers), { now });

// ---- how prices move at all, across every tracked listing ----

export const MARKET = Object.freeze({
  COMPARE_MIN_DAYS: 5, // "a week later" = the first later record 5 to 9 days on
  COMPARE_MAX_DAYS: 9,
  MOVE: 0.03, // a move of 3% or more
});

/**
 * How prices moved over about a week, across every tracked listing, so a page can say what usually happens to a price and how little
 * data that rests on. Counts only; says nothing about any one product. It uses every record there is (a comparison pairs a record
 * with the first later one 5 to 9 days on, so sparse early records are simply fewer comparisons), and `since` says how far back that goes.
 * @param {{platform: string, entries: object[]}[]} documents  price-history documents
 * @returns {{comparisons: number, comparedFrom: string|null, comparedTo: string|null, fell: number, rose: number, steady: number, stores: number,
 *            fellFromLargestStore: number|null, listings: number, listingsChanged: number, since: string|null, asOf: string}}
 */
export function summarizeMovement(documents, { now = Date.now() } = {}) {
  let comparisons = 0;
  let fell = 0;
  let rose = 0;
  let listings = 0;
  let listingsChanged = 0;
  let since = null;
  let comparedFrom = null;
  let comparedTo = null;
  const stores = new Set();
  const fellByStore = new Map();

  for (const doc of Array.isArray(documents) ? documents : []) {
    const points = dailyPrices(doc?.entries);
    if (points.length < 2) continue;
    listings += 1;
    if (points.some((point, i) => i > 0 && Math.abs(point.price - points[i - 1].price) / points[i - 1].price >= OUTLOOK.CHANGE)) listingsChanged += 1;
    if (!since || points[0].day < since) since = points[0].day;

    for (let i = 0; i < points.length; i += 1) {
      const later = points.slice(i + 1).find((point) => {
        const gap = dayIndex(point.day) - dayIndex(points[i].day);
        return gap >= MARKET.COMPARE_MIN_DAYS && gap <= MARKET.COMPARE_MAX_DAYS;
      });
      if (!later) continue;
      comparisons += 1;
      if (!comparedFrom || points[i].day < comparedFrom) comparedFrom = points[i].day;
      if (!comparedTo || later.day > comparedTo) comparedTo = later.day;
      stores.add(doc.platform);
      const change = (later.price - points[i].price) / points[i].price;
      if (change <= -MARKET.MOVE) {
        fell += 1;
        fellByStore.set(doc.platform, (fellByStore.get(doc.platform) ?? 0) + 1);
      } else if (change >= MARKET.MOVE) rose += 1;
    }
  }

  const biggest = Math.max(0, ...fellByStore.values());
  return {
    comparisons, comparedFrom, comparedTo, fell, rose, steady: comparisons - fell - rose, stores: stores.size,
    fellFromLargestStore: fell > 0 ? Math.round((biggest / fell) * 100) : null,
    listings, listingsChanged, since, asOf: new Date(now).toISOString(),
  };
}

// ---- checking the verdicts against what actually happened ----

export const BACKTEST = Object.freeze({
  MIN_JUDGEABLE: 30, // a verdict with fewer comparisons than this is reported as too few to judge
});

const VERDICTS = ["too_early", "flat", "at_low", "above_usual", "usual"];

/**
 * Replays the outlook on past records: for every record that has a later record 5 to 9 days on, works out the verdict using only
 * the history up to that record, then notes whether the price fell, rose or stayed within 3% by the later record. This is how the
 * verdicts are tested: a verdict is only worth showing if listings that got "above_usual" fell more often than the rest. Pure.
 * Comparisons from the same listing on neighbouring days overlap, so they are not independent: `listings` counts the distinct ones.
 * @param {{platform: string, entries: object[]}[]} documents
 */
export function backtestOutlook(documents) {
  const rows = Object.fromEntries(VERDICTS.map((verdict) => [verdict, { verdict, comparisons: 0, fell: 0, rose: 0, steady: 0, listings: new Set() }]));
  let from = null;
  let to = null;

  (Array.isArray(documents) ? documents : []).forEach((doc, index) => {
    const points = dailyPrices(doc?.entries);
    for (let i = 0; i < points.length; i += 1) {
      const later = points.slice(i + 1).find((point) => {
        const gap = dayIndex(point.day) - dayIndex(points[i].day);
        return gap >= MARKET.COMPARE_MIN_DAYS && gap <= MARKET.COMPARE_MAX_DAYS;
      });
      if (!later) continue;

      // noon UTC is 5pm in Pakistan: the same calendar day
      const { verdict } = assessOutlook(points.slice(0, i + 1), { now: Date.parse(points[i].day) + 12 * 3600 * 1000 });
      const row = rows[verdict];
      const change = (later.price - points[i].price) / points[i].price;
      row.comparisons += 1;
      row.listings.add(index);
      if (change <= -MARKET.MOVE) row.fell += 1;
      else if (change >= MARKET.MOVE) row.rose += 1;
      else row.steady += 1;
      if (!from || points[i].day < from) from = points[i].day;
      if (!to || later.day > to) to = later.day;
    }
  });

  const share = (part, whole) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);
  const table = VERDICTS.map((verdict) => {
    const row = rows[verdict];
    return {
      verdict, comparisons: row.comparisons, listings: row.listings.size, fell: row.fell, rose: row.rose, steady: row.steady,
      fellShare: share(row.fell, row.comparisons), roseShare: share(row.rose, row.comparisons),
      judgeable: row.comparisons >= BACKTEST.MIN_JUDGEABLE,
    };
  });
  const all = table.reduce((sum, row) => ({ comparisons: sum.comparisons + row.comparisons, fell: sum.fell + row.fell, rose: sum.rose + row.rose }), { comparisons: 0, fell: 0, rose: 0 });
  return { from, to, table, all: { ...all, fellShare: share(all.fell, all.comparisons), roseShare: share(all.rose, all.comparisons) } };
}
