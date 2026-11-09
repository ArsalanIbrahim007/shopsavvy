// PriceOye's search page changed layout around 2026-11-08: each result moved from <a class="product-card"> to the link inside a
// <div class="productBox">, and every PriceOye search came back empty. The markup below is the live page's, trimmed.
import { describe, it, expect, vi } from "vitest";

const NEW_LAYOUT = `
<div class="productBox b-productBox"><a href="https://priceoye.pk/mobiles/apple/apple-iphone-17" class="ga-dataset">
  <div class="image-box"><img src="https://images.priceoye.pk/apple-iphone-17-pakistan-priceoye-270x270.webp" class="product-thumbnail-img product-thumbnail"></div>
  <div class="detail-box"><div class="text-box"><h4 class="p-title p-title-center bold h5"> Apple Iphone 17</h4></div>
  <div class="pricing-setting"><div class="price-box h2"><span><sup>Rs</sup>405,699</span></div>
  <div class="price-diff"><div class="price-diff-retail"><span><sup>Rs</sup>434,599</span></div><div class="price-diff-saving">7% OFF </div></div></div>
  <div class="user-rating-box"><div class="user-rating-content"><img src="https://static.priceoye.pk/images/stars.svg" alt="Rating Star"><span class="h6">4.9</span><span class="p6 space">11</span><span class="p6">Reviews</span></div></div></div>
</a></div>
<div class="productBox b-productBox"><a href="/mobiles/vivo/vivo-v80" class="ga-dataset">
  <div class="detail-box"><h4 class="p-title"> Vivo V80</h4><div class="pricing-setting"><div class="price-box h2"><span><sup>Rs</sup>209,999</span></div></div></div>
</a></div>`;

const OLD_LAYOUT = `<a class="product-card" href="/mobiles/samsung/galaxy-a17"><div class="p-title">Samsung Galaxy A17</div><div class="price-box">Rs 64,000</div></a>`;

const fetchHtml = vi.fn();
vi.mock("../src/scrapers/scraper.utils.js", async (original) => ({ ...(await original()), fetchHtml: (...args) => fetchHtml(...args) }));
const { scrapePriceOyeSearch } = await import("../src/scrapers/priceoye.scraper.js");

describe("scrapePriceOyeSearch", () => {
  it("reads the new layout: title, price, the 'was' price, the address and the picture", async () => {
    fetchHtml.mockReset().mockResolvedValueOnce(NEW_LAYOUT).mockResolvedValue("<html></html>"); // page 2 is empty: stop
    const listings = await scrapePriceOyeSearch("https://priceoye.pk/search?q=iphone%2017");
    expect(listings.map((l) => [l.title, l.price, l.originalPrice, l.sourceUrl])).toEqual([
      ["Apple Iphone 17", 405699, 434599, "https://priceoye.pk/mobiles/apple/apple-iphone-17"],
      ["Vivo V80", 209999, null, "https://priceoye.pk/mobiles/vivo/vivo-v80"],
    ]);
    expect(listings[0].imageUrl).toMatch(/apple-iphone-17/);
  });

  it("still reads the old layout", async () => {
    fetchHtml.mockReset().mockResolvedValueOnce(OLD_LAYOUT).mockResolvedValue("<html></html>");
    const [listing] = await scrapePriceOyeSearch("https://priceoye.pk/search?q=a17");
    expect([listing.title, listing.price]).toEqual(["Samsung Galaxy A17", 64000]);
  });

  it("reads a card's rating and review count, and none from a card without reviews (2026-11-09)", async () => {
    fetchHtml.mockReset().mockResolvedValueOnce(NEW_LAYOUT).mockResolvedValue("<html></html>");
    const [rated, unrated] = await scrapePriceOyeSearch("https://priceoye.pk/search?q=iphone%2017");
    expect([rated.rating, rated.reviewCount]).toEqual([4.9, 11]);
    expect([unrated.rating, unrated.reviewCount]).toEqual([null, null]);
  });
});
