// playwrightFetch.js
// Shared headless-browser HTML fetcher for platforms that block plain
// axios requests (iShopping, Paklap both 403 even with full browser-like
// headers and a session-cookie handshake -- their bot detection checks
// something axios genuinely can't fake, most likely a JS/TLS fingerprint).
//
// The browser instance is launched once and reused across calls in the
// same process (scheduled scraping runs ~90 queries per invocation --
// relaunching Chromium per query would be very slow). Each call still
// gets its own browser context, so cookies/storage don't leak between
// unrelated requests, matching how a fresh visitor would look each time.

import { chromium } from "playwright";

let browserPromise = null;

function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true });
  }
  return browserPromise;
}

// Serializes all fetches through the shared browser -- confirmed live that
// running two Playwright-backed fetches at once (even two requests to the
// SAME site, so this isn't a per-site rate limit) makes one of them read
// page.content() while the grid has only partially rendered: 1 card instead
// of ~110-150. Raising every timeout involved didn't fix it, so this isn't
// a "wait longer" problem -- it's resource contention inside one shared
// browser process on this machine. Queuing fetches one-at-a-time removes
// the contention entirely at the cost of some wall-clock time, which is a
// fine trade for only 2 platforms (iShopping, Paklap) that need it.
let queue = Promise.resolve();

function runQueued(fn) {
  const run = queue.then(fn, fn);
  queue = run.then(() => {}, () => {});
  return run;
}

/**
 * Loads a URL in a headless browser and returns the rendered HTML.
 * @param {string} url
 * @param {object} [opts]
 * @param {string} [opts.waitForSelector] - CSS selector to wait for before
 *   reading page content (e.g. a product card). Non-fatal if it never
 *   appears -- falls back to whatever rendered by the timeout, same
 *   graceful-degradation approach the rest of the scrapers use.
 * @param {number} [opts.timeout=20000]
 * @param {number} [opts.retries=1]
 * @param {boolean} [opts.scrollToLoad=false] - scroll the page in steps
 *   before reading content, for sites that lazy-load images/content below
 *   the fold (e.g. Daraz's product grid images never populate otherwise).
 */
function fetchHtmlWithBrowser(url, opts = {}) {
  return runQueued(() => fetchHtmlWithBrowserUnqueued(url, opts));
}

async function fetchHtmlWithBrowserUnqueued(url, opts = {}) {
  const { waitForSelector, timeout = 20000, retries = 1, scrollToLoad = false } = opts;

  let lastErr;

  for (let attempt = 0; attempt <= retries; attempt++) {
    let context;
    try {
      const browser = await getBrowser();
      context = await browser.newContext({
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        viewport: { width: 1366, height: 768 },
      });

      const page = await context.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded", timeout });

      if (waitForSelector) {
        await page.waitForSelector(waitForSelector, { timeout: 8000 }).catch(() => {});
      }

      if (scrollToLoad) {
        for (let i = 0; i < 6; i++) {
          await page.mouse.wheel(0, 1500);
          await page.waitForTimeout(300);
        }
      }

      const html = await page.content();
      await context.close();
      return html;
    } catch (err) {
      lastErr = err;
      if (context) await context.close().catch(() => {});
      if (attempt < retries) continue;
    }
  }

  throw new Error(`fetchHtmlWithBrowser failed for ${url}: ${lastErr?.message || "Unknown error"}`);
}

/**
 * Closes the shared browser instance. Call at the end of one-off scripts
 * so the Node process can exit -- an open headless browser otherwise keeps
 * the event loop alive indefinitely.
 */
async function closeBrowser() {
  if (browserPromise) {
    const browser = await browserPromise;
    await browser.close();
    browserPromise = null;
  }
}

export { fetchHtmlWithBrowser, closeBrowser };
