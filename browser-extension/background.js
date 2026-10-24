/**
 * ShopSavvy Background Service Worker
 * Receives product detection messages from content script,
 * caches the current product, and responds to popup queries.
 */

// In-memory cache keyed by tabId
const tabProducts = new Map();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  if (message.type === 'PRODUCT_DETECTED') {
    if (tabId !== undefined) {
      tabProducts.set(tabId, {
        store: message.store,
        name: message.name,
        price: message.price,
        url: message.url,
        detectedAt: Date.now(),
      });
      // Update badge so user sees the extension is active
      chrome.action.setBadgeText({ text: '✓', tabId });
      chrome.action.setBadgeBackgroundColor({ color: '#10b981', tabId }); // green
    }
    sendResponse({ ok: true });
  }

  if (message.type === 'PAGE_TYPE' && !message.isProduct) {
    if (tabId !== undefined) {
      tabProducts.delete(tabId);
      chrome.action.setBadgeText({ text: '', tabId });
    }
    sendResponse({ ok: true });
  }

  // Popup asks: what product is on the current tab?
  if (message.type === 'GET_PRODUCT') {
    const product = tabProducts.get(message.tabId) ?? null;
    sendResponse({ product });
  }

  return true; // keep channel open for async sendResponse
});

// Clean up when tab closes
chrome.tabs.onRemoved.addListener((tabId) => {
  tabProducts.delete(tabId);
});
