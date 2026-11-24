// content.js — runs on the stores' pages: reads the product (reader.js), asks the service worker which product it is, and shows
// a small panel when another store sells it, cheaper or not.
//
// The panel lives in a closed shadow DOM, so the store's styles cannot change it and its styles cannot change the store's page.
// Everything from the API is written with textContent, and links are only http(s) (format.js safeLink).
//
// Redesigned 2026-11-24, in the site's light look (dark when the computer is): the saving as the big figure, the cheapest stores
// with this page among them, the checks as marked notes, and a "minimise" that folds the panel into a small tag.

(function () {
  "use strict";

  const { readProduct, readLookup } = globalThis.ShopSavvyReader;
  const { lookupSiteOf, storeName, storeOfHost } = globalThis.ShopSavvyStores;
  const { hero, lookupSummary, noteKind, rupees, safeLink, storeRows, summary } = globalThis.ShopSavvyFormat;

  let host = null; // the panel's host element, one per page
  let dismissedFor = null; // the address the shopper closed the panel on
  let foldedFor = null; // the address the shopper minimised the panel on
  const ROWS = 3; // other stores listed in the panel; the comparison page has them all

  // The site's tokens (frontend/src/styles/tokens.css, "Ink & amber"): white card and ink text, amber for the main action.
  const STYLE = `
    :host { all: initial; }
    .panel, .pill {
      --paper: #ffffff; --canvas: #f5f7fa; --line: #e5e7eb; --ink: #111827; --soft: #4b5565; --faint: #6b7280;
      --accent: #feae2c; --on-accent: #111827; --accent-soft: #fdf4e3; --accent-ink: #8f5300;
      --save: #0f7b4a; --save-soft: #e7f6ee; --warn: #b42318; --warn-soft: #fdecea; --link: #2457d6;
      --mono: ui-monospace, "Cascadia Mono", "SFMono-Regular", Menlo, Consolas, monospace;
      position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
      font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--ink);
    }
    @media (prefers-color-scheme: dark) {
      .panel, .pill {
        --paper: #12151d; --canvas: #0b0d14; --line: #262a36; --ink: #eef0f5; --soft: #a6acba; --faint: #878fa2;
        --accent-soft: #2a2010; --accent-ink: #feae2c; --save: #5ed39c; --save-soft: #11271d; --warn: #ff8a80; --warn-soft: #2d1515; --link: #8fb3ff;
      }
    }
    .panel { width: 320px; max-width: calc(100vw - 32px); background: var(--paper); border: 1px solid var(--line); border-radius: 16px;
      box-shadow: 0 18px 48px rgba(17, 24, 39, .18), 0 2px 6px rgba(17, 24, 39, .06); overflow: hidden;
      animation: rise .42s cubic-bezier(.22, 1, .36, 1) both; }
    @keyframes rise { from { opacity: 0; transform: translateY(12px) scale(.98); } to { opacity: 1; transform: none; } }
    @media (prefers-reduced-motion: reduce) { .panel, .pill { animation: none; } }

    .top { display: flex; align-items: center; gap: 8px; padding: 10px 10px 10px 14px; border-bottom: 1px solid var(--line); }
    .brand { display: inline-flex; align-items: center; gap: 8px; font-weight: 700; letter-spacing: -.02em; }
    .brand svg { width: 22px; height: 22px; }
    .brand small { font-weight: 500; color: var(--faint); font-size: 12px; letter-spacing: 0; }
    .icon { all: unset; cursor: pointer; display: grid; place-items: center; width: 28px; height: 28px; border-radius: 8px; color: var(--faint); font-size: 17px; line-height: 1; }
    .icon:first-of-type { margin-left: auto; }
    .icon:hover { background: var(--canvas); color: var(--ink); }
    .icon:focus-visible, a:focus-visible, .pill:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

    .hero { margin: 12px 12px 0; padding: 12px 14px; border-radius: 12px; background: var(--canvas); }
    .save .hero { background: var(--save-soft); }
    .best .hero { background: var(--save-soft); }
    .kicker { font-size: 12px; font-weight: 600; color: var(--soft); text-transform: uppercase; letter-spacing: .04em; }
    .big { font-size: 22px; font-weight: 750; letter-spacing: -.02em; line-height: 1.2; margin-top: 2px; }
    .save .big, .best .big { color: var(--save); }
    .sub { font-size: 13px; color: var(--soft); margin-top: 2px; }

    .rows { list-style: none; margin: 10px 12px 0; padding: 0; display: grid; gap: 2px; }
    .rows li { display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-radius: 9px; font-size: 13px; }
    .rows li:nth-child(odd) { background: var(--canvas); }
    .rows .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .rows a { color: var(--link); text-decoration: none; font-weight: 600; }
    .rows a:hover { text-decoration: underline; }
    .rows .price { font-family: var(--mono); font-weight: 600; letter-spacing: -.02em; }
    .rows .tag { font-size: 11px; font-weight: 600; padding: 1px 7px; border-radius: 999px; background: var(--accent-soft); color: var(--accent-ink); }
    .rows .here { font-weight: 600; }
    .rows .here .tag { background: var(--line); color: var(--soft); }
    .more { margin: 4px 12px 0; font-size: 12px; color: var(--faint); }

    .notes { list-style: none; margin: 10px 12px 0; padding: 0; display: grid; gap: 5px; }
    .notes li { display: flex; gap: 8px; align-items: flex-start; font-size: 12.5px; color: var(--soft); }
    .notes li::before { content: "i"; flex: none; display: grid; place-items: center; width: 17px; height: 17px; margin-top: 1px; border-radius: 50%;
      font: 700 11px/1 system-ui, sans-serif; background: var(--line); color: var(--soft); }
    .notes li.good::before { content: "✓"; background: var(--save-soft); color: var(--save); }
    .notes li.warn::before { content: "!"; background: var(--warn-soft); color: var(--warn); }

    .links { display: flex; gap: 8px; padding: 12px; }
    .links a { flex: 1; text-align: center; padding: 9px 10px; border-radius: 10px; text-decoration: none; font-weight: 650; font-size: 13px; }
    a.primary { background: var(--accent); color: var(--on-accent); }
    a.primary:hover { filter: brightness(.96); }
    a.ghost { border: 1px solid var(--line); color: var(--ink); }
    a.ghost:hover { background: var(--canvas); }

    .pill { all: unset; position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; cursor: pointer; display: inline-flex; align-items: center; gap: 8px;
      padding: 8px 14px 8px 9px; border-radius: 999px; background: var(--paper); border: 1px solid var(--line); color: var(--ink);
      font: 600 13px/1.2 system-ui, -apple-system, "Segoe UI", sans-serif; box-shadow: 0 10px 28px rgba(17, 24, 39, .18);
      animation: rise .3s cubic-bezier(.22, 1, .36, 1) both; }
    .pill svg { width: 22px; height: 22px; }
    .pill.save span, .pill.best span { color: var(--save); }
  `;

  function el(tag, attrs = {}, text) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (text !== undefined) node.textContent = text;
    return node;
  }
  const linkTo = (href, cls, text) => {
    const safe = safeLink(href);
    return safe ? el("a", { class: cls, href: safe, target: "_blank", rel: "noopener noreferrer" }, text) : null;
  };

  // the logo: an amber price tag on an ink tile (frontend/src/components/Logo.jsx), built as SVG nodes, never as markup text
  function logo() {
    const svgNs = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNs, "svg");
    svg.setAttribute("viewBox", "0 0 32 32");
    svg.setAttribute("aria-hidden", "true");
    for (const [tag, attrs] of [
      ["rect", { x: "0.5", y: "0.5", width: "31", height: "31", rx: "8.5", fill: "#111827", stroke: "#2e3443" }],
      ["path", { d: "M8 9.6C8 8.7 8.7 8 9.6 8h6.3c.5 0 .9.2 1.2.5l7.6 7.6c.6.6.6 1.7 0 2.3l-6.1 6.1c-.6.6-1.7.6-2.3 0l-7.6-7.6c-.3-.3-.5-.7-.5-1.2z", fill: "#feae2c" }],
      ["circle", { cx: "12.4", cy: "12.4", r: "1.7", fill: "#111827" }],
    ]) {
      const node = document.createElementNS(svgNs, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
      svg.append(node);
    }
    return svg;
  }

  function removePanel() {
    host?.remove();
    host = null;
  }

  /** The cheapest other stores, with this page placed among them by its price (not on a looked-up foreign page). */
  function priceRows(result, pagePrice) {
    const stores = storeRows(result.offers);
    const list = el("ol", { class: "rows", "aria-label": "Prices, cheapest first" });
    const rows = stores.slice(0, ROWS).map(({ offer, more }) => ({ offer, more }));
    if (!result.lookup && pagePrice > 0) rows.push({ here: true, price: pagePrice });
    rows.sort((a, b) => (a.here ? a.price : a.offer.price) - (b.here ? b.price : b.offer.price));
    rows.forEach((row, i) => {
      const li = el("li", { class: row.here ? "here" : "" });
      const name = el("span", { class: "name" });
      if (row.here) name.append("This page");
      else name.append(linkTo(row.offer.url, "", storeName(row.offer.platform)) ?? storeName(row.offer.platform));
      li.append(name);
      if (i === 0 && rows.length > 1) li.append(el("span", { class: "tag" }, "Cheapest"));
      else if (!row.here && row.more) li.append(el("span", { class: "tag" }, `+${row.more} sellers`));
      li.append(el("span", { class: "price" }, rupees(row.here ? row.price : row.offer.price)));
      list.append(li);
    });
    return { list, hidden: Math.max(0, stores.length - ROWS) };
  }

  function showPill(result, pagePrice) {
    const top = hero(result, storeName);
    const pill = el("button", { class: `pill ${top.tone}`, type: "button", "aria-label": `ShopSavvy: ${top.pill}. Open the price comparison` });
    pill.append(logo(), el("span", {}, top.pill));
    pill.addEventListener("click", () => {
      foldedFor = null;
      showPanel(result, pagePrice);
    });
    return pill;
  }

  function showPanel(result, pagePrice) {
    removePanel();
    if (dismissedFor === location.href) return;

    host = el("div", { "data-shopsavvy": "" });
    const root = host.attachShadow({ mode: "closed" });
    root.append(el("style", {}, STYLE));
    document.documentElement.append(host);
    if (foldedFor === location.href) {
      root.append(showPill(result, pagePrice));
      return;
    }

    const top = hero(result, storeName);
    const { lines } = result.lookup ? lookupSummary(result, storeName) : summary(result, storeName);
    const panel = el("section", { class: `panel ${top.tone}`, role: "complementary", "aria-label": "ShopSavvy price comparison" });

    const bar = el("div", { class: "top" });
    const brand = el("span", { class: "brand" });
    brand.append(logo(), "ShopSavvy", el("small", {}, "price check"));
    const fold = el("button", { class: "icon", type: "button", "aria-label": "Minimise", title: "Minimise" }, "–");
    fold.addEventListener("click", () => {
      foldedFor = location.href;
      showPanel(result, pagePrice);
    });
    const close = el("button", { class: "icon", type: "button", "aria-label": "Close", title: "Close on this page" }, "×");
    close.addEventListener("click", () => {
      dismissedFor = location.href;
      removePanel();
    });
    bar.append(brand, fold, close);

    const head = el("div", { class: "hero" });
    head.append(el("div", { class: "kicker" }, top.kicker), el("div", { class: "big" }, top.big), el("div", { class: "sub" }, top.sub));

    panel.append(bar, head);
    if (result.offers?.length) {
      const { list, hidden } = priceRows(result, pagePrice);
      panel.append(list);
      if (hidden) panel.append(el("p", { class: "more" }, `and ${hidden} more ${hidden === 1 ? "store" : "stores"} on the comparison page`));
    }
    if (lines.length) {
      const notes = el("ul", { class: "notes" });
      for (const line of lines) notes.append(el("li", { class: noteKind(line) }, line));
      panel.append(notes);
    }

    const links = el("div", { class: "links" });
    const deal = result.cheapest?.cheaperThanThisPage ? linkTo(result.cheapest.url, "primary", `Go to ${storeName(result.cheapest.platform)}`) : null;
    const offerCount = (result.offers?.length ?? 0) + (result.lookup ? 0 : 1); // a looked-up page is not one of the offers
    const compareText = result.lookup ? `See ${offerCount} offers` : offerCount > 1 ? "Compare all" : "Price history";
    const compare = linkTo(result.productUrl, deal ? "ghost" : "primary", compareText);
    if (deal) links.append(deal);
    if (compare) links.append(compare);
    if (links.childElementCount) panel.append(links);

    root.append(panel);
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
    // Also when no other store sells it: the shopper learns that, and what our checks say about this page's price.
    if (result?.found && wanted !== false && (result.offers?.length || !result.lookup)) showPanel(result, abroad ? null : product.price || result.listing?.price);
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
