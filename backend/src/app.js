import dotenv from "dotenv";

import { createApp } from "./createApp.js";
import { connectDB } from "./config/db.js";
import { installProcessHandlers } from "./config/process.js";
import { describeCorsPolicy } from "./config/cors.js";
import { warmDealsCache } from "./services/dealsFeed.service.js";
import { warmCatalogCache } from "./services/catalogFeed.service.js";
import { startEventLoopMonitor } from "./services/runtimeStats.service.js";
import { warmGroupingPool } from "./services/grouping.service.js";
import { startPriceHistoryJob } from "./jobs/priceHistoryJob.js";
import { startAlertCheckJob } from "./jobs/alertCheckJob.js";

dotenv.config();

startEventLoopMonitor();
describeCorsPolicy().forEach((line) => console.log(line));
const app = createApp();
const PORT = process.env.PORT || 5000;

// Once connected, start the grouping workers (so the first broad search does not pay for
// their start-up) and fill the deals cache in the background (a worker does the
// computation, so requests are not held up). Set WARM_DEALS=false to skip the cache fill.
connectDB().then(() => {
  warmGroupingPool();
  // One after the other, so the two warm-ups do not fill the worker pool between them.
  if (process.env.WARM_DEALS !== "false") warmDealsCache().then(() => warmCatalogCache());
});

// Kept so a shutdown can stop them; a disabled job returns null.
const jobs = [startPriceHistoryJob(), startAlertCheckJob()].filter(Boolean);

const server = app.listen(PORT, () => {
  console.log(`ShopSavvy backend running on port ${PORT}`);
});

installProcessHandlers({ server, jobs });
