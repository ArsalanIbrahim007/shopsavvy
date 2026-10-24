import { describe, it, expect, beforeEach } from "vitest";
import { parsePrice, validatePricePair, politeDelay, HOST_DELAY_MS } from "../src/scrapers/scraper.utils.js";
import { parseIShoppingHtml } from "../src/scrapers/ishopping.scraper.js";

// ─── parsePrice ───────────────────────────────────────────────────────────────
describe("parsePrice", () => {
  it("parses a plain integer string", () => {
    expect(parsePrice("49999")).toBe(49999);
  });

  it("parses a PKR string with commas", () => {
    expect(parsePrice("PKR 49,999")).toBe(49999);
  });

  it("parses a Rs. string with decimal", () => {
    expect(parsePrice("Rs. 10,799.00")).toBe(10799);
  });

  it("parses a lakh format string", () => {
    expect(parsePrice("Rs. 1,49,999")).toBe(149999);
  });

  it("returns null for null input", () => {
    expect(parsePrice(null)).toBeNull();
  });

  it("returns null for a non-numeric string", () => {
    expect(parsePrice("N/A")).toBeNull();
  });
});

// ─── validatePricePair ────────────────────────────────────────────────────────
describe("validatePricePair", () => {
  it("accepts a valid price with a higher was-price", () => {
    expect(validatePricePair(49999, 59999)).toEqual({
      price: 49999,
      originalPrice: 59999,
    });
  });

  it("nullifies a was-price that is below the current price", () => {
    expect(validatePricePair(49999, 39999)).toEqual({
      price: 49999,
      originalPrice: null,
    });
  });

  it("nullifies a was-price equal to the current price", () => {
    expect(validatePricePair(49999, 49999)).toEqual({
      price: 49999,
      originalPrice: null,
    });
  });

  it("accepts a null was-price and passes it through", () => {
    expect(validatePricePair(49999, null)).toEqual({
      price: 49999,
      originalPrice: null,
    });
  });

  it("nullifies a zero or negative price", () => {
    expect(validatePricePair(0, 59999)).toEqual({
      price: null,
      originalPrice: null,
    });
    expect(validatePricePair(-100, 59999)).toEqual({
      price: null,
      originalPrice: null,
    });
  });

  it("nullifies a price below PKR 100 (likely a parse error)", () => {
    // e.g. Telemart blog article priced at PKR 20
    expect(validatePricePair(20, null)).toEqual({
      price: null,
      originalPrice: null,
    });
  });

  it("nullifies a was-price more than 10x the current price (likely a misparse)", () => {
    // e.g. Telemart Haier TV: price 786999, was-price 11005000
    expect(validatePricePair(786999, 11005000)).toEqual({
      price: 786999,
      originalPrice: null,
    });
  });

  // ── Boundary cases ──────────────────────────────────────────────────────────
  it("accepts price exactly 100 (minimum valid price)", () => {
    expect(validatePricePair(100, null)).toEqual({
      price: 100,
      originalPrice: null,
    });
  });

  it("rejects price 99 (one below the minimum)", () => {
    expect(validatePricePair(99, null)).toEqual({
      price: null,
      originalPrice: null,
    });
  });

  it("accepts a was-price exactly 10x the current price", () => {
    // 10x is the upper boundary — must be accepted
    expect(validatePricePair(10000, 100000)).toEqual({
      price: 10000,
      originalPrice: 100000,
    });
  });

  it("rejects a was-price of 10x + 1 (one above the boundary)", () => {
    expect(validatePricePair(10000, 100001)).toEqual({
      price: 10000,
      originalPrice: null,
    });
  });
});

