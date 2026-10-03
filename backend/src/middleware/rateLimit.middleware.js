// rateLimit.middleware.js — the price-alert endpoints are the only ones in
// this app that are both public/unauthenticated AND write real, persisted
// data tied to an arbitrary email address (every other write requires a
// specific listing id already scraped from a real store, which is a much
// smaller attack surface). Without a limit, POST /api/alerts could be used
// to spam-create alerts, or probed as a blind email-validity oracle.

import rateLimit from "express-rate-limit";

import { sendError } from "./error.middleware.js";
import { ERROR_CODES } from "../errors/AppError.js";

// express-rate-limit calls this when a caller is over the limit. Answering
// through sendError keeps the body identical to every other API error.
const tooMany = (message) => (req, res) => sendError(res, 429, ERROR_CODES.RATE_LIMITED, message);

export const createAlertLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: tooMany("Too many alert requests from this address. Please try again in a few minutes."),
});

// Looser than the write limiter -- listing/cancelling isn't free either
// (still DB reads/writes and still a lever to enumerate whether an email
// has alerts), but is a much lower-value abuse target than creation.
export const alertReadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: tooMany("Too many requests. Please try again in a few minutes."),
});


// Search is the one public endpoint that can make this server do expensive
// outbound work: a search for something not scraped in the last 30 minutes
// launches live requests to every store, including headless-browser page
// loads. The freshness window and the in-flight de-duplication in
// scraper.service.js limit accidental load; this limits deliberate load, and
// protects the stores (and our IP address's standing with them).
//
// The number is generous on purpose. The homepage alone fires about five
// searches on load (ten in development under React StrictMode), and a
// shopper refining a query issues several more. It is a ceiling against
// scripts, not a throttle on people.
export function createSearchLimiter({ windowMs = 15 * 60 * 1000, limit = 120 } = {}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    handler: tooMany("Too many searches from this address. Please wait a few minutes and try again."),
  });
}

export const searchLimiter = createSearchLimiter();

// Read endpoints that only ever read stored data or a cache: no scraping, no heavy
// work per request. Suggestions fire as the user types (the frontend debounces, but
// a busy typist still makes several requests a second), so that limit is high.
export function createReadLimiter({ windowMs = 15 * 60 * 1000, limit = 240 } = {}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    handler: tooMany("Too many requests. Please wait a few minutes and try again."),
  });
}

export const dealsLimiter = createReadLimiter({ limit: 240 });
// A product page is one request (the server groups its offers in a worker): a shopper opens a few dozen in a sitting, a script opens thousands.
export const detailLimiter = createReadLimiter({ limit: 200 });
// Stored listings, one product's recorded prices, headline counts: reads of stored data.
export const readLimiter = createReadLimiter({ limit: 240 });
// The health check pings the database. A monitor polls it every few seconds, so this is a ceiling against abuse, not a throttle:
// 600 an hour-quarter is one every 1.5 seconds.
export const healthLimiter = createReadLimiter({ limit: 600 });
// Writes that need the admin key: the limit is what stops the key being guessed.
export function createAdminLimiter({ windowMs = 15 * 60 * 1000, limit = 30 } = {}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    handler: tooMany("Too many requests. Please wait a few minutes and try again."),
  });
}
export const adminLimiter = createAdminLimiter();
export const suggestLimiter = createReadLimiter({ limit: 900 });
