import express from "express";

import { getCategoryCatalog, getDeals, getListingStats, getPriceDropsFeed } from "../controllers/feeds.controller.js";
import { addListingPriceHistory, createListing, getListingHistory, getListings } from "../controllers/listing.controller.js";
import { getListingDetails, getProductComparison, getProductMatch } from "../controllers/product.controller.js";
import { searchListings, suggestListings } from "../controllers/search.controller.js";

import {
  validateCreateListing,
} from "../middleware/validation.middleware.js";
import { requireAdminKey } from "../middleware/adminKey.middleware.js";
import { searchLimiter, dealsLimiter, suggestLimiter, detailLimiter, readLimiter, adminLimiter, matchLimiter } from "../middleware/rateLimit.middleware.js";

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
router.get("/", readLimiter, getListings);

/**
 * @swagger
 * /api/listings/stats:
 *   get:
 *     summary: Headline counts
 *     description: Total number of visible listings, the number of distinct platforms, and how many listings each product category holds (biggest first, cached for a minute), without returning the listings themselves.
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
 *                 categories:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       category:
 *                         type: string
 *                         example: smartphone
 *                       count:
 *                         type: integer
 *                         example: 1368
 */
router.get("/stats", readLimiter, getListingStats);

/**
 * @swagger
 * /api/listings/deals:
 *   get:
 *     summary: Top deals
 *     description: Products where the cheapest store beats the typical price by a real margin, ranked by saving. Built from stored data only (no scraping) and cached for ten minutes. The saving is measured against the median price of the offers considered, never against a store's own "was" price. Conservative on purpose, so only new offers scraped in the last 72 hours, in stock, not flagged as an unusual price and not labelled non-PTA are considered; a product needs at least three such offers from at least two stores whose prices are within 1.6x of each other; and for phones and tablets the cheapest offer must be explicitly PTA-approved (a cheap phone with PTA status unstated looks the same as a non-PTA one). A saving must be at least 5% and PKR 1,000.
 *     tags:
 *       - Listings
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [smartphone, laptop, tv, tablet, smartwatch, headphones, air_conditioner, refrigerator, washing_machine, monitor]
 *         description: Restrict to one category. Omitted means all of them.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 12
 *     responses:
 *       200:
 *         description: Deals, biggest percentage saving first.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: integer
 *                 generatedAt:
 *                   type: string
 *                   format: date-time
 *                   description: When the (oldest) cached category was computed.
 *                 maxAgeHours:
 *                   type: integer
 *                   example: 72
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       productName: { type: string }
 *                       category: { type: string }
 *                       imageUrl: { type: string }
 *                       offerCount: { type: integer }
 *                       storeCount: { type: integer }
 *                       lowest:
 *                         type: object
 *                         properties:
 *                           _id: { type: string }
 *                           platform: { type: string }
 *                           price: { type: number }
 *                           productUrl: { type: string }
 *                       referencePrice: { type: number, description: Median price of the offers considered. }
 *                       savingAmount: { type: number }
 *                       savingPercent: { type: number }
 *                       verifiedDiscountPercent: { type: integer, nullable: true, description: The lowest offer's claimed discount, only when no check doubts it. }
 *                       recommendation: { type: string, nullable: true }
 *                       dealScore: { type: number, nullable: true }
 *                       updatedAt: { type: string, format: date-time }
 *       400:
 *         description: Unknown category.
 *       429:
 *         description: Too many requests.
 */
router.get("/deals", dealsLimiter, getDeals);

/**
 * @swagger
 * /api/listings/drops:
 *   get:
 *     summary: Price drops
 *     description: Offers whose newest recorded price is at least 5% and PKR 500 below the price recorded on the previous day it was checked (at most 14 days earlier), seen in the last 2 days. A fall of more than 50% is left out (more often a listing or parsing error than a sale). Only active, new offers still at the new price, in the deal categories. Built from stored price history only (no scraping) and cached for ten minutes.
 *     tags:
 *       - Listings
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [smartphone, laptop, tv, tablet, smartwatch, headphones, air_conditioner, refrigerator, washing_machine, monitor]
 *         description: Restrict to one category. Omitted means all of them.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 24
 *     responses:
 *       200:
 *         description: Drops, biggest percentage first. Each item is a listing with a `drop` object (price, before, day, beforeDay, rupees, percent); `rules` repeats the thresholds used.
 *       400:
 *         description: Unknown category.
 */
