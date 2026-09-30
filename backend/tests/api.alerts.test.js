// Price alerts with double opt-in, through the REAL app (routes, validators, controller,
// service, token signing). The database models and the mail delivery are replaced by an
// in-memory store and a spy, so the tests can follow a whole alert from creation to the
// links in its emails.

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";

vi.mock("../src/services/notification.service.js", () => ({
  sendAlertConfirmation: vi.fn(async () => ({ delivered: false, channel: "test" })),
  notifyAlert: vi.fn(async () => ({ delivered: false, channel: "test" })),
}));

// These tests create dozens of alerts from one address; the limiters (tested in
// api.rateLimit.test.js) would answer 429 long before. Everything else stays real.
vi.mock("../src/middleware/rateLimit.middleware.js", async (importOriginal) => {
  const passThrough = (req, res, next) => next();
  return { ...(await importOriginal()), createAlertLimiter: passThrough, alertReadLimiter: passThrough };
});

import Listing from "../src/models/listing.model.js";
import PriceAlert from "../src/models/priceAlert.model.js";
import { createApp } from "../src/createApp.js";
import { sendAlertConfirmation, notifyAlert } from "../src/services/notification.service.js";
import { checkAlerts, CONFIRM_WINDOW_HOURS } from "../src/services/priceAlert.service.js";
import { signAlertToken } from "../src/services/alertTokens.service.js";

const ID = (n) => `6a78a2af9c96f297ede773${String(n).padStart(2, "0")}`;
const LISTING = { _id: ID(1), title: "Samsung Galaxy A17", price: 60000 };
const valid = { listingId: ID(1), email: "Shopper@Example.com", targetPrice: 55000 };

let server;
let url;
let store; // alert id -> document
let nextId;

const send = (method, path, body) =>
  fetch(`${url}${path}`, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) })
    .then(async (res) => ({ res, body: await res.json() }));

const tokenIn = (link) => new URL(link).searchParams.get("token");
const lastLinks = () => sendAlertConfirmation.mock.calls.at(-1)[1];

const matches = (doc, filter) =>
  Object.entries(filter).every(([key, want]) => {
    if (key === "_id") return String(doc._id) === String(want);
    if (want && typeof want === "object" && "$in" in want) return want.$in.includes(doc[key]);
    if (want && typeof want === "object" && "$lt" in want) return doc[key] < want.$lt;
    return doc[key] === want;
  });

beforeAll(async () => {
  process.env.ALERT_TOKEN_SECRET = "test-secret-0123456789-abcdef";
  await new Promise((resolve) => {
    server = createApp().listen(0, () => { url = `http://127.0.0.1:${server.address().port}`; resolve(); });
  });
});
afterAll(() => new Promise((resolve) => server.close(resolve)));

beforeEach(() => {
  delete process.env.ALERT_AUTO_CONFIRM;
  store = new Map();
  nextId = 10;
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});

  vi.spyOn(Listing, "findById").mockResolvedValue(LISTING);
  vi.spyOn(PriceAlert, "create").mockImplementation(async (data) => {
    const doc = { _id: ID(nextId++), createdAt: new Date(), ...data, save: vi.fn(async () => doc) };
    store.set(doc._id, doc);
    return doc;
  });
  vi.spyOn(PriceAlert, "findById").mockImplementation(async (id) => store.get(String(id)) ?? null);
  vi.spyOn(PriceAlert, "findOneAndUpdate").mockImplementation(async (filter, update) => {
    const doc = store.get(String(filter._id));
    if (!doc || !matches(doc, filter)) return null;
    Object.assign(doc, update);
    return doc;
  });
  vi.spyOn(PriceAlert, "countDocuments").mockImplementation(async (filter) =>
    [...store.values()].filter((doc) => matches(doc, filter)).length);
});
afterEach(() => {
  vi.restoreAllMocks();
  sendAlertConfirmation.mockClear();
  notifyAlert.mockClear();
  delete process.env.ALERT_AUTO_CONFIRM;
});

