// shopper.e2e.js — what a shopper does, through the real site, API and database (see playwright.config.js).
import { test, expect } from "@playwright/test";

import { API } from "../playwright.config.js";
import { A17, ITEMS } from "./fixtures.js";

const READABLE = /\/product\/samsung-galaxy-a17-8gb-256gb-pta-approved-[0-9a-f]{24}$/;

test("the API is on the e2e database, not the real catalogue", async ({ request }) => {
  const stats = await (await request.get(`${API}/api/listings/stats`)).json();
  expect(stats.products).toBe(ITEMS.length);
});

test("search from the home page, then open the product: every store's price, cheapest first", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("combobox", { name: "Search products" }).fill("galaxy a17");
  await page.getByRole("button", { name: "Search" }).click();

  await expect(page).toHaveURL(/\/results\?q=galaxy(\+|%20)a17/);
  const card = page.locator("article").filter({ hasText: A17 });
  await expect(card).toHaveCount(1); // three stores' offers, one product
  await expect(card).toContainText("PKR 62,999");

  await card.getByRole("link", { name: A17 }).click();
  await expect(page).toHaveURL(READABLE);
  await expect(page.getByRole("heading", { level: 1, name: A17 })).toBeVisible();
  // The offers table: one row per store, cheapest first.
  const rows = page.getByRole("table", { name: /^offers for/i }).getByRole("row").filter({ has: page.getByRole("cell") });
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText("PKR 62,999");
  await expect(rows.nth(0)).toContainText("PriceOye");
  await expect(rows.nth(1)).toContainText("PKR 63,999");
  await expect(rows.nth(1)).toContainText("Mega.pk");
  await expect(rows.nth(2)).toContainText("PKR 64,500");
  await expect(rows.nth(2)).toContainText("Shophive");

  await page.getByRole("link", { name: "← Back to results" }).click();
  await expect(page).toHaveURL(/\/results\?q=galaxy/);
});

test("browse a category without searching", async ({ page }) => {
  await page.goto("/results?category=smartphone");
  await expect(page.getByRole("link", { name: A17 })).toBeVisible();
  await expect(page.getByRole("link", { name: /Apple iPhone 17 Pro 256GB/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Haier/ })).toHaveCount(0); // an air conditioner is not a phone
});

test("an old product link (a bare id) opens the page and shows the readable address", async ({ page, request }) => {
  const search = await (await request.get(`${API}/api/listings/search?q=galaxy%20a17`)).json();
  const id = search.groups[0].offers[0]._id;
  await page.goto(`/product/${id}`);
  await expect(page.getByRole("heading", { level: 1, name: A17 })).toBeVisible();
  await expect(page).toHaveURL(READABLE);
});

test("a shared product link carries the product's own preview card, then opens its page", async ({ page, request }) => {
  const search = await (await request.get(`${API}/api/listings/search?q=galaxy%20a17`)).json();
  const id = search.groups[0].offers[0]._id;
  const html = await (await request.get(`${API}/share/product/x-${id}`, { maxRedirects: 0 })).text();
  expect(html).toContain(`<meta property="og:title" content="${A17}: from PKR 62,999">`);
  expect(html).toContain("From PKR 62,999 at 3 stores.");

  await page.goto(`${API}/share/product/x-${id}`);
  await expect(page).toHaveURL(READABLE);
  await expect(page.getByRole("heading", { level: 1, name: A17 })).toBeVisible();
});
