import { createAlert, confirmAlert, cancelAlertByToken } from "../services/priceAlert.service.js";

// What a caller may learn about an alert. Never the email (the requester typed it, and
// a link-holder is not necessarily the requester) and never anything that could rebuild a link.
const publicAlert = (alert) => ({
  _id: alert._id,
  title: alert.title,
  targetPrice: alert.targetPrice,
  priceAtCreation: alert.priceAtCreation,
  status: alert.status,
});

export async function createPriceAlert(req, res) {
  const { listingId, email, targetPrice } = req.body;
  const { alert, confirmationRequired, confirmationSent } = await createAlert({
    listingId,
    email,
    targetPrice: Number(targetPrice),
  });

  let message = "Alert created. You'll be notified if the price drops to your target.";
  if (confirmationRequired) {
    message = confirmationSent
      ? "Check your email: we sent a link to confirm this alert. It stays inactive until you follow it."
      : "Alert saved but not active yet. It has to be confirmed from an email link, and this server cannot send email at the moment.";
  }

  res.status(201).json({
    success: true,
    message,
    confirmationRequired,
    confirmationSent,
    data: publicAlert(alert),
  });
}

export async function confirmPriceAlert(req, res) {
  const alert = await confirmAlert(req.body.token);
  res.json({ success: true, message: "Alert confirmed. We'll email you if the price reaches your target.", data: publicAlert(alert) });
}

export async function cancelPriceAlert(req, res) {
  const alert = await cancelAlertByToken(req.body.token);
  res.json({ success: true, message: "Alert cancelled. You won't get any more email about it.", data: publicAlert(alert) });
}
