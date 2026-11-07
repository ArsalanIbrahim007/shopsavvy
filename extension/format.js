// format.js — words and numbers the panel and the popup show, from the API's /match answer. A plain script (no imports), like
// reader.js: loaded by the content script and the popup, and read by the tests.

(function () {
  "use strict";

  const rupees = (n) => `PKR ${Math.round(Number(n)).toLocaleString("en-US")}`;

  /** "-15k" or "-1.5L" for the toolbar badge (four or five characters fit). */
  function badgeSaving(saving) {
    const n = Math.round(Number(saving));
    if (!(n > 0)) return "";
    if (n >= 100000) return `-${(n / 100000).toFixed(n >= 1000000 ? 0 : 1).replace(/\.0$/, "")}L`;
    if (n >= 1000) return `-${Math.round(n / 1000)}k`;
    return `-${n}`;
  }

  /** Only http(s) addresses become links: the API's answer is data, never trusted to be a safe link. */
  function safeLink(url) {
    try {
      const u = new URL(String(url));
      return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
    } catch {
      return null;
    }
  }

  const DISCOUNT = {
    likely_fake: "The store's discount looks fake: the price was never that high",
    suspicious: "The store's discount looks doubtful",
    genuine_discount: "The discount is real: the price was higher before",
  };
  const ADVICE = { BUY_NOW: "Buy now", GOOD_DEAL: "Good deal", FAIR_PRICE: "Fair price", WAIT: "Wait", OVERPRICED: "Overpriced" };

  /**
   * What to tell the shopper about this page, from a found /match answer.
   * @returns {{tone: "save"|"best"|"info", headline: string, lines: string[]}}
   */
  function summary(result, storeName) {
    const lines = [];
    const others = result.offers?.length ?? 0;
    const stores = new Set((result.offers ?? []).map((o) => o.platform)).size;
    let tone = "info";
    let headline = `Also sold by ${stores} other ${stores === 1 ? "store" : "stores"}`;
    if (result.cheapest?.cheaperThanThisPage) {
      tone = "save";
      headline = `${rupees(result.cheapest.price)} at ${storeName(result.cheapest.platform)}: save ${rupees(result.cheapest.saving)}`;
    } else if (result.cheapest && others > 0) {
      tone = "best";
      headline = "This is the lowest price we found";
    }
    if (result.atLow?.thisPage) lines.push("The lowest price we have recorded for it");
    const discount = DISCOUNT[result.discountVerdict?.discount?.classification];
    if (discount) lines.push(discount);
    if (result.discountVerdict?.price) lines.push("This price looks unusual next to the other stores");
    if (result.matchedBy === "similar") lines.push("Matched by name and price: check it is the same model");
    // "Good deal" under "save PKR 6,521 at Shophive" contradicts itself (seen on iShopping, 2026-11-07): this page's own verdict is
    // left out when another store is cheaper, unless it is a warning.
    const advice = ADVICE[result.advice?.action];
    const praise = result.advice?.action === "BUY_NOW" || result.advice?.action === "GOOD_DEAL";
    if (advice && !(praise && tone === "save")) lines.push(`Our verdict: ${advice}`);
    return { tone, headline, lines };
  }

  globalThis.ShopSavvyFormat = { rupees, badgeSaving, safeLink, summary };
})();
