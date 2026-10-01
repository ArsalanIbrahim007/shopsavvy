// platforms.js — how a store is named on screen. Scraped data uses lowercase
// platform ids ("priceoye") and older seeded data used display casing
// ("PriceOye"); canonicalPlatform() makes both the same key.

// `color` tells the stores apart: their monogram badge when there is no logo file, and their line on the price chart. It follows the brand where that keeps them distinguishable (Mega.pk is brown, not its orange, so it does not look like PriceOye on a chart).
const STORES = {
  priceoye: { name: "PriceOye", domain: "priceoye.pk", color: "#ff6b00" },
  mega: { name: "Mega.pk", domain: "mega.pk", color: "#795548" },
  shophive: { name: "Shophive", domain: "shophive.com", color: "#d32f2f" },
  w11stop: { name: "W11Stop", domain: "w11stop.com", color: "#6a1b9a" },
  telemart: { name: "Telemart", domain: "telemart.pk", color: "#1976d2" },
  ishopping: { name: "iShopping", domain: "ishopping.pk", color: "#2e7d32" },
  paklap: { name: "Paklap", domain: "paklap.pk", color: "#00695c" },
  daraz: { name: "Daraz", domain: "daraz.pk", color: "#f85606" },
  homeshopping: { name: "HomeShopping", domain: "homeshopping.pk", color: "#b71c1c" },
  symbios: { name: "Symbios", domain: "symbios.pk", color: "#8e24aa" },
  // added 2026-10-01 (backend scrapers/stores.js); no logo files yet, so they show the monogram
  mistore: { name: "Mi Store", domain: "mistore.pk", color: "#c2185b" },
  mymart: { name: "MyMart", domain: "mymart.pk", color: "#37474f" },
  alfatah: { name: "Al-Fatah", domain: "alfatah.pk", color: "#827717" },
  xcessorieshub: { name: "XcessoriesHub", domain: "xcessorieshub.com", color: "#0097a7" },
  eezepc: { name: "eezepc", domain: "eezepc.com", color: "#3949ab" },
  ledshop: { name: "LEDshop.pk", domain: "ledshop.pk", color: "#e65100" },
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

const FALLBACK_COLOR = "#47566b";

/** The store's brand colour, or a neutral grey for a store we do not know. */
export function platformColor(platform) {
  return STORES[canonicalPlatform(platform)]?.color || FALLBACK_COLOR;
}

/** One or two letters for a monogram badge: "PriceOye" -> "P", "Mega.pk" -> "M". */
export function platformInitial(platform) {
  const name = platformName(platform).trim();
  return (name.charAt(0) || "S").toUpperCase();
}

/** The store ids we have a name for, for code that needs to list them (logo files, tests). */
export const KNOWN_PLATFORMS = Object.keys(STORES);
