// requestLogger.middleware.js — one access-log line per request, written when
// the response finishes:  [req 3f2a…] GET /api/listings/search 200 34ms
//
// Only the PATH is logged, never the query string. Query strings carry search
// text and, on the alert endpoints, email addresses (?email=...), and personal
// data does not belong in logs. Health checks are skipped so they do not drown
// out real traffic.

export function requestLogger(req, res, next) {
  const startedAt = Date.now();

  res.on("finish", () => {
    if (req.path === "/api/health") return;
    console.log("[req %s] %s %s %s %sms", req.id, req.method, req.originalUrl.split("?")[0], res.statusCode, Date.now() - startedAt);
  });

  next();
}
