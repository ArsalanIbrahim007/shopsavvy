import mongoose from "mongoose";
import { AppError } from "../errors/AppError.js";

import {
  getAnalyticsOverview,
  getPlatformAnalytics,
  getPriceTrendAnalytics,
} from "../services/analytics/analytics.service.js";

export async function analyticsOverview(
  req,
  res
) {
  const analytics =
    await getAnalyticsOverview();

  res.json({
    success: true,
    generatedAt: new Date(),
    data: analytics,
  });
}

export async function platformAnalytics(
  req,
  res
) {
  const platforms =
    await getPlatformAnalytics();

  res.json({
    success: true,
    count: platforms.length,
    generatedAt: new Date(),
    data: platforms,
  });
}

export async function priceTrendAnalytics(
  req,
  res
) {
  const {
    days = 30,
    platform,
    listingId,
  } = req.query;

  if (
    listingId &&
    !mongoose.isValidObjectId(listingId)
  ) {
    throw AppError.invalidId("Invalid listing ID");
  }

  const numericDays = Number(days);

  if (
    !Number.isFinite(numericDays) ||
    numericDays < 1 ||
    numericDays > 365
  ) {
    throw AppError.badRequest("Days must be a number between 1 and 365");
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
}