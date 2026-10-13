// send-test-email.js — sends ONE test email through the same channel the price alerts use, to check the SMTP settings in .env.
//
//   node src/scripts/ops/send-test-email.js you@example.com
//
// Prints which channel was used and whether it was delivered, and, if not, the error code (never a password, a link or the settings).

import { config } from "dotenv";
config({ quiet: true });

import { sendTestEmail, smtpSettings } from "../../services/notification.service.js";

const to = process.argv[2];
if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
  console.error("Usage: node src/scripts/ops/send-test-email.js you@example.com");
  process.exit(2);
}

const settings = smtpSettings();
if (!settings) {
  console.log("SMTP_HOST is not set in backend/.env, so alerts only print to the console. Nothing was sent.");
  process.exit(1);
}
console.log(`Sending through ${settings.host}:${settings.port} (${settings.secure ? "TLS" : "STARTTLS"}) as ${settings.from || "(no sender set)"} ...`);

const result = await sendTestEmail(to);
console.log(result.delivered ? "Delivered: check the inbox (and the spam folder)." : `Not delivered (${result.reason ?? "no reason given"}).`);
process.exit(result.delivered ? 0 : 1);
