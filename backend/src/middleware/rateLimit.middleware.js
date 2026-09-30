// rateLimit.middleware.js — the price-alert endpoints are the only ones in
// this app that are both public/unauthenticated AND write real, persisted
// data tied to an arbitrary email address (every other write requires a
// specific listing id already scraped from a real store, which is a much
// smaller attack surface). Without a limit, POST /api/alerts could be used
// to spam-create alerts, or probed as a blind email-validity oracle.

import rateLimit from "express-rate-limit";

export const createAlertLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many alert requests from this address. Please try again in a few minutes.",
  },
});

// Looser than the write limiter -- listing/cancelling isn't free either
// (still DB reads/writes and still a lever to enumerate whether an email
// has alerts), but is a much lower-value abuse target than creation.
export const alertReadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests. Please try again in a few minutes.",
  },
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
    message: {
      success: false,
      message: "Too many searches from this address. Please wait a few minutes and try again.",
    },
  });
}

export const searchLimiter = createSearchLimiter();