// ─── politeDelay ──────────────────────────────────────────────────────────────
describe("politeDelay", () => {
  // Reset the module's internal nextAllowedAt map before each test by
  // tracking elapsed time with a fake clock rather than real timers.
  // We test politeDelay indirectly through its observable effect: the
  // sequence and spacing of sleeps.

  it("lets the first request to a host go immediately (no wait)", async () => {
    const sleeps = [];
    const start = Date.now();

    // Use a unique host per test to avoid state from other tests
    const url = `https://host-first-${Date.now()}.test/page`;

    // Monkey-patch: replace the real politeDelay's dependency on Date.now
    // with a controlled clock. Since politeDelay is a closure over the
    // module-level nextAllowedAt map and Date.now, we test the real function
    // and just measure how long it actually waits.
    const before = Date.now();
    await politeDelay(url, 1500);
    const elapsed = Date.now() - before;

    // First request: should not wait (elapsed well under 1500 ms)
    expect(elapsed).toBeLessThan(200);
  });

  it("spaces successive requests to the same host by at least the delay", async () => {
    const url = `https://host-spacing-${Date.now()}.test/page`;
    const delay = 300; // use a short delay so the test runs fast

    const t0 = Date.now();
    await politeDelay(url, delay);
    const t1 = Date.now();
    await politeDelay(url, delay);
    const t2 = Date.now();

    // First call: no wait
    expect(t1 - t0).toBeLessThan(100);
    // Second call: waited at least the delay
    expect(t2 - t1).toBeGreaterThanOrEqual(delay - 20); // 20ms tolerance
  });

  it("does not make requests to different hosts wait for each other", async () => {
    const hostA = `https://host-a-${Date.now()}.test/page`;
    const hostB = `https://host-b-${Date.now()}.test/page`;
    const delay = 500;

    // Occupy host A's slot
    await politeDelay(hostA, delay);

    // Host B should go immediately, not wait for host A's gap to expire
    const before = Date.now();
    await politeDelay(hostB, delay);
    const elapsed = Date.now() - before;

    expect(elapsed).toBeLessThan(100);
  });
});

// ─── iShopping Was/Now layout ─────────────────────────────────────────────────
// iShopping uses a custom Was/Now price layout where data-price-amount sits on
// the wrapper span itself (not a child span). Plain requests to iShopping get a
// 403, so the scraper uses a real headless browser — but the parser (cheerio)
// works on the rendered HTML string and can be tested with a small fixture.


describe("iShopping Was/Now price layout (small fixture)", () => {
  // Trimmed from a real iShopping search result page (2026-10-03).
  // One card with Was/Now layout, one card with no discount.
  const FIXTURE_HTML = `
    <li class="item product product-item">
      <div class="product-item-info" id="product-item-info_652883">
        <div class="product-item-details">
          <strong class="product name product-item-name">
            <a class="product-item-link" href="https://www.ishopping.pk/morui-cable-mc-04">
              Morui Cable MC-04
            </a>
          </strong>
          <div class="price-box price-final_price">
            <span class="info-list--row SP">
              <span id="old-price-652883"
                    data-price-amount="323"
                    data-price-type="oldPrice"
                    class="price-wrapper">
                <span class="price">Rs. 323</span>
              </span>
            </span>
            <span class="info-list--row active">
              <span id="product-price-652883"
                    data-price-amount="291"
                    data-price-type="finalPrice"
                    class="price-wrapper">
                <span class="price">Rs. 291</span>
              </span>
            </span>
          </div>
        </div>
      </div>
    </li>
    <li class="item product product-item">
      <div class="product-item-info" id="product-item-info_646309">
        <div class="product-item-details">
          <strong class="product name product-item-name">
            <a class="product-item-link" href="https://www.ishopping.pk/apple-iphone-12-128gb">
              Apple iPhone 12 128GB
            </a>
          </strong>
          <div class="price-box price-final_price">
            <span id="product-price-646309"
                  data-price-amount="119999"
                  data-price-type="finalPrice"
                  class="price-wrapper">
              <span class="price">Rs. 119,999</span>
            </span>
          </div>
        </div>
      </div>
    </li>
  `;

  it("reads the current price from data-price-amount on the finalPrice span", () => {
    const listings = parseIShoppingHtml(FIXTURE_HTML);
    const cable = listings.find((l) => l.title.includes("Morui"));
    expect(cable).toBeDefined();
    expect(cable.price).toBe(291);
  });

  it("reads the was-price from data-price-amount on the oldPrice span itself", () => {
    const listings = parseIShoppingHtml(FIXTURE_HTML);
    const cable = listings.find((l) => l.title.includes("Morui"));
    expect(cable?.originalPrice).toBe(323);
  });

  it("leaves originalPrice null when no was-price element is present", () => {
    const listings = parseIShoppingHtml(FIXTURE_HTML);
    const iphone = listings.find((l) => l.title.includes("iPhone"));
    expect(iphone?.originalPrice).toBeNull();
  });
});