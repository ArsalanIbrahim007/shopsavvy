// popup.js — the toolbar popup: what ShopSavvy knows about the product on this tab, and the settings.
//
// It reads the tab's answer that the service worker kept in chrome.storage.session (background.js), and redraws when that
// changes (the answer can arrive after the popup opens). Everything from the API is written with textContent.

(async function () {
  "use strict";

  const { storeOfHost, storeName, STORES } = globalThis.ShopSavvyStores;
  const { rupees, safeLink, summary } = globalThis.ShopSavvyFormat;
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
    if (!host || !storeOfHost(host)) {
      return show(
        el("h2", {}, "Open a product page"),
        el("p", { class: "muted" }, `ShopSavvy compares prices on ${Object.keys(STORES).length} Pakistani stores, such as PriceOye, Mega.pk, Shophive, iShopping, Paklap and Daraz.`),
      );
    }
    if (!entry) return show(el("h2", {}, "Not a product page"), el("p", { class: "muted" }, "Open a product's own page on this store to compare its price."));
    if (!entry.result) return show(el("p", {}, "Checking the other stores…"));

    const { product, result } = entry;
    if (result.error === "offline") {
      return show(el("h2", {}, "Cannot reach ShopSavvy"), el("p", { class: "muted" }, `Nothing answered at ${result.base}. Is the server running? The address can be changed in Settings.`));
    }
    if (result.error) return show(el("h2", {}, "Something went wrong"), el("p", { class: "muted" }, result.error === "busy" ? "Too many requests just now: try again in a minute." : "The comparison could not be made."));

    const thisPage = el("div", { class: "this" });
    thisPage.append(el("div", { class: "title" }, product.title || "This page"));
    if (product.price) thisPage.append(el("div", {}, `${rupees(product.price)} at ${storeOfHost(host).name}`));

    if (!result.found) {
      const why = result.reason === "no_match" ? "No other store sells this product, as far as we know." : "We do not know this product yet.";
      return show(thisPage, el("p", {}, why), link(result.searchUrl, "button ghost", "Search for it on ShopSavvy"));
    }

    const { tone, headline, lines } = summary(result, storeName);
    const head = el("div", { class: tone });
    head.append(el("div", { class: "headline" }, headline));
    const notes = el("ul", { class: "notes" });
    for (const line of lines) notes.append(el("li", {}, line));

    // One row per store, at its lowest price: a marketplace's several sellers (AlfaMall listed four times, two at one price) are one
    // store to the shopper. The offers come cheapest first, so a store's first is its lowest.
    const byStore = new Map();
    for (const offer of result.offers) {
      if (byStore.has(offer.platform)) byStore.get(offer.platform).more += 1;
      else byStore.set(offer.platform, { offer, more: 0 });
    }
    const stores = [...byStore.values()];
    const offers = el("ol", { class: "offers", "aria-label": "Other stores, cheapest first" });
    for (const { offer, more } of stores.slice(0, 6)) {
      const li = el("li", { class: offer === result.offers.find((o) => o.id === result.cheapest?.id) ? "cheapest" : "" });
      const name = link(offer.url, "", storeName(offer.platform)) ?? el("span", {}, storeName(offer.platform));
      const flags = [offer.outOfDate && "old price", offer.unusualPrice && "unusual", offer.condition !== "new" && offer.condition, !offer.inStock && "out of stock", more && `+${more} more`].filter(Boolean);
      const left = el("span");
      left.append(name);
      if (flags.length) left.append(el("span", { class: "flag" }, ` · ${flags.join(", ")}`));
      li.append(left, el("span", {}, rupees(offer.price)));
      offers.append(li);
    }

    show(
      thisPage,
      head,
      lines.length ? notes : null,
      offers,
      stores.length > 6 ? el("p", { class: "muted" }, `and ${stores.length - 6} more stores`) : null,
      link(result.productUrl, "button", "See the full comparison"),
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
  apiInput.value = saved.apiBase || "https://shopsavvy-api.duckdns.org"; // background.js DEFAULT_API
  panelInput.checked = saved.showPanel !== false;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const base = safeLink(apiInput.value.trim());
    if (!base) {
      status.textContent = "Enter an address starting with http:// or https://";
      return;
    }
    const origin = new URL(base).origin;
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
