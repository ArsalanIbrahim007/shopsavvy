// price-outlook-backtest.js — tests the "wait or buy?" verdicts (services/priceOutlook.service.js) against what actually happened.
//
// For every recorded price that has a later record 5 to 9 days on, the verdict is worked out from the history up to that day only,
// and compared with whether the price then fell 3% or more, rose 3% or more, or stayed put. The result is written to
// src/ml/OUTLOOK_BACKTEST.md. A verdict with fewer than 30 comparisons is reported as too few to judge, and the report says so.
//
// Read-only. Re-run it as history builds up: the first runs (days of daily records) cannot say whether the verdicts mean anything.
//
// Usage (from backend/):
//   node src/scripts/ml/price-outlook-backtest.js

import { config } from "dotenv";
config({ quiet: true });
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";

import PriceHistory from "../../models/priceHistory.model.js";
import { BACKTEST, backtestOutlook, OUTLOOK } from "../../services/priceOutlook.service.js";

const LABEL = {
  too_early: "Too early to say (not enough days of records)",
  flat: "Flat (the best price has not moved)",
  at_low: "At its lowest recorded price",
  above_usual: "5% or more above its usual price",
  usual: "Around its usual price",
};

const cell = (value, judgeable) => (value === null ? "n/a" : judgeable ? `${value}%` : `${value}% (too few)`);

await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
const documents = await PriceHistory.find({}).select("platform entries").lean();
await mongoose.disconnect();

const result = backtestOutlook(documents);
const lines = [
  "# Wait-or-buy outlook: backtest",
  "",
  `Generated ${new Date().toISOString()} by \`src/scripts/ml/price-outlook-backtest.js\`. Read-only.`,
  "",
  "The outlook (`src/services/priceOutlook.service.js`) is not a price forecast. It says what a product's own recorded prices show:",
  `too early to say (under ${OUTLOOK.MIN_DAYS} days or ${OUTLOOK.MIN_RECORD_DAYS} records), flat, at its lowest recorded price, well above its usual price, or in between.`,
  "This replays it on past records: for each record with a later record 5 to 9 days on, the verdict uses only the history up to that day,",
  "and is compared with whether the price then fell 3% or more, rose 3% or more, or stayed put.",
  "",
  `Records compared: ${result.all.comparisons}${result.from ? `, starting ${result.from}, the last one on ${result.to}` : ""}.`,
  `A verdict with fewer than ${BACKTEST.MIN_JUDGEABLE} comparisons is marked "too few" and should not be read as evidence.`,
  "",
  "| Verdict at the time | Comparisons | Listings | Fell 3%+ a week later | Rose 3%+ a week later |",
  "|---|---|---|---|---|",
  ...result.table.map((row) => `| ${LABEL[row.verdict]} | ${row.comparisons} | ${row.listings} | ${cell(row.fellShare, row.judgeable)} | ${cell(row.roseShare, row.judgeable)} |`),
  `| All | ${result.all.comparisons} | | ${cell(result.all.fellShare, result.all.comparisons >= BACKTEST.MIN_JUDGEABLE)} | ${cell(result.all.roseShare, result.all.comparisons >= BACKTEST.MIN_JUDGEABLE)} |`,
  "",
  "## How to read it",
  "",
  "- The verdict is worth showing only if \"5% or more above its usual price\" fell more often than the rows around it, and \"at its lowest\" rose or",
  "  stayed put more often. If the rows look alike, the verdict carries no information and the page should say so.",
  "- Comparisons from one listing on neighbouring days overlap, so they are not independent; the Listings column counts distinct listings.",
  "- Daily records only started on 2026-09-27. Before that records were sparse (days to weeks apart), so most verdicts before then are \"too early\".",
  "- Re-run this as the history grows. Until the judgeable rows have at least 30 comparisons each it cannot support a claim either way.",
  "",
];
const path = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "ml", "OUTLOOK_BACKTEST.md");
writeFileSync(path, lines.join("\n"));
console.log(lines.join("\n"));
console.log(`\nWritten to ${path}`);
