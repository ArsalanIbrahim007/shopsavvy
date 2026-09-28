import express from "express";

import {
  createPriceAlert,
  getPriceAlerts,
  deletePriceAlert,
} from "../controllers/priceAlert.controller.js";

import { validateCreateAlert } from "../middleware/validation.middleware.js";

const router = express.Router();

router.post("/", validateCreateAlert, createPriceAlert);
router.get("/", getPriceAlerts);
router.delete("/:id", deletePriceAlert);

export default router;
