// createApp.js — builds the Express application: middleware, routes and error
// handling, and nothing else. It does not connect to the database, start jobs
// or open a port; app.js does that. Keeping construction separate is what lets
// the tests run the real app (real middleware, real routes) without a database.

import express from "express";
import cors from "cors";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";

import { swaggerSpec } from "./config/swagger.js";
import { buildCorsOptions } from "./config/cors.js";
import { apiDocsHeaders, apiHeaders } from "./config/securityHeaders.js";
import { requestId } from "./middleware/requestId.middleware.js";
import { requestLogger } from "./middleware/requestLogger.middleware.js";
import { notFoundHandler, globalErrorHandler } from "./middleware/error.middleware.js";
import healthRoutes from "./routes/health.routes.js";
import listingRoutes from "./routes/listing.routes.js";
import analyticsRoutes from "./routes/analytics.routes.js";
import integrityRoutes from "./routes/integrity.routes.js";
import priceAlertRoutes from "./routes/priceAlert.routes.js";
import alertPageRoutes from "./routes/alertPages.routes.js";

export function createApp() {
  const app = express();

  // Do not advertise the framework in every response.
  app.disable("x-powered-by");

  // First, so every later log line and error body can carry the request id.
  app.use(requestId);
  app.use(requestLogger);

  // Standard security headers (see config/securityHeaders.js). The Swagger page needs inline scripts and styles, so it gets the
  // same headers without the strict content policy; the alert pages send their own, stricter, nonce-based policy.
  app.use((req, res, next) => (req.path === "/api-docs" || req.path.startsWith("/api-docs/") ? apiDocsHeaders : apiHeaders)(req, res, next));

  // Which websites may read responses from a browser: see config/cors.js (CORS_ORIGINS).
  app.use(cors(buildCorsOptions()));
  // No endpoint takes a large body; a small explicit limit is cheaper than the
  // default being an accident.
  app.use(express.json({ limit: "100kb" }));

  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, { explorer: true }));
  app.get("/api-docs-json", (req, res) => {
    res.json(swaggerSpec);
  });

  app.use("/api/health", healthRoutes);
  app.use("/api/listings", listingRoutes);
  app.use("/api/analytics", analyticsRoutes);
  app.use("/api/integrity", integrityRoutes);
  app.use("/api/alerts", priceAlertRoutes);
  // The pages the links in alert emails open (confirm / cancel).
  app.use("/alerts", alertPageRoutes);

  // Must stay last: anything nothing above answered, and every error thrown above.
  app.use(notFoundHandler);
  app.use(globalErrorHandler);

  return app;
}
