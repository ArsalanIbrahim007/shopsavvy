// ExtensionPrompt.jsx — the invitation to add the browser extension (2026-11-27, Arsalan's request: "only I can use it so far").
// A small card in the corner, never a blocking dialog: shown on a computer's Chrome or Edge (the extension runs nowhere else), not
// to someone who has it (extension/site.js marks the page), not on the /extension page itself, and only once the visitor has looked
// around: a second page, or SHOW_AFTER_MS on the first. "Not now" hides it for 14 days, "Add" for 60 (lib/extension.js).

import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import {
  ADDED_DAYS, EXTENSION_STORE_URL, EXTENSION_STORES, NOT_NOW_DAYS, browserName, extensionBrowser, extensionInstalled, promptSnoozed,
  snoozePrompt,
} from "../lib/extension.js";
import "./ExtensionPrompt.css";

export const SHOW_AFTER_MS = 15000;

export default function ExtensionPrompt() {
  const { pathname } = useLocation();
  const [firstPage] = useState(pathname);
  const [waited, setWaited] = useState(false);
  const [closed, setClosed] = useState(false);
  const browser = extensionBrowser();

  // a while on the first page (or a second page opened, below)
  useEffect(() => {
    const timer = setTimeout(() => setWaited(true), SHOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  // the extension's mark is set before the page's scripts run, so it is known by the first render
  const open = Boolean(browser) && !closed && (waited || pathname !== firstPage) && !pathname.startsWith("/extension")
    && !extensionInstalled() && !promptSnoozed();

  const notNow = () => {
    snoozePrompt(NOT_NOW_DAYS);
    setClosed(true);
  };
  const added = () => {
    snoozePrompt(ADDED_DAYS);
    setClosed(true);
  };

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      snoozePrompt(NOT_NOW_DAYS);
      setClosed(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  const label = `Add to ${browserName(browser)}, it's free`;
  return (
    <aside className="ext-prompt" role="dialog" aria-labelledby="ext-prompt-title" aria-describedby="ext-prompt-text">
      <button type="button" className="ext-prompt__close" aria-label="Close" onClick={notNow}>×</button>
      <div className="ext-prompt__head">
        <span className="ext-prompt__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22" focusable="false">
            <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" />
              <circle cx="7.5" cy="7.5" r="1.5" />
            </g>
          </svg>
        </span>
        <h2 id="ext-prompt-title" className="ext-prompt__title">Never overpay again</h2>
      </div>
      <p id="ext-prompt-text" className="ext-prompt__text">
        See cheaper prices from {EXTENSION_STORES} Pakistani stores right on the page you're shopping, and spot fake discounts.
      </p>
      <div className="ext-prompt__actions">
        {EXTENSION_STORE_URL ? (
          <a className="btn btn-accent" href={EXTENSION_STORE_URL} target="_blank" rel="noopener noreferrer" onClick={added}>{label}</a>
        ) : (
          <Link className="btn btn-accent" to="/extension" onClick={added}>{label}</Link>
        )}
        <button type="button" className="ext-prompt__later" onClick={notNow}>Not now</button>
      </div>
    </aside>
  );
}
