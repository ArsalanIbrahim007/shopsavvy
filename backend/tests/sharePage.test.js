// GET /share/product/<slug> (2026-10-26): a shared product link's preview card, then the product's page on the site.
import { describe, it, expect, vi, afterEach, beforeAll, afterAll } from "vitest";

vi.mock("../src/services/productView.service.js", () => ({ buildProductView: vi.fn() }));

import Listing from "../src/models/listing.model.js";
import { buildProductView } from "../src/services/productView.service.js";
import { shareCard, sharePageHtml } from "../src/services/sharePage.service.js";
import { createApp } from "../src/createApp.js";

const ID = (n) => `6a78a2af9c96f297ede776${String(n).padStart(2, "0")}`;
const RECENT = new Date(Date.now() - 3600 * 1000).toISOString();
const offer = (n, platform, price, over = {}) => ({
  _id: ID(n), platform, price, title: "Samsung Galaxy A17 8GB 256GB", inStock: true, lastScrapedAt: RECENT, imageUrl: `https://img.example/${n}.webp`, ...over,
});
const SITE = "https://shopsavvy.example";

afterEach(() => vi.restoreAllMocks());

describe("shareCard", () => {
  const view = { selectedListing: offer(1, "priceoye", 64000), selectedGroup: { productName: "Samsung Galaxy A17 8GB 256GB" }, offers: [offer(1, "priceoye", 64000), offer(2, "mega", 63000), offer(3, "shophive", 65500)] };

  it("names the product, its lowest price and how many stores sell it, and points at its page", () => {
    expect(shareCard(view, { site: SITE })).toEqual({
      title: "Samsung Galaxy A17 8GB 256GB: from PKR 63,000",
      description: "From PKR 63,000 at 3 stores. Compare prices, price history and honest discounts on ShopSavvy.",
      image: "https://img.example/2.webp",
      url: `${SITE}/product/samsung-galaxy-a17-8gb-256gb-${ID(2)}`,
    });
  });

  it("uses another store's photo when the cheapest has none a preview can fetch, and none when no store has one", () => {
    const noPhoto = { ...view, offers: [offer(1, "priceoye", 64000), offer(2, "mega", 63000, { imageUrl: "http://img.example/2.jpg" })] };
    expect(shareCard(noPhoto, { site: SITE }).image).toBe("https://img.example/1.webp");
    const none = { ...view, offers: [offer(2, "mega", 63000, { imageUrl: null })] };
    expect(shareCard(none, { site: SITE }).image).toBeNull();
    expect(shareCard(none, { site: SITE }).description).toBe("From PKR 63,000. Compare prices, price history and honest discounts on ShopSavvy.");
  });
});

describe("sharePageHtml", () => {
  it("escapes what came from a store, so a title cannot break out of the tags", () => {
    const html = sharePageHtml({ title: `Evil "><script>alert(1)</script>`, description: "d & d", image: null, url: `${SITE}/product/x-${ID(1)}` });
    expect(html).not.toContain("<script>");
    expect(html).toContain('content="Evil &quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"');
    expect(html).toContain('content="d &amp; d"');
    expect(html).not.toContain("og:image"); // no photo: no tag pointing nowhere
    expect(html).toContain('name="twitter:card" content="summary"');
  });
});

describe("GET /share/product/:slug", () => {
  let server;
  let url;
  beforeAll(async () => {
    delete process.env.PUBLIC_SITE_URL; // the local frontend
    await new Promise((resolve) => {
      server = createApp().listen(0, () => { url = `http://127.0.0.1:${server.address().port}`; resolve(); });
    });
  });
  afterAll(() => new Promise((resolve) => server.close(resolve)));

  it("serves the card and moves on to the product's page", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(Listing, "findOne").mockReturnValue({ lean: async () => offer(1, "priceoye", 64000) });
    buildProductView.mockResolvedValue({ selectedListing: offer(1, "priceoye", 64000), selectedGroup: null, offers: [offer(1, "priceoye", 64000), offer(2, "mega", 63000)] });

    const res = await fetch(`${url}/share/product/samsung-galaxy-a17-${ID(1)}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    const text = await res.text();
    const page = `http://localhost:5173/product/samsung-galaxy-a17-8gb-256gb-${ID(2)}`;
    expect(text).toContain(`<meta property="og:title" content="Samsung Galaxy A17 8GB 256GB: from PKR 63,000">`);
    expect(text).toContain(`<meta property="og:image" content="https://img.example/2.webp">`);
    expect(text).toContain(`<meta http-equiv="refresh" content="0; url=${page}">`);
    expect(Listing.findOne.mock.calls[0][0]._id).toBe(ID(1)); // only the id at the end was read
  });

  it("sends an address that names no listing to the site's home page", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(Listing, "findOne").mockReturnValue({ lean: async () => null });
    for (const slug of ["not-a-product", `gone-${ID(9)}`]) {
      const res = await fetch(`${url}/share/product/${slug}`, { redirect: "manual" });
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("http://localhost:5173/");
    }
  });
});
