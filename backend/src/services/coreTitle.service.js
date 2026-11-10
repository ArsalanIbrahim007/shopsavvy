// coreTitle.service.js — the product a marketplace title names, without the specification list the seller wrote after it.
//
// Daraz sellers write the spec sheet into the title: "Tecno Spark Go 3 - 6.75 Inches Display - 4GB RAM 64GB/128GB ROM - 8MP Front
// Camera - 13MP Rear Camera - Unisoc T7250 - Dual SIM - 5000mAh Battery" (2026-11-10). Matched as it stands, the extension found no
// other store selling it (the camera, battery and display words outweigh the model), and its "Search for it on ShopSavvy" link was
// refused (a search is at most 100 characters). The core is "Tecno Spark Go 3 4GB RAM": the title up to its first spec part, plus
// a part that states the capacity. A part listing several storage sizes ("64GB/128GB ROM": the page sells both) keeps its RAM only,
// so the page's price picks the variant.

/** A part of a title that describes a feature rather than naming the product or its capacity. */
const SPEC_PART =
  /\b\d+(\.\d+)?\s*(-?\s*inch(es)?|"|″|mp|megapixels?|mah|hz|nits|w)\b|\b(display|screen|camera|battery|processor|chipset|octa|quad|core|unisoc|snapdragon|helio|dimensity|exynos|bionic|tensor|kirin|dual\s*sim|single\s*sim|sim\b|fingerprint|android|ios\b|charging|charger|fast|wifi|bluetooth|nfc|gps|amoled|lcd|oled|ips|resolution|refresh|stereo|speakers?|ip\d\d|water|dust|warranty|official|brand new|box packed|free)\b/i;
const CAPACITY = /\b\d+\s*(gb|tb)\b/i;

/** "Tecno Spark Go 3 - 6.75 Inches Display - 4GB RAM 64GB/128GB ROM - ..." -> "Tecno Spark Go 3 4GB RAM". Short titles come back as they are. */
export function coreTitle(title) {
  const text = String(title ?? "").replace(/\s+/g, " ").trim();
  const parts = text.split(/\s+[-|–]\s+|\s*\|\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 3 && text.length <= 80) return text;

  const kept = [parts[0]];
  for (const part of parts.slice(1)) {
    if (CAPACITY.test(part)) {
      // several storage sizes: the RAM only ("4GB RAM 64GB/128GB ROM" -> "4GB RAM")
      const several = /\d+\s*(gb|tb)\s*\/\s*\d+\s*(gb|tb)/i.test(part) || (part.match(/\d+\s*(gb|tb)/gi) ?? []).length > 2;
      kept.push(several ? (part.match(/\b\d+\s*gb\s*ram\b/i)?.[0] ?? "") : part);
    } else if (!SPEC_PART.test(part) && kept.length === 1 && part.split(" ").length <= 3) {
      kept.push(part); // a short model part right after the name ("Galaxy A17 - 5G")
    }
  }
  return kept.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

/** A search text at most `max` characters: the core of a long title, then cut at a word. */
export function searchableText(text, max = 100) {
  const raw = String(text ?? "").replace(/\s+/g, " ").trim();
  if (raw.length <= max) return raw;
  const core = coreTitle(raw);
  if (core.length <= max) return core;
  return core.slice(0, max).replace(/\s+\S*$/, "").trim();
}