router.get("/drops", dealsLimiter, getPriceDropsFeed);

/**
 * @swagger
 * /api/listings/match:
 *   get:
 *     summary: Which product is this store page? (browser extension)
 *     description: >
 *       The product a store's product page shows, and the same product at the other stores, as the product page groups it.
 *       Read-only: never scrapes, never writes. The page is found by its address (the query string picks the variant where the
 *       store keeps it there), else by the same store's listing with the same title, else, when the page is not stored at all, by
 *       grouping it as a temporary offer with the stored listings of its category ("similar"; needs title and price). A listing
 *       whose title contradicts the page title (capacity, PTA status, model) is never taken for it. Answers are cached for ten
 *       minutes.
 *     tags:
 *       - Listings
 *     parameters:
 *       - in: query
 *         name: url
 *         required: true
 *         schema: { type: string, maxLength: 2048 }
 *         description: The address of the product page.
 *       - in: query
 *         name: title
 *         schema: { type: string, maxLength: 300 }
 *         description: The product title shown on the page.
 *       - in: query
 *         name: price
 *         schema: { type: string, example: "PKR 1,23,456" }
 *         description: The price shown on the page, in rupees ("PKR 1,23,456", "Rs. 123456" and "123456" are all read).
 *     responses:
 *       200:
 *         description: >
 *           `found`, `matchedBy` (url, title, similar or null), `listing` (our record of this page; null for "similar"), `offers`
 *           (the other offers of the product, cheapest first, each with platform, title, price, url, inStock, lastScrapedAt,
 *           outOfDate, unusualPrice, ptaStatus, ptaAssessment, condition), `cheapest` (the cheapest offer a shopper can act on, with
 *           `saving` against the page price and `cheaperThanThisPage`), `atLow` (the "lowest we've recorded" claim or null),
 *           `discountVerdict` ({discount, market, price}, each null or a code and reason), `advice` (buy or wait), `pta` ({product,
 *           thisPage}), `productUrl` (the product on ShopSavvy), `searchUrl`. When not found, `reason` is store_not_covered,
 *           not_stored or no_match.
 *       400:
 *         description: Missing or over-long address, over-long title, or a price that is not a number of rupees.
 *       429:
 *         description: Too many requests.
 */
router.get("/match", matchLimiter, getProductMatch);

/**
 * @swagger
 * /api/listings/compare:
 *   get:
 *     summary: Compare 2 to 4 products side by side
 *     description: >
 *       For the Compare page. Each id is a listing; its column is the product (group of offers) that listing belongs to, built
 *       as on the product page. Specifications are the typed sheets the nightly page check read from the stores' product pages
 *       (Specs engine), merged across the product's stores (the value most stores give). `specScore` and `rank` come from the
 *       Specs engine and are null until it is installed, or when too few specifications are known; `specsEngine` says whether
 *       it is. Never scrapes.
 *     tags:
 *       - Listings
 *     parameters:
 *       - in: query
 *         name: ids
 *         required: true
 *         schema: { type: string, example: "6a6b01724d3ce0c30fbd2729,6ac0f72def0f2a362b00bbfa" }
 *         description: 2 to 4 distinct listing ids, separated by commas.
 *     responses:
 *       200:
 *         description: >
 *           `products` in the order asked, each with id, name, category, image, `bestOffer` (id, platform, title, price, url,
 *           inStock, lastScrapedAt, outOfDate), lowestPrice, offerCount, stores, ptaStatus, `specs` (canonical sheet or null),
 *           `specsFrom` (stores whose pages gave it), `specScore` ({score, parts:[{field, points, max}]} or null), `rank` (from the
 *           Specs engine, or null), productUrl; and `specsEngine` ("ready" or "missing").
 *       400:
 *         description: Fewer than 2 or more than 4 ids, an id that is not a listing id, or the same id twice.
 *       404:
 *         description: An id matches no listing (`errors.missing` lists them).
 */
router.get("/compare", detailLimiter, getProductComparison);

