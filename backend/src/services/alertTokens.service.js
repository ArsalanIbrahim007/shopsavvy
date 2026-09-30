// alertTokens.service.js — the secret links that confirm or cancel ONE price alert.
//
// Alerts are accountless (an email and a target price), so nothing proves that the
// person who typed an address owns it. Two consequences are handled with links
// that only the mailbox owner receives:
//   - confirm: an alert does nothing until its link is followed (double opt-in), so
//     typing a stranger's address cannot make us send them alert mail;
//   - cancel: every alert email carries a cancel link, so cancelling never depends on
//     knowing an address or an id (the old "list or delete by email" endpoints let anyone
//     enumerate or cancel another person's alerts).
//
// A token is  <alertId>.<signature>  where the signature is an HMAC-SHA256 over the
// alert id and the purpose ("confirm" or "cancel") with a server secret. Nothing is
// stored per token, links can be rebuilt whenever an email is sent, a confirm link
// cannot be used to cancel (or the reverse), and guessing one means guessing a
// 256-bit value. Changing ALERT_TOKEN_SECRET invalidates every outstanding link.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const TOKEN_PURPOSES = Object.freeze({ CONFIRM: "confirm", CANCEL: "cancel" });

const ID_PATTERN = /^[0-9a-f]{24}$/;

let fallbackSecret = null;

function secret() {
  const configured = process.env.ALERT_TOKEN_SECRET;
  if (configured && configured.length >= 16) return configured;

  // No usable secret configured: use a random one for this process so links are still
  // unguessable, and say plainly that they will not survive a restart.
  if (!fallbackSecret) {
    fallbackSecret = randomBytes(32).toString("hex");
    console.warn("[alerts] ALERT_TOKEN_SECRET is not set (or shorter than 16 characters): using a random one for this run, so confirm and cancel links stop working when the server restarts. Set it in .env.");
  }
  return fallbackSecret;
}

const sign = (alertId, purpose) =>
  createHmac("sha256", secret()).update(`alert:v1:${purpose}:${alertId}`).digest("base64url");

/** @returns {string} the token for that alert and purpose */
export function signAlertToken(alertId, purpose) {
  const id = String(alertId);
  if (!ID_PATTERN.test(id)) throw new Error("signAlertToken needs a 24-character hex alert id");
  return `${id}.${sign(id, purpose)}`;
}

/** @returns {string|null} the alert id if the token is genuine for that purpose, otherwise null */
export function verifyAlertToken(token, purpose) {
  if (typeof token !== "string" || token.length > 200) return null;

  const [id, signature, ...extra] = token.split(".");
  if (extra.length > 0 || !ID_PATTERN.test(id ?? "") || !signature) return null;

  const expected = Buffer.from(sign(id, purpose));
  const given = Buffer.from(signature);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return id;
}
