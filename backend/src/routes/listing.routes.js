import express from "express";

import {
  createListing,
  getListings,
  searchListings,
  getListingDetails,
  addListingPriceHistory,
  getListingHistory,
} from "../controllers/listing.controller.js";

import {
  validateCreateListing,
} from "../middleware/validation.middleware.js";

const router = express.Router();

/**
 * @swagger
 * /api/listings:
 *   post:
 *     summary: Create a listing
 *     description: Creates a single listing directly (used for manual entries and testing; scraped listings are normally written by the scraper service, not this endpoint).
 *     tags:
 *       - Listings
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ListingInput'
 *     responses:
 *       201:
 *         description: Listing created.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Listing'
 *       400:
 *         description: Validation failed.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationErrorResponse'
 */
router.post(
  "/",
  validateCreateListing,
  createListing
);

/**
 * @swagger
 * /api/listings:
 *   get:
 *     summary: List stored listings
 *     description: Returns every stored listing, newest first. No pagination is currently applied -- large collections return in full.
 *     tags:
 *       - Listings
 *     responses:
 *       200:
 *         description: Stored listings.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 count:
 *                   type: integer
 *                   example: 1946
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Listing'
 */
router.get("/", getListings);

/**
 * @swagger
 * /api/listings/search:
 *   get:
 *     summary: Search, group and rank listings for a query
 *     description: >
 *       The primary endpoint. Checks whether stored data for the query is within the freshness
 *       window (30 minutes); if not, runs the live scrapers across all active platforms, saves
 *       the results, then groups matching listings into products, scores every offer and attaches
 *       a buying recommendation before returning.
 *     tags:
 *       - Listings
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         example: samsung galaxy a17
 *         description: The search text.
 *       - in: query
 *         name: refresh
 *         schema:
 *           type: boolean
 *         description: Force a live re-scrape even if stored data is still fresh.
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Restrict results to a specific product category instead of the one auto-detected from the query.
 *       - in: query
 *         name: storage
 *         schema:
 *           type: integer
 *         description: Filter to a specific storage capacity in GB.
 *       - in: query
 *         name: colour
 *         schema:
 *           type: string
 *       - in: query
 *         name: condition
 *         schema:
 *           type: string
 *           enum: [new, used, refurbished, open_box]
 *       - in: query
 *         name: pta
 *         schema:
 *           type: string
 *       - in: query
 *         name: matching
 *         schema:
 *           type: string
 *           enum: [rule]
 *         description: Pass "rule" to use the rule-based matcher instead of the default trained ML classifier (rollback switch).
 *     responses:
 *       200:
 *         description: Grouped, ranked offers for the query.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 count:
 *                   type: integer
 *                   description: Total offers returned.
 *                 groupCount:
 *                   type: integer
 *                   description: Number of distinct products the offers were grouped into.
 *                 refresh:
 *                   type: object
 *                   description: Whether a live scrape ran for this request and why.
 *                   properties:
 *                     scraped:
 *                       type: boolean
 *                     reason:
 *                       type: string
 *                       enum: [fresh_data, stale_or_missing, force_refresh, joined_in_flight]
 *                 summary:
 *                   type: object
 *                   description: Aggregate stats across all returned offers (lowest/average price, best deal, platforms compared).
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Listing'
 *       400:
 *         description: Missing or empty q parameter.
 */
router.get("/search", searchListings);

/**
 * @swagger
 * /api/listings/{id}/history:
 *   get:
 *     summary: Get recorded price history for a listing
 *     tags:
 *       - Price History
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Maximum number of recent entries to return.
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *         description: Restrict entries to the last N days.
 *     responses:
 *       200:
 *         description: Recorded price entries and summary statistics for the listing.
 *       404:
 *         description: No price history found for this listing.
 *   post:
 *     summary: Record a price observation for a listing
 *     description: Appends a new price snapshot; normally called by the scraper service, exposed here for manual/testing use.
 *     tags:
 *       - Price History
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
 *             required: [price]
 *             properties:
 *               price:
 *                 type: number
 *               originalPrice:
 *                 type: number
 *                 nullable: true
 *               inStock:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Price entry recorded.
 *       404:
 *         description: Listing not found.
 */
router.get("/:id/history", getListingHistory);
router.post("/:id/history", addListingPriceHistory);

/**
 * @swagger
 * /api/listings/{id}:
 *   get:
 *     summary: Get a single listing with its full product group
 *     description: Returns the listing itself plus every other offer grouped with it (same matching logic as /search), so a detail page can show all stores selling that product.
 *     tags:
 *       - Listings
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Listing with its grouped offers and summary.
 *       404:
 *         description: Listing not found.
 */
router.get("/:id", getListingDetails);

export default router;