// ptaPage.service.js — reads PTA approval from a store's own product page. Pure: HTML in, answer out; fetching
// and saving live in ptaEnrichment.service.js.
//
// Why: most stores leave "PTA" out of their listing titles ("Samsung Galaxy A17"), so a title can say nothing about
// a phone whose page says "PTA Status: PTA Approved" (iShopping's attribute list) or shows a "PTA Approved" badge
// (PriceOye). Without this the shopper sees "PTA not stated" for a phone the store does state.
//
// What counts as evidence, strongest first. Each is part of THIS product's page, never the whole page text, because
// a product page also lists other products ("Related: iPhone 16 PTA Approved") and that would give the wrong answer:
//   1. a labelled specification: a table row, definition or list item whose label mentions PTA ("PTA Approved: Yes");
//   2. a store's attribute list that names PTA ("PTA Status" with its options, as Magento stores embed it);
//   3. PriceOye's summary badge (summaryAttributes.approved);
//   4. the page's own title, heading, description and structured data;
//   5. the product's own gallery image titles, only where they name this product ("iShopping - Samsung Galaxy A17-Black-PTA Approved-128GB").
// When the evidence disagrees (a store that sells the same page in both PTA and non-PTA versions), the answer is
// "unknown": better to say "not stated" than to pick one.

import * as cheerio from "cheerio";

import { extractPtaStatus } from "./productAttributes.service.js";

const NON_PTA_WORDS = /\bnon[\s-]?pta\b|\bnot\s+pta\b|\bpta\s+not\s+approved\b|\bwithout\s+pta\b|\bunapproved\b|\bnot\s+approved\b/i;
const YES_VALUE = /^(yes|approved|available|registered|verified|true)\b/i;
const NO_VALUE = /^(no|not|non|unapproved|false|n\/?a\b)/i;

/** "pta_approved", "non_pta" or "unknown" for one piece of text. */
export function classify(text) {
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "unknown";
  if (NON_PTA_WORDS.test(t) && /\bpta\b|\bnon[\s-]?pta\b/i.test(t)) return "non_pta";
  return extractPtaStatus(t);
}

/** A label/value pair like "PTA Approved" / "Yes". */
function classifyPair(label, value) {
  const v = String(value ?? "").replace(/\s+/g, " ").trim();
  if (YES_VALUE.test(v)) return /non[\s-]?pta/i.test(label) ? "non_pta" : "pta_approved";
  if (NO_VALUE.test(v)) return "non_pta";
  return classify(`${label} ${v}`);
}

function labelledSpecs($) {
  const found = [];
  const pair = (label, value) => {
    if (/\bpta\b/i.test(label)) found.push({ status: classifyPair(label, value), text: `${label.trim()}: ${String(value).replace(/\s+/g, " ").trim()}` });
  };

  $("tr").each((_, tr) => {
    const cells = $(tr).children("th,td");
    if (cells.length >= 2) pair($(cells[0]).text(), $(cells[1]).text());
  });
  $("dt").each((_, dt) => pair($(dt).text(), $(dt).next("dd").text()));
  $("li").each((_, li) => {
    const text = $(li).text().replace(/\s+/g, " ").trim();
    const m = /^([^:]{1,40}):\s*(.{1,80})$/.exec(text);
    if (m) pair(m[1], m[2]);
  });
  return found;
}

/** Stores embedding an attribute list as JSON, e.g. {"code":"pta_approved","label":"PTA Status","options":[{"label":"PTA Approved"}]}. */
function attributeLists(html) {
  const found = [];
  const re = /"label"\s*:\s*"([^"]*\bPTA\b[^"]*)"\s*,\s*"options"\s*:\s*\[([^\]]*(?:\[[^\]]*\][^\]]*)*)\]/gi;
  let m;
  while ((m = re.exec(html))) {
    for (const option of m[2].matchAll(/"label"\s*:\s*"([^"]*)"/g)) {
      found.push({ status: classifyPair(m[1], option[1]), text: `${m[1]}: ${option[1]}` });
    }
  }
  return found;
}

function priceOyeBadge(html) {
  const m = /"summaryAttributes"\s*:\s*\{\s*"approved"\s*:\s*\{\s*"title"\s*:\s*"([^"]*)"/i.exec(html);
  return m ? [{ status: classify(m[1]), text: m[1] }] : [];
}

function ownTitles($) {
  const texts = [
    $("title").first().text(),
    $("h1").first().text(),
    $('meta[property="og:title"]').attr("content"),
    $('meta[name="description"]').attr("content"),
    $('meta[property="og:description"]').attr("content"),
  ];
  $('script[type="application/ld+json"]').each((_, script) => {
    try {
      const walk = (node) => {
        if (Array.isArray(node)) return node.forEach(walk);
        if (!node || typeof node !== "object") return;
        if (/product/i.test(String(node["@type"] ?? ""))) texts.push(node.name, node.description);
        Object.values(node).forEach(walk);
      };
      walk(JSON.parse($(script).contents().text()));
    } catch {
      /* structured data that is not valid JSON is ignored */
    }
  });
  return texts.filter(Boolean).map((text) => ({ status: classify(text), text: String(text).replace(/\s+/g, " ").trim().slice(0, 160) }));
}

/** Gallery image titles that name this product, e.g. "iShopping - Samsung Galaxy A17-Black-PTA Approved-128GB". */
function galleryTitles($, productName) {
  const name = String(productName ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!name) return [];
  const found = [];
  $("img[alt], a[title], img[title]").each((_, el) => {
    const text = ($(el).attr("alt") || $(el).attr("title") || "").replace(/\s+/g, " ").trim();
    if (text.toLowerCase().includes(name) && /\bpta\b/i.test(text)) found.push({ status: classify(text), text: text.slice(0, 160) });
  });
  return found;
}

/**
 * @param {string} html  a store's product page
 * @param {object} [options]
 * @param {string} [options.productName]  the listing's own title, to recognise its own gallery images
 * @returns {{status: "pta_approved"|"non_pta"|"unknown", evidence: string|null, source: string|null}}
 */
export function extractPtaFromPage(html, { productName } = {}) {
  const page = String(html ?? "");
  if (!page) return { status: "unknown", evidence: null, source: null };
  const $ = cheerio.load(page);

  const layers = [
    ["specification", labelledSpecs($)],
    ["attribute list", attributeLists(page)],
    ["summary badge", priceOyeBadge(page)],
    ["page title or description", ownTitles($)],
    ["product images", galleryTitles($, productName)],
  ];

  for (const [source, items] of layers) {
    const stated = items.filter((item) => item.status !== "unknown");
    if (stated.length === 0) continue;
    const statuses = new Set(stated.map((item) => item.status));
    // A page that names both a PTA and a non-PTA version is not a statement about this listing.
    if (statuses.size > 1) return { status: "unknown", evidence: `mixed: ${stated.map((s) => s.text).slice(0, 2).join(" / ")}`, source };
    return { status: stated[0].status, evidence: stated[0].text, source };
  }
  return { status: "unknown", evidence: null, source: null };
}
