import { describe, it, expect } from "vitest";
import { extractSpecs, normalizeSpecs, specScore, rankInBand } from "../src/specs/index.js";

// ── extractSpecs ──────────────────────────────────────────────────────────────
const PRICEOYE_HTML = `<html><body>
  <table class="specs-table">
    <tr><td>RAM</td><td>8 GB</td></tr>
    <tr><td>Storage</td><td>256 GB</td></tr>
    <tr><td>Battery</td><td>5000 mAh</td></tr>
    <tr><td>Processor</td><td>Snapdragon 8 Gen 3</td></tr>
  </table></body></html>`;

const SHOPHIVE_HTML = `<html><body>
  <table id="product-attribute-specs-table">
    <tr><td>RAM</td><td>12 GB</td></tr>
    <tr><td>Internal Storage</td><td>512 GB</td></tr>
  </table></body></html>`;

describe("extractSpecs", () => {
  it("parses priceoye spec table into raw string pairs", () => {
    const raw = extractSpecs("priceoye", PRICEOYE_HTML);
    expect(raw?.RAM).toBe("8 GB");
    expect(raw?.Battery).toBe("5000 mAh");
  });

  it("parses shophive attribute table", () => {
    const raw = extractSpecs("shophive", SHOPHIVE_HTML);
    expect(raw?.RAM).toBe("12 GB");
  });

  it("returns null for unknown platform", () => {
    expect(extractSpecs("unknownstore", PRICEOYE_HTML)).toBeNull();
  });

  it("returns null for HTML with no matching spec containers", () => {
    expect(extractSpecs("priceoye", "<html><body><p>nothing</p></body></html>")).toBeNull();
  });
});

// ── normalizeSpecs ────────────────────────────────────────────────────────────
describe("normalizeSpecs", () => {
  it("converts RAM string to number", () => {
    expect(normalizeSpecs({ RAM: "8 GB" }).ramGb).toBe(8);
  });

  it("converts Internal Storage to storageGb", () => {
    expect(normalizeSpecs({ "Internal Storage": "256 GB" }).storageGb).toBe(256);
  });

  it("converts battery mAh to number", () => {
    expect(normalizeSpecs({ Battery: "5000 mAh" }).batteryMah).toBe(5000);
  });

  it("derives chipsetTier from chipset name", () => {
    const sheet = normalizeSpecs({ Processor: "Snapdragon 8 Gen 3" });
    expect(sheet.chipset).toBe("Snapdragon 8 Gen 3");
    expect(sheet.chipsetTier).toBe("flagship");
  });

  it("parses multi-camera field — takes largest value", () => {
    const sheet = normalizeSpecs({ Camera: "50 MP + 12 MP + 10 MP" });
    expect(sheet.mainCameraMp).toBe(50);
  });

  it("parses boolean NFC field", () => {
    expect(normalizeSpecs({ NFC: "Yes" }).nfc).toBe(true);
    expect(normalizeSpecs({ NFC: "No" }).nfc).toBe(false);
  });

  it("drops fields with unparseable values silently", () => {
    const sheet = normalizeSpecs({ RAM: "N/A", Battery: "5000 mAh" });
    expect("ramGb" in sheet).toBe(false);
    expect(sheet.batteryMah).toBe(5000);
  });
});

// ── specScore ─────────────────────────────────────────────────────────────────
describe("specScore", () => {
  it("returns null for a sheet with fewer than 2 fields", () => {
    expect(specScore({ ramGb: 8 }, "smartphone")).toBeNull();
    expect(specScore({}, "smartphone")).toBeNull();
  });

  it("returns score 0–100 and parts array for a valid sheet", () => {
    const { score, parts } = specScore({ ramGb: 8, batteryMah: 5000 }, "smartphone");
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
    expect(parts.some((p) => p.field === "ramGb" && p.points > 0)).toBe(true);
  });

  it("returns 100 for a fully populated smartphone sheet", () => {
    const full = {
      chipset: "Snapdragon 8 Gen 3", chipsetTier: "flagship",
      ramGb: 12, storageGb: 256, displayInches: 6.7, refreshHz: 120,
      displayType: "AMOLED", batteryMah: 5000, chargingW: 45,
      mainCameraMp: 50, frontCameraMp: 12, os: "Android 14",
      has5g: true, nfc: true,
    };
    expect(specScore(full, "smartphone").score).toBe(100);
  });

  it("falls back to default weights for unknown category", () => {
    const { score } = specScore({ ramGb: 8, batteryMah: 5000 }, "toaster");
    expect(score).toBeGreaterThan(0);
  });
});

// ── rankInBand ────────────────────────────────────────────────────────────────
describe("rankInBand", () => {
  it("ranks product correctly and returns band boundaries", () => {
    const me = { id: "a", category: "smartphone", score: 70, price: 65000 };
    const others = [
      { id: "b", score: 90, price: 62000 },
      { id: "c", score: 50, price: 68000 },
    ];
    const result = rankInBand(me, others);
    expect(result).toEqual({ rank: 2, of: 3, band: { min: 60000, max: 70000 } });
  });

  it("ranks #1 of 1 when no others are in the band", () => {
    const me = { id: "a", category: "smartphone", score: 70, price: 65000 };
    const result = rankInBand(me, [{ id: "b", score: 90, price: 15000 }]); // different band
    expect(result).toEqual({ rank: 1, of: 1, band: { min: 60000, max: 70000 } });
  });

  it("returns null when product has no valid price", () => {
    expect(rankInBand({ id: "a", score: 70, price: 0 }, [])).toBeNull();
    expect(rankInBand({ id: "a", score: 70, price: NaN }, [])).toBeNull();
    expect(rankInBand(null, [])).toBeNull();
  });
});