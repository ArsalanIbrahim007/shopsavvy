import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { signAlertToken, verifyAlertToken, TOKEN_PURPOSES } from "../src/services/alertTokens.service.js";

const ID = "6a78a2af9c96f297ede77377";
const OTHER_ID = "6a78a2af9c96f297ede77378";
const saved = process.env.ALERT_TOKEN_SECRET;

beforeEach(() => { process.env.ALERT_TOKEN_SECRET = "a-long-enough-test-secret-1234"; });
afterEach(() => {
  if (saved === undefined) delete process.env.ALERT_TOKEN_SECRET;
  else process.env.ALERT_TOKEN_SECRET = saved;
  vi.restoreAllMocks();
});

describe("alert tokens", () => {
  it("round-trips for the purpose they were made for", () => {
    for (const purpose of Object.values(TOKEN_PURPOSES)) {
      expect(verifyAlertToken(signAlertToken(ID, purpose), purpose)).toBe(ID);
    }
  });

  it("is stable, so a link can be rebuilt whenever an email is sent", () => {
    expect(signAlertToken(ID, "cancel")).toBe(signAlertToken(ID, "cancel"));
  });

  it("differs by alert and by purpose, and a token is not valid for the other purpose", () => {
    expect(signAlertToken(ID, "confirm")).not.toBe(signAlertToken(OTHER_ID, "confirm"));
    expect(signAlertToken(ID, "confirm")).not.toBe(signAlertToken(ID, "cancel"));
    expect(verifyAlertToken(signAlertToken(ID, "confirm"), "cancel")).toBeNull();
    expect(verifyAlertToken(signAlertToken(ID, "cancel"), "confirm")).toBeNull();
  });

  it("is not valid for a different alert: swapping the id in a token fails", () => {
    const [, signature] = signAlertToken(ID, "confirm").split(".");
    expect(verifyAlertToken(`${OTHER_ID}.${signature}`, "confirm")).toBeNull();
  });

  it("rejects anything malformed without throwing", () => {
    const good = signAlertToken(ID, "confirm");
    const [, signature] = good.split(".");
    const bad = [undefined, null, 5, {}, [], "", ".", `${ID}.`, `.${signature}`, `${ID}`, `${good}.x`, `${good}x`, good.slice(0, -1), good.toUpperCase(),
      `nothex-nothex-nothex-noth.${signature}`, "x".repeat(500)];
    for (const token of bad) expect(verifyAlertToken(token, "confirm"), String(token)).toBeNull();
  });

  it("stops working when the secret changes", () => {
    const token = signAlertToken(ID, "confirm");
    process.env.ALERT_TOKEN_SECRET = "a-completely-different-secret-5678";
    expect(verifyAlertToken(token, "confirm")).toBeNull();
  });

  it("refuses to sign anything that is not an alert id", () => {
    expect(() => signAlertToken("../../etc/passwd", "confirm")).toThrow();
    expect(() => signAlertToken(undefined, "confirm")).toThrow();
  });

  it("with no usable secret configured, uses a random one and warns once (links then die on restart)", () => {
    delete process.env.ALERT_TOKEN_SECRET;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const token = signAlertToken(ID, "confirm");
    expect(verifyAlertToken(token, "confirm")).toBe(ID);
    signAlertToken(ID, "cancel");
    expect(warn.mock.calls.length).toBeLessThanOrEqual(1);

    process.env.ALERT_TOKEN_SECRET = "short"; // shorter than 16 counts as not configured
    expect(verifyAlertToken(token, "confirm")).toBe(ID);
  });
});
