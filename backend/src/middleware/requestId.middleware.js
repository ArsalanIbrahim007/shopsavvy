// requestId.middleware.js — gives every request an id, so the line in the log
// and the error a user or teammate reports can be matched up.
//
// An incoming x-request-id is reused only if it looks harmless (short, letters,
// digits, dash, underscore); anything else is replaced, so a client cannot
// inject odd characters into our logs.

import { randomUUID } from "crypto";

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function requestId(req, res, next) {
  const incoming = req.get("x-request-id");
  req.id = incoming && SAFE_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader("x-request-id", req.id);
  next();
}
