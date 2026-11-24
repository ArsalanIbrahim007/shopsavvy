// The price-alert emails as HTML (2026-11-24).
import { describe, it, expect } from "vitest";

import { confirmationEmail, escapeHtml, pkr, reachedEmail, storeName } from "../src/services/alertEmail.service.js";

describe("alert emails", () => {
  const alert = { title: 'Galaxy A17 <b>"bold"</b>', targetPrice: 451000 };

  it("writes prices with commas and names stores", () => {
    expect(pkr(451000)).toBe("PKR 451,000");
    expect(storeName("priceoye")).toBe("PriceOye");
    expect(storeName("unknownshop")).toBe("unknownshop");
  });

  it("escapes a store's title, so a title can never add HTML to the email", () => {
    const html = confirmationEmail(alert, { confirmUrl: "https://x.example/c", cancelUrl: "https://x.example/n" });
    expect(html).not.toContain("<b>");
    expect(html).toContain(escapeHtml(alert.title));
  });

  it("links only http(s) addresses", () => {
    const html = reachedEmail(alert, { price: 449999, productUrl: "javascript:alert(1)" }, { cancelUrl: "https://x.example/n" });
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("View deal"); // no safe address, no button
  });

  it("says how far under the target the price is, and where", () => {
    const html = reachedEmail(alert, { price: 449999, platform: "mega", productUrl: "https://mega.pk/x" });
    expect(html).toContain("PKR 1,001 under your target");
    expect(html).toContain("Mega.pk");
  });
});