describe("creating an alert (double opt-in)", () => {
  it("starts pending, sends a confirmation with both links, and never echoes the address or a token", async () => {
    const { res, body } = await send("POST", "/api/alerts", valid);
    expect(res.status).toBe(201);
    expect(body).toMatchObject({ success: true, confirmationRequired: true, confirmationSent: false });
    expect(body.data).toMatchObject({ title: "Samsung Galaxy A17", targetPrice: 55000, priceAtCreation: 60000, status: "pending" });
    expect(JSON.stringify(body)).not.toMatch(/shopper@example|token|confirmUrl|cancelUrl/i);

    expect(PriceAlert.create.mock.calls[0][0]).toMatchObject({ email: "shopper@example.com", status: "pending", confirmedAt: null });
    const [alert, links] = sendAlertConfirmation.mock.calls[0];
    expect(alert.email).toBe("shopper@example.com");
    expect(links.confirmUrl).toMatch(/\/alerts\/confirm\?token=[0-9a-f]{24}\./);
    expect(links.cancelUrl).toMatch(/\/alerts\/cancel\?token=[0-9a-f]{24}\./);
    expect(tokenIn(links.confirmUrl)).not.toBe(tokenIn(links.cancelUrl));
  });

  it("says honestly when no confirmation email could be sent, and when one was", async () => {
    const notSent = await send("POST", "/api/alerts", valid);
    expect(notSent.body.message).toMatch(/cannot send email/i);

    sendAlertConfirmation.mockResolvedValueOnce({ delivered: true, channel: "smtp" });
    const sent = await send("POST", "/api/alerts", { ...valid, email: "other@example.com" });
    expect(sent.body.confirmationSent).toBe(true);
    expect(sent.body.message).toMatch(/check your email/i);
  });

  it("with ALERT_AUTO_CONFIRM=true (demonstrations only) creates an active alert and sends nothing", async () => {
    process.env.ALERT_AUTO_CONFIRM = "true";
    const { res, body } = await send("POST", "/api/alerts", valid);
    expect(res.status).toBe(201);
    expect(body).toMatchObject({ confirmationRequired: false, data: { status: "active" } });
    expect(sendAlertConfirmation).not.toHaveBeenCalled();
  });

  it("keeps the number of unconfirmed alerts per address small, so it cannot be used to mail a stranger", async () => {
    for (let i = 0; i < 3; i++) expect((await send("POST", "/api/alerts", valid)).res.status).toBe(201);
    const fourth = await send("POST", "/api/alerts", valid);
    expect(fourth.res.status).toBe(429);
    expect(fourth.body.message).toMatch(/waiting to be confirmed/);
    expect(sendAlertConfirmation).toHaveBeenCalledTimes(3);

    // another address is unaffected
    expect((await send("POST", "/api/alerts", { ...valid, email: "different@example.com" })).res.status).toBe(201);
  });

  it("still refuses a target that is not below the price, an unknown listing, and a full mailbox", async () => {
    expect((await send("POST", "/api/alerts", { ...valid, targetPrice: 60000 })).res.status).toBe(400);
    expect(sendAlertConfirmation).not.toHaveBeenCalled();

    Listing.findById.mockResolvedValueOnce(null);
    expect((await send("POST", "/api/alerts", valid)).res.status).toBe(404);

    for (let i = 0; i < 20; i++) store.set(`x${i}`, { email: "shopper@example.com", status: "active" });
    const full = await send("POST", "/api/alerts", valid);
    expect(full.res.status).toBe(429);
    expect(full.body.message).toMatch(/at most 20/);
  });
});

