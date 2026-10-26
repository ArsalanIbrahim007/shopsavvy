// share.routes.js — GET /share/product/:slug, the address a product page's Share button hands out (see services/sharePage.service.js).

import { Router } from "express";

import { detailLimiter } from "../middleware/rateLimit.middleware.js";
import { sharePage } from "../services/sharePage.service.js";

const router = Router();

/**
 * @swagger
 * /share/product/{slug}:
 *   get:
 *     summary: A product's link preview card, then its page on the site
 *     description: >
 *       A small HTML page with the product's Open Graph tags (name, lowest price, number of stores, a photo), which link previews
 *       (WhatsApp, Facebook, X) read, and an immediate move to the product's page on the site (PUBLIC_SITE_URL). Only the listing
 *       id at the end of the slug is read. An address that names no listing the site shows moves to the site's home page.
 *     tags:
 *       - Site
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         example: samsung-galaxy-a17-8gb-256gb-6710c3e2a4b5c6d7e8f90123
 *     responses:
 *       200:
 *         description: The page (text/html).
 *       302:
 *         description: No such listing; to the site's home page.
 *       429:
 *         description: Too many requests.
 */
router.get("/product/:slug", detailLimiter, async (req, res) => {
  const result = await sharePage(req.params.slug);
  if (result.redirect) {
    res.redirect(302, result.redirect);
    return;
  }
  res.set("Cache-Control", "public, max-age=600");
  res.type("html").send(result.html);
});

export default router;
