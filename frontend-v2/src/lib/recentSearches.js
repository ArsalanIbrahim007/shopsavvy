// recentSearches.js — the last few things this shopper searched for, kept in their own browser.
// Never sent anywhere and never shared. Storage can be unavailable or hold junk (private windows, blocked
// site data, another version of the app), so every read and write is guarded and the page works without it.

const KEY = "shopsavvy:recent-searches:v1";
export const MAX_RECENT = 6;
const MAX_LENGTH = 100; // the server refuses longer search text anyway

function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** @returns {string[]} newest first, at most MAX_RECENT, only clean strings */
export function getRecentSearches() {
  try {
    const parsed = JSON.parse(storage()?.getItem(KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((term) => typeof term === "string" && term.trim() !== "" && term.length <= MAX_LENGTH)
      .map((term) => term.trim())
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

/** Remembers a search: newest first, no repeats (case-insensitive), capped. Returns the new list. */
export function addRecentSearch(term) {
  const clean = String(term ?? "").trim();
  if (!clean || clean.length > MAX_LENGTH) return getRecentSearches();

  const next = [clean, ...getRecentSearches().filter((old) => old.toLowerCase() !== clean.toLowerCase())].slice(0, MAX_RECENT);
  try {
    storage()?.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage full or blocked: the list simply is not remembered */
  }
  return next;
}

export function clearRecentSearches() {
  try {
    storage()?.removeItem(KEY);
  } catch {
    /* nothing to do */
  }
}
