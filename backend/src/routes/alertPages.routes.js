// alertPages.routes.js — the two small pages an alert email's links open:
//   GET /alerts/confirm?token=...     GET /alerts/cancel?token=...
//
// Following a link must not change anything by itself: mail scanners and link previews
// fetch links automatically, and would confirm (or cancel) alerts nobody chose to. So the
// page only shows a button, and the button sends the POST to /api/alerts/confirm or
// /api/alerts/cancel. This means the alert flow works end to end without the frontend.
//
// The token is never written into the HTML by the server: the page's script reads it from
// the address bar and sends it in a request body, so there is nothing to escape and it does
// not reach a log line (the access log records paths only) or another site (no Referer).
// Text is set with textContent, and a per-response nonce lets only this page's own script run.

import express from "express";
import { randomBytes } from "node:crypto";

import { alertReadLimiter } from "../middleware/rateLimit.middleware.js";

const router = express.Router();

const PAGES = {
  confirm: {
    heading: "Confirm your price alert",
    intro: "Press the button to start this alert. We'll email you only if the price reaches your target.",
    button: "Confirm alert",
    api: "/api/alerts/confirm",
  },
  cancel: {
    heading: "Cancel your price alert",
    intro: "Press the button to stop this alert. You won't get any more email about it.",
    button: "Cancel alert",
    api: "/api/alerts/cancel",
  },
};

function renderPage(page, nonce) {
  // Every value interpolated below is a constant from PAGES, never request data.
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${page.heading} - ShopSavvy</title>
<style nonce="${nonce}">
  body { font-family: system-ui, sans-serif; max-width: 30rem; margin: 12vh auto; padding: 0 1rem; line-height: 1.5; color: #1c1c1c; }
  h1 { font-size: 1.4rem; }
  button { font: inherit; padding: .6rem 1.2rem; border-radius: .4rem; border: 0; background: #1c5bd8; color: #fff; cursor: pointer; }
  button:disabled { opacity: .6; cursor: default; }
  #result { margin-top: 1rem; font-weight: 600; }
</style>
</head>
<body>
<h1>${page.heading}</h1>
<p>${page.intro}</p>
<button id="go" type="button">${page.button}</button>
<p id="result" role="status"></p>
<script nonce="${nonce}">
  const token = new URLSearchParams(location.search).get("token");
  const button = document.getElementById("go");
  const result = document.getElementById("result");
  if (!token) { button.disabled = true; result.textContent = "This link is incomplete. Open the link from your email again."; }
  button.addEventListener("click", async () => {
    button.disabled = true;
    result.textContent = "One moment...";
    try {
      const response = await fetch(${JSON.stringify(page.api)}, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = await response.json().catch(() => ({}));
      result.textContent = body.message || "Something went wrong. Please try again.";
      if (!response.ok) button.disabled = false;
    } catch {
      result.textContent = "Could not reach the server. Please try again.";
      button.disabled = false;
    }
  });
</script>
</body>
</html>`;
}

for (const [name, page] of Object.entries(PAGES)) {
  router.get(`/${name}`, alertReadLimiter, (req, res) => {
    const nonce = randomBytes(16).toString("base64");
    res.set({
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy":
        `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
    });
    res.send(renderPage(page, nonce));
  });
}

export default router;
