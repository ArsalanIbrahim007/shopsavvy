import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { sendMail, createTransport } = vi.hoisted(() => {
  const sendMail = vi.fn();
  return { sendMail, createTransport: vi.fn(() => ({ sendMail })) };
});
vi.mock("nodemailer", () => ({ default: { createTransport }, createTransport }));

import { notifyAlert, sendAlertConfirmation, sendTestEmail, smtpSettings } from "../src/services/notification.service.js";

const KEYS = ["SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"];
const saved = {};
const alert = { email: "shopper@example.com", targetPrice: 50000, title: "Samsung Galaxy A17" };
const links = { confirmUrl: "http://localhost:5000/alerts/confirm/SECRETCONFIRM", cancelUrl: "http://localhost:5000/alerts/cancel/SECRETCANCEL" };
const smtp = (extra = {}) => Object.assign(process.env, { SMTP_HOST: "smtp.example.com", SMTP_USER: "alerts@example.com", SMTP_PASS: "hunter2-app-password", ...extra });

let log;
let warn;
beforeEach(() => {
  for (const key of KEYS) { saved[key] = process.env[key]; delete process.env[key]; }
  sendMail.mockReset().mockResolvedValue({ accepted: ["shopper@example.com"] });
  createTransport.mockClear();
  log = vi.spyOn(console, "log").mockImplementation(() => {});
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  for (const key of KEYS) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }
  vi.restoreAllMocks();
});

const everythingLogged = () => [...log.mock.calls, ...warn.mock.calls].flat().join(" ");

describe("without SMTP_HOST (the console channel, as before)", () => {
  it("prints the message with the links and reports that nothing was delivered", async () => {
    const result = await sendAlertConfirmation(alert, links);
    expect(result).toEqual({ delivered: false, channel: "console-log-only" });
    expect(everythingLogged()).toContain("SECRETCONFIRM");
    expect(everythingLogged()).not.toContain("shopper@example.com"); // the address is masked in logs
    expect(createTransport).not.toHaveBeenCalled();
  });

  it("treats a blank SMTP_HOST as not set", async () => {
    process.env.SMTP_HOST = "   ";
    expect(smtpSettings()).toBeNull();
    expect((await notifyAlert(alert, { price: 49000 }, { cancelUrl: links.cancelUrl })).channel).toBe("console-log-only");
  });
});

describe("smtpSettings", () => {
  it("defaults to port 465 with TLS, and sends from the user when there is no SMTP_FROM", () => {
    smtp();
    expect(smtpSettings()).toEqual({ host: "smtp.example.com", port: 465, secure: true, auth: { user: "alerts@example.com", pass: "hunter2-app-password" }, from: "alerts@example.com" });
  });

  it("port 587 means STARTTLS (secure false), and SMTP_SECURE can say otherwise either way", () => {
    smtp({ SMTP_PORT: "587" });
    expect(smtpSettings()).toMatchObject({ port: 587, secure: false });
    smtp({ SMTP_PORT: "587", SMTP_SECURE: "true" });
    expect(smtpSettings().secure).toBe(true);
    smtp({ SMTP_PORT: "465", SMTP_SECURE: "false" });
    expect(smtpSettings().secure).toBe(false);
    smtp({ SMTP_PORT: "465", SMTP_SECURE: "TRUE" });
    expect(smtpSettings().secure).toBe(true);
  });

  it("falls back to 465 for a port that is not a number, and uses SMTP_FROM when given", () => {
    smtp({ SMTP_PORT: "abc", SMTP_FROM: ' "ShopSavvy" <alerts@example.com> ' });
    expect(smtpSettings()).toMatchObject({ port: 465, from: '"ShopSavvy" <alerts@example.com>' });
  });

  it("has no auth for a server that needs none", () => {
    process.env.SMTP_HOST = "localhost";
    expect(smtpSettings()).toMatchObject({ auth: undefined, from: "" });
  });

  it("reads the environment it is given", () => {
    expect(smtpSettings({ SMTP_HOST: "mail.test", SMTP_USER: "u", SMTP_PASS: "p" })).toMatchObject({ host: "mail.test", auth: { user: "u", pass: "p" } });
  });
});