/**
 * @swagger
 * /api/listings/catalog:
 *   get:
 *     summary: Browse a category
 *     description: >
 *       The products of one category (smartphone, laptop, tv, tablet, smartwatch, headphones, air_conditioner, refrigerator, washing_machine or monitor), most
 *       compared first, in pages. Each product is a group of offers with the same shape as the groups
 *       in /api/listings/search, except that offers carry no price history (the product page loads it).
 *       Grouping a category is expensive, so it is computed once in the worker pool and cached for ten
 *       minutes (warmed at start-up); no scraping happens. Shares the deals rate limit.
 *     tags:
 *       - Listings
 *     parameters:
 *       - in: query
 *         name: category
 *         required: true
 *         schema:
 *           type: string
 *           enum: [smartphone, laptop, tv, tablet, smartwatch, headphones, air_conditioner, refrigerator, washing_machine, monitor]
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 24
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *     responses:
 *       200:
 *         description: One page of products.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 category: { type: string }
 *                 count: { type: integer, description: Products in this page. }
 *                 total: { type: integer, description: Products in the whole category. }
 *                 offset: { type: integer }
 *                 limit: { type: integer }
 *                 generatedAt: { type: string, format: date-time }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     description: A product group (productName, offerCount, lowestPrice, highestPrice, bestDeal, offers).
 *       400:
 *         description: Missing or unknown category.
 *       429:
 *         description: Too many requests.
 *       503:
 *         description: The database is unreachable, or the grouping workers are saturated (code SERVICE_BUSY).
 */
router.get("/catalog", dealsLimiter, getCategoryCatalog);

/**
 * @swagger
 * /api/listings/suggest:
 *   get:
 *     summary: Search suggestions
 *     description: Product names matching what the user has typed, built from the listings we hold and ranked by how many listings share each name. Under two characters answers an empty list. Accessories and uncategorised items are left out.
 *     tags:
 *       - Listings
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *           maxLength: 100
 *         example: galaxy a
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 15
 *           default: 8
 *     responses:
 *       200:
 *         description: Suggestions, best first.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: integer
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       text: { type: string, example: Samsung Galaxy A17 }
 *                       category: { type: string, example: smartphone }
 *                       count: { type: integer, description: Listings that share this name. }
 *       400:
 *         description: Query longer than 100 characters.
 *       429:
 *         description: Too many requests.
 */
router.get("/suggest", suggestLimiter, suggestListings);

/**
 * @swagger
 * /api/listings/search:
 *   get:
 *     summary: Search, group and rank listings for a query
 *     description: >
 *       The primary endpoint. Checks whether stored data for the query is within the freshness
 *       window (30 minutes). When nothing is stored for it, runs the live scrapers across all
 *       active platforms and waits for them. When listings are stored but older, answers from them
 *       at once and refreshes in the background: `refresh.refreshing` is then true, and asking
 *       again in about 20 seconds returns the new prices. Then groups matching listings into
 *       products, scores every offer and attaches a buying recommendation before returning.
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
 *       503:
 *         description: The database is unreachable (code DATABASE_UNAVAILABLE), or the grouping workers are saturated and the request was refused (code SERVICE_BUSY). Retry shortly.
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
 *       400:
 *         description: The id is not a valid listing id.
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
router.get("/:id/history", readLimiter, getListingHistory);
router.post("/:id/history", adminLimiter, requireAdminKey, addListingPriceHistory);

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
 *         description: |
 *           Listing with its grouped offers and summary, and `outlook`: what the product's own recorded prices say about waiting
 *           ("wait or buy?"). It is not a price forecast. `outlook.verdict` is `too_early` (too few days of records to say, with
 *           `why`: `short`, `stale` or `no_records`), `flat`, `at_low`, `above_usual` or `usual`; `basis` says how many days and
 *           records it rests on, `stats` the numbers (current, low, high, usual, vsUsualPct, changeWeekPct, daysSinceChange, daysBelow),
 *           `strength` is `early` (under 4 weeks of records) or `fair`, and `market` counts how prices moved over about a week across
 *           every tracked listing (or null). `outlook` is null if it could not be worked out.
 *       404:
 *         description: Listing not found.
 *       400:
 *         description: The id is not a valid listing id.
 *       503:
 *         description: The database is unreachable, or the grouping workers are saturated (code SERVICE_BUSY). Retry shortly.
 */
router.get("/:id", detailLimiter, getListingDetails);

export default router;