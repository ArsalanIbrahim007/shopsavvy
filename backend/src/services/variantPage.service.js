// variantPage.service.js — the RAM and storage a store's product page sells a phone in, when its title names neither (2026-11-27).
//
// iShopping lists "Samsung Galaxy A17" at PKR 65,999; its page offers "128GB - 6GB RAM" (65,999 in black) and "256GB - 8GB RAM"
// (78,999), with the cheapest one chosen. The listing's price is that chosen variant's, so the variant whose price is the listing's
// is the phone listed. Read from Magento's jsonConfig (the swatch renderer's attributes, optionPrices and products), which every
// Magento store's configurable product page carries.

/** "128GB - 6GB RAM", "8GB RAM / 256GB", "6GB+128GB", "1TB - 12GB RAM" -> { ramGb, storageGb }, or null. */
export function readMemoryLabel(label = "") {
  const text = String(label).toLowerCase();
  const sizes = [...text.matchAll(/(\d{1,4})\s*(gb|tb)(\s*ram)?/g)].map((m) => ({
    gb: Number(m[1]) * (m[2] === "tb" ? 1024 : 1),
    ram: Boolean(m[3]),
  }));
  if (sizes.length !== 2) return null;
  const ram = sizes.find((s) => s.ram) ?? [...sizes].sort((a, b) => a.gb - b.gb)[0];
  const storage = sizes.find((s) => s !== ram);
  if (!(ram.gb >= 1 && ram.gb <= 24) || !(storage.gb >= 16 && storage.gb <= 2048)) return null;
  return { ramGb: ram.gb, storageGb: storage.gb };
}

function balancedObject(text, start) {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

/**
 * The memory variants a Magento product page sells: [{ label, ramGb, storageGb, price }], price being the variant's lowest (its
 * colours may differ). Empty when the page has no memory choice.
 */
export function memoryVariants(html = "") {
  const page = String(html);
  const at = /"jsonConfig"\s*:\s*/.exec(page);
  if (!at) return [];
  let config;
  try {
    config = JSON.parse(balancedObject(page, at.index + at[0].length) ?? "{}");
  } catch {
    return [];
  }
  const prices = config.optionPrices ?? {};
  const out = [];
  for (const attribute of Object.values(config.attributes ?? {})) {
    if (!/memory|ram|storage|capacity/i.test(`${attribute?.code ?? ""} ${attribute?.label ?? ""}`)) continue;
    for (const option of attribute.options ?? []) {
      const memory = readMemoryLabel(option?.label);
      const amounts = (option?.products ?? []).map((id) => Number(prices[id]?.finalPrice?.amount)).filter((n) => n > 0);
      if (memory && amounts.length) out.push({ label: String(option.label), ...memory, price: Math.min(...amounts) });
    }
  }
  return out;
}

/** The variant the listing's price is, when exactly one is: the phone the listing names. Null otherwise. */
export function listedVariant(variants, price) {
  const same = (variants ?? []).filter((v) => Math.abs(v.price - Number(price)) < 1);
  return same.length === 1 ? same[0] : null;
}