describe("with SMTP configured", () => {
  it("sends the confirmation to the real address, with both links, and reports it delivered", async () => {
    smtp({ SMTP_FROM: "ShopSavvy <alerts@example.com>" });
    const result = await sendAlertConfirmation(alert, links);
    expect(result).toEqual({ delivered: true, channel: "smtp" });
    expect(sendMail).toHaveBeenCalledTimes(1);
    const mail = sendMail.mock.calls[0][0];
    expect(mail).toMatchObject({ from: "ShopSavvy <alerts@example.com>", to: "shopper@example.com", subject: "Confirm your ShopSavvy price alert" });
    expect(mail.text).toContain(links.confirmUrl);
    expect(mail.text).toContain(links.cancelUrl);
  });

  it("an alert-reached email carries the product link, the price and the way to stop", async () => {
    smtp();
    await notifyAlert(alert, { price: 49000, productUrl: "https://shop.example/a17" }, { cancelUrl: links.cancelUrl });
    const mail = sendMail.mock.calls[0][0];
    expect(mail.subject).toBe("Your ShopSavvy price alert was reached");
    expect(mail.text).toContain("PKR 49000");
    expect(mail.text).toContain("https://shop.example/a17");
    expect(mail.text).toContain(links.cancelUrl);
  });

  it("starts the connection with timeouts, and with TLS required on a STARTTLS port", async () => {
    smtp({ SMTP_PORT: "587" });
    await sendAlertConfirmation(alert, links);
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({
      host: "smtp.example.com", port: 587, secure: false, requireTLS: true, connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 15000,
      auth: { user: "alerts@example.com", pass: "hunter2-app-password" },
    }));
    smtp({ SMTP_PORT: "465" });
    await sendAlertConfirmation(alert, links);
    expect(createTransport).toHaveBeenLastCalledWith(expect.objectContaining({ port: 465, secure: true, requireTLS: false }));
  });

  it("reuses the connection settings between emails, and builds new ones when the settings change", async () => {
    smtp({ SMTP_HOST: "reuse.example.com" }); // settings no other test uses, so the cache from an earlier test cannot answer
    await sendAlertConfirmation(alert, links);
    await sendAlertConfirmation(alert, links);
    expect(createTransport).toHaveBeenCalledTimes(1);
    process.env.SMTP_PASS = "another-password";
    await sendAlertConfirmation(alert, links);
    expect(createTransport).toHaveBeenCalledTimes(2);
  });

  it("never writes a link, a password or the full address to the log, on success", async () => {
    smtp();
    await sendAlertConfirmation(alert, links);
    expect(log).not.toHaveBeenCalled();
    expect(everythingLogged()).not.toMatch(/SECRET|hunter2|shopper@example\.com/);
  });

  it("reports a failed send as not delivered, with the error code only, and does not throw", async () => {
    smtp();
    sendMail.mockRejectedValue(Object.assign(new Error("Invalid login: 535-5.7.8 Username and Password not accepted for hunter2-app-password"), { code: "EAUTH" }));
    const result = await sendAlertConfirmation(alert, links);
    expect(result).toEqual({ delivered: false, channel: "smtp", reason: "EAUTH" });
    expect(everythingLogged()).toContain("EAUTH");
    expect(everythingLogged()).not.toMatch(/SECRET|hunter2|shopper@example\.com|Username and Password/);
  });

  it("names a failure by its response code, or just 'error', when it has no code", async () => {
    smtp();
    sendMail.mockRejectedValueOnce(Object.assign(new Error("x"), { responseCode: 550 }));
    expect((await sendAlertConfirmation(alert, links)).reason).toBe("550");
    sendMail.mockRejectedValueOnce(new Error("socket hang up"));
    expect((await sendAlertConfirmation(alert, links)).reason).toBe("error");
    sendMail.mockRejectedValueOnce(null);
    expect((await sendAlertConfirmation(alert, links)).reason).toBe("error");
  });

  it("does not send when there is nobody to send as", async () => {
    process.env.SMTP_HOST = "smtp.example.com";
    const result = await sendAlertConfirmation(alert, links);
    expect(result).toEqual({ delivered: false, channel: "smtp", reason: "no-sender" });
    expect(sendMail).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("no SMTP_FROM or SMTP_USER"));
  });

  it("sendTestEmail goes through the same channel", async () => {
    smtp();
    expect(await sendTestEmail("me@example.com")).toEqual({ delivered: true, channel: "smtp" });
    expect(sendMail.mock.calls[0][0]).toMatchObject({ to: "me@example.com", subject: "ShopSavvy test email" });
  });
});
