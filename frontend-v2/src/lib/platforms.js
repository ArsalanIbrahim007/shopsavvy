// platforms.js — how a store is named on screen. Scraped data uses lowercase
// platform ids ("priceoye") and older seeded data used display casing
// ("PriceOye"); canonicalPlatform() makes both the same key.

const STORES = {
  priceoye: { name: "PriceOye", domain: "priceoye.pk" },
  mega: { name: "Mega.pk", domain: "mega.pk" },
  shophive: { name: "Shophive", domain: "shophive.com" },
  w11stop: { name: "W11Stop", domain: "w11stop.com" },
  telemart: { name: "Telemart", domain: "telemart.pk" },
  ishopping: { name: "iShopping", domain: "ishopping.pk" },
  paklap: { name: "Paklap", domain: "paklap.pk" },
  daraz: { name: "Daraz", domain: "daraz.pk" },
  homeshopping: { name: "HomeShopping", domain: "homeshopping.pk" },
  symbios: { name: "Symbios", domain: "symbios.pk" },
};

/** "PriceOye", "priceoye.pk", "PRICEOYE" -> "priceoye" */
export function canonicalPlatform(platform = "") {
  return String(platform).toLowerCase().replace(/[^a-z0-9]/g, "").replace(/pk$|com$/, "");
}

export function platformName(platform) {
  return STORES[canonicalPlatform(platform)]?.name || String(platform || "Store");
}

export function platformDomain(platform) {
  return STORES[canonicalPlatform(platform)]?.domain || null;
}
