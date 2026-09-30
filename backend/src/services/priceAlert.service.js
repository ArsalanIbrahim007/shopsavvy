// priceAlert.service.js — create/confirm/cancel alerts, and the check that
// decides which active alerts have actually been met.
//
// Life of an alert:  pending --(confirm link)--> active --(price reached)--> triggered
//                    pending / active --(cancel link)--> cancelled
// A pending alert that is not confirmed within CONFIRM_WINDOW_HOURS is deleted.
// Only ACTIVE alerts are ever checked or emailed, so an address that was typed by
// someone else never receives alert mail (double opt-in, see alertTokens.service.js).

import PriceAlert from "../models/priceAlert.model.js";
import Listing from "../models/listing.model.js";
import { notifyAlert, sendAlertConfirmation } from "./notification.service.js";
import { signAlertToken, verifyAlertToken, TOKEN_PURPOSES } from "./alertTokens.service.js";
import { AppError } from "../errors/AppError.js";

const MAX_ACTIVE_ALERTS_PER_EMAIL = 20;
// Each unconfirmed alert sends one email to an address the requester may not own, so
// the number waiting for confirmation is kept small.
const MAX_PENDING_ALERTS_PER_EMAIL = 3;
export const CONFIRM_WINDOW_HOURS = 48;

const INVALID_LINK = "This link is invalid or has expired.";

// An AppError, so the global handler gives it a stable code (NOT_FOUND,
// FORBIDDEN, RATE_LIMITED, ...) from its status. Kept under its old name.
export class AlertServiceError extends AppError {
  constructor(message, statusCode = 400) {
    super(statusCode, message);
    this.name = "AlertServiceError";
  }
}

/**
 * Pure decision of whether an alert's condition is met -- kept separate
 * from the DB-touching check loop below so it's directly unit-testable.
 */
export function shouldTrigger(alert, currentPrice) {
  if (alert.status !== "active") return false;
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) return false;
  return currentPrice <= alert.targetPrice;
}

/** ALERT_AUTO_CONFIRM=true skips the email confirmation. For demonstrations on a machine with no mail delivery. */
export const autoConfirmEnabled = () => process.env.ALERT_AUTO_CONFIRM === "true";

/** Where links point: this server, or PUBLIC_BASE_URL when it sits behind a public address. */
function baseUrl() {
  const configured = String(process.env.PUBLIC_BASE_URL ?? "").trim().replace(/\/+$/, "");
  return configured || `http://localhost:${process.env.PORT || 5000}`;
}

/** The two links that go in an alert's emails. */
export function alertLinks(alertId) {
  const link = (page, purpose) => `${baseUrl()}/alerts/${page}?token=${signAlertToken(alertId, purpose)}`;
  return {
    confirmUrl: link("confirm", TOKEN_PURPOSES.CONFIRM),
    cancelUrl: link("cancel", TOKEN_PURPOSES.CANCEL),
  };
}

/**
 * @returns {Promise<{alert: object, confirmationRequired: boolean, confirmationSent: boolean}>}
 */
export async function createAlert({ listingId, email, targetPrice }) {
  const listing = await Listing.findById(listingId);
  if (!listing) {
    throw new AlertServiceError("Listing not found", 404);
  }

  const [liveCount, pendingCount] = await Promise.all([
    PriceAlert.countDocuments({ email, status: { $in: ["active", "pending"] } }),
    PriceAlert.countDocuments({ email, status: "pending" }),
  ]);
  if (liveCount >= MAX_ACTIVE_ALERTS_PER_EMAIL) {
    throw new AlertServiceError(
      `Each email may have at most ${MAX_ACTIVE_ALERTS_PER_EMAIL} active alerts. Cancel one first.`,
      429
    );
  }

  if (Number.isFinite(listing.price) && targetPrice >= listing.price) {
    throw new AlertServiceError(
      `Target price must be below the current price (PKR ${listing.price}).`,
      400
    );
  }

  const autoConfirm = autoConfirmEnabled();
  if (!autoConfirm && pendingCount >= MAX_PENDING_ALERTS_PER_EMAIL) {
    throw new AlertServiceError(
      "This address has alerts waiting to be confirmed. Confirm them from the email we sent, or wait for them to expire, before adding more.",
      429
    );
  }

  const alert = await PriceAlert.create({
    listing: listing._id,
    title: listing.title,
    email,
    targetPrice,
    priceAtCreation: listing.price ?? null,
    status: autoConfirm ? "active" : "pending",
    confirmedAt: autoConfirm ? new Date() : null,
  });

  if (autoConfirm) return { alert, confirmationRequired: false, confirmationSent: false };

  const delivery = await sendAlertConfirmation(alert, alertLinks(alert._id));
  return { alert, confirmationRequired: true, confirmationSent: delivery.delivered === true };
}

