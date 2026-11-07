// content.js — runs on the stores' pages: reads the product (reader.js), asks the service worker which product it is, and shows
// a small panel when another store sells it, cheaper or not.
//
// The panel lives in a closed shadow DOM, so the store's styles cannot change it and its styles cannot change the store's page.
// Everything from the API is written with textContent, and links are only http(s) (format.js safeLink).

(function () {
  "use strict";

  const { readProduct } = globalThis.ShopSavvyReader;
  const { storeName, storeOfHost } = globalThis.ShopSavvyStores;
  const { safeLink, summary } = globalThis.ShopSavvyFormat;

  let host = null; // the panel's host element, one per page
  let dismissedFor = null; // the address the shopper closed the panel on

  const STYLE = `
    :host { all: initial; }
    .panel { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; width: 300px; max-width: calc(100vw - 32px);
      font: 14px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; color: #10233f; background: #fff;
      border: 1px solid #d5dce6; border-radius: 12px; box-shadow: 0 8px 28px rgba(16, 35, 63, .18); overflow: hidden; }
    .top { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: #1a3c6e; color: #fff; }
    .brand { font-weight: 700; letter-spacing: .2px; }
    .close { all: unset; cursor: pointer; font-size: 18px; line-height: 1; padding: 0 4px; color: #fff; }
    .close:focus-visible, a:focus-visible { outline: 2px solid #feae2c; outline-offset: 2px; }
    .body { padding: 12px; display: grid; gap: 8px; }
    .headline { font-weight: 700; font-size: 15px; }
    .save .headline { color: #b45309; }
    .best .headline { color: #047857; }
    ul { margin: 0; padding-left: 18px; color: #3d4f66; font-size: 13px; }
    .links { display: flex; gap: 8px; flex-wrap: wrap; }
    a { display: inline-block; padding: 6px 10px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 13px; }
    a.primary { background: #feae2c; color: #10233f; }
    a.ghost { border: 1px solid #d5dce6; color: #1a3c6e; }
  `;

  function el(tag, attrs = {}, text) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function removePanel() {
    host?.remove();
    host = null;
  }

  function showPanel(result) {
    removePanel();
    if (dismissedFor === location.href) return;
    const { tone, headline, lines } = summary(result, storeName);

    host = el("div", { "data-shopsavvy": "" });
    const root = host.attachShadow({ mode: "closed" });
    root.append(el("style", {}, STYLE));
    const panel = el("section", { class: `panel ${tone}`, role: "complementary", "aria-label": "ShopSavvy price comparison" });
    const top = el("div", { class: "top" });
    top.append(el("span", { class: "brand" }, "ShopSavvy"));
    const close = el("button", { class: "close", type: "button", "aria-label": "Close" }, "×");
    close.addEventListener("click", () => {
      dismissedFor = location.href;
      removePanel();
    });
    top.append(close);

    const body = el("div", { class: "body" });
    body.append(el("div", { class: "headline" }, headline));
    if (lines.length) {
      const list = el("ul");
      for (const line of lines) list.append(el("li", {}, line));
      body.append(list);
    }
    const links = el("div", { class: "links" });
    const deal = result.cheapest?.cheaperThanThisPage ? safeLink(result.cheapest.url) : null;
    if (deal) links.append(el("a", { class: "primary", href: deal, target: "_blank", rel: "noopener noreferrer" }, `Go to ${storeName(result.cheapest.platform)}`));
    const compare = safeLink(result.productUrl);
    if (compare) links.append(el("a", { class: "ghost", href: compare, target: "_blank", rel: "noopener noreferrer" }, `Compare ${(result.offers?.length ?? 0) + 1} offers`));
    body.append(links);

    panel.append(top, body);
    root.append(panel);
    document.documentElement.append(host);
  }

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function check() {
    if (!storeOfHost(location.hostname)) return;
    let product = readProduct(document, location.href);
    // Some stores draw the price with JavaScript after the page has loaded (Daraz): without it the API cannot place a page it does
    // not store, so look again for a few seconds first.
    for (let tries = 0; product && !product.price && tries < 4; tries += 1) {
      await wait(1500);
      product = readProduct(document, location.href) ?? product;
    }
    if (!product) {
      removePanel();
      chrome.runtime.sendMessage({ type: "CLEAR" });
      return;
    }
    const answer = await chrome.runtime.sendMessage({ type: "MATCH", product }).catch(() => null);
    const result = answer?.result;
    const { showPanel: wanted } = await chrome.storage.sync.get("showPanel");
    if (result?.found && result.offers?.length && wanted !== false) showPanel(result);
    else removePanel();
  }

  // Stores that change pages without reloading (Daraz, some Shopify themes): look again when the address changes.
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    setTimeout(check, 800); // let the new page draw its product first
  }, 1000);

  check();
})();
