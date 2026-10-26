// load-test.js — how many shoppers at once the API serves, and how fast, on this machine and this catalogue.
//
// It starts its own copy of the API (PORT 5055, nightly scrape off) and drives it with "virtual shoppers": each one sends a request,
// waits for the answer, and sends the next, picking what to ask for by the mix below (a search, a product page, a category...).
// Phases of 10, 25 and 50 shoppers at once run 30 s each; for every phase and every kind of request it records how many were
// answered, how fast (median, 95th and 99th percentile) and how many failed. The result is written to LOAD_TEST.md.
//
// Two things keep it honest and polite:
//  - Every rate limit counts per visitor. From one machine every request comes from one address, so the copy runs with
//    TRUST_PROXY=1 and each shopper sends one of 200 made-up visitor addresses in X-Forwarded-For, as a host's proxy would. A
//    shopper can still hit a limit; such answers (429) are counted separately.
//  - A search whose prices are stale starts a refresh from the stores. So the search phrases are each searched once first, and
//    the test waits until they are fresh: the stores see one ordinary search per phrase, and none during the test.
//
//   node src/scripts/ops/load-test.js                 the three phases, then LOAD_TEST.md
//   node src/scripts/ops/load-test.js --phase=20      one phase of 20 shoppers

import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import os from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BACKEND = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const PORT = 5055;
const BASE = `http://127.0.0.1:${PORT}`;
const PHASE_SECONDS = 30;
const phaseArg = process.argv.find((a) => a.startsWith("--phase="));
const PHASES = phaseArg ? [Number(phaseArg.split("=")[1])] : [10, 25, 50];
const VISITORS = 200;
const QUERIES = ["iphone 17 pro", "samsung galaxy a17", "redmi note 15 pro", "dell latitude", "haier ac 1.5 ton", "samsung 55 inch tv"];
const SUGGEST = ["iph", "sams", "redmi no", "dell", "haier", "lg"];
const CATEGORIES = ["smartphone", "laptop", "tv", "air_conditioner", "refrigerator", "headphones"];

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const visitor = () => `10.${Math.floor(Math.random() * 2)}.${Math.floor(Math.random() * 100)}.${1 + Math.floor(Math.random() * VISITORS / 2)}`;

async function get(path, { ip = visitor(), timeoutMs = 60000 } = {}) {
  const started = performance.now();
  try {
    const res = await fetch(`${BASE}${path}`, { headers: { "X-Forwarded-For": ip }, signal: AbortSignal.timeout(timeoutMs) });
    const body = res.headers.get("content-type")?.includes("json") ? await res.json() : await res.text();
    return { status: res.status, ms: performance.now() - started, body };
  } catch (error) {
    return { status: 0, ms: performance.now() - started, error: error.name };
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(check, what, timeoutMs) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (await check()) return;
    await sleep(2000);
  }
  throw new Error(`timed out waiting for ${what}`);
}

// ---- start the API -----------------------------------------------------------------------------------------------------------

