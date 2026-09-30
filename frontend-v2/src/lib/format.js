// format.js — how values are shown. Kept in one place so a price, a capacity or a
// date reads the same on every page. Locale is fixed to en-US for numbers so the
// grouping ("650,000") does not change with the visitor's browser settings.

const NUMBER = new Intl.NumberFormat("en-US");

export const formatNumber = (value) => NUMBER.format(value);

/** 65000 -> "PKR 65,000" */
export function formatPrice(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `PKR ${NUMBER.format(Math.round(number))}` : "—";
}

/** 256 -> "256 GB", 1024 -> "1 TB" */
export function formatCapacity(gb) {
  return gb >= 1024 ? `${gb / 1024} TB` : `${gb} GB`;
}

const CONDITIONS = { new: "New", used: "Used", refurbished: "Refurbished", open_box: "Open box" };
export const formatCondition = (value) => CONDITIONS[value] || value;

const PTA = { pta_approved: "PTA approved", non_pta: "Non-PTA" };
export const formatPta = (value) => PTA[value] || value;

/** Stores and our own parsing give brands in lower case: "apple" -> "Apple", short ones are acronyms: "hp" -> "HP". */
export function formatBrand(brand) {
  const text = String(brand ?? "").trim();
  if (!text) return "";
  if (text.length <= 3) return text.toUpperCase();
  return text.replace(/(^|[\s-])([a-z])/g, (_, lead, letter) => lead + letter.toUpperCase());
}

export const formatScreen = (inches) => `${inches}"`;

/** 25 -> "25% off". Whole percent; anything under 1% is not worth showing. */
export function formatPercent(fraction) {
  const percent = Math.round(fraction * 100);
  return percent >= 1 ? `${percent}%` : "";
}

/**
 * How long ago something happened, in plain words: "just now", "5 min ago",
 * "3 h ago", "2 days ago", and a date once it is more than two weeks old.
 * Used for "updated ..." so freshness is visible per offer.
 */
export function timeAgo(value, now = Date.now()) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "";

  const seconds = Math.max(0, Math.round((now - time) / 1000));
  if (seconds < 60) return "just now";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;

  const days = Math.round(hours / 24);
  if (days <= 14) return `${days} ${days === 1 ? "day" : "days"} ago`;

  return new Date(time).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
