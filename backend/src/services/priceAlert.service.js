// priceAlert.service.js — create/list/cancel alerts, and the check that
// decides which active alerts have actually been met.

import PriceAlert from "../models/priceAlert.model.js";
import Listing from "../models/listing.model.js";
import { notifyAlert } from "./notification.service.js";
import { AppError } from "../errors/AppError.js";

const MAX_ACTIVE_ALERTS_PER_EMAIL = 20;

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

export async function createAlert({ listingId, email, targetPrice }) {
  const listing = await Listing.findById(listingId);
  if (!listing) {
    throw new AlertServiceError("Listing not found", 404);
  }

  const activeCount = await PriceAlert.countDocuments({ email, status: "active" });
  if (activeCount >= MAX_ACTIVE_ALERTS_PER_EMAIL) {
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

  return PriceAlert.create({
    listing: listing._id,
    title: listing.title,
    email,
    targetPrice,
    priceAtCreation: listing.price ?? null,
  });
}

export async function listAlertsByEmail(email, { status } = {}) {
  const filter = { email };
  if (status) filter.status = status;
  return PriceAlert.find(filter).sort({ createdAt: -1 });
}

export async function cancelAlert(id, email) {
  const alert = await PriceAlert.findById(id);
  if (!alert) {
    throw new AlertServiceError("Alert not found", 404);
  }

  // No real auth exists, so this is the lightest possible check: whoever
  // is cancelling has to supply the same email the alert was created
  // with. Not real authorization, but it stops a stranger who merely
  // guesses/enumerates an alert id from cancelling someone else's alert.
  if (alert.email !== String(email).toLowerCase().trim()) {
    throw new AlertServiceError("Email does not match this alert", 403);
  }

  alert.status = "cancelled";
  return alert.save();
}

/**
 * Checks every active alert against its listing's current price, triggers
 * and notifies the ones that have been met. Groups by listing first so an
 * N-alerts-on-the-same-product case (a popular listing) doesn't issue N
 * redundant Listing lookups.
 *
 * @returns {Promise<{checked: number, triggered: number}>}
 */
export async function checkAlerts() {
  const activeAlerts = await PriceAlert.find({ status: "active" });
  if (activeAlerts.length === 0) return { checked: 0, triggered: 0 };

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

      await notifyAlert(alert, listing);
      triggered++;
    }
  }

  return { checked: activeAlerts.length, triggered };
}
