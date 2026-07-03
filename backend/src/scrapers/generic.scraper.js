// generic.scraper.js
//
// AI-powered generic scraper — works on ANY e-commerce product page URL
// without needing site-specific CSS selectors.
//
// Uses Groq API (free tier, no credit card needed, works in Pakistan).
// Model: llama-3.1-8b-instant — fast and free.
//
// How it works:
//   1. Fetches raw HTML from the given URL
//   2. Strips noise (scripts, styles, nav, footer, ads) to cut token usage
//   3. Sends cleaned HTML to Groq with a structured extraction prompt
//   4. Parses the JSON response into a normalized ScrapedListing object
//
// Requirements:
//   - GROQ_API_KEY must be set in backend/.env
//   - Get free key at: https://console.groq.com
//   - Works best on single product pages (not search/listing pages)

import * as cheerio from "cheerio";
import axios from "axios";
import { fetchHtml } from "./scraper.utils.js";
import { makeListing } from "./scraper.schema.js";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";
// Send more HTML to increase chance of capturing price — Groq handles this fine
const MAX_HTML_LENGTH = 12000;

/**
 * Strips everything that isn't useful product content and tries to extract
 * the most relevant section (product container) rather than just first N chars.
 * This matters for large pages where product info appears deep in the HTML.
 */
function cleanHtml(rawHtml) {
  const $ = cheerio.load(rawHtml);

  // Remove noise elements
  $(
    "script, style, noscript, nav, footer, header, iframe, " +
    "[aria-hidden='true'], .cookie-banner, .newsletter-popup, " +
    ".breadcrumb, .related-products, .recommendations, " +
    ".reviews, .comments, #reviews, #comments"
  ).remove();

  // Try to find the main product container by common patterns
  // Most e-commerce platforms use predictable class/id names for product sections
  const productSelectors = [
    ".product-single",
    ".product-detail",
    ".product-info",
    ".product__info",
    ".product-page",
    "#product",
    "#product-detail",
    "[class*='product-detail']",
    "[class*='ProductDetail']",
    ".pdp-content",
    ".item-detail",
    "main",
    "#main",
    "#content",
    ".main-content",
  ];

  let productHtml = "";
  for (const selector of productSelectors) {
    const el = $(selector).first();
    if (el.length && el.html()?.length > 500) {
      productHtml = el.html() || "";
      break;
    }
  }

  // If no product section found, fall back to full body
  if (!productHtml) {
    productHtml = $("body").html() || rawHtml;
  }

  // Collapse excessive whitespace
  const cleaned = productHtml
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s{3,}/g, " ")
    .replace(/>\s+</g, "><")
    .trim();

  if (cleaned.length <= MAX_HTML_LENGTH) return cleaned;

  // When we need to truncate, try to preserve a section that contains a price.
  // Look for common price indicators (Rs, PKR, currency symbols near numbers)
  // and center the window around that section.
  const pricePatterns = [
    /Rs\.?\s*[\d,]+/i,
    /PKR\s*[\d,]+/i,
    /price/i,
    /[\d,]{4,}/,    // 4+ digit number (likely a price)
  ];

  for (const pattern of pricePatterns) {
    const match = pattern.exec(cleaned);
    if (match) {
      // Take a window centered around the price match
      const center = match.index;
      const start = Math.max(0, center - MAX_HTML_LENGTH / 2);
      const end = Math.min(cleaned.length, start + MAX_HTML_LENGTH);
      return cleaned.slice(start, end) + "... [truncated]";
    }
  }

  // Final fallback: just take the first MAX_HTML_LENGTH chars
  return cleaned.slice(0, MAX_HTML_LENGTH) + "... [truncated]";
}

/**
 * Extracts the hostname from a URL to use as platform name.
 * e.g. "https://www.alfatah.com.pk/..." → "alfatah.com.pk"
 */
