import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { THEME_KEY, THEMES, applyTheme, getStoredTheme, nextTheme, storeTheme } from "../src/lib/theme.js";

// ---- reading tokens.css ----

const read = (path) => readFileSync(path, "utf8").split("\r\n").join("\n");
const tokensCss = read("src/styles/tokens.css");

/** Custom properties declared in the first `{ ... }` after `opener`. */
function declarationsAfter(css, opener) {
  const start = css.indexOf(opener);
  if (start < 0) throw new Error(`no block starting ${opener}`);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
  const out = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const light = declarationsAfter(tokensCss, ":root {");
const darkByDevice = declarationsAfter(tokensCss, ':root:not([data-theme="light"])');
const darkByChoice = declarationsAfter(tokensCss, ':root[data-theme="dark"]');
const dark = { ...light, ...darkByChoice };

// ---- contrast (WCAG 2.x) ----

function rgb(value) {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (!hex) throw new Error(`not a 6-digit hex colour: ${value}`);
  return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16));
}
function luminance(value) {
  const [r, g, b] = rgb(value).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("tokens.css dark mode", () => {
  it("has the same dark values whether the device or the shopper chose dark", () => {
    expect(Object.keys(darkByDevice).length).toBeGreaterThan(20);
    expect(darkByDevice).toEqual(darkByChoice);
  });

  it("redefines every colour token, except the ones deliberately the same in both themes", () => {
    const SAME_IN_BOTH = ["--accent", "--accent-hover", "--on-accent", "--neutral-fill", "--mark-tile", "--on-store"];
    const colourTokens = Object.entries(light)
      .filter(([, v]) => /^#|^transparent$|rgba?\(/.test(v))
      .map(([k]) => k);
    expect(colourTokens.length).toBeGreaterThan(30);
    const missing = colourTokens.filter((k) => !(k in darkByChoice) && !SAME_IN_BOTH.includes(k));
    expect(missing).toEqual([]);
    for (const k of SAME_IN_BOTH) expect(darkByChoice).not.toHaveProperty(k);
  });

  // Text pairs need 4.5:1 (WCAG AA). --ink-mute is decorative only and --ink-faint is the quietest text.
  const PAIRS = [
    ["--ink", "--paper"], ["--ink", "--canvas"],
    ["--ink-soft", "--paper"], ["--ink-soft", "--canvas"],
    ["--ink-faint", "--paper"], ["--ink-faint", "--canvas"],
    ["--brand", "--paper"], ["--brand", "--canvas"], ["--brand", "--brand-soft"], ["--ink", "--brand-soft"],
    ["--on-brand", "--brand"], ["--on-brand", "--brand-hover"], ["--on-brand-soft", "--brand"],
    ["--on-accent", "--accent"], ["--on-accent", "--accent-hover"],
    ["--good", "--good-soft"], ["--good", "--paper"], ["--good", "--canvas"],
    ["--caution", "--caution-soft"], ["--caution", "--paper"],
    ["--bad", "--bad-soft"], ["--bad", "--paper"], ["--bad", "--canvas"],
    ["--ink-soft", "--line-soft"],
    ["--on-caution", "--caution"],
    ["--caution", "--good-soft"], ["--bad", "--good-soft"], ["--ink", "--good-soft"], ["--ink-soft", "--good-soft"], // the lowest-price row
    ["--ink", "--caution-soft"], ["--ink", "--bad-soft"], ["--ink-soft", "--caution-soft"],
    ["--accent-ink", "--paper"], ["--accent-ink", "--canvas"], ["--accent-ink", "--accent-soft"], ["--ink", "--accent-soft"],
    ["--ink", "--raised"], ["--ink-soft", "--raised"], ["--ink-faint", "--raised"],
  ];

  for (const [name, tokens] of [["light", light], ["dark", dark]]) {
    it(`meets 4.5:1 for every text pair in ${name} mode`, () => {
      const weak = PAIRS.map(([fg, bg]) => ({ pair: `${fg} on ${bg}`, ratio: contrast(tokens[fg], tokens[bg]) })).filter((p) => p.ratio < 4.5);
      expect(weak).toEqual([]);
    });
  }

  it("keeps the page darkest in dark mode, then cards, then lines", () => {
    expect(luminance(dark["--canvas"])).toBeLessThan(luminance(dark["--paper"]));
    expect(luminance(dark["--paper"])).toBeLessThan(luminance(dark["--line"]));
    expect(luminance(dark["--canvas"])).toBeLessThan(0.05);
  });

  it("lightens store colours enough to read as chart lines on a dark card, and leaves them alone in light mode", () => {
    const lift = parseInt(dark["--chart-lift"], 10) / 100;
    for (const hex of ["#6a1b9a", "#1976d2", "#b71c1c", "#00695c", "#2e7d32", "#ff6b00", "#d32f2f", "#795548"]) {
      const lifted = "#" + rgb(hex).map((c) => Math.round(c * (1 - lift) + 255 * lift).toString(16).padStart(2, "0")).join("");
      expect(contrast(lifted, dark["--paper"])).toBeGreaterThanOrEqual(4.5);
    }
    expect(light["--chart-lift"]).toBe("0%");
  });
});

// ---- no colour hard-coded outside tokens.css ----

function files(dir, ext) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path, ext) : path.endsWith(ext) ? [path] : [];
  });
}

