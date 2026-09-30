import express from "express";
import mongoose from "mongoose";

import Listing from "../models/listing.model.js";
import { VISIBLE_PLATFORMS_FILTER } from "../config/platforms.js";

const router = express.Router();

const PING_TIMEOUT_MS = 2000;

/** Asks the database to answer, but never waits longer than PING_TIMEOUT_MS. */
async function databaseIsUp() {
  if (mongoose.connection.readyState !== 1) return false;
  try {
    await Promise.race([
      mongoose.connection.db.admin().ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("ping timed out")), PING_TIMEOUT_MS)),
    ]);
    return true;
  } catch {
    return false;
  }
}

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Check API health
 *     description: Reports whether the backend is running AND whether it can reach its database. Answers 200 when everything works and 503 when the database is unreachable, so a monitor or a person can tell "the process is up" apart from "the service works". Also reports when data was last scraped, which shows a stalled scraper.
 *     tags:
 *       - Health
 *     responses:
 *       200:
 *         description: Backend and database are working.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [ok, degraded]
 *                   example: ok
 *                 message:
 *                   type: string
 *                   example: ShopSavvy backend is running
 *                 db:
 *                   type: string
 *                   enum: [up, down]
 *                   example: up
 *                 uptimeSeconds:
 *                   type: integer
 *                   example: 3600
 *                 lastScrapeAt:
 *                   type: string
 *                   format: date-time
 *                   nullable: true
 *                   description: Most recent time any listing was scraped, or null if unknown.
 *       503:
 *         description: The process is up but the database is unreachable (status "degraded", db "down").
 */
router.get("/", async (req, res) => {
  const dbUp = await databaseIsUp();

  let lastScrapeAt = null;
  if (dbUp) {
    try {
      const latest = await Listing.findOne(VISIBLE_PLATFORMS_FILTER)
        .sort({ lastScrapedAt: -1 })
        .select("lastScrapedAt")
        .lean();
      lastScrapeAt = latest?.lastScrapedAt ?? null;
    } catch {
      // Health reporting must never fail because of the extra detail.
    }
  }

  res.status(dbUp ? 200 : 503).json({
    status: dbUp ? "ok" : "degraded",
    message: dbUp ? "ShopSavvy backend is running" : "ShopSavvy backend is running but cannot reach its database",
    db: dbUp ? "up" : "down",
    uptimeSeconds: Math.round(process.uptime()),
    lastScrapeAt,
    requestId: req.id,
  });
});

export default router;
