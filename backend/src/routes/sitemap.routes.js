// sitemap.routes.js — GET /sitemap.xml for search engines (see services/sitemap.service.js).

import { Router } from "express";

import { readLimiter } from "../middleware/rateLimit.middleware.js";
import { getSitemap } from "../services/sitemap.service.js";

const router = Router();

/**
 * @swagger
 * /sitemap.xml:
 *   get:
 *     summary: The site's pages for search engines
 *     description: >
 *       A sitemaps.org file listing the site's fixed pages, each category's page, and one page per product sold by at least two
 *       stores, at the frontend's address (PUBLIC_SITE_URL). Built only from the category catalogs already computed (never by
 *       computing one), and cached for an hour; for five minutes while a category is still being computed after start-up.
 *     tags:
 *       - Site
 *     responses:
 *       200:
 *         description: The sitemap (application/xml).
 *       429:
 *         description: Too many requests.
 */
router.get("/", readLimiter, (req, res) => {
  const { xml, missing } = getSitemap();
  // A sitemap still missing a category (the server has just started) must not be kept by a cache for an hour.
  res.set("Cache-Control", `public, max-age=${missing.length ? 300 : 3600}`);
  res.type("application/xml").send(xml);
});

export default router;
