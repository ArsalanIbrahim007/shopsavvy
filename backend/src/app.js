import dotenv from "dotenv";

import { createApp } from "./createApp.js";
import { connectDB } from "./config/db.js";
import { installProcessHandlers } from "./config/process.js";
import { startPriceHistoryJob } from "./jobs/priceHistoryJob.js";
import { startAlertCheckJob } from "./jobs/alertCheckJob.js";

dotenv.config();

const app = createApp();
const PORT = process.env.PORT || 5000;

connectDB();

// Kept so a shutdown can stop them; a disabled job returns null.
const jobs = [startPriceHistoryJob(), startAlertCheckJob()].filter(Boolean);

const server = app.listen(PORT, () => {
  console.log(`ShopSavvy backend running on port ${PORT}`);
});

installProcessHandlers({ server, jobs });
