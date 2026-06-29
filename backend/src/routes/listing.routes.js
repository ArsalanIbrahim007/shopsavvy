import express from "express";
import {
  createListing,
  getListings,
  searchListings,
} from "../controllers/listing.controller.js";

const router = express.Router();

router.post("/", createListing);
router.get("/", getListings);
router.get("/search", searchListings);

export default router;