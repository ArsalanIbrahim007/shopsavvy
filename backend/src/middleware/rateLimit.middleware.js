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
