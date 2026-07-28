import mongoose from "mongoose";

import {
  getAnalyticsOverview,
  getPlatformAnalytics,
  getPriceTrendAnalytics,
} from "../services/analytics/analytics.service.js";

export async function analyticsOverview(
  req,
  res
) {
  try {
    const analytics =
      await getAnalyticsOverview();

    res.json({
      success: true,
      generatedAt: new Date(),
      data: analytics,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message:
        "Unable to generate analytics overview",
      error: error.message,
    });
  }
}

export async function platformAnalytics(
  req,
  res
) {
  try {
    const platforms =
      await getPlatformAnalytics();

    res.json({
      success: true,
      count: platforms.length,
      generatedAt: new Date(),
      data: platforms,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message:
        "Unable to generate platform analytics",
      error: error.message,
    });
  }
}

export async function priceTrendAnalytics(
  req,
  res
) {
  try {
    const {
      days = 30,
      platform,
      listingId,
    } = req.query;

    if (
      listingId &&
      !mongoose.isValidObjectId(listingId)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid listing ID",
      });
    }

    const numericDays = Number(days);

    if (
      !Number.isFinite(numericDays) ||
      numericDays < 1 ||
      numericDays > 365
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Days must be a number between 1 and 365",
      });
    }

    const trends =
      await getPriceTrendAnalytics({
        days: numericDays,
        platform,
        listingId,
      });

    res.json({
      success: true,
      generatedAt: new Date(),
      data: trends,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message:
        "Unable to generate price trend analytics",
      error: error.message,
    });
  }
}