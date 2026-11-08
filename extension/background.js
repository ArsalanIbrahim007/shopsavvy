// background.js — the extension's service worker: asks the ShopSavvy API which product a store page is, and shows the answer on
// the toolbar badge.
//
// The content script reads {url, title, price} from the page (reader.js) and sends it here. Calls go from here, not from the
// page: an extension page with a host permission for the API is not held back by CORS, the store's page is.
// A Manifest V3 service worker is stopped when idle and loses its variables, so each tab's answer is kept in
// chrome.storage.session, where the popup reads it.

importScripts("format.js"); // ShopSavvyFormat.badgeSaving

// The deployed API (deploy/README.md); the popup's settings can point it at a local one (http://localhost:5000) for development.
const DEFAULT_API = "https://shopsavvy-api.duckdns.org";
const BADGE = { save: "#d97706", best: "#059669" };

async function apiBase() {
  const { apiBase: saved } = await chrome.storage.sync.get("apiBase");
  return String(saved || DEFAULT_API).replace(/\/+$/, "");
}

// The website the answers link to: the deployed one, or the local one beside a local API (the Vite dev server's port).
async function siteBase() {
  const base = await apiBase();
  return /\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base) ? base.replace(/:\d+$/, ":5173") : "https://shopsavvy.pages.dev";
}

/**
 * A shop abroad (Amazon): its price is in another currency, so the product's NAME is searched for, and the closest product's offers
 * in Pakistan come back in the shape of a /match answer (found, offers, cheapest, productUrl), marked lookup: true.
 */
async function lookup(product) {
  const base = await apiBase();
  const site = await siteBase();
  const query = ShopSavvyFormat.lookupQuery(product.title);
  const searchUrl = `${site}/results?q=${encodeURIComponent(query)}`;
  if (!query) return { found: false, lookup: true, searchUrl };
  try {
    const res = await fetch(`${base}/api/listings/search?q=${encodeURIComponent(query)}`, { signal: AbortSignal.timeout(20000) });
    if (res.status === 429) return { error: "busy" };
    if (!res.ok) return { error: "failed", status: res.status };
    const body = await res.json();
    // A search that only found names spelt nearly the same is not this product.
    const group = body.matchedBy === "spelling" ? null : body.groups?.[0];
    const offers = (group?.offers ?? [])
      .filter((o) => o.price > 0)
      .sort((a, b) => a.price - b.price)
      .map((o) => ({ id: o._id, platform: o.platform, price: o.price, url: o.productUrl || o.sourceUrl, condition: o.condition || "new", inStock: o.inStock !== false }));
    if (offers.length === 0) return { found: false, lookup: true, reason: "not_stored", searchUrl };
    const cheapest = offers.find((o) => o.condition === "new") ?? offers[0];
    return {
      found: true, lookup: true, query, productName: group.productName, offers,
      cheapest: { ...cheapest, cheaperThanThisPage: false },
      productUrl: `${site}/product/${cheapest.id}`, searchUrl,
    };
  } catch {
    return { error: "offline", base };
  }
}

async function match(product) {
  const base = await apiBase();
  const params = new URLSearchParams({ url: product.url });
  if (product.title) params.set("title", product.title);
  if (product.price) params.set("price", String(product.price));
  try {
    const res = await fetch(`${base}/api/listings/match?${params}`, { signal: AbortSignal.timeout(20000) });
    if (res.status === 429) return { error: "busy" };
    if (!res.ok) return { error: "failed", status: res.status };
    return await res.json();
  } catch {
    return { error: "offline", base };
  }
}

function setBadge(tabId, result) {
  let text = "";
  let color = BADGE.best;
  if (result?.found && result.cheapest?.cheaperThanThisPage) {
    text = ShopSavvyFormat.badgeSaving(result.cheapest.saving);
    color = BADGE.save;
  } else if (result?.found && result.lookup) {
    text = "PK";
  } else if (result?.found && result.offers?.length) {
    text = "✓";
  }
  chrome.action.setBadgeText({ tabId, text });
  if (text) chrome.action.setBadgeBackgroundColor({ tabId, color });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;
  if (tabId === undefined) return false;

  if (message.type === "CLEAR") {
    chrome.storage.session.remove(`tab:${tabId}`);
    chrome.action.setBadgeText({ tabId, text: "" });
    return false;
  }

  if (message.type === "MATCH" || message.type === "LOOKUP") {
    chrome.storage.session.set({ [`tab:${tabId}`]: { product: message.product, result: null, at: Date.now() } });
    (message.type === "LOOKUP" ? lookup(message.product) : match(message.product)).then(async (result) => {
      await chrome.storage.session.set({ [`tab:${tabId}`]: { product: message.product, result, at: Date.now() } });
      setBadge(tabId, result);
      sendResponse({ result });
    });
    return true; // answered later, once the API has
  }
  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => chrome.storage.session.remove(`tab:${tabId}`));
