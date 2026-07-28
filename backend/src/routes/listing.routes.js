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

router.post(
  "/",
  validateCreateListing,
  createListing
);

router.get("/", getListings);
router.get("/search", searchListings);

router.get("/:id/history", getListingHistory);
router.post("/:id/history", addListingPriceHistory);

router.get("/:id", getListingDetails);

export default router;