import { connectDB } from "./config/db.js";
import listingRoutes from "./routes/listing.routes.js";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import healthRoutes from "./routes/health.routes.js";


dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/health", healthRoutes);
app.use("/api/listings", listingRoutes);
const PORT = process.env.PORT || 5000;
connectDB();
app.listen(PORT, () => {
  console.log(`ShopSavvy backend running on port ${PORT}`);
});
