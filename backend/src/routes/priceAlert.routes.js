import express from "express";

import {
  createPriceAlert,
  confirmPriceAlert,
  cancelPriceAlert,
} from "../controllers/priceAlert.controller.js";

import { validateCreateAlert, validateAlertToken } from "../middleware/validation.middleware.js";
import { createAlertLimiter, alertReadLimiter } from "../middleware/rateLimit.middleware.js";

const router = express.Router();

/**
 * @swagger
 * /api/alerts:
 *   post:
 *     summary: Create a price alert (starts pending until the email link is followed)
 *     description: >
 *       Accountless by design: an alert is just {listingId, email, targetPrice}. Because nothing
 *       proves the caller owns the address, the alert starts as `pending` and an email with a
 *       confirm link is sent; it only becomes `active` (and is only then checked, every 15
 *       minutes, or emailed) once that link is followed (double opt-in). Unconfirmed alerts are
 *       deleted after 48 hours. An address may have at most 3 alerts waiting for confirmation
 *       and 20 in total. The response says whether the confirmation email could be sent
 *       (`confirmationSent`); the server has no mail delivery configured yet, so today it is
 *       written to the server log instead. `ALERT_AUTO_CONFIRM=true` skips confirmation
 *       (demonstrations only). Rate limited to 10 creates per 15 minutes per IP.
 *     tags:
 *       - Price Alerts
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [listingId, email, targetPrice]
 *             properties:
 *               listingId:
 *                 type: string
 *                 description: Must be a valid Listing id.
 *               email:
 *                 type: string
 *                 format: email
 *               targetPrice:
 *                 type: number
 *                 description: Alert fires once the listing's price falls to or below this value.
 *     responses:
 *       201:
 *         description: Alert created (status pending, or active with ALERT_AUTO_CONFIRM). The body never contains the email address.
 *       400:
 *         description: Validation failed (bad listingId, invalid email, or non-positive targetPrice), or the target price is not below the current price.
 *       404:
 *         description: The listing does not exist.
 *       429:
 *         description: Rate limit exceeded (10 creates / 15 min / IP), the address already has 20 alerts, or 3 alerts waiting for confirmation.
 */
router.post("/", createAlertLimiter, validateCreateAlert, createPriceAlert);

/**
 * @swagger
 * /api/alerts/confirm:
 *   post:
 *     summary: Confirm an alert with the token from the emailed link
 *     description: Moves a pending alert to active. Safe to repeat (an already active alert answers 200). The token is the secret in the emailed link; it is not an alert id and cannot be guessed. The link opens a page on this server (`/alerts/confirm?token=`) that sends this request when the button is pressed.
 *     tags:
 *       - Price Alerts
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Alert is active.
 *       400:
 *         description: token missing or not the right shape.
 *       404:
 *         description: The link is invalid or has expired (the same answer for a forged, unknown or expired token).
 *       409:
 *         description: The alert was already cancelled.
 *       429:
 *         description: Rate limit exceeded (60 / 15 min / IP).
 */
router.post("/confirm", alertReadLimiter, validateAlertToken, confirmPriceAlert);

/**
 * @swagger
 * /api/alerts/cancel:
 *   post:
 *     summary: Cancel an alert with the token from the emailed link
 *     description: Every alert email carries a cancel link. Safe to repeat. This replaces the old list-by-email and cancel-by-email endpoints, which let anyone who knew an address enumerate or cancel its alerts.
 *     tags:
 *       - Price Alerts
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Alert is cancelled (or already was).
 *       400:
 *         description: token missing or not the right shape.
 *       404:
 *         description: The link is invalid or has expired.
 *       429:
 *         description: Rate limit exceeded (60 / 15 min / IP).
 */
router.post("/cancel", alertReadLimiter, validateAlertToken, cancelPriceAlert);

export default router;
