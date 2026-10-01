// safeLink.js — store links come from scraped pages, which are untrusted. Only
// plain web addresses are ever opened or rendered as a link; anything else
// (javascript:, data:, file:, a malformed string) becomes null and the caller
// shows the button as unavailable.

/** @returns {string|null} the URL if it is http(s), otherwise null */
export function safeExternalUrl(value) {
  if (typeof value !== "string" || value.trim() === "") return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** A store link for an offer: its product page, falling back to the source URL. */
export function offerLink(offer) {
  return safeExternalUrl(offer?.productUrl) || safeExternalUrl(offer?.sourceUrl);
}

/** Opens a store link in a new tab without giving the store access to this page. */
export function openStoreLink(offer) {
  const url = offerLink(offer);
  if (url) window.open(url, "_blank", "noopener,noreferrer");
  return Boolean(url);
}
