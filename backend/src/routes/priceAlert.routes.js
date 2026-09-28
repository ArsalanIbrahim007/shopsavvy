import express from "express";

import {
  createPriceAlert,
  getPriceAlerts,
  deletePriceAlert,
} from "../controllers/priceAlert.controller.js";

import { validateCreateAlert } from "../middleware/validation.middleware.js";
import { createAlertLimiter, alertReadLimiter } from "../middleware/rateLimit.middleware.js";

const router = express.Router();

router.post("/", createAlertLimiter, validateCreateAlert, createPriceAlert);
router.get("/", alertReadLimiter, getPriceAlerts);
router.delete("/:id", alertReadLimiter, deletePriceAlert);

export default router;
