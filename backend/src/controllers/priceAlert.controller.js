import {
  createAlert,
  listAlertsByEmail,
  cancelAlert,
} from "../services/priceAlert.service.js";
import { AppError } from "../errors/AppError.js";
import { textParam } from "../services/queryParams.service.js";

export async function createPriceAlert(req, res) {
  const { listingId, email, targetPrice } = req.body;
  const alert = await createAlert({ listingId, email, targetPrice: Number(targetPrice) });

  res.status(201).json({
    success: true,
    message: "Alert created. You'll be notified if the price drops to your target.",
    data: alert,
  });
}

export async function getPriceAlerts(req, res) {
  // Plain strings only: an object here (?status[$ne]=x) would reach the database
  // filter as an operator.
  const email = textParam(req.query.email);
  const status = textParam(req.query.status);

  if (!email) {
    throw AppError.badRequest("email query parameter is required, e.g. /api/alerts?email=you@example.com");
  }

  const alerts = await listAlertsByEmail(email.toLowerCase(), { status });
  res.json({ success: true, count: alerts.length, data: alerts });
}

export async function deletePriceAlert(req, res) {
  const { id } = req.params;
  const email = textParam(req.body?.email);

  if (!email) {
    throw AppError.badRequest("email is required in the request body to cancel an alert");
  }

  const alert = await cancelAlert(id, email);
  res.json({ success: true, message: "Alert cancelled.", data: alert });
}
