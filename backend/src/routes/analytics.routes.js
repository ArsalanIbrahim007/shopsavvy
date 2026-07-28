import express from "express";

import {
  analyticsOverview,
  platformAnalytics,
  priceTrendAnalytics,
} from "../controllers/analytics.controller.js";

const router = express.Router();

router.get(
  "/overview",
  analyticsOverview
);

router.get(
  "/platforms",
  platformAnalytics
);

router.get(
  "/price-trends",
  priceTrendAnalytics
);

export default router;