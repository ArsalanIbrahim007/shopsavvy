import { maskEmail } from "./maskEmail.js";

// notification.service.js — delivery for alert emails: the confirmation that starts
// an alert, and the notice that its price was reached.
//
// There is no email-sending infrastructure in this project (no SMTP/SendGrid
// credentials, nothing configured) and adding one isn't something to do silently --
// it needs real credentials only the project owner can provide. So this is a
// single, pluggable seam: everything upstream just calls sendAlertConfirmation() /
// notifyAlert() and does not know how delivery happens. The default channel writes
// to the server console and reports `delivered: false`, so the API can tell the
// requester honestly that no email went out.
//
// The console channel prints the confirm / cancel LINKS, because on a machine with no
// mail delivery that is the only way the person running the server can follow them.
// Those links are secrets (see alertTokens.service.js); a real channel must put them
// in the email and must not log them. Addresses are always masked in logs.
//
// To wire up real email: install nodemailer (or use a provider's SDK), add
// SMTP_HOST/SMTP_USER/SMTP_PASS (or an API key) to .env, and make deliver() send
// instead of log. Every email must carry the cancel link. Nothing else changes.

const CHANNEL = "console-log-only";

/**
 * The single place a message leaves the system.
 * @returns {Promise<{delivered: boolean, channel: string}>}
 */
async function deliver({ to, subject, text }) {
  console.log(`[notification] (${CHANNEL}) To ${maskEmail(to)} — ${subject}\n${text}`);
  return { delivered: false, channel: CHANNEL };
}

/**
 * Asks the address's owner to confirm an alert. Nothing else is sent until they do.
 * @param {{email: string, targetPrice: number, title: string}} alert
 * @param {{confirmUrl: string, cancelUrl: string}} links
 */
export function sendAlertConfirmation(alert, { confirmUrl, cancelUrl }) {
  return deliver({
    to: alert.email,
    subject: "Confirm your ShopSavvy price alert",
    text:
      `Someone (hopefully you) asked to be told when "${alert.title}" drops to PKR ${alert.targetPrice} or less.\n` +
      `Confirm: ${confirmUrl}\n` +
      `If this was not you, ignore this message or cancel: ${cancelUrl}`,
  });
}

/**
 * @param {{email: string, targetPrice: number, title: string}} alert
 * @param {{price: number, productUrl?: string, platform?: string}} listing
 * @param {{cancelUrl: string}} links  every alert email carries a way to stop them
 */
export function notifyAlert(alert, listing, { cancelUrl } = {}) {
  return deliver({
    to: alert.email,
    subject: "Your ShopSavvy price alert was reached",
    text:
      `"${alert.title}" dropped to PKR ${listing.price} (target was PKR ${alert.targetPrice}).` +
      (listing.productUrl ? `\n${listing.productUrl}` : "") +
      (cancelUrl ? `\nStop alerts like this: ${cancelUrl}` : ""),
  });
}
