import express from "express";

import { dealsLimiter } from "../middleware/rateLimit.middleware.js";
import { getIntegrityReport } from "../services/integrity.service.js";

const router = express.Router();

/**
 * @swagger
 * /api/integrity:
 *   get:
 *     summary: How the data is checked, with real numbers
 *     description: >
 *       What ShopSavvy's own checks found in the data it holds right now (offers set aside as unusual prices, discount
 *       claims by verdict, PTA handling, how fresh the prices are, how much history is recorded), and how the two trained
 *       models scored on labelled pairs they never saw (taken from the evaluation reports the team's scripts write). Counted
 *       from the cached, grouped catalog, so it matches what the browse pages show; no scraping. Cached for ten minutes; the
 *       first request after a restart can take about a minute while the catalog is grouped. Shares the deals rate limit.
 *     tags:
 *       - Listings
 *     responses:
 *       200:
 *         description: The report. `evaluation.matcher` and `evaluation.discount` are null when their report cannot be read.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 generatedAt:
 *                   type: string
 *                   format: date-time
 *                 live:
 *                   type: object
 *                   description: Counts (offers, stores, products, productsCompared, listings, unusualPrices, discounts, pta, freshness, history).
 *                 evaluation:
 *                   type: object
 *                   description: matcher (production, candidate and rule scores on held-out pairs) and discount (the detector at its threshold).
 */
router.get("/", dealsLimiter, async (req, res) => {
  const report = await getIntegrityReport();
  res.set("Cache-Control", "public, max-age=60");
  res.json({ success: true, ...report });
});

export default router;
