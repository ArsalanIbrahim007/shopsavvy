// theme.js — the shopper's colour-theme choice: follow the device (default), or light, or dark.
// Kept in their own browser only. Storage can be unavailable (private windows, blocked site data), so
// every read and write is guarded and the page simply follows the device without it.
//
// The choice is applied as a data-theme attribute on <html>; tokens.css does the rest. "system" means no
// attribute, so the device's own setting (prefers-color-scheme) decides.

export const THEME_KEY = "shopsavvy:theme:v1";
export const THEMES = ["system", "light", "dark"];

// index.html repeats this key in a tiny inline script that applies the choice before the first paint, so
// a dark-mode shopper never sees a white flash. tests/theme.test.js checks the two agree.

function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** @returns {"system"|"light"|"dark"} the saved choice; anything else (missing, junk) is "system" */
export function getStoredTheme() {
  try {
    const saved = storage()?.getItem(THEME_KEY);
    return THEMES.includes(saved) ? saved : "system";
  } catch {
    return "system";
  }
}

export function storeTheme(theme) {
  try {
    if (theme === "system") storage()?.removeItem(THEME_KEY);
    else storage()?.setItem(THEME_KEY, theme);
  } catch {
    /* blocked or full: the choice lasts until the page closes */
  }
}

/** Sets or clears the attribute tokens.css reads. */
export function applyTheme(theme, root = document.documentElement) {
  if (theme === "light" || theme === "dark") root.setAttribute("data-theme", theme);
  else root.removeAttribute("data-theme");
}

/** The button cycles device -> light -> dark -> device. */
export function nextTheme(theme) {
  return THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
}
