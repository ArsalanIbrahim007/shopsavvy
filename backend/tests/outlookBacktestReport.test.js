import { describe, it, expect, beforeEach } from "vitest";

import { clearEvaluationCache, parseOutlookBacktest, readEvaluation } from "../src/services/evaluationReport.service.js";

const REPORT = `# Wait-or-buy outlook: backtest

Generated 2026-10-01T07:29:34.670Z by \`src/scripts/ml/price-outlook-backtest.js\`. Read-only.

Records compared: 221, starting 2026-07-03, the last one on 2026-08-17.
A verdict with fewer than 30 comparisons is marked "too few" and should not be read as evidence.

| Verdict at the time | Comparisons | Listings | Fell 3%+ a week later | Rose 3%+ a week later |
|---|---|---|---|---|
| Too early to say (not enough days of records) | 189 | 62 | 17.5% | 11.1% |
| Flat (the best price has not moved) | 0 | 0 | n/a | n/a |
| At its lowest recorded price | 12 | 10 | 0% (too few) | 25% (too few) |
| 5% or more above its usual price | 14 | 7 | 50% (too few) | 7.1% (too few) |
| Around its usual price | 6 | 6 | 33.3% (too few) | 0% (too few) |
| All | 221 | | 19% | 11.3% |

## How to read it
`;

describe("parseOutlookBacktest", () => {
  it("reads the period, the minimum to judge, and one row per verdict in order", () => {
    const out = parseOutlookBacktest(REPORT);
    expect(out).toMatchObject({ generatedAt: "2026-10-01T07:29:34.670Z", comparisons: 221, from: "2026-07-03", to: "2026-08-17", minimumToJudge: 30 });
    expect(out.rows.map((row) => row.verdict)).toEqual(["too_early", "flat", "at_low", "above_usual", "usual"]);
    expect(out.rows[0]).toEqual({ verdict: "too_early", label: "Too early to say (not enough days of records)", comparisons: 189, listings: 62, fellShare: 17.5, roseShare: 11.1, judgeable: true });
  });

  it("marks a row that says '(too few)' as not judgeable, and keeps its numbers", () => {
    const row = parseOutlookBacktest(REPORT).rows[3];
    expect(row).toMatchObject({ verdict: "above_usual", comparisons: 14, listings: 7, fellShare: 50, roseShare: 7.1, judgeable: false });
  });

  it("treats a '(too few)' mark in either column as not judgeable", () => {
    const only = (cell) => parseOutlookBacktest(REPORT.replace("| 50% (too few) | 7.1% (too few) |", cell)).rows[3].judgeable;
    expect(only("| 50% (too few) | 7.1% |")).toBe(false);
    expect(only("| 50% | 7.1% (too few) |")).toBe(false);
    expect(only("| 50% | 7.1% |")).toBe(true);
  });

  it("reads a row with no comparisons as n/a, never as 0%", () => {
    const row = parseOutlookBacktest(REPORT).rows[1];
    expect(row).toMatchObject({ verdict: "flat", comparisons: 0, fellShare: null, roseShare: null, judgeable: false });
  });

  it("reads a judgeable row, and the 'All' line", () => {
    const out = parseOutlookBacktest(REPORT.replace("| 50% (too few) | 7.1% (too few) |", "| 50% | 7.1% |").replace("| 14 | 7 |", "| 40 | 7 |"));
    expect(out.rows[3]).toMatchObject({ comparisons: 40, fellShare: 50, roseShare: 7.1, judgeable: true });
    expect(out.all).toMatchObject({ label: "All", comparisons: 221, listings: null, fellShare: 19, roseShare: 11.3 });
  });

  it("copes with a report that has no records yet", () => {
    const empty = REPORT.replace("Records compared: 221, starting 2026-07-03, the last one on 2026-08-17.", "Records compared: 0.");
    expect(parseOutlookBacktest(empty)).toMatchObject({ comparisons: 0, from: null, to: null });
  });

  it("gives null for text that is not the report, or that has lost a row or a number", () => {
    expect(parseOutlookBacktest("")).toBeNull();
    expect(parseOutlookBacktest(undefined)).toBeNull();
    expect(parseOutlookBacktest("# something else")).toBeNull();
    expect(parseOutlookBacktest(REPORT.replace("| Around its usual price | 6 | 6 | 33.3% (too few) | 0% (too few) |\n", ""))).toBeNull();
    expect(parseOutlookBacktest(REPORT.replace("| Flat (the best price has not moved) | 0 | 0 | n/a | n/a |", "| Flat | many | 0 | n/a | n/a |"))).toBeNull();
    expect(parseOutlookBacktest(REPORT.replace("Records compared: 221", "Records: 221"))).toBeNull();
    expect(parseOutlookBacktest(REPORT.replace("fewer than 30 comparisons", "few comparisons"))).toBeNull();
  });
});

describe("the real backtest report in the repository", () => {
  beforeEach(() => clearEvaluationCache());

  it("can still be read, so the page is never silently empty", () => {
    const { outlook } = readEvaluation();
    expect(outlook).not.toBeNull();
    expect(outlook.rows).toHaveLength(5);
    expect(outlook.minimumToJudge).toBeGreaterThan(0);
    expect(outlook.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
    expect(outlook.all.comparisons).toBe(outlook.rows.reduce((sum, row) => sum + row.comparisons, 0));
    for (const row of outlook.rows) expect(row.judgeable).toBe(row.comparisons >= outlook.minimumToJudge);
  });
});
