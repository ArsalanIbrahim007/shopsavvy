// stores.js — the stores the extension works on, and how each is named on screen. A plain script (no imports): loaded by the
// content script (manifest.json) and the popup, and read by the tests. Keep it in step with the API's STORE_HOSTS
// (backend/src/services/productMatch.service.js) and the manifest's "matches"; the tests check all three agree.

(function () {
  "use strict";

  const STORES = {
    "priceoye.pk": { platform: "priceoye", name: "PriceOye" },
    "mega.pk": { platform: "mega", name: "Mega.pk" },
    "shophive.com": { platform: "shophive", name: "Shophive" },
    "ishopping.pk": { platform: "ishopping", name: "iShopping" },
    "paklap.pk": { platform: "paklap", name: "Paklap" },
    "eezepc.com": { platform: "eezepc", name: "eezepc" },
    "w11stop.com": { platform: "w11stop", name: "W11Stop" },
    "xcessorieshub.com": { platform: "xcessorieshub", name: "XcessoriesHub" },
    "mistore.pk": { platform: "mistore", name: "Mi Store" },
    "mymart.pk": { platform: "mymart", name: "MyMart" },
    "alfatah.pk": { platform: "alfatah", name: "Al-Fatah" },
    "ledshop.pk": { platform: "ledshop", name: "LEDshop.pk" },
    "techroid.com": { platform: "techroid", name: "Techroid" },
    "subhanelectronics.pk": { platform: "subhanelectronics", name: "Subhan Electronics" },
    "jalalelectronics.com": { platform: "jalalelectronics", name: "Jalal Electronics" },
    "japanelectronics.com.pk": { platform: "japanelectronics", name: "Japan Electronics" },
    "zerolifestyle.co": { platform: "zerolifestyle", name: "Zero Lifestyle" },
    "audionic.co": { platform: "audionic", name: "Audionic" },
    "ronin.pk": { platform: "ronin", name: "Ronin" },
    "baseus.pk": { platform: "baseus", name: "Baseus" },
    "infinix.pk": { platform: "infinix", name: "Infinix.pk" },
    "alfamall.com": { platform: "alfamall", name: "AlfaMall" },
    "digimall.faysalbank.com": { platform: "digimall", name: "DigiMall" },
    // Not scraped (its robots.txt disallows the catalogue search), but a shopper on Daraz can still see the other stores' prices:
    // the API places the page among our products by its title and price.
    "daraz.pk": { platform: "daraz", name: "Daraz" },
    // A price-comparison site, not a store: never collected from. Its product page states a name and a price in rupees, so the API
    // places it among our products the same way, and the shopper sees our stores' prices beside the one Qeemat shows.
    "qeemat.com.pk": { platform: "qeemat", name: "Qeemat" },
  };

  // Shops abroad: their prices are in another currency, so nothing is compared with them. The product's name is looked up in
  // ShopSavvy's search instead: "in Pakistan from PKR ...".
  const LOOKUP_SITES = {
    "amazon.com": "Amazon",
    "amazon.co.uk": "Amazon",
    "amazon.ae": "Amazon",
    "amazon.sa": "Amazon",
    "amazon.in": "Amazon",
    "amazon.de": "Amazon",
    "amazon.ca": "Amazon",
    "amazon.com.au": "Amazon",
  };

  const byPlatform = Object.fromEntries(Object.values(STORES).map((s) => [s.platform, s.name]));

  /** The store a host belongs to ("www.mega.pk" -> Mega), or null. */
  function storeOfHost(hostname) {
    const host = String(hostname ?? "").toLowerCase().replace(/^(www|m)\./, "");
    return STORES[host] ?? null;
  }

  /** The shop abroad a host belongs to ("www.amazon.co.uk" -> "Amazon"), or null. */
  function lookupSiteOf(hostname) {
    const host = String(hostname ?? "").toLowerCase().replace(/^(www|m|smile)\./, "");
    return LOOKUP_SITES[host] ?? null;
  }

  /** A platform's name for the screen ("mega" -> "Mega.pk"). */
  const storeName = (platform) => byPlatform[platform] ?? String(platform ?? "Store");

  globalThis.ShopSavvyStores = { STORES, LOOKUP_SITES, storeOfHost, lookupSiteOf, storeName };
})();
