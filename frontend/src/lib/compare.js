// compare.js — the products a shopper has picked to compare: up to four, of one kind (phones with phones), kept in this browser
// (localStorage) so the list survives moving between pages. No account, nothing sent anywhere: the Compare page asks the server
// for the picked ids only when it is opened.

import { useSyncExternalStore } from "react";

export const COMPARE_MAX = 4;
const KEY = "shopsavvy.compare";
const EVENT = "shopsavvy:compare";

function read() {
  try {
    const items = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(items) ? items.filter((item) => item && typeof item.id === "string").slice(0, COMPARE_MAX) : [];
  } catch {
    return [];
  }
}

let cache = null; // the parsed list, so useSyncExternalStore sees the same array until it changes
function snapshot() {
  if (cache === null) cache = read();
  return cache;
}

function write(items) {
  cache = items;
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // private mode or storage full: the list still works for this page
  }
  window.dispatchEvent(new Event(EVENT));
}

export function getCompare() {
  return snapshot();
}

export function inCompare(id) {
  return snapshot().some((item) => item.id === String(id));
}

/**
 * Adds a product, or removes it when it is already there.
 * @param {{id: string, name: string, category?: string, image?: string}} item
 * @returns {{ok: true, added: boolean} | {ok: false, reason: string}}
 */
export function toggleCompare(item) {
  const items = snapshot();
  const id = String(item.id);
  if (items.some((i) => i.id === id)) {
    write(items.filter((i) => i.id !== id));
    return { ok: true, added: false };
  }
  const kind = items[0]?.category;
  if (kind && item.category && kind !== item.category) {
    return { ok: false, reason: "Compare holds one kind of product at a time. Clear it to compare this one." };
  }
  if (items.length >= COMPARE_MAX) return { ok: false, reason: `Compare holds ${COMPARE_MAX} products. Remove one first.` };
  write([...items, { id, name: String(item.name ?? ""), category: item.category ?? null, image: item.image ?? null }]);
  return { ok: true, added: true };
}

export function removeFromCompare(id) {
  write(snapshot().filter((item) => item.id !== String(id)));
}

export function clearCompare() {
  write([]);
}

const ID = /^[a-f0-9]{24}$/i;

/** The ids to compare: the address's (?ids=a,b), else the picked list's; listing ids only, at most four, each once. */
export function compareIds(param, picked = snapshot()) {
  const fromUrl = String(param ?? "").split(",").map((s) => s.trim()).filter((s) => ID.test(s));
  const ids = fromUrl.length ? fromUrl : picked.map((item) => item.id);
  return [...new Set(ids)].slice(0, COMPARE_MAX);
}

/** The Compare page's address for the picked products. */
export function comparePath(items = snapshot()) {
  return `/compare?ids=${items.map((item) => item.id).join(",")}`;
}

function subscribe(onChange) {
  const onStorage = (event) => {
    if (event.key === KEY) {
      cache = null; // another tab changed it
      onChange();
    }
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** The picked products, kept current. */
export function useCompare() {
  return useSyncExternalStore(subscribe, snapshot, () => []);
}

/** For tests. */
export function resetCompareCache() {
  cache = null;
}
