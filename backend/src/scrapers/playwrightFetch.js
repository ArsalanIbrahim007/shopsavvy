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
 *   reading page content. Non-fatal if it never appears -- falls back to
 *   whatever rendered by the timeout.
 * @param {number} [opts.timeout=15000] - page load timeout in ms.
 * @param {number} [opts.selectorTimeout=5000] - how long to wait for
 *   waitForSelector before giving up and reading whatever rendered. Kept
 *   separate from the page load timeout so a slow network doesn't hide a
 *   missing selector.
 * @param {number} [opts.retries=1]
 * @param {boolean} [opts.scrollToLoad=false] - scroll the page in steps
 *   before reading content, for sites that lazy-load content below the fold.
 * @param {object} [opts.context] - an existing Playwright BrowserContext to
 *   reuse. When supplied the caller owns the context lifecycle (open/close);
 *   when omitted a fresh context is created and closed per fetch. Reusing a
 *   context across pages of the same scrape session saves ~200-400 ms of
 *   context startup per page.
 */
function fetchHtmlWithBrowser(url, opts = {}) {
  return runQueued(() => fetchHtmlWithBrowserUnqueued(url, opts));
}

async function fetchHtmlWithBrowserUnqueued(url, opts = {}) {
  const {
    waitForSelector,
    timeout = 15000,
    selectorTimeout = 5000,
    retries = 1,
    scrollToLoad = false,
    context: sharedContext = null,
  } = opts;

  let lastErr;

  for (let attempt = 0; attempt <= retries; attempt++) {
    // Use the shared context when provided; otherwise create a fresh one
    // and close it when done so we don't leak browser resources.
    const ownsContext = sharedContext === null;
    let context = sharedContext;

    try {
      const browser = await getBrowser();

      if (ownsContext) {
        context = await browser.newContext({
          userAgent:
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          viewport: { width: 1366, height: 768 },
        });
      }

      const page = await context.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded", timeout });

      if (waitForSelector) {
        await page
          .waitForSelector(waitForSelector, { timeout: selectorTimeout })
          .catch(() => {});
      }

      if (scrollToLoad) {
        for (let i = 0; i < 6; i++) {
          await page.mouse.wheel(0, 1500);
          await page.waitForTimeout(300);
        }
      }

      const html = await page.content();
      await page.close();
      if (ownsContext) await context.close();
      return html;
    } catch (err) {
      lastErr = err;
      if (ownsContext && context) await context.close().catch(() => {});
      if (attempt < retries) continue;
    }
  }

  throw new Error(
    `fetchHtmlWithBrowser failed for ${url}: ${lastErr?.message || "Unknown error"}`
  );
}

/**
 * Creates a reusable browser context for one scraper session. Pass the
 * returned context as opts.context to fetchHtmlWithBrowser for each page
 * in the session, then call context.close() when done. This saves the
 * ~200-400 ms context-creation overhead per page without changing the
 * serialised fetch queue or the shared browser lifecycle.
 */
async function createScraperContext() {
  const browser = await getBrowser();
  return browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    viewport: { width: 1366, height: 768 },
  });
}

/**
 * Closes the shared browser instance. Safe to call whether or not a browser
 * was ever launched -- if nothing was ever fetched, browserPromise is null
 * and this returns immediately. The backend calls this during graceful
 * shutdown (SIGINT/SIGTERM) so the Chromium process does not outlive Node.
 */
async function closeBrowser() {
  if (browserPromise) {
    const browser = await browserPromise;
    await browser.close();
    browserPromise = null;
  }
}

export { fetchHtmlWithBrowser, createScraperContext, closeBrowser };