import express from "express";

import {
  createListing,
  getListings,
  getListingStats,
  searchListings,
  getListingDetails,
  addListingPriceHistory,
  getListingHistory,
} from "../controllers/listing.controller.js";

import {
  validateCreateListing,
} from "../middleware/validation.middleware.js";
import { requireAdminKey } from "../middleware/adminKey.middleware.js";
import { searchLimiter } from "../middleware/rateLimit.middleware.js";

const router = express.Router();

/**
 * @swagger
 * /api/listings:
 *   post:
 *     summary: Create a listing
 *     description: Creates a single listing directly (used for manual entries and testing; scraped listings are normally written by the scraper service, not this endpoint). Requires the x-admin-key header; the endpoint is disabled when the server has no ADMIN_API_KEY.
 *     tags:
 *       - Listings
 *     security:
 *       - AdminKey: []
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
 *       401:
 *         description: Missing or wrong x-admin-key.
 *       503:
 *         description: Disabled because the server has no ADMIN_API_KEY configured.
 */
router.post(
  "/",
  requireAdminKey,
  validateCreateListing,
  createListing
);

/**
 * @swagger
 * /api/listings:
 *   get:
 *     summary: List stored listings
 *     description: Returns stored listings, newest first. Without `limit` the whole collection is returned, as before. With `limit` the response is paginated and also carries total, page, limit and totalPages.
 *     tags:
 *       - Listings
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 200
 *         description: Page size. Enables pagination; values above 200 are clamped.
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: 1-based page number, used together with limit.
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
 * /api/listings/stats:
 *   get:
 *     summary: Headline counts
 *     description: Total number of stored listings and the number of distinct platforms, without returning the listings themselves.
 *     tags:
 *       - Listings
 *     responses:
 *       200:
 *         description: Counts.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 products:
 *                   type: integer
 *                   example: 2727
 *                 platforms:
 *                   type: integer
 *                   example: 8
 */
router.get("/stats", getListingStats);

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
 *           maxLength: 100
 *         example: samsung galaxy a17
 *         description: The search text, at most 100 characters.
 *       - in: query
 *         name: refresh
 *         schema:
 *           type: boolean
 *         description: Force a live re-scrape even if stored data is still fresh. Honoured only when a valid x-admin-key header is sent; otherwise ignored and the normal cached behaviour applies.
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
 *         description: Missing, empty, non-text or over-long (more than 100 characters) q parameter.
 *       429:
 *         description: Too many searches from this address (120 per 15 minutes).
 */
router.get("/search", searchLimiter, searchListings);

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
 *     description: Appends a new price snapshot; normally called by the scraper service, exposed here for manual/testing use. Requires the x-admin-key header; the endpoint is disabled when the server has no ADMIN_API_KEY.
 *     tags:
 *       - Price History
 *     security:
 *       - AdminKey: []
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
 *       401:
 *         description: Missing or wrong x-admin-key.
 *       404:
 *         description: Listing not found.
 *       503:
 *         description: Disabled because the server has no ADMIN_API_KEY configured.
 */
router.get("/:id/history", getListingHistory);
router.post("/:id/history", requireAdminKey, addListingPriceHistory);

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