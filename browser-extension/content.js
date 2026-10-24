/**
 * ShopSavvy Content Script
 * Detects product pages on iShopping, Paklap, and Telemart.
 * Extracts product name + price, posts to background service worker.
 */

(function () {
  'use strict';

  // ── Store detectors ──────────────────────────────────────────────────────────

  const DETECTORS = {
    'ishopping.pk': {
      isProductPage() {
        // iShopping product URLs: /product/<slug> or /products/<slug>
        return /\/products?\/[^/]+/.test(location.pathname);
      },
      extract() {
        const name =
          document.querySelector('h1.product-title, h1.product_title, h1')?.innerText?.trim() ?? null;
        const priceEl = document.querySelector(
          '.price .amount, .woocommerce-Price-amount, .product-price .price, [class*="product-price"]'
        );
        const price = priceEl?.innerText?.replace(/[^\d.]/g, '') ?? null;
        return { name, price };
      },
    },

    'paklap.pk': {
      isProductPage() {
        // Paklap product URLs: /product/<slug>
        return /\/product\/[^/]+/.test(location.pathname);
      },
      extract() {
        const name =
          document.querySelector('h1.product_title, h1.entry-title, h1')?.innerText?.trim() ?? null;
        const priceEl = document.querySelector(
          '.woocommerce-Price-amount, .price ins .amount, .price .amount'
        );
        const price = priceEl?.innerText?.replace(/[^\d.]/g, '') ?? null;
        return { name, price };
      },
    },

    'telemart.pk': {
      isProductPage() {
        // Telemart product URLs: /products/<slug> (Shopify)
        return /\/products\/[^/]+/.test(location.pathname);
      },
      extract() {
        // Telemart is Shopify-based — JSON data is reliable
        const jsonEl = document.querySelector('[data-product-json], #product-json');
        if (jsonEl) {
          try {
            const data = JSON.parse(jsonEl.textContent);
            return {
              name: data.title ?? null,
              price: data.price ? String(data.price / 100) : null, // Shopify stores paise
            };
          } catch (_) { /* fall through to DOM */ }
        }
        const name =
          document.querySelector('h1.product__title, h1.product-title, h1')?.innerText?.trim() ?? null;
        const priceEl = document.querySelector(
          '.product__price .price-item--regular, .price__regular .price-item, [class*="product-price"]'
        );
        const price = priceEl?.innerText?.replace(/[^\d.]/g, '') ?? null;
        return { name, price };
      },
    },
  };

  // ── Detection entry point ────────────────────────────────────────────────────

  function detectAndReport() {
    const hostname = location.hostname.replace(/^www\./, '');
    const detector = DETECTORS[hostname];

    if (!detector) return; // not a supported store

    if (!detector.isProductPage()) {
      // Browsing category/search page — clear any cached badge
      chrome.runtime.sendMessage({ type: 'PAGE_TYPE', isProduct: false });
      return;
    }

    const { name, price } = detector.extract();

    chrome.runtime.sendMessage({
      type: 'PRODUCT_DETECTED',
      store: hostname,
      name,
      price,
      url: location.href,
    });
  }

  // Run on initial load + SPA navigation
  detectAndReport();

  // Handle SPA route changes (Shopify/Vue/React stores)
  let lastUrl = location.href;
  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(detectAndReport, 500); // brief wait for DOM to settle
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