describe("colours live in tokens.css", () => {
  const cssFiles = files("src", ".css").filter((p) => !p.endsWith("tokens.css"));
  it.each(cssFiles)("%s uses tokens, not colour literals", (path) => {
    // white overlays on the hero (rgba(255,255,255,x)) are allowed: the hero is navy in both themes
    const css = read(path).replace(/rgba\(255,\s*255,\s*255,\s*[\d.]+\)/g, "");
    expect(css.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/g) ?? []).toEqual([]);
  });

  it("the logo tile colour comes from the theme", () => {
    expect(read("src/components/Logo.jsx")).toContain('className="logo__tile"');
    expect(read("src/components/Layout.css")).toMatch(/\.logo__tile\s*\{[^}]*var\(--logo-tile\)/);
  });
});

// ---- the choice ----

describe("theme choice", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("cycles dark -> light -> device -> dark", () => {
    expect(THEMES).toEqual(["dark", "light", "system"]);
    expect(nextTheme("dark")).toBe("light");
    expect(nextTheme("light")).toBe("system");
    expect(nextTheme("system")).toBe("dark");
    expect(nextTheme("junk")).toBe("dark");
  });

  it("opens dark when nothing or junk is stored", () => {
    expect(getStoredTheme()).toBe("dark");
    window.localStorage.setItem(THEME_KEY, "purple");
    expect(getStoredTheme()).toBe("dark");
  });

  it("remembers each choice, including following the device", () => {
    storeTheme("light");
    expect(getStoredTheme()).toBe("light");
    storeTheme("system");
    expect(getStoredTheme()).toBe("system");
    storeTheme("dark");
    expect(getStoredTheme()).toBe("dark");
  });

  it("works when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(getStoredTheme()).toBe("dark");
    expect(() => storeTheme("light")).not.toThrow();
  });

  it("sets data-theme for light and dark and clears it for the device setting", () => {
    applyTheme("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    applyTheme("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    applyTheme("system");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("uses the same storage key and default as the inline script in index.html that prevents a flash", () => {
    const html = read("index.html");
    expect(html).toContain(`"${THEME_KEY}"`);
    // run the inline script as the browser would, for each stored value
    const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    for (const [stored, expected] of [[null, "dark"], ["purple", "dark"], ["dark", "dark"], ["light", "light"], ["system", null]]) {
      document.documentElement.removeAttribute("data-theme");
      if (stored === null) window.localStorage.removeItem(THEME_KEY); else window.localStorage.setItem(THEME_KEY, stored);
      new Function(script)();
      expect(document.documentElement.getAttribute("data-theme"), String(stored)).toBe(expected);
    }
  });

  it("every token a stylesheet uses is defined in tokens.css", () => {
    // tokens.css, plus the few a component sets inline for itself (a store's colour: style={{ "--store": colour }})
    const inline = files("src", ".jsx").flatMap((p) => [...read(p).matchAll(/"(--[\w-]+)":/g)].map((m) => m[1]))
      // and a stylesheet's own local ones (Charts.css sets --tone per colour class)
      .concat(files("src", ".css").filter((p) => !p.endsWith("tokens.css")).flatMap((p) => [...read(p).matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1])));
    const defined = new Set([...tokensCss.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]).concat(inline));
    const used = files("src", ".css").flatMap((p) => [...read(p).matchAll(/var\((--[\w-]+)/g)].map((m) => `${p}: ${m[1]}`));
    expect(used.filter((u) => !defined.has(u.split(": ")[1]))).toEqual([]);
  });
});
