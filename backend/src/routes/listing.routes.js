import express from "express";
import {
  createListing,
  getListings,
  searchListings,
  getListingDetails,
  addListingPriceHistory,
  getListingHistory,
} from "../controllers/listing.controller.js";

const router = express.Router();

router.post("/", createListing);
router.get("/", getListings);
router.get("/search", searchListings);

router.get("/:id/history", getListingHistory);
router.post("/:id/history", addListingPriceHistory);

router.get("/:id", getListingDetails);

export default router;