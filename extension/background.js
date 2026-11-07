// background.js — the extension's service worker: asks the ShopSavvy API which product a store page is, and shows the answer on
// the toolbar badge.
//
// The content script reads {url, title, price} from the page (reader.js) and sends it here. Calls go from here, not from the
// page: an extension page with a host permission for the API is not held back by CORS, the store's page is.
// A Manifest V3 service worker is stopped when idle and loses its variables, so each tab's answer is kept in
// chrome.storage.session, where the popup reads it.

importScripts("format.js"); // ShopSavvyFormat.badgeSaving

const DEFAULT_API = "http://localhost:5000";
const BADGE = { save: "#d97706", best: "#059669" };

async function apiBase() {
  const { apiBase: saved } = await chrome.storage.sync.get("apiBase");
  return String(saved || DEFAULT_API).replace(/\/+$/, "");
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

  if (message.type === "MATCH") {
    chrome.storage.session.set({ [`tab:${tabId}`]: { product: message.product, result: null, at: Date.now() } });
    match(message.product).then(async (result) => {
      await chrome.storage.session.set({ [`tab:${tabId}`]: { product: message.product, result, at: Date.now() } });
      setBadge(tabId, result);
      sendResponse({ result });
    });
    return true; // answered later, once the API has
  }
  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => chrome.storage.session.remove(`tab:${tabId}`));
