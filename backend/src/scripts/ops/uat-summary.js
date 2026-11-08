// uat-summary.js — the user acceptance test's results (services/uat.service.js), printed, and with --record written to UAT_RESULTS.md.
//
//   node src/scripts/ops/uat-summary.js            print the summary
//   node src/scripts/ops/uat-summary.js --record   also write backend/UAT_RESULTS.md, with every comment (they are anonymous)

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";
config({ quiet: true });
import mongoose from "mongoose";

import UatResponse from "../../models/uatResponse.model.js";
import { summarizeUat, SUS_AVERAGE } from "../../services/uat.service.js";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "UAT_RESULTS.md");
// The words of each task, as the page (frontend/src/lib/uat.js) puts them, shortened.
const TASK_NAMES = {
  cheapest: "Find which store sells a product cheapest",
  discount: "Tell whether a discount is real",
  wait: "Decide whether to buy now or wait",
  drops: "Find a recent price drop in a category",
  alert: "Set a price alert",
};

await mongoose.connect(process.env.MONGO_URI);
const responses = await UatResponse.find({}).sort({ createdAt: 1 }).lean();
await mongoose.disconnect();

const s = summarizeUat(responses);
const date = (iso) => (iso ? iso.slice(0, 10) : "-");
const interval = s.sus.ci95 ? `${s.sus.ci95[0]} to ${s.sus.ci95[1]}` : "needs two or more responses";
const lines = [
  `Responses: ${s.responses} (${date(s.first)} to ${date(s.last)})`,
  `SUS: mean ${s.sus.mean ?? "-"} (95% interval ${interval}), median ${s.sus.median ?? "-"}, range ${s.sus.min ?? "-"}-${s.sus.max ?? "-"}; the published average is ${SUS_AVERAGE}`,
  ...s.tasks.map((t) => `${TASK_NAMES[t.id].padEnd(44)} done ${t.done}/${t.n} (${t.completion ?? "-"}%), with help ${t.withHelp}, not done ${t.notDone}, ease ${t.meanEase ?? "-"}/7`),
];
console.log(lines.join("\n"));

if (process.argv.includes("--record")) {
  const tally = (counts) => Object.entries(counts).filter(([, n]) => n > 0).map(([k, n]) => `${k.replace("_", " ")} ${n}`).join(", ") || "-";
  const comments = responses.map((r) => r.comment).filter(Boolean);
  const md = `# User acceptance test: results

Written by \`src/scripts/ops/uat-summary.js --record\` on ${new Date().toISOString().slice(0, 10)}, from the answers people gave on the
site's /try page (anonymous: no name, email or address is kept).

**How it was run.** Each person used ShopSavvy on their own device for five everyday tasks, said for each whether they managed it
alone, with help, or not at all, and rated its ease (Single Ease Question, 1 = very difficult, 7 = very easy). Then they answered the
System Usability Scale (Brooke, 1996): ten statements from 1 to 5, scored 0-100. Across published studies the average SUS score is
about ${SUS_AVERAGE} (Sauro, 2011).

## Usability (SUS)

| Responses | Mean | 95% interval | Median | Range | Published average |
|---:|---:|---|---:|---|---:|
| ${s.responses} | ${s.sus.mean ?? "-"} | ${interval} | ${s.sus.median ?? "-"} | ${s.sus.min ?? "-"}-${s.sus.max ?? "-"} | ${SUS_AVERAGE} |

## The tasks

| Task | Done alone | With help | Not done | Completion | Ease (1-7) |
|---|---:|---:|---:|---:|---:|
${s.tasks.map((t) => `| ${TASK_NAMES[t.id]} | ${t.done} | ${t.withHelp} | ${t.notDone} | ${t.completion ?? "-"}% | ${t.meanEase ?? "-"} |`).join("\n")}

## Who took part

- Role: ${tally(s.participants.role)}
- Shops online: ${tally(s.participants.shopsOnline)}
- Device: ${tally(s.participants.device)}

## What they said

${comments.length ? comments.map((c) => `- ${c.replace(/\s+/g, " ")}`).join("\n") : "No comments."}

## Reading it

${s.responses < 5 ? `Only ${s.responses} response(s): too few to say much. Five or more is the usual minimum for a usability test.` : `With ${s.responses} people the interval above is wide; it says how far the mean could move with other participants.`}
A task "done with help" counts as not done alone in the completion rate.
`;
  writeFileSync(OUT, md);
  console.log(`\nwritten ${OUT}`);
}
process.exit(0);
