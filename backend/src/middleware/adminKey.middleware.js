// adminKey.middleware.js — protects the few endpoints that write or force work
// and are not meant for anonymous visitors: creating a listing by hand, adding
// a price observation by hand, and forcing a live re-scrape with ?refresh=true.
//
// They were open to anyone, so one request could put a fake "PKR 1,000 iPhone"
// into a system whose whole value is trustworthy prices, or make the server
// hammer every store on demand. A shared secret in the ADMIN_API_KEY
// environment variable, sent in the x-admin-key header, is the smallest
// control that closes that without adding user accounts.
//
// If ADMIN_API_KEY is not set the protected endpoints are simply switched off,
// so a server that forgot to configure it fails closed, not open.

import { createHmac, randomBytes, timingSafeEqual } from "crypto";

import { sendError } from "./error.middleware.js";
import { ERROR_CODES } from "../errors/AppError.js";

// Both sides are passed through an HMAC first: that gives them the same length, which timingSafeEqual requires, and avoids leaking
// the key's length through timing. This is not password storage (the key is never stored hashed), so a keyed HMAC with a random
// per-process key is the right tool; a bare SHA-256 of a secret is what code scanners rightly flag.
const COMPARE_KEY = randomBytes(32);
const digest = (value) => createHmac("sha256", COMPARE_KEY).update(String(value)).digest();

/** True when the request carries the configured admin key. */
export function hasAdminKey(req) {
  const configured = process.env.ADMIN_API_KEY;
  if (!configured) return false;

  const supplied = req.get("x-admin-key");
  if (!supplied) return false;

  return timingSafeEqual(digest(supplied), digest(configured));
}

/** Express middleware: 503 if no key is configured, 401 if the key is wrong. */
export function requireAdminKey(req, res, next) {
  if (!process.env.ADMIN_API_KEY) {
    return sendError(res, 503, ERROR_CODES.SERVICE_DISABLED, "This endpoint is disabled on this server.");
  }

  if (!hasAdminKey(req)) {
    return sendError(res, 401, ERROR_CODES.UNAUTHORIZED, "A valid x-admin-key header is required.");
  }

  return next();
}
