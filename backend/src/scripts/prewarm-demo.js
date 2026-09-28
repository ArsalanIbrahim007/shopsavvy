// prewarm-demo.js
// Run this ~5-10 minutes before presenting to the panel: searches every query
// the homepage or a likely demo path will hit, so each is served from the
// 30-minute freshness cache (fast, ~3s) during the actual demo instead of
// live-scraping (~20s) while the panel watches.
//
// Usage: node src/scripts/prewarm-demo.js   (backend must be running)

const BASE = "http://localhost:5000/api/listings/search";

const QUERIES = [
  // Demo-protected: seeded fake-discount data, most important to have fresh & correct
  "iphone 17 pro",
  "samsung galaxy a57",
  // Homepage's own background fetches, fired automatically on load
  "iphone",
  "samsung",
  "laptop",
  "smartphone",
  // Homepage's clickable "Popular" chips
  "iPhone 17",
  "Samsung S25",
  "HP Laptop",
  "Xiaomi 14",
  "MacBook Air",
  "Samsung Galaxy A55",
];

// Deliberately modest -- firing all queries at once would recreate the
// concurrent-scrape pile-up fixed earlier (2026-09-29). The in-flight
// dedup fix means duplicate requests are safe, but this keeps the load
// on external sites reasonable regardless.
const CONCURRENCY = 3;

async function warmOne(query) {
  const start = Date.now();
  try {
    const res = await fetch(`${BASE}?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    const secs = ((Date.now() - start) / 1000).toFixed(1);
    console.log(
      `[${secs}s] "${query}" -> ${res.status}, groups=${data.groupCount ?? "?"}, offers=${data.count ?? "?"}, reason=${data.refresh?.reason ?? "?"}`
    );
  } catch (err) {
    const secs = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[${secs}s] "${query}" -> FAILED: ${err.message}`);
  }
}

async function runBatched(queries, concurrency) {
  const queue = [...queries];
  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length > 0) {
      const q = queue.shift();
      await warmOne(q);
    }
  });
  await Promise.all(workers);
}

const overallStart = Date.now();
runBatched(QUERIES, CONCURRENCY).then(() => {
  console.log(`\nDone in ${((Date.now() - overallStart) / 1000).toFixed(1)}s total.`);
  console.log("Cache is warm for ~30 minutes from each query's own scrape time -- re-run this closer to presenting if there's a gap.");
});
