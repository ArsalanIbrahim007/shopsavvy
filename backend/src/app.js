import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./config/swagger.js";
import {
  notFoundHandler,
  globalErrorHandler,
} from "./middleware/error.middleware.js";
import { connectDB } from "./config/db.js";
import healthRoutes from "./routes/health.routes.js";
import listingRoutes from "./routes/listing.routes.js";
import analyticsRoutes from "./routes/analytics.routes.js";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    explorer: true,
  })
);
app.get("/api-docs-json", (req, res) => {
  res.json(swaggerSpec);
});
app.use("/api/health", healthRoutes);
app.use("/api/listings", listingRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use(notFoundHandler);
app.use(globalErrorHandler);
const PORT = process.env.PORT || 5000;

connectDB();

app.listen(PORT, () => {
  console.log(`ShopSavvy backend running on port ${PORT}`);
});