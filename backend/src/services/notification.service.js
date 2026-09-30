import { maskEmail } from "./maskEmail.js";

// notification.service.js — delivery for triggered price alerts.
//
// There is no email-sending infrastructure in this project (no SMTP/
// SendGrid credentials, nothing configured) and adding one isn't something
// to do silently -- it needs real credentials only the project owner can
// provide. This is a single, pluggable seam: everything upstream (the
// alert-check job) just calls notifyAlert() and doesn't know or care how
// delivery actually happens. The default implementation logs and records
// that a notification was "sent", so the alert lifecycle and the API are
// fully working end-to-end right now; swapping in real email later is a
// change to this one file only.
//
// To wire up real email: install nodemailer (or use a provider's SDK),
// add SMTP_HOST/SMTP_USER/SMTP_PASS (or an API key) to .env, and replace
// the body of notifyAlert with an actual send call. Everything else --
// the model, the job, the API -- stays the same.

/**
 * @param {{email: string, targetPrice: number, title: string}} alert
 * @param {{price: number, productUrl?: string, platform?: string}} listing
 */
export async function notifyAlert(alert, listing) {
  // The address is masked: personal data does not belong in a log file.
  console.log(
    `[notification] Price alert triggered for ${maskEmail(alert.email)}: "${alert.title}" ` +
    `dropped to PKR ${listing.price} (target was PKR ${alert.targetPrice}).` +
    (listing.productUrl ? ` ${listing.productUrl}` : "")
  );

  // No real delivery channel configured -- see the module comment above.
  // Returning a result object (rather than just logging) so callers can
  // tell delivery apart from a thrown error once a real channel exists.
  return { delivered: false, channel: "console-log-only" };
}
