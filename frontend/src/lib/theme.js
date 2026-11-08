// theme.js — the shopper's colour-theme choice: dark (the default, since 2026-11-08), light, or follow the device.
// Kept in their own browser only. Storage can be unavailable (private windows, blocked site data), so
// every read and write is guarded and the page simply follows the device without it.
//
// The choice is applied as a data-theme attribute on <html>; tokens.css does the rest. "system" means no
// attribute, so the device's own setting (prefers-color-scheme) decides. Nothing stored means dark, so
// "system" has to be stored like the others.

export const THEME_KEY = "shopsavvy:theme:v1";
export const THEMES = ["dark", "light", "system"];

// index.html repeats this key in a tiny inline script that applies the choice before the first paint, so
// a dark-mode shopper never sees a white flash. tests/theme.test.js checks the two agree.

function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export const DEFAULT_THEME = "dark";

/** @returns {"system"|"light"|"dark"} the saved choice; anything else (missing, junk) is the default, dark */
export function getStoredTheme() {
  try {
    const saved = storage()?.getItem(THEME_KEY);
    return THEMES.includes(saved) ? saved : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function storeTheme(theme) {
  try {
    storage()?.setItem(THEME_KEY, theme);
  } catch {
    /* blocked or full: the choice lasts until the page closes */
  }
}

/** Sets or clears the attribute tokens.css reads. */
export function applyTheme(theme, root = document.documentElement) {
  if (theme === "light" || theme === "dark") root.setAttribute("data-theme", theme);
  else root.removeAttribute("data-theme");
}

/** The button cycles dark -> light -> device -> dark. */
export function nextTheme(theme) {
  return THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
}
