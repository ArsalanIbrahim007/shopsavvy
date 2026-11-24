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
  /* the same look as the alert emails (alertEmail.service.js), 2026-11-24 */
  body { margin: 0; min-height: 100vh; background: #f4f5f8; font-family: system-ui, -apple-system, "Segoe UI", Arial, sans-serif; color: #111827; line-height: 1.55; }
  main { max-width: 30rem; margin: 0 auto; padding: 12vh 1rem 2rem; }
  .brand { display: flex; align-items: center; gap: .55rem; font-weight: 700; font-size: 1.3rem; margin: 0 0 1rem .25rem; color: #111827; }
  .brand__tile { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 8px; background: #111827; color: #f5a524; font-size: 1rem; }
  .brand__soft { color: #4b5563; }
  .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 16px; padding: 2rem 1.75rem; box-shadow: 0 8px 24px rgba(17, 24, 39, .06); }
  h1 { font-size: 1.5rem; line-height: 1.25; margin: 0 0 .5rem; }
  p { margin: 0; color: #4b5563; }
  button { margin-top: 1.5rem; font: 600 1rem/1 inherit; padding: .9rem 1.6rem; border-radius: 10px; border: 0; background: #2457d6; color: #fff; cursor: pointer; }
  button:hover { background: #1c47b3; }
  button:disabled { opacity: .55; cursor: default; }
  #result { margin-top: 1rem; font-weight: 600; color: #111827; }
  #result:empty { display: none; }
  .foot { margin-top: 1rem; text-align: center; font-size: .8rem; color: #6b7280; }
  .foot a { color: #4b5563; }
</style>
</head>
<body>
<main>
<p class="brand"><span class="brand__tile" aria-hidden="true">&#127991;</span><span>Shop<span class="brand__soft">Savvy</span></span></p>
<div class="card">
<h1>${page.heading}</h1>
<p>${page.intro}</p>
<button id="go" type="button">${page.button}</button>
<p id="result" role="status"></p>
</div>
<p class="foot"><a href="https://shopsavvy.pages.dev">Back to ShopSavvy</a></p>
</main>
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
