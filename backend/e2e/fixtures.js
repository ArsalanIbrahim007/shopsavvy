// fixtures.js — what the end-to-end tests' stores "sell": items in the shape a scraper returns, saved through the same path a real
// scrape uses (seed.js), so their categories, attributes and price records are derived exactly as in production.
//
// No image addresses: the browser under test must not fetch anything from the internet.

export const E2E_MONGO_URI = process.env.E2E_MONGO_URI ?? "mongodb://127.0.0.1:27017/shopsavvy_e2e";

const item = (platform, title, price, slug, extra = {}) => ({
  platform,
  title,
  price,
  originalPrice: null,
  sourceUrl: `https://${platform}.example/e2e/${slug}`,
  imageUrl: "",
  inStock: true,
  ...extra,
});

export const A17 = "Samsung Galaxy A17 8GB 256GB PTA Approved";
export const IPHONE = "Apple iPhone 17 Pro 256GB PTA Approved";
export const AC = "Haier 1.5 Ton DC Inverter AC HSU-18HFPAAS";

export const ITEMS = [
  item("priceoye", A17, 62999, "galaxy-a17"),
  item("mega", A17, 63999, "galaxy-a17", { originalPrice: 69999 }),
  item("shophive", A17, 64500, "galaxy-a17"),
  item("priceoye", IPHONE, 439999, "iphone-17-pro"),
  item("mega", IPHONE, 444999, "iphone-17-pro"),
  item("mega", AC, 189999, "haier-ac"),
  item("ishopping", AC, 192500, "haier-ac"),
];
