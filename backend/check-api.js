// check-api.js — run with: node check-api.js   (backend must be running)
const BASE = "http://localhost:5000/api";
const QUERY = process.argv[2] || "iphone 17 pro";

async function main() {
  console.log(`=== SEARCH: ${QUERY} ===`);
// Refresh is opt-in. A re-scrape overwrites the seeded originalPrice values
  // that the fake-discount badges depend on, so the default reads stored data.
  const refresh = process.argv.includes("--refresh") ? "&refresh=true" : "";

  const res = await fetch(
    `${BASE}/listings/search?q=${encodeURIComponent(QUERY)}${refresh}`
  );
  const j = await res.json();

  console.log("groups:", j.groupCount, "| listings:", j.count);
  console.log("refresh:", JSON.stringify(j.refresh));
  console.log("summary:", JSON.stringify(j.summary, null, 1));

  console.log("\n--- all offers ---");
  (j.data || []).forEach((o) => {
    console.log(
      String(o.platform).padEnd(10),
      String(o.price).padStart(7),
      "score:" + String(o.dealScore).padStart(5),
      "hist:" + String((o.priceHistory || []).length).padStart(2),
      String(o.recommendation?.action || "-").padEnd(11),
      String(o.discountAnalysis?.classification || "-").padEnd(22),
      String(o.title).slice(0, 38)
    );
  });

  console.log("\n--- groups ---");
  (j.groups || []).forEach((g) => {
    console.log(
      "offers:" + String(g.offerCount).padStart(2),
      String(g.lowestPrice).padStart(7),
      "-",
      String(g.highestPrice).padStart(7),
      " " + String(g.productName).slice(0, 45)
    );
  });

}

main().catch((e) => console.error("FAILED:", e.message));