import { maskEmail } from "./maskEmail.js";

// notification.service.js — delivery for alert emails: the confirmation that starts
// an alert, and the notice that its price was reached.
//
// This is a single, pluggable seam: everything upstream just calls sendAlertConfirmation() /
// notifyAlert() and does not know how delivery happens.
//
//   - Without SMTP_HOST in .env, the channel writes to the server console and reports
//     `delivered: false`, so the API can tell the requester honestly that no email went out.
//     It prints the confirm / cancel LINKS, because on a machine with no mail delivery that is
//     the only way the person running the server can follow them. Those links are secrets (see
//     alertTokens.service.js).
//   - With SMTP_HOST (and SMTP_USER, SMTP_PASS and, optionally, SMTP_PORT, SMTP_SECURE,
//     SMTP_FROM) it sends through nodemailer. The SMTP channel never logs a link, a password or
//     a full address. A send that fails (wrong password, server down) is logged by error code
//     only and reported as delivered: false, the same honest answer, so creating an alert never
//     fails because mail did.
//
// Every email carries the cancel link. Addresses are always masked in logs.

const CONSOLE_CHANNEL = "console-log-only";
const SMTP_CHANNEL = "smtp";

// A request that creates an alert waits for the confirmation email, so a dead mail server must not hold it for long.
const TIMEOUTS_MS = { connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 15000 };

/** The SMTP settings from the environment, or null when no mail server is set. Read on every call, so a change to .env needs only a restart. */
export function smtpSettings(env = process.env) {
  const host = String(env.SMTP_HOST ?? "").trim();
  if (!host) return null;
  const port = Number.parseInt(env.SMTP_PORT, 10) || 465;
  const secure = env.SMTP_SECURE === undefined || env.SMTP_SECURE === "" ? port === 465 : String(env.SMTP_SECURE).toLowerCase() === "true";
  const user = String(env.SMTP_USER ?? "").trim();
  return {
    host,
    port,
    secure,
    auth: user ? { user, pass: String(env.SMTP_PASS ?? "") } : undefined,
    from: String(env.SMTP_FROM ?? "").trim() || user,
  };
}

let cached = { key: "", transport: null };

// nodemailer is loaded only when SMTP is configured, so a server (or the nightly scrape) without mail never touches it.
async function transportFor(settings) {
  const key = JSON.stringify([settings.host, settings.port, settings.secure, settings.auth?.user, settings.auth?.pass]);
  if (cached.key !== key) {
    const nodemailer = await import("nodemailer");
    const createTransport = nodemailer.createTransport ?? nodemailer.default.createTransport;
    cached = {
      key,
      transport: createTransport({
        host: settings.host,
        port: settings.port,
        secure: settings.secure,
        auth: settings.auth,
        requireTLS: !settings.secure, // port 587: upgrade to TLS or do not send, never fall back to plain text
        ...TIMEOUTS_MS,
      }),
    };
  }
  return cached.transport;
}

/**
 * The single place a message leaves the system.
 * @returns {Promise<{delivered: boolean, channel: string, reason?: string}>}
 */
async function deliver({ to, subject, text }) {
  const settings = smtpSettings();
  if (!settings) {
    console.log(`[notification] (${CONSOLE_CHANNEL}) To ${maskEmail(to)} — ${subject}\n${text}`);
    return { delivered: false, channel: CONSOLE_CHANNEL };
  }
  if (!settings.from) {
    console.warn("[notification] SMTP_HOST is set but there is no SMTP_FROM or SMTP_USER to send from: nothing was sent");
    return { delivered: false, channel: SMTP_CHANNEL, reason: "no-sender" };
  }
  try {
    const transport = await transportFor(settings);
    await transport.sendMail({ from: settings.from, to, subject, text });
    return { delivered: true, channel: SMTP_CHANNEL };
  } catch (err) {
    const reason = String(err?.code ?? err?.responseCode ?? "error").slice(0, 40);
    console.warn("[notification] email to %s was not sent (%s)", maskEmail(to), reason);
    return { delivered: false, channel: SMTP_CHANNEL, reason };
  }
}

/** Sends one plain message through the real channel, to check the SMTP settings (src/scripts/ops/send-test-email.js). */
export function sendTestEmail(to) {
  return deliver({ to, subject: "ShopSavvy test email", text: "If you can read this, ShopSavvy can send email. Nothing else is needed." });
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
