import express from "express";

import {
  createPriceAlert,
  getPriceAlerts,
  deletePriceAlert,
} from "../controllers/priceAlert.controller.js";

import { validateCreateAlert } from "../middleware/validation.middleware.js";
import { createAlertLimiter, alertReadLimiter } from "../middleware/rateLimit.middleware.js";

const router = express.Router();

/**
 * @swagger
 * /api/alerts:
 *   post:
 *     summary: Create a price alert
 *     description: >
 *       Accountless by design: an alert is just {listingId, email, targetPrice}, the same
 *       pattern as a "notify me when back in stock" button with no login. Checked every 15
 *       minutes by a background job; triggering currently only logs and marks the alert
 *       triggered in the DB (no real email delivery is wired up yet). Rate limited to 10
 *       creates per 15 minutes per IP.
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
 *         description: Alert created.
 *       400:
 *         description: Validation failed (bad listingId, invalid email, or non-positive targetPrice).
 *       429:
 *         description: Rate limit exceeded (10 creates / 15 min / IP).
 *   get:
 *     summary: List a person's alerts
 *     description: Requires the email as a lightweight anti-tampering check, since there's no real authentication in this system.
 *     tags:
 *       - Price Alerts
 *     parameters:
 *       - in: query
 *         name: email
 *         required: true
 *         schema:
 *           type: string
 *           format: email
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, triggered, cancelled]
 *         description: Filter to alerts in a specific state.
 *     responses:
 *       200:
 *         description: The alerts for that email.
 *       400:
 *         description: email query parameter is missing.
 *       429:
 *         description: Rate limit exceeded (60 reads / 15 min / IP).
 */
router.post("/", createAlertLimiter, validateCreateAlert, createPriceAlert);
router.get("/", alertReadLimiter, getPriceAlerts);

/**
 * @swagger
 * /api/alerts/{id}:
 *   delete:
 *     summary: Cancel a price alert
 *     description: Requires the same email the alert was created with, as a lightweight anti-tampering check.
 *     tags:
 *       - Price Alerts
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Alert cancelled.
 *       400:
 *         description: email missing from the request body, or it doesn't match the alert's owner.
 *       404:
 *         description: Alert not found.
 *       429:
 *         description: Rate limit exceeded (60 reads / 15 min / IP).
 */
router.delete("/:id", alertReadLimiter, deletePriceAlert);

export default router;
