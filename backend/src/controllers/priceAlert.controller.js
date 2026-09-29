import {
  createAlert,
  listAlertsByEmail,
  cancelAlert,
  AlertServiceError,
} from "../services/priceAlert.service.js";

function handleServiceError(error, res) {
  if (error instanceof AlertServiceError) {
    return res.status(error.statusCode).json({ success: false, message: error.message });
  }
  throw error; // let the global error handler deal with anything unexpected
}

export async function createPriceAlert(req, res) {
  try {
    const { listingId, email, targetPrice } = req.body;
    const alert = await createAlert({ listingId, email, targetPrice: Number(targetPrice) });

    res.status(201).json({
      success: true,
      message: "Alert created. You'll be notified if the price drops to your target.",
      data: alert,
    });
  } catch (error) {
    handleServiceError(error, res);
  }
}

export async function getPriceAlerts(req, res) {
  try {
    const { email, status } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "email query parameter is required, e.g. /api/alerts?email=you@example.com",
      });
    }

    const alerts = await listAlertsByEmail(String(email).toLowerCase().trim(), { status });
    res.json({ success: true, count: alerts.length, data: alerts });
  } catch (error) {
    handleServiceError(error, res);
  }
}

export async function deletePriceAlert(req, res) {
  try {
    const { id } = req.params;
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "email is required in the request body to cancel an alert",
      });
    }

    const alert = await cancelAlert(id, email);
    res.json({ success: true, message: "Alert cancelled.", data: alert });
  } catch (error) {
    handleServiceError(error, res);
  }
}
