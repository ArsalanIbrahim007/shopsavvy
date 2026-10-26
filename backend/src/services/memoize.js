// memoize.js — keeps the answers of a pure function of one string (a product title), for grouping.
//
// Grouping compares every listing with the groups it might join, and every comparison reads both titles again (storage, RAM,
// screen, PTA status, model codes, appliance readers...). Grouping the 2,502 "samsung" listings took 85 s, most of it re-reading
// the same few thousand titles millions of times (CPU profile, 2026-10-26). A function wrapped here must be pure: the same title
// always gives the same answer. Answers are shared between callers, which only read them. A cache is emptied when it reaches
// `limit` entries, so memory stays bounded however many titles pass through.
//
// 10,000 titles holds any one grouping (the largest category has about 3,300 listings) and keeps all the caches of one process
// near 40 MB: grouping six categories (11,664 listings) with no limit kept 47 MB, and the API runs the main thread and two
// grouping workers, each with its own caches, on hosts that may have 512 MB in all.
export const MEMO_LIMIT = 10000;

/** fn(text), remembered per text. Extra arguments are not part of the key, so only wrap functions of the text alone. */
export function memoize(fn, limit = MEMO_LIMIT) {
  const cache = new Map();
  return (text = "") => {
    const key = String(text);
    let value = cache.get(key);
    if (value === undefined && !cache.has(key)) {
      if (cache.size >= limit) cache.clear();
      value = fn(key);
      cache.set(key, value);
    }
    return value;
  };
}
