// measure-response-times.js — measures how fast the API answers, for the evaluation the initial report promised ("response time,
// matching accuracy and anomaly detection effectiveness"). Asks each main endpoint REPEAT times in a row and reports the median and
// the 95th percentile, the first (cold) answer apart, and the compressed size. Writes PERFORMANCE_REPORT.md beside it.
//
//   node src/scripts/ops/measure-response-times.js                       against http://localhost:5000
//   node src/scripts/ops/measure-response-times.js https://api.example   against another server
//
// Run it against a server that has been up a few minutes (its caches warm), with nothing else loading it.

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import https from "node:https";
import { gunzipSync } from "node:zlib";

const BASE = (process.argv[2] || "http://localhost:5000").replace(/\/+$/, "");
const REPEAT = 20;
const here = dirname(fileURLToPath(import.meta.url));

async function firstProductId() {
  const res = await fetch(`${BASE}/api/listings/catalog?category=smartphone&limit=1`);
  const body = await res.json();
  return body.data?.[0]?.offers?.[0]?._id;
}

const ENDPOINTS = async () => {
  const id = await firstProductId();
  return [
    ["Health check", "/api/health"],
    ["Home: most compared (5 phones)", "/api/listings/catalog?category=smartphone&limit=5"],
    ["Home: verified deals", "/api/listings/deals?limit=8"],
    ["Home: caught discounts", "/api/listings/caught"],
    ["Search: \"samsung galaxy a17\"", "/api/listings/search?q=samsung%20galaxy%20a17"],
    ["Search: \"iphone 17 pro max\"", "/api/listings/search?q=iphone%2017%20pro%20max"],
    ["Product page", `/api/listings/${id}`],
    ["Price drops", "/api/listings/drops?limit=48"],
    ["Honest prices report", "/api/integrity"],
  ];
};

const percentile = (xs, q) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)];
};

// The raw HTTP client, not fetch: fetch unpacks gzip itself, and the point is to count the bytes that travelled.
function timeOnce(path) {
  const url = new URL(`${BASE}${path}`);
  const client = url.protocol === "https:" ? https : http;
  const started = performance.now();
  return new Promise((resolve, reject) => {
    client
      .get(url, { headers: { "accept-encoding": "gzip" } }, (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks);
          const ms = performance.now() - started;
          const plain = res.headers["content-encoding"] === "gzip" ? gunzipSync(raw).length : raw.length;
          resolve({ ms, status: res.statusCode, size: raw.length, plain });
        });
      })
      .on("error", reject);
  });
}

const rows = [];
for (const [name, path] of await ENDPOINTS()) {
  const cold = await timeOnce(path);
  const times = [];
  let last = cold;
  for (let i = 0; i < REPEAT; i++) {
    last = await timeOnce(path);
    times.push(last.ms);
  }
  const row = { name, path, status: last.status, first: cold.ms, median: percentile(times, 0.5), p95: percentile(times, 0.95), size: last.size, plain: last.plain };
  rows.push(row);
  console.log(`${name.padEnd(34)} ${String(row.status).padStart(3)}  first ${row.first.toFixed(0).padStart(6)} ms  median ${row.median.toFixed(1).padStart(7)} ms  p95 ${row.p95.toFixed(1).padStart(7)} ms  ${(row.size / 1024).toFixed(1)} KB sent (${(row.plain / 1024).toFixed(1)} KB of JSON)`);
}

const kb = (b) => `${(b / 1024).toFixed(1)} KB`;
writeFileSync(join(here, "PERFORMANCE_REPORT.md"), `# Response times

Measured ${new Date().toISOString()} against \`${BASE}\` by \`src/scripts/ops/measure-response-times.js\`: each endpoint asked ${REPEAT + 1}
times in a row from the same machine, the first answer ("first") apart from the rest (median and 95th percentile). Sizes are what was
sent (gzip) and the JSON it unpacks to.

| What | First | Median | 95th percentile | Sent | JSON |
|---|---|---|---|---|---|
${rows.map((r) => `| ${r.name} | ${r.first.toFixed(0)} ms | ${r.median.toFixed(1)} ms | ${r.p95.toFixed(1)} ms | ${kb(r.size)} | ${kb(r.plain)} |`).join("\n")}

How it is kept fast: answers are compressed; the category catalogues, deals, caught discounts and the honest-prices report are computed
in the background and kept (in memory, and on disk across restarts); a product page is kept a minute; a search answers from stored
prices at once and refreshes stale ones in the background; and the site starts loading a product when its card is hovered.
`);
console.log(`\nWrote ${join(here, "PERFORMANCE_REPORT.md")}`);
