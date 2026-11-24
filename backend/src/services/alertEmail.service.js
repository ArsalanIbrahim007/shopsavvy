// alertEmail.service.js — the price-alert emails as HTML (2026-11-24): a white card with the ShopSavvy header, the product and the
// prices in a highlighted box, one big button, and the way out in small print. Every style is inline and the layout is tables,
// which is what Gmail, Outlook and phone mail apps all render alike. The plain-text version goes with each (notification.service.js).

const BRAND = "#2457d6";
const AMBER = "#f5a524";
const INK = "#111827";
const SOFT = "#4b5563";
const LINE = "#e5e7eb";
const GOOD = "#0e7c4a";
const CANVAS = "#f4f5f8";

// How a store is named in an email (the frontend's lib/platforms.js names them the same way)
const STORE_NAMES = {
  priceoye: "PriceOye", mega: "Mega.pk", shophive: "Shophive", ishopping: "iShopping", mistore: "Mi Store", mymart: "MyMart",
  alfatah: "Al-Fatah", xcessorieshub: "XcessoriesHub", eezepc: "eezepc", ledshop: "LEDshop.pk", techroid: "Techroid",
  subhanelectronics: "Subhan Electronics", jalalelectronics: "Jalal Electronics", japanelectronics: "Japan Electronics",
  zerolifestyle: "Zero Lifestyle", audionic: "Audionic", ronin: "Ronin", baseus: "Baseus", infinix: "Infinix.pk", alfamall: "AlfaMall",
  digimall: "DigiMall",
};
export const storeName = (platform) => STORE_NAMES[String(platform ?? "").toLowerCase()] ?? (platform ? String(platform) : null);

/** "451000" -> "PKR 451,000" */
export function pkr(value) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? `PKR ${n.toLocaleString("en-US")}` : "PKR —";
}

/** Text made safe to put inside HTML. */
export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

/** Only http(s) addresses become links. */
const safeUrl = (url) => (/^https?:\/\/[^\s"'<>]+$/i.test(String(url ?? "")) ? String(url) : null);

function button(label, url, colour = BRAND, text = "#ffffff") {
  const href = safeUrl(url);
  if (!href) return "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 8px;"><tr><td style="border-radius:10px;background:${colour};">
<a href="${escapeHtml(href)}" style="display:inline-block;padding:14px 28px;font:600 16px/1 Arial,Helvetica,sans-serif;color:${text};text-decoration:none;border-radius:10px;">${escapeHtml(label)}</a>
</td></tr></table>`;
}

/** The frame every alert email shares: header, card, footer. `preheader` is the line mail apps show beside the subject. */
function layout({ preheader, title, body, footer }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:${CANVAS};">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CANVAS};"><tr><td align="center" style="padding:32px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr><td style="padding:0 4px 16px;font:700 22px/1 Arial,Helvetica,sans-serif;color:${INK};">
<span style="display:inline-block;width:28px;height:28px;border-radius:8px;background:${INK};color:${AMBER};text-align:center;font:700 15px/28px Arial,sans-serif;vertical-align:middle;">&#127991;</span>
<span style="vertical-align:middle;padding-left:8px;">Shop<span style="color:${SOFT};">Savvy</span></span>
</td></tr>
<tr><td style="background:#ffffff;border:1px solid ${LINE};border-radius:16px;padding:32px 28px;font:16px/1.55 Arial,Helvetica,sans-serif;color:${INK};">
${body}
</td></tr>
<tr><td style="padding:18px 8px 0;font:12px/1.6 Arial,Helvetica,sans-serif;color:#6b7280;text-align:center;">
${footer}<br>ShopSavvy compares prices across Pakistani stores for free. We don't take money from stores.
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

/** A highlighted box of label / value rows (the product, the prices). */
function factBox(rows) {
  const cells = rows
    .map(([label, value, colour = INK]) => `<tr><td style="padding:6px 0;font:14px Arial,Helvetica,sans-serif;color:${SOFT};">${escapeHtml(label)}</td>
<td align="right" style="padding:6px 0;font:700 15px Arial,Helvetica,sans-serif;color:${colour};">${escapeHtml(value)}</td></tr>`)
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 4px;background:#f8fafc;border:1px solid ${LINE};border-radius:12px;">
<tr><td style="padding:14px 18px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${cells}</table></td></tr></table>`;
}

/** The email that asks the address's owner to confirm an alert. */
export function confirmationEmail(alert, { confirmUrl, cancelUrl }) {
  const body = `<h1 style="margin:0 0 8px;font:700 24px/1.25 Arial,Helvetica,sans-serif;color:${INK};">Confirm your price alert</h1>
<p style="margin:0;color:${SOFT};">One click and we'll email you the moment this price drops. Nothing is sent until you confirm.</p>
${factBox([["Product", alert.title], ["Tell me at or below", pkr(alert.targetPrice), GOOD]])}
${button("Confirm my alert", confirmUrl)}
<p style="margin:12px 0 0;font-size:13px;color:#6b7280;">Didn't ask for this? Ignore this email, or <a href="${escapeHtml(safeUrl(cancelUrl) ?? "#")}" style="color:${SOFT};">cancel the alert</a>.</p>`;
  return layout({
    preheader: `Confirm to be told when ${alert.title} drops to ${pkr(alert.targetPrice)}.`,
    title: "Confirm your ShopSavvy price alert",
    body,
    footer: "You are getting this because someone entered this address for a price alert on ShopSavvy.",
  });
}

/** The email that says an alert's price was reached. */
export function reachedEmail(alert, listing, { cancelUrl } = {}) {
  const saved = Number(alert.targetPrice) - Number(listing.price);
  const store = storeName(listing.platform);
  const rows = [["Product", alert.title], ["Price now", pkr(listing.price), GOOD], ["Your target", pkr(alert.targetPrice)]];
  if (store) rows.splice(2, 0, ["At", store]);
  const body = `<p style="margin:0 0 6px;font:700 13px Arial,Helvetica,sans-serif;color:${GOOD};letter-spacing:.02em;">PRICE ALERT REACHED</p>
<h1 style="margin:0 0 8px;font:700 24px/1.25 Arial,Helvetica,sans-serif;color:${INK};">It's down to ${escapeHtml(pkr(listing.price))}</h1>
<p style="margin:0;color:${SOFT};">${escapeHtml(alert.title)} is now at or below the price you asked for${saved > 0 ? `, ${escapeHtml(pkr(saved))} under your target` : ""}.</p>
${factBox(rows)}
${button("View deal", listing.productUrl, AMBER, INK)}
<p style="margin:12px 0 0;font-size:13px;color:#6b7280;">Prices change quickly: check it on the store's page before you buy.</p>`;
  return layout({
    preheader: `${alert.title} is now ${pkr(listing.price)}.`,
    title: "Your ShopSavvy price alert was reached",
    body,
    footer: safeUrl(cancelUrl) ? `<a href="${escapeHtml(cancelUrl)}" style="color:#6b7280;">Stop alerts like this</a>` : "",
  });
}
