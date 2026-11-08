// content.js — runs on the stores' pages: reads the product (reader.js), asks the service worker which product it is, and shows
// a small panel when another store sells it, cheaper or not.
//
// The panel lives in a closed shadow DOM, so the store's styles cannot change it and its styles cannot change the store's page.
// Everything from the API is written with textContent, and links are only http(s) (format.js safeLink).

(function () {
  "use strict";

  const { readProduct, readLookup } = globalThis.ShopSavvyReader;
  const { lookupSiteOf, storeName, storeOfHost } = globalThis.ShopSavvyStores;
  const { lookupSummary, safeLink, summary } = globalThis.ShopSavvyFormat;

  let host = null; // the panel's host element, one per page
  let dismissedFor = null; // the address the shopper closed the panel on

  // The site's dark theme ("Ink & amber", frontend/src/styles/tokens.css): ink panel, off-white text, amber for the main action.
  const STYLE = `
    :host { all: initial; }
    .panel { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; width: 304px; max-width: calc(100vw - 32px);
      font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; color: #eef0f5; background: #12151d;
      border: 1px solid #262a36; border-radius: 14px; box-shadow: 0 16px 40px rgba(0, 0, 0, .45); overflow: hidden;
      animation: rise .42s cubic-bezier(.22, 1, .36, 1) both; }
    @keyframes rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
    @media (prefers-reduced-motion: reduce) { .panel { animation: none; } }
    .top { display: flex; align-items: center; justify-content: space-between; padding: 9px 12px; background: #0b0d14; border-bottom: 1px solid #262a36; }
    .brand { display: inline-flex; align-items: center; gap: 8px; font-weight: 600; letter-spacing: -.02em; }
    .brand svg { width: 20px; height: 20px; }
    .close { all: unset; cursor: pointer; font-size: 18px; line-height: 1; padding: 0 4px; color: #878fa2; }
    .close:hover { color: #eef0f5; }
    .close:focus-visible, a:focus-visible { outline: 2px solid #feae2c; outline-offset: 2px; }
    .body { padding: 12px; display: grid; gap: 10px; }
    .headline { font-weight: 600; font-size: 15px; font-family: ui-monospace, "Cascadia Mono", Menlo, Consolas, monospace; letter-spacing: -.02em; }
    .save .headline { color: #ffa56e; }
    .best .headline { color: #5ed39c; }
    ul { margin: 0; padding-left: 18px; color: #a6acba; font-size: 13px; }
    .links { display: flex; gap: 8px; flex-wrap: wrap; }
    a { display: inline-block; padding: 7px 11px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 13px; }
    a.primary { background: #feae2c; color: #111827; }
    a.ghost { border: 1px solid #262a36; color: #eef0f5; }
    a.ghost:hover { border-color: #4d5466; }
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
    const { tone, headline, lines } = result.lookup ? lookupSummary(result, storeName) : summary(result, storeName);

    host = el("div", { "data-shopsavvy": "" });
    const root = host.attachShadow({ mode: "closed" });
    root.append(el("style", {}, STYLE));
    const panel = el("section", { class: `panel ${tone}`, role: "complementary", "aria-label": "ShopSavvy price comparison" });
    const top = el("div", { class: "top" });
    const brand = el("span", { class: "brand" });
    // the logo: an amber price tag on an ink tile (frontend/src/components/Logo.jsx), built as SVG nodes, never as markup text
    const svgNs = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNs, "svg");
    svg.setAttribute("viewBox", "0 0 32 32");
    svg.setAttribute("aria-hidden", "true");
    for (const [tag, attrs] of [
      ["rect", { x: "0.5", y: "0.5", width: "31", height: "31", rx: "8.5", fill: "#1b1f2a", stroke: "#2e3443" }],
      ["path", { d: "M8 9.6C8 8.7 8.7 8 9.6 8h6.3c.5 0 .9.2 1.2.5l7.6 7.6c.6.6.6 1.7 0 2.3l-6.1 6.1c-.6.6-1.7.6-2.3 0l-7.6-7.6c-.3-.3-.5-.7-.5-1.2z", fill: "#feae2c" }],
      ["circle", { cx: "12.4", cy: "12.4", r: "1.7", fill: "#1b1f2a" }],
    ]) {
      const node = document.createElementNS(svgNs, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
      svg.append(node);
    }
    brand.append(svg, document.createTextNode("ShopSavvy"));
    top.append(brand);
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
    const offerCount = (result.offers?.length ?? 0) + (result.lookup ? 0 : 1); // a looked-up page is not one of the offers
    if (compare) links.append(el("a", { class: result.lookup ? "primary" : "ghost", href: compare, target: "_blank", rel: "noopener noreferrer" }, result.lookup ? `See ${offerCount} offers in Pakistan` : `Compare ${offerCount} offers`));
    body.append(links);

    panel.append(top, body);
    root.append(panel);
    document.documentElement.append(host);
  }

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function check() {
    const abroad = lookupSiteOf(location.hostname);
    if (!storeOfHost(location.hostname) && !abroad) return;
    const read = () => (abroad ? readLookup(document, location.href) : readProduct(document, location.href));
    let product = read();
    // Some stores draw the whole page with JavaScript after it has loaded (AlfaMall, DigiMall), or only the price (Daraz): without
    // them the API cannot place a page it does not store, so look again for a few seconds first.
    for (let tries = 0; (!product || (!abroad && !product.price)) && tries < 5; tries += 1) {
      await wait(1500);
      product = read() ?? product;
    }
    if (!product) {
      removePanel();
      chrome.runtime.sendMessage({ type: "CLEAR" });
      return;
    }
    const answer = await chrome.runtime.sendMessage({ type: abroad ? "LOOKUP" : "MATCH", product }).catch(() => null);
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
