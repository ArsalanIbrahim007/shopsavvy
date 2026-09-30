import dotenv from "dotenv";

import { createApp } from "./createApp.js";
import { connectDB } from "./config/db.js";
import { installProcessHandlers } from "./config/process.js";
import { warmDealsCache } from "./services/dealsFeed.service.js";
import { startPriceHistoryJob } from "./jobs/priceHistoryJob.js";
import { startAlertCheckJob } from "./jobs/alertCheckJob.js";

dotenv.config();

const app = createApp();
const PORT = process.env.PORT || 5000;

// Once connected, fill the deals cache in the background (a worker thread does the
// computation, so requests are not held up). Set WARM_DEALS=false to skip it.
connectDB().then(() => {
  if (process.env.WARM_DEALS !== "false") warmDealsCache();
});

// Kept so a shutdown can stop them; a disabled job returns null.
const jobs = [startPriceHistoryJob(), startAlertCheckJob()].filter(Boolean);

const server = app.listen(PORT, () => {
  console.log(`ShopSavvy backend running on port ${PORT}`);
});

installProcessHandlers({ server, jobs });
