// fairPrice.service.js — "the fair price for these specs": what the trained linear regression (ml/fairPrice) expects a listing to cost
// from its title, its numbers, its store, condition and PTA status. Used by the deal score (ranking/dealScore.js: a price is judged
// against it as well as against the other stores, so a product only one store sells is still judged) and by the discount check (a
// claimed "was" price far above it is evidence against the discount, with or without price history).
//
// Only where the model earned it: a category is used when, on products it never saw, its median error beat both baselines (the
// brand + storage median and the category median) and stayed within MAX_MEDIAN_ERROR (FAIR_PRICE_REPORT.md: headphones did not beat
// the baseline and are left out). A listing is judged only when it is new and the model knows most of its title's words.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { rowFor, vocabularyCoverage } from "../ml/fairPrice/features.js";
import { predictRidge } from "../ml/ridge.js";

const here = dirname(fileURLToPath(import.meta.url));
export const MAX_MEDIAN_ERROR = 0.22;
export const MIN_COVERAGE = 0.5;
// The model abstains for a listing whose own price lies well outside the range it expects (beyond its 80% range by more than
// OUTSIDE_MARGIN): it does not describe that product, so it must not judge it (2026-11-08: a 98-inch Samsung TV at PKR 1,059,990,
// which every store prices above PKR 1 million, got a fair price of PKR 454,739 and its "was" price was called suspicious).
export const OUTSIDE_MARGIN = 0.15;

let artifact = null;
function load() {
  if (artifact) return artifact;
  try {
    artifact = JSON.parse(readFileSync(join(here, "..", "ml", "fairPrice", "model.artifact.json"), "utf8"));
  } catch {
    artifact = { categories: {} }; // no model trained yet: nothing is judged against a fair price
  }
  return artifact;
}

/** The categories the model is trusted for, with its median error on unseen products there. */
export function reliableCategories() {
  return Object.entries(load().categories)
    .filter(([, m]) => m.metrics.mdape <= MAX_MEDIAN_ERROR && m.metrics.mdape < m.metrics.baselines.brandStorage.mdape && m.metrics.mdape < m.metrics.baselines.category.mdape)
    .map(([category, m]) => ({ category, medianError: m.metrics.mdape }));
}

/**
 * The fair price for a listing's specs, or null when the model is not trusted for it.
 * @returns {{price: number, low: number, high: number, medianError: number}|null}  low/high: the range that held 80% of the real
 *   prices of unseen products (their 10th and 90th percentile errors)
 */
export function fairPriceOf(listing) {
  if (!listing?.title) return null;
  if ((listing.condition ?? "new") !== "new") return null;
  const model = load().categories[listing.productCategory];
  if (!model) return null;
  const m = model.metrics;
  if (!(m.mdape <= MAX_MEDIAN_ERROR && m.mdape < m.baselines.brandStorage.mdape && m.mdape < m.baselines.category.mdape)) return null;
  if (vocabularyCoverage(listing, model) < MIN_COVERAGE) return null;
  const predicted = Math.exp(predictRidge(rowFor(listing, model), model));
  if (!Number.isFinite(predicted) || predicted <= 0) return null;
  const low = predicted * Math.exp(model.residual.p10);
  const high = predicted * Math.exp(model.residual.p90);
  const price = Number(listing.price);
  if (price > 0 && (price < low * (1 - OUTSIDE_MARGIN) || price > high * (1 + OUTSIDE_MARGIN))) return null;
  return { price: Math.round(predicted), low: Math.round(low), high: Math.round(high), medianError: m.mdape };
}

/**
 * How good a price is against the fair price, from 0 to 1: 1 at or below the fair price less twice the model's median error, 0 at or
 * above it plus twice that, in a straight line between (the fair price itself scores 0.5).
 */
export function fairPriceScore(price, fair) {
  if (!fair || !(Number(price) > 0)) return null;
  const span = 2 * fair.medianError;
  const ratio = Number(price) / fair.price;
  return Number(Math.min(1, Math.max(0, 0.5 - (ratio - 1) / (2 * span))).toFixed(4));
}
