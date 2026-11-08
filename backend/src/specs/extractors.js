import * as cheerio from "cheerio";

function tableRows($, selector) {
  const out = {};
  $(selector).each((_, row) => {
    const cells = $(row).find("td, th");
    if (cells.length >= 2) {
      const k = $(cells[0]).text().trim();
      const v = $(cells[1]).text().trim();
      if (k && v) out[k] = v;
    }
  });
  return out;
}

function dlPairs($, selector) {
  const out = {};
  $(selector).each((_, dl) => {
    const dts = $(dl).find("dt");
    const dds = $(dl).find("dd");
    dts.each((i, dt) => {
      const k = $(dt).text().trim();
      const v = $(dds[i])?.text?.().trim() ?? "";
      if (k && v) out[k] = v;
    });
  });
  return out;
}

export function extractPriceoye(html) {
  const $ = cheerio.load(html);
  return {
    ...tableRows($, ".specs-table tr, .product-specifications tr, table.spec tr"),
    ...dlPairs($, ".product-specs dl, .specifications dl"),
  };
}

export function extractMega(html) {
  const $ = cheerio.load(html);
  return {
    ...tableRows($, ".product-specs tr, .technical-details tr, .specs tr"),
    ...dlPairs($, "dl.specs, .product-attributes dl"),
  };
}

export function extractShophive(html) {
  const $ = cheerio.load(html);
  return {
    ...tableRows($, "#product-attribute-specs-table tr, .data.table.additional-attributes tr"),
    ...dlPairs($, ".product.attribute dl"),
  };
}

export function extractW11stop(html) {
  const $ = cheerio.load(html);
  return tableRows($, ".product-specs table tr, .specifications table tr");
}

export function extractPaklap(html) {
  const $ = cheerio.load(html);
  return tableRows($, "#product-attribute-specs-table tr, .additional-attributes tr");
}

export function extractTelemart(html) {
  const $ = cheerio.load(html);
  return {
    ...tableRows($, ".product-specifications tr, .specifications tr"),
    ...dlPairs($, ".product-specs dl"),
  };
}

export function extractIshopping(html) {
  const $ = cheerio.load(html);
  return tableRows($, "#product-attribute-specs-table tr, .additional-attributes tr");
}

const EXTRACTORS = {
  priceoye:  extractPriceoye,
  mega:      extractMega,
  shophive:  extractShophive,
  w11stop:   extractW11stop,
  paklap:    extractPaklap,
  telemart:  extractTelemart,
  ishopping: extractIshopping,
};

export function extractSpecs(platform, html) {
  const fn = EXTRACTORS[String(platform).toLowerCase()];
  if (!fn) return null;
  const raw = fn(html);
  return Object.keys(raw).length > 0 ? raw : null;
}