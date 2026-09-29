import express from "express";

import {
  analyticsOverview,
  platformAnalytics,
  priceTrendAnalytics,
} from "../controllers/analytics.controller.js";

const router = express.Router();

/**
 * @swagger
 * /api/analytics/overview:
 *   get:
 *     summary: Aggregate dataset statistics
 *     description: Overall counts and figures across the entire stored dataset (total listings, categories, platforms, etc.).
 *     tags:
 *       - Analytics
 *     responses:
 *       200:
 *         description: Aggregate overview.
 */
router.get(
  "/overview",
  analyticsOverview
);

/**
 * @swagger
 * /api/analytics/platforms:
 *   get:
 *     summary: Per-platform statistics
 *     description: Listing counts and average price broken down by platform.
 *     tags:
 *       - Analytics
 *     responses:
 *       200:
 *         description: Per-platform statistics.
 */
router.get(
  "/platforms",
  platformAnalytics
);

/**
 * @swagger
 * /api/analytics/price-trends:
 *   get:
 *     summary: Price movement over time
 *     description: Aggregate price trend data derived from recorded price history.
 *     tags:
 *       - Analytics
 *     responses:
 *       200:
 *         description: Price trend data.
 */
router.get(
  "/price-trends",
  priceTrendAnalytics
);

export default router;