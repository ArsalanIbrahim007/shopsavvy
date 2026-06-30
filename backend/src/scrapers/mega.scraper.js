// mega.scraper.js
//
// STATUS: WORKING (selectors confirmed via DevTools, June 2026).
// Mega serves product data as static HTML — Axios + Cheerio works fine.
// Real search URL pattern: https://www.mega.pk/search/{query}/
// (NOT a query-string pattern — confirmed by testing in browser.)

import * as cheerio from "cheerio";
import { fetchHtml, parsePrice, cleanText, safeMap } from "./scraper.utils.js";
import { makeListing } from "./scraper.schema.js";

const PLATFORM = "mega";
const BASE_URL = "https://www.mega.pk";

/**
 * Scrapes a single Mega.pk search/category page.
 * @param {string} searchUrl
 * @returns {Promise<import('./scraper.schema').ScrapedListing[]>}
 */
async function scrapeMegaSearch(searchUrl) {
  const html = await fetchHtml(searchUrl);
  const $ = cheerio.load(html);

  // Confirmed via DevTools inspection (June 2026): each card is an <li> with
  // a data-brand attribute and a data-slug attribute.
  const cards = $("li[data-brand]").toArray();

  return safeMap(
    cards,
    (el) => {
      const card = $(el);

      const title = cleanText(card.find("#lap_name_div h3 a").text());
      const href = card.find("#lap_name_div h3 a").attr("href");
      const imageUrl = card.find(".image img").attr("src") || null;
      const brand = card.attr("data-brand") || null;

      // .cat_price contains both the "was" (original) price div AND the
      // current price as a trailing text node, e.g.:
      // <div class="was">599,999 - PKR</div>584,999<span> - PKR</span>
      // Clone it, strip out the .was div, then read what's left for current price.
      const priceBox = card.find(".cat_price").clone();
      const originalPriceRaw = priceBox.find(".was").text();
      priceBox.find(".was").remove();
      const priceRaw = priceBox.text();

      if (!title || !href) return null;

      const sourceUrl = href.startsWith("http") ? href : `${BASE_URL}${href}`;

      return makeListing({
        platform: PLATFORM,
        sourceUrl,
        title,
        price: parsePrice(priceRaw),
        originalPrice: parsePrice(originalPriceRaw) || null,
        imageUrl,
        brand,
      });
    },
    PLATFORM
  );
}

export { scrapeMegaSearch };

// Quick manual test:
// node -e "import('./mega.scraper.js').then(m => m.scrapeMegaSearch('https://www.mega.pk/search/iphone/')).then(r => console.log(JSON.stringify(r, null, 2)))"