const server = spawn(process.execPath, ["src/app.js"], {
  cwd: BACKEND,
  env: { ...process.env, PORT: String(PORT), TRUST_PROXY: "1", SCHEDULED_SCRAPING: "false" },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (chunk) => { serverLog += chunk; });
server.stderr.on("data", (chunk) => { serverLog += chunk; });
const stop = () => { if (!server.killed) server.kill(); };
process.on("exit", stop);

try {
  console.log("starting the API on port", PORT);
  await waitFor(async () => (await get("/api/health")).status === 200, "the API", 120000);
  console.log("waiting for the catalogue caches (built at start-up)");
  await waitFor(() => serverLog.includes("[catalog] Cache warmed"), "the catalogue caches", 15 * 60 * 1000);

  // ---- what to ask for ---------------------------------------------------------------------------------------------------
  const productIds = [];
  const pageUrls = [];
  for (const category of CATEGORIES) {
    const { body } = await get(`/api/listings/catalog?category=${category}&limit=20`);
    for (const group of body.data ?? []) {
      const offer = group.offers?.[0];
      if (offer?._id) productIds.push(offer._id);
      if (offer?.sourceUrl || offer?.productUrl) pageUrls.push(offer.sourceUrl || offer.productUrl);
    }
  }
  console.log(`${productIds.length} product pages and ${pageUrls.length} store pages to ask about`);

  console.log("warming the search phrases (one ordinary search each, then waiting until fresh)");
  for (const q of QUERIES) {
    const path = `/api/listings/search?q=${encodeURIComponent(q)}`;
    await get(path, { timeoutMs: 120000 });
    await waitFor(async () => (await get(path, { timeoutMs: 120000 })).body?.refresh?.reason === "fresh_data", `"${q}" to be fresh`, 180000);
  }

  // ---- the mix -------------------------------------------------------------------------------------------------------------
  const MIX = [
    ["search", 30, () => `/api/listings/search?q=${encodeURIComponent(pick(QUERIES))}`],
    ["product page", 25, () => `/api/listings/${pick(productIds)}`],
    ["category page", 15, () => `/api/listings/catalog?category=${pick(CATEGORIES)}&limit=24`],
    ["home: deals and counts", 10, () => (Math.random() < 0.5 ? "/api/listings/deals" : "/api/listings/stats")],
    ["search suggestions", 10, () => `/api/listings/suggest?q=${encodeURIComponent(pick(SUGGEST))}`],
    ["price drops", 5, () => "/api/listings/drops"],
    ["extension lookup", 5, () => `/api/listings/match?url=${encodeURIComponent(pick(pageUrls))}`],
  ];
  const totalWeight = MIX.reduce((sum, [, weight]) => sum + weight, 0);
  const chooseKind = () => {
    let r = Math.random() * totalWeight;
    for (const kind of MIX) if ((r -= kind[1]) < 0) return kind;
    return MIX[0];
  };

  const percentile = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : null);
  const summarise = (records) => {
    const ok = records.filter((r) => r.status >= 200 && r.status < 300);
    const ms = ok.map((r) => r.ms).sort((a, b) => a - b);
    return {
      requests: records.length,
      ok: ok.length,
      limited: records.filter((r) => r.status === 429).length,
      // 503 is the API turning a request away on purpose when its grouping queue is full (workerPool.js), not a fault
      busy: records.filter((r) => r.status === 503).length,
      failed: records.filter((r) => r.status === 0 || (r.status >= 500 && r.status !== 503)).length,
      p50: percentile(ms, 50), p95: percentile(ms, 95), p99: percentile(ms, 99),
    };
  };

  const results = [];
  for (const shoppers of PHASES) {
    console.log(`phase: ${shoppers} shoppers at once for ${PHASE_SECONDS} s`);
    const records = [];
    const until = performance.now() + PHASE_SECONDS * 1000;
    await Promise.all(Array.from({ length: shoppers }, async () => {
      const ip = visitor(); // one shopper keeps one address, as a person would
      while (performance.now() < until) {
        const [name, , path] = chooseKind();
        const r = await get(path(), { ip });
        records.push({ name, ...r });
      }
    }));
    const overall = summarise(records);
    const byKind = Object.fromEntries(MIX.map(([name]) => [name, summarise(records.filter((r) => r.name === name))]));
    results.push({ shoppers, overall: { ...overall, perSecond: overall.ok / PHASE_SECONDS }, byKind });
    console.log(`  ${overall.ok} answered (${(overall.ok / PHASE_SECONDS).toFixed(1)}/s), median ${overall.p50?.toFixed(0)} ms, 95% ${overall.p95?.toFixed(0)} ms, busy ${overall.busy}, failed ${overall.failed}, limited ${overall.limited}`);
    await sleep(3000);
  }

  // ---- report --------------------------------------------------------------------------------------------------------------
  const ms = (x) => (x === null ? "-" : `${Math.round(x)} ms`);
  const machine = `${os.cpus()[0]?.model?.trim()} (${os.cpus().length} threads), ${(os.totalmem() / 2 ** 30).toFixed(0)} GB RAM, ${os.type()} ${os.release()}, Node ${process.version}`;
  const stats = (await get("/api/listings/stats")).body;
  const md = [
    "# Load test",
    "",
    `Run ${new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} with \`src/scripts/ops/load-test.js\` on one machine: ${machine}.`,
    `The API and MongoDB ran on that same machine, with two grouping workers and the catalogue as it stood (${Number(stats?.products ?? 0).toLocaleString("en-US")} listings).`,
    `Each phase ran ${PHASE_SECONDS} s; each shopper sends a request, waits for the answer and sends the next (no pause between them, so this is`,
    "far busier than real shoppers, who read a page before the next click). Requests come from 200 visitor addresses through X-Forwarded-For.",
    "",
    "\"Turned away\" is the API answering 503 \"busy, try again in a moment\" on purpose when its grouping queue is full, so a flood",
    "cannot pile up; \"failed\" is anything else that went wrong (an error or no answer).",
    "",
    "| Shoppers at once | Answered per second | Median | 95th percentile | 99th percentile | Turned away (busy) | Failed | Rate-limited |",
    "|---|---|---|---|---|---|---|---|",
    ...results.map((r) => `| ${r.shoppers} | ${r.overall.perSecond.toFixed(1)} | ${ms(r.overall.p50)} | ${ms(r.overall.p95)} | ${ms(r.overall.p99)} | ${r.overall.busy} | ${r.overall.failed} | ${r.overall.limited} |`),
    "",
    "## By kind of request",
    "",
    ...results.flatMap((r) => [
      `### ${r.shoppers} shoppers at once`,
      "",
      "| Request | Share of the mix | Answered | Median | 95th percentile | Turned away (busy) | Failed | Rate-limited |",
      "|---|---|---|---|---|---|---|---|",
      ...MIX.map(([name, weight]) => {
        const s = r.byKind[name];
        return `| ${name} | ${Math.round((weight / totalWeight) * 100)}% | ${s.ok} | ${ms(s.p50)} | ${ms(s.p95)} | ${s.busy} | ${s.failed} | ${s.limited} |`;
      }),
      "",
    ]),
    "## What this does and does not show",
    "",
    "- One machine played every part (API, database and shoppers), so the shoppers took CPU from the API: a server with the database",
    "  elsewhere would do better. The figures are for this machine and this catalogue.",
    "- Searches were for phrases already fresh, so no store was asked during the test. A search whose prices are stale answers from",
    "  stored prices just as fast and refreshes in the background; a phrase never searched before waits for the stores (10 to 20 s).",
    "- The catalogue caches were built before the test (as at start-up), so category pages read from memory.",
    "",
  ].join("\n");
  writeFileSync(join(BACKEND, "LOAD_TEST.md"), md);
  console.log("written LOAD_TEST.md");
} catch (error) {
  console.error("load test failed:", error.message);
  console.error(serverLog.split("\n").slice(-20).join("\n"));
  process.exitCode = 1;
} finally {
  stop();
}