function platformFromUrl(url) {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

/**
 * Calls the Groq API with cleaned HTML and returns extracted product data as JSON.
 * Groq uses the OpenAI-compatible chat completions format.
 * @param {string} cleanedHtml
 * @param {string} sourceUrl
 * @returns {Promise<object>}
 */
async function extractWithAI(cleanedHtml, sourceUrl) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GROQ_API_KEY is not set in your .env file. " +
      "Get your free key from https://console.groq.com and add it to backend/.env"
    );
  }

  const prompt = `You are a product data extractor. Given the HTML of an e-commerce product page, extract the product information and return it as a JSON object.

Source URL: ${sourceUrl}

HTML Content:
${cleanedHtml}

Extract the following fields and return ONLY a valid JSON object with no extra text, no markdown, no backticks:
{
  "title": "full product name/title",
  "price": 12345,
  "originalPrice": 15000,
  "imageUrl": "https://...",
  "brand": "brand name or null",
  "inStock": true,
  "currency": "PKR"
}

Rules:
- price and originalPrice must be plain numbers (no commas, no currency symbols), or null if not found
- originalPrice is the crossed-out/before-discount price, null if no discount is shown
- imageUrl should be the main product image URL, null if not found
- brand should be extracted from the title or page content, null if unclear
- inStock: true if product appears available, false if out of stock message is shown
- If a field cannot be determined, use null
- Return ONLY the JSON object, nothing else`;

  const response = await axios.post(
    GROQ_API_URL,
    {
      model: MODEL,
      messages: [
        {
          role: "system",
          content: "You are a product data extractor. You ONLY respond with valid JSON objects. Never write code, explanations, or markdown. Only output the raw JSON object requested.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0,
      max_tokens: 500,
    },
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      timeout: 30000,
    }
  );

  const rawText = response.data.choices?.[0]?.message?.content || "";
  const jsonText = rawText.replace(/```json|```/g, "").trim();

  try {
    return JSON.parse(jsonText);
  } catch {
    throw new Error(`Groq returned non-JSON response: ${rawText.slice(0, 200)}`);
  }
}

/**
 * Scrapes any single product page URL using AI extraction.
 * Works on sites you haven't written a specific scraper for.
 *
 * @param {string} url - full URL to a product detail page
 * @returns {Promise<import('./scraper.schema.js').ScrapedListing>}
 */
async function scrapeGeneric(url) {
  console.log(`[generic] Fetching: ${url}`);
  const rawHtml = await fetchHtml(url);

  console.log(`[generic] Cleaning HTML (${rawHtml.length} chars raw)...`);
  const cleanedHtml = cleanHtml(rawHtml);
  console.log(`[generic] Sending ${cleanedHtml.length} chars to Claude...`);

  const extracted = await extractWithAI(cleanedHtml, url);
  console.log(`[generic] Extracted:`, extracted);

  return makeListing({
    platform: platformFromUrl(url),
    sourceUrl: url,
    title: extracted.title || "Unknown Product",
    price: extracted.price ? Math.round(Number(extracted.price)) : null,
    originalPrice: extracted.originalPrice
      ? Math.round(Number(extracted.originalPrice))
      : null,
    imageUrl: extracted.imageUrl || null,
    brand: extracted.brand || null,
    inStock: extracted.inStock !== false, // default true unless explicitly false
  });
}

export { scrapeGeneric };

// CLI test: node generic.scraper.js "https://any-product-url-here"
// Example:  node generic.scraper.js "https://www.daraz.pk/products/..."
if (process.argv[1].includes("generic.scraper")) {
  const url = process.argv[2];
  if (!url) {
    console.error("Usage: node generic.scraper.js <product-url>");
    process.exit(1);
  }

  // Load .env for CLI usage — .env is at backend/.env, two levels up from scrapers/
  const { config } = await import("dotenv");
  config({ path: new URL("../../.env", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1") });

  scrapeGeneric(url)
    .then((result) => {
      console.log("\nResult:");
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((err) => {
      console.error("Failed:", err.message);
    });
}