/** The alert a link points at, or null when the token is not genuine. */
async function alertForToken(token, purpose) {
  const id = verifyAlertToken(token, purpose);
  return id ? PriceAlert.findById(id) : null;
}

const isExpiredPending = (alert) =>
  alert.status === "pending" && Date.now() - new Date(alert.createdAt).getTime() > CONFIRM_WINDOW_HOURS * 3600 * 1000;

/** Follows a confirm link: pending -> active. Idempotent for an alert that is already active. */
export async function confirmAlert(token) {
  const alert = await alertForToken(token, TOKEN_PURPOSES.CONFIRM);
  if (!alert) throw new AlertServiceError(INVALID_LINK, 404);

  if (alert.status === "active") return alert;
  if (alert.status === "cancelled") throw new AlertServiceError("This alert was cancelled, so it cannot be confirmed.", 409);
  if (alert.status === "triggered") return alert;
  if (isExpiredPending(alert)) throw new AlertServiceError(INVALID_LINK, 404);

  // Only a still-pending alert moves; two clicks (or a mail scanner and a person) confirm it once.
  const updated = await PriceAlert.findOneAndUpdate(
    { _id: alert._id, status: "pending" },
    { status: "active", confirmedAt: new Date() },
    { returnDocument: "after" }
  );
  return updated ?? (await PriceAlert.findById(alert._id));
}

/** Follows a cancel link. Idempotent: cancelling twice is not an error. */
export async function cancelAlertByToken(token) {
  const alert = await alertForToken(token, TOKEN_PURPOSES.CANCEL);
  if (!alert) throw new AlertServiceError(INVALID_LINK, 404);

  if (alert.status === "pending" || alert.status === "active") {
    const updated = await PriceAlert.findOneAndUpdate(
      { _id: alert._id, status: { $in: ["pending", "active"] } },
      { status: "cancelled" },
      { returnDocument: "after" }
    );
    return updated ?? (await PriceAlert.findById(alert._id));
  }
  return alert; // already cancelled or triggered
}

/**
 * Checks every active alert against its listing's current price, triggers
 * and notifies the ones that have been met. Groups by listing first so an
 * N-alerts-on-the-same-product case (a popular listing) doesn't issue N
 * redundant Listing lookups. Also removes pending alerts nobody confirmed.
 *
 * @returns {Promise<{checked: number, triggered: number, expired: number}>}
 */
export async function checkAlerts() {
  const cutoff = new Date(Date.now() - CONFIRM_WINDOW_HOURS * 3600 * 1000);
  const { deletedCount = 0 } = (await PriceAlert.deleteMany({ status: "pending", createdAt: { $lt: cutoff } })) ?? {};

  const activeAlerts = await PriceAlert.find({ status: "active" });
  if (activeAlerts.length === 0) return { checked: 0, triggered: 0, expired: deletedCount };

  const listingIds = [...new Set(activeAlerts.map((a) => String(a.listing)))];
  const listings = await Listing.find({ _id: { $in: listingIds } });
  const listingById = new Map(listings.map((l) => [String(l._id), l]));

  let triggered = 0;

  for (const alert of activeAlerts) {
    const listing = listingById.get(String(alert.listing));
    if (!listing) continue; // listing no longer exists, leave the alert active

    if (shouldTrigger(alert, listing.price)) {
      alert.status = "triggered";
      alert.triggeredAt = new Date();
      alert.triggeredPrice = listing.price;
      await alert.save();

      await notifyAlert(alert, listing, alertLinks(alert._id));
      triggered++;
    }
  }

  return { checked: activeAlerts.length, triggered, expired: deletedCount };
}
