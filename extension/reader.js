// reader.js — what product a store page shows: its address, title and price, read from the page itself.
//
// Loaded before content.js (manifest.json) and by the tests, so it is a plain script with no imports: it puts one function on
// globalThis. It reads, in order, what stores publish for search engines, which is steadier than their page layout:
//   1. schema.org Product data (a <script type="application/ld+json">, possibly inside "@graph" or an array; offers an object or
//      an array): PriceOye, Mega, Paklap, W11Stop and most Shopify and WooCommerce stores;
//   2. Open Graph product tags (og:type "product", product:price:amount): Shophive. A price of 0 is ignored (Mega's says 0);
//   3. a Magento product page (body.catalog-product-view, the final price's data-price-amount): iShopping;
//   4. a WooCommerce product page (body.single-product).
// Anything else is not a product page (a category, a search, the home page), and nothing is sent.
// The address is always sent: for a page we have stored, the address alone finds it.

(function () {
  "use strict";

  // The first number in the text, commas dropped: "Rs. 559,999" -> 559999 ("Rs." keeps its dot out of it), "34999.00" -> 34999.
  const toNumber = (value) => {
    const found = String(value ?? "").match(/\d[\d,]*(?:\.\d+)?/);
    const n = found ? Number(found[0].replace(/,/g, "")) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const clean = (text) => (typeof text === "string" ? text.replace(/\s+/g, " ").trim() || null : null);
  const meta = (doc, name) => doc.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.getAttribute("content") ?? null;
  const isProductType = (type) => (Array.isArray(type) ? type : [type]).some((t) => /^(?:https?:\/\/schema\.org\/)?Product$/i.test(String(t)));

  function productNodes(data) {
    const out = [];
    const visit = (node) => {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) return node.forEach(visit);
      if (isProductType(node["@type"])) out.push(node);
      if (node["@graph"]) visit(node["@graph"]);
    };
    visit(data);
    return out;
  }

  function priceOfOffers(offers) {
    for (const offer of Array.isArray(offers) ? offers : [offers]) {
      if (!offer || typeof offer !== "object") continue;
      const price = toNumber(offer.price) ?? toNumber(offer.lowPrice) ?? toNumber(offer.priceSpecification?.price);
      if (price) return price;
    }
    return null;
  }

  function fromJsonLd(doc) {
    for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
      let data;
      try {
        data = JSON.parse(script.textContent);
      } catch {
        continue; // a store's broken block: try the next
      }
      for (const node of productNodes(data)) {
        const title = clean(node.name);
        if (title) return { title, price: priceOfOffers(node.offers) };
      }
    }
    return null;
  }

  function fromOpenGraph(doc) {
    const type = String(meta(doc, "og:type") ?? "").toLowerCase();
    if (type !== "product" && type !== "product.item" && type !== "og:product") return null;
    const title = clean(meta(doc, "og:title")) ?? clean(doc.querySelector("h1")?.textContent);
    const price = toNumber(meta(doc, "product:price:amount")) ?? toNumber(meta(doc, "og:price:amount"));
    return title ? { title, price } : null;
  }

  function fromMagento(doc) {
    if (!doc.body?.classList.contains("catalog-product-view")) return null;
    const title = clean(doc.querySelector(".page-title, h1")?.textContent);
    const priceEl = doc.querySelector('.product-info-main [data-price-type="finalPrice"][data-price-amount]')
      ?? doc.querySelector('[data-price-type="finalPrice"][data-price-amount]');
    return title ? { title, price: toNumber(priceEl?.getAttribute("data-price-amount")) } : null;
  }

  function fromWooCommerce(doc) {
    if (!doc.body?.classList.contains("single-product")) return null;
    const title = clean(doc.querySelector("h1.product_title, h1")?.textContent);
    // On sale the summary shows the old price struck through and the new one inside <ins>. Asked one after the other: a selector
    // list returns the first match in page order, which is the struck-out price.
    const priceEl = doc.querySelector(".summary .price ins .amount") ?? doc.querySelector(".summary .price .amount");
    return title ? { title, price: toNumber(priceEl?.textContent) } : null;
  }

  /**
   * @param {Document} doc
   * @param {string} href  the page's address
   * @returns {{url: string, title: string, price: number|null}|null}  null when the page is not a product page
   */
  function readProduct(doc, href) {
    const found = fromJsonLd(doc) ?? fromOpenGraph(doc) ?? fromMagento(doc) ?? fromWooCommerce(doc);
    if (!found) return null;
    // A WooCommerce store's visible name beats its Product data, which some fill with a search-engine title ("Buy Apple Airpods
    // 2 Pro at Lowest price in Pakistan" on eezepc, 2026-11-07).
    const title = clean(doc.querySelector("h1.product_title")?.textContent) ?? found.title;
    // A Product block without a price (Mi Store, Daraz) still names the page; the shown price fills it where there is one:
    // Open Graph, or Daraz's current price (its struck-out one is "pdp-price_type_deleted").
    const price = found.price
      ?? toNumber(meta(doc, "product:price:amount"))
      ?? toNumber(doc.querySelector(".pdp-price_type_normal")?.textContent);
    return { url: href, title: title.slice(0, 300), price };
  }

  globalThis.ShopSavvyReader = { readProduct };
})();
