// extension.js — the browser extension, as the website offers it (2026-11-27): where "Add to Chrome" leads, whether this browser
// can install it, and whether it is installed already (the extension's site.js marks the page). Used by the /extension page and
// the invitation (components/ExtensionPrompt.jsx).

/**
 * The extension's Chrome Web Store page, once it is published (set VITE_EXTENSION_STORE_URL in Cloudflare Pages, or here). Until
 * then "Add" opens /extension, which offers the .zip and the three steps to install it.
 */
export const EXTENSION_STORE_URL = (import.meta.env?.VITE_EXTENSION_STORE_URL || "").trim();
export const EXTENSION_ZIP = "/shopsavvy-extension.zip";
export const EXTENSION_STORES = 24; // the stores whose product pages it reads (extension/manifest.json), Qeemat besides

/** True when the extension marked this page (extension/site.js). */
export const extensionInstalled = (doc = globalThis.document) => Boolean(doc?.documentElement?.dataset?.shopsavvyExtension);

/**
 * "edge", "chrome" (Chrome, Brave, Opera: Chromium browsers that install from the Chrome Web Store) or null: a phone, Firefox or
 * Safari, which cannot run it.
 */
export function extensionBrowser(nav = globalThis.navigator) {
  if (!nav) return null;
  const ua = String(nav.userAgent ?? "");
  const mobile = nav.userAgentData?.mobile ?? /Mobi|Android|iPhone|iPad/i.test(ua);
  if (mobile) return null;
  if (/\bEdg\//.test(ua)) return "edge";
  if (/\b(Chrome|Chromium)\//.test(ua) && !/\bOPR\/|SamsungBrowser/.test(ua)) return "chrome";
  if (/\bOPR\//.test(ua)) return "chrome";
  return null;
}

export const browserName = (browser) => (browser === "edge" ? "Edge" : "Chrome");

// The invitation's memory, in this browser only: "Not now" hides it for NOT_NOW_DAYS, a click on "Add" for ADDED_DAYS.
const KEY = "shopsavvy:extension-prompt";
export const NOT_NOW_DAYS = 14;
export const ADDED_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

export function promptSnoozed(now = Date.now(), storage = globalThis.localStorage) {
  try {
    const until = Number(JSON.parse(storage?.getItem(KEY) ?? "null")?.until);
    return Number.isFinite(until) && until > now;
  } catch {
    return false;
  }
}

export function snoozePrompt(days, now = Date.now(), storage = globalThis.localStorage) {
  try {
    storage?.setItem(KEY, JSON.stringify({ until: now + days * DAY_MS }));
  } catch {
    /* private mode: shown again next visit */
  }
}
