// popup.js — the toolbar popup: what ShopSavvy knows about the product on this tab, and the settings.
//
// It reads the tab's answer that the service worker kept in chrome.storage.session (background.js), and redraws when that
// changes (the answer can arrive after the popup opens). Everything from the API is written with textContent.

(async function () {
  "use strict";

  const { lookupSiteOf, storeOfHost, storeName, STORES } = globalThis.ShopSavvyStores;
  const { hero, lookupSummary, noteKind, rupees, safeLink, storeRows, summary } = globalThis.ShopSavvyFormat;
  const app = document.getElementById("app");

  function el(tag, attrs = {}, text) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (text !== undefined) node.textContent = text;
    return node;
  }
  const link = (href, cls, text) => {
    const safe = safeLink(href);
    return safe ? el("a", { class: cls, href: safe, target: "_blank", rel: "noopener noreferrer" }, text) : null;
  };
  const show = (...nodes) => app.replaceChildren(...nodes.filter(Boolean));

  function render(tab, entry) {
    let host = null;
    try {
      host = new URL(tab?.url ?? "").hostname;
    } catch {
      // not a web page (a new tab, chrome://)
    }
    const abroad = host ? lookupSiteOf(host) : null;
    if (!host || (!storeOfHost(host) && !abroad)) {
      return show(
        el("h2", {}, "Open a product page"),
        el("p", { class: "muted" }, `ShopSavvy compares prices on ${Object.keys(STORES).length - 1} Pakistani stores, such as PriceOye, Mega.pk, Shophive, iShopping, Paklap and Daraz, and on Qeemat. On Amazon it finds the product in Pakistan.`),
      );
    }
    if (!entry) return show(el("h2", {}, "Not a product page"), el("p", { class: "muted" }, "Open a product's own page on this store to compare its price."));
    if (!entry.result) {
      const checking = el("div", { class: "checking" });
      checking.append(el("span", { class: "spinner", "aria-hidden": "true" }), el("span", {}, "Checking the other stores…"));
      return show(checking);
    }

    const { product, result } = entry;
    if (result.error === "offline") {
      return show(el("h2", {}, "Cannot reach ShopSavvy"), el("p", { class: "muted" }, `Nothing answered at ${result.base}. Is the server running? The address can be changed in Settings.`));
    }
    if (result.error) return show(el("h2", {}, "Something went wrong"), el("p", { class: "muted" }, result.error === "busy" ? "Too many requests just now: try again in a minute." : "The comparison could not be made."));

    const thisPage = el("div", { class: "this" });
    thisPage.append(el("div", { class: "title", title: product.title || "" }, product.title || "This page"));
    if (product.price && !abroad) {
      const where = el("div", { class: "where" });
      where.append(el("b", {}, rupees(product.price)), ` on this page at ${storeOfHost(host).name}`);
      thisPage.append(where);
    }
    if (abroad) thisPage.append(el("div", { class: "where" }, `On ${abroad}`));

    if (!result.found) {
      const why = result.reason === "no_match" ? "No other store sells this product, as far as we know." : "We do not know this product yet.";
      const actions = el("div", { class: "actions" });
      const search = link(result.searchUrl, "button ghost", "Search for it on ShopSavvy");
      if (search) actions.append(search);
      return show(thisPage, el("p", { class: "muted" }, why), actions);
    }

    const top = hero(result, storeName);
    const { lines } = result.lookup ? lookupSummary(result, storeName) : summary(result, storeName);
    const head = el("div", { class: top.tone });
    const box = el("div", { class: "hero" });
    box.append(el("div", { class: "kicker" }, top.kicker), el("div", { class: "big" }, top.big), el("div", { class: "sub" }, top.sub));
    head.append(box);

    const notes = el("ul", { class: "notes" });
    for (const line of lines) notes.append(el("li", { class: noteKind(line) }, line));

    // One row per store, at its lowest price (format.js storeRows), cheapest first.
    const stores = storeRows(result.offers);
    const offers = el("ol", { class: "offers", "aria-label": "Other stores, cheapest first" });
    stores.slice(0, 6).forEach(({ offer, more }, i) => {
      const li = el("li");
      const name = el("span", { class: "name" });
      name.append(link(offer.url, "", storeName(offer.platform)) ?? storeName(offer.platform));
      const flags = [offer.outOfDate && "old price", offer.unusualPrice && "unusual", offer.condition !== "new" && offer.condition, !offer.inStock && "out of stock", more && `+${more} sellers`].filter(Boolean);
      if (flags.length) name.append(el("span", { class: "flag" }, ` · ${flags.join(", ")}`));
      li.append(name);
      if (i === 0 && stores.length > 1) li.append(el("span", { class: "tag" }, "Cheapest"));
      li.append(el("span", { class: "price" }, rupees(offer.price)));
      offers.append(li);
    });

    const actions = el("div", { class: "actions" });
    const deal = result.cheapest?.cheaperThanThisPage ? link(result.cheapest.url, "button", `Go to ${storeName(result.cheapest.platform)}`) : null;
    const compare = link(result.productUrl, deal ? "button ghost" : "button", "Full comparison");
    for (const a of [deal, compare, result.lookup ? link(result.searchUrl, "button ghost", "Search") : null]) if (a) actions.append(a);

    show(
      thisPage,
      head,
      stores.length ? offers : null,
      stores.length > 6 ? el("p", { class: "muted" }, `and ${stores.length - 6} more stores`) : null,
      lines.length ? notes : null,
      actions,
    );
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const key = `tab:${tab?.id}`;
  render(tab, (await chrome.storage.session.get(key))[key]);
  chrome.storage.session.onChanged.addListener((changes) => {
    if (changes[key]) render(tab, changes[key].newValue);
  });

  // ---- settings ----------------------------------------------------------------------------------------------------------
  const form = document.getElementById("settings-form");
  const apiInput = document.getElementById("api");
  const panelInput = document.getElementById("panel");
  const status = document.getElementById("settings-status");
  const saved = await chrome.storage.sync.get(["apiBase", "showPanel"]);
  // a website address saved earlier is shown as the API address the extension really uses (background.js apiBase)
  apiInput.value = saved.apiBase && !/\.pages\.dev(\/|$)/i.test(saved.apiBase) ? saved.apiBase : "https://cranium-espresso-sway.ngrok-free.dev"; // background.js DEFAULT_API
  panelInput.checked = saved.showPanel !== false;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const base = safeLink(apiInput.value.trim());
    if (!base) {
      status.textContent = "Enter an address starting with http:// or https://";
      return;
    }
    let origin = new URL(base).origin;
    // The website's address is not the API's: saving it broke every page ("Cannot reach ShopSavvy", 2026-11-19).
    if (/(^|\.)pages\.dev$/i.test(new URL(base).hostname)) {
      origin = "https://cranium-espresso-sway.ngrok-free.dev"; // background.js DEFAULT_API
      apiInput.value = origin;
      await chrome.storage.sync.set({ apiBase: origin, showPanel: panelInput.checked });
      status.textContent = "That is the website's address; the extension needs the API's, so the API address was saved instead.";
      return;
    }
    // A new address needs the shopper's permission to be called (the manifest grants only the local server).
    const granted = await chrome.permissions.request({ origins: [`${origin}/*`] }).catch(() => false);
    if (!granted) {
      status.textContent = "Permission was not given, so the address was not saved.";
      return;
    }
    await chrome.storage.sync.set({ apiBase: origin, showPanel: panelInput.checked });
    status.textContent = "Saved. Reload the store's page to use it.";
  });
})();