describe("confirming an alert", () => {
  const create = async () => {
    await send("POST", "/api/alerts", valid);
    return { links: lastLinks(), id: [...store.keys()].at(-1) };
  };

  it("activates a pending alert when the confirm link's token is posted", async () => {
    const { links, id } = await create();
    const { res, body } = await send("POST", "/api/alerts/confirm", { token: tokenIn(links.confirmUrl) });
    expect(res.status).toBe(200);
    expect(body.data.status).toBe("active");
    expect(store.get(id)).toMatchObject({ status: "active" });
    expect(store.get(id).confirmedAt).toBeInstanceOf(Date);
    expect(JSON.stringify(body)).not.toMatch(/shopper@example/i);
  });

  it("is safe to repeat: a second click (or a mail scanner) changes nothing", async () => {
    const { links } = await create();
    const token = tokenIn(links.confirmUrl);
    await send("POST", "/api/alerts/confirm", { token });
    PriceAlert.findOneAndUpdate.mockClear();

    const again = await send("POST", "/api/alerts/confirm", { token });
    expect(again.res.status).toBe(200);
    expect(again.body.data.status).toBe("active");
    expect(PriceAlert.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("answers a forged, foreign or wrong-purpose token with the same 404, and changes nothing", async () => {
    const { links, id } = await create();
    const genuine = tokenIn(links.confirmUrl);
    const forged = [
      `${id}.${"A".repeat(43)}`,
      `${ID(99)}.${genuine.split(".")[1]}`, // a real signature on another alert's id
      tokenIn(links.cancelUrl), // the cancel token cannot confirm
      `${genuine}.extra`,
      genuine.toUpperCase(),
    ];
    for (const token of forged) {
      const { res, body } = await send("POST", "/api/alerts/confirm", { token });
      expect(res.status, token).toBe(404);
      expect(body.code).toBe("NOT_FOUND");
      expect(body.message).toBe("This link is invalid or has expired.");
    }
    expect(store.get(id).status).toBe("pending");
  });

  it("rejects a missing or malformed token with a 400 before looking anything up", async () => {
    for (const body of [{}, { token: "" }, { token: "short" }, { token: 12345678901234567890 }, { token: { $ne: "x" } }, { token: "x".repeat(300) }]) {
      const { res, body: answer } = await send("POST", "/api/alerts/confirm", body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(answer.code).toBe("VALIDATION_ERROR");
    }
    expect(PriceAlert.findById).not.toHaveBeenCalled();
  });

  it("will not confirm an alert after the window, and will not revive a cancelled one", async () => {
    const { links, id } = await create();
    store.get(id).createdAt = new Date(Date.now() - (CONFIRM_WINDOW_HOURS + 1) * 3600 * 1000);
    const late = await send("POST", "/api/alerts/confirm", { token: tokenIn(links.confirmUrl) });
    expect(late.res.status).toBe(404);
    expect(store.get(id).status).toBe("pending");

    store.get(id).createdAt = new Date();
    await send("POST", "/api/alerts/cancel", { token: tokenIn(links.cancelUrl) });
    const revived = await send("POST", "/api/alerts/confirm", { token: tokenIn(links.confirmUrl) });
    expect(revived.res.status).toBe(409);
    expect(store.get(id).status).toBe("cancelled");
  });
});

describe("cancelling an alert", () => {
  it("cancels with the cancel link's token alone, no email needed, and repeating it is fine", async () => {
    await send("POST", "/api/alerts", valid);
    const { cancelUrl } = lastLinks();
    const id = [...store.keys()].at(-1);
    const token = tokenIn(cancelUrl);

    const first = await send("POST", "/api/alerts/cancel", { token });
    expect(first.res.status).toBe(200);
    expect(first.body.data.status).toBe("cancelled");
    expect(store.get(id).status).toBe("cancelled");

    const second = await send("POST", "/api/alerts/cancel", { token });
    expect(second.res.status).toBe(200);
    expect(second.body.data.status).toBe("cancelled");
  });

  it("will not cancel with a forged token, the confirm token, or a bare alert id", async () => {
    await send("POST", "/api/alerts", valid);
    const { confirmUrl } = lastLinks();
    const id = [...store.keys()].at(-1);

    for (const token of [tokenIn(confirmUrl), `${id}.${"B".repeat(43)}`, id + ".".repeat(1) + "x".repeat(30)]) {
      expect((await send("POST", "/api/alerts/cancel", { token })).res.status).toBe(404);
    }
    expect(store.get(id).status).toBe("pending");
  });

  it("cancels an alert that was already confirmed, so no more email is sent", async () => {
    await send("POST", "/api/alerts", valid);
    const { confirmUrl, cancelUrl } = lastLinks();
    await send("POST", "/api/alerts/confirm", { token: tokenIn(confirmUrl) });
    await send("POST", "/api/alerts/cancel", { token: tokenIn(cancelUrl) });
    expect([...store.values()].at(-1).status).toBe("cancelled");
  });
});

describe("the old list and cancel-by-email endpoints are gone", () => {
  it("no longer lists any address's alerts or cancels by email", async () => {
    const list = await send("GET", "/api/alerts?email=shopper@example.com");
    expect(list.res.status).toBe(404);

    const cancel = await send("DELETE", `/api/alerts/${ID(5)}`, { email: "shopper@example.com" });
    expect(cancel.res.status).toBe(404);
  });
});

describe("the pages the email links open", () => {
  const page = (path) => fetch(`${url}${path}`);

  it("serves a confirm page that only shows a button: opening the link changes nothing", async () => {
    await send("POST", "/api/alerts", valid);
    const { confirmUrl } = lastLinks();
    const link = new URL(confirmUrl);

    const res = await page(`${link.pathname}${link.search}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    const html = await res.text();
    expect(html).toContain("Confirm alert");
    expect(html).toContain('"/api/alerts/confirm"');
    expect([...store.values()].at(-1).status).toBe("pending");
    expect(PriceAlert.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("serves a cancel page, and nothing under other names", async () => {
    const html = await (await page("/alerts/cancel?token=whatever")).text();
    expect(html).toContain("Cancel alert");
    expect(html).toContain('"/api/alerts/cancel"');
    expect((await page("/alerts/other")).status).toBe(404);
  });

  it("never writes the token into the page, whatever it contains", async () => {
    const hostile = encodeURIComponent('"><script>alert(1)</script>SECRETVALUE');
    const html = await (await page(`/alerts/confirm?token=${hostile}`)).text();
    expect(html).not.toContain("SECRETVALUE");
    expect(html).not.toContain("alert(1)");
  });

  it("locks the page down: only its own script runs, nothing is cached, no referrer leaks", async () => {
    const res = await page("/alerts/confirm?token=x");
    const csp = res.headers.get("content-security-policy");
    const html = await res.text();
    const nonce = /script-src 'nonce-([^']+)'/.exec(csp)?.[1];

    expect(nonce).toBeTruthy();
    expect(html).toContain(`<script nonce="${nonce}">`);
    expect(csp).toMatch(/default-src 'none'/);
    expect(csp).toMatch(/connect-src 'self'/);
    expect(csp).toMatch(/frame-ancestors 'none'/);
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval|\*/);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");

    const second = await page("/alerts/confirm?token=x");
    expect(/script-src 'nonce-([^']+)'/.exec(second.headers.get("content-security-policy"))[1]).not.toBe(nonce); // a fresh nonce each time
  });

  it("does not log the token", async () => {
    await page("/alerts/confirm?token=SECRET-IN-QUERY-12345");
    await new Promise((resolve) => setTimeout(resolve, 20));
    const logged = console.log.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(logged).toMatch(/GET \/alerts\/confirm 200/);
    expect(logged).not.toMatch(/SECRET-IN-QUERY/);
  });
});

describe("the alert check", () => {
  const listingNow = { _id: ID(1), title: "Samsung Galaxy A17", price: 50000 };

  const seed = (status, over = {}) => {
    const doc = { _id: ID(nextId++), listing: ID(1), title: listingNow.title, email: "shopper@example.com", targetPrice: 55000, status, createdAt: new Date(), ...over };
    doc.save = vi.fn(async () => doc);
    store.set(doc._id, doc);
    return doc;
  };

  beforeEach(() => {
    vi.spyOn(PriceAlert, "find").mockImplementation(async (filter) => [...store.values()].filter((doc) => matches(doc, filter)));
    vi.spyOn(PriceAlert, "deleteMany").mockImplementation(async (filter) => {
      const doomed = [...store.values()].filter((doc) => matches(doc, filter));
      doomed.forEach((doc) => store.delete(doc._id));
      return { deletedCount: doomed.length };
    });
    vi.spyOn(Listing, "find").mockResolvedValue([listingNow]);
  });

  it("only emails alerts that were confirmed, and gives every email a working cancel link", async () => {
    const pending = seed("pending");
    const active = seed("active");

    const result = await checkAlerts();
    expect(result).toMatchObject({ checked: 1, triggered: 1 });
    expect(pending.status).toBe("pending");
    expect(active.status).toBe("triggered");

    expect(notifyAlert).toHaveBeenCalledTimes(1);
    const [alert, listing, links] = notifyAlert.mock.calls[0];
    expect(alert._id).toBe(active._id);
    expect(listing.price).toBe(50000);
    expect(tokenIn(links.cancelUrl)).toBe(signAlertToken(active._id, "cancel"));
  });

  it("deletes alerts that were never confirmed within the window, and keeps fresh and confirmed ones", async () => {
    const stale = seed("pending", { createdAt: new Date(Date.now() - (CONFIRM_WINDOW_HOURS + 1) * 3600 * 1000) });
    const fresh = seed("pending");
    const oldButActive = seed("active", { createdAt: new Date(Date.now() - 30 * 24 * 3600 * 1000), targetPrice: 1000 });

    const result = await checkAlerts();
    expect(result.expired).toBe(1);
    expect(store.has(stale._id)).toBe(false);
    expect(store.has(fresh._id)).toBe(true);
    expect(store.has(oldButActive._id)).toBe(true);
  });
});
