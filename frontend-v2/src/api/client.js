// client.js — the only place that calls fetch.
//
// Every page goes through request(), so every failure arrives as an ApiError with
// a stable code, a timeout is enforced, and a request that is no longer wanted
// (the user searched again, or left the page) can be cancelled with a signal.

import { ApiError, CLIENT_CODES } from "./errors.js";

// Set VITE_API_URL at build time for a deployed backend; local development uses
// the Express server on port 5000.
export const BASE_URL = (import.meta.env?.VITE_API_URL || "http://localhost:5000/api").replace(/\/+$/, "");

const DEFAULT_TIMEOUT_MS = 15000;

function buildUrl(path, params) {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/**
 * @param {string} path                e.g. "/listings/search"
 * @param {object} [options]
 * @param {"GET"|"POST"|"DELETE"} [options.method]
 * @param {object} [options.params]    query string values (empty ones are dropped)
 * @param {object} [options.body]      sent as JSON
 * @param {AbortSignal} [options.signal]  aborts the request; the AbortError is rethrown so callers can ignore it
 * @param {number} [options.timeoutMs]
 * @returns {Promise<object>} the parsed JSON body of a successful response
 * @throws {ApiError} on a non-2xx answer, a network failure, a timeout or an unreadable body
 */
export async function request(path, { method = "GET", params, body, signal, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  let timedOut = false;

  const onCallerAbort = () => controller.abort(signal.reason);
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener("abort", onCallerAbort, { once: true });
  }
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  let response;
  try {
    response = await fetch(buildUrl(path, params), {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (timedOut) throw new ApiError({ code: CLIENT_CODES.TIMEOUT, message: "The request timed out" });
    if (error?.name === "AbortError") throw error; // the caller cancelled: not a failure to show
    throw new ApiError({ code: CLIENT_CODES.NETWORK_ERROR, message: "Could not reach the server" });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onCallerAbort);
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    // Handled below: an error status with no readable body, or a 2xx that is not JSON.
  }

  if (!response.ok) {
    throw new ApiError({
      status: response.status,
      code: data?.code || `HTTP_${response.status}`,
      message: data?.message,
      requestId: data?.requestId || response.headers.get("x-request-id") || undefined,
      details: data?.errors,
    });
  }

  if (data === null || typeof data !== "object") {
    throw new ApiError({ status: response.status, code: CLIENT_CODES.INVALID_RESPONSE, message: "The server sent an unreadable response" });
  }

  return data;
}
