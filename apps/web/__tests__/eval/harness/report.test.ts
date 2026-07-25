import { describe, expect, it } from "vitest";
import { buildEvalReport } from "@/__tests__/eval/harness/report";
import type {
  EvalResultRecord,
  EvalRun,
} from "@/__tests__/eval/harness/run-suite";

function record(overrides: Partial<EvalResultRecord> = {}): EvalResultRecord {
  return {
    evalName: "unit",
    caseId: "case-a",
    suite: "draft-reply",
    split: "dev",
    tags: [],
    difficultyAxes: ["verbosity-pressure"],
    difficulty: "medium",
    model: "test-model",
    variantId: "baseline",
    sampleIndex: 0,
    pass: true,
    sendReady: true,
    primaryIssue: null,
    severity: "none",
    assertionFailures: [],
    criteriaFailures: [],
    durationMs: 10,
    judgeReasoning: null,
    actual: null,
    error: null,
    sourceRoot: null,
    ...overrides,
  };
}

function makeRun(records: EvalResultRecord[]): EvalRun {
  return {
    evalName: "unit",
    model: "test-model",
    variantId: "baseline",
    filters: { split: "dev", tags: [], caseIds: [], shard: null },
    startedAt: "2026-07-26T00:00:00.000Z",
    finishedAt: "2026-07-26T00:00:10.000Z",
    selectedCaseCount: new Set(records.map((r) => r.caseId)).size,
    records,
    historyPath: null,
  };
}

function passing(count: number) {
  return Array.from({ length: count }, (_, i) =>
    record({ caseId: `pass-${i}` }),
  );
}

function failing(
  count: number,
  primaryIssue: EvalResultRecord["primaryIssue"],
) {
  return Array.from({ length: count }, (_, i) =>
    record({
      caseId: `fail-${primaryIssue}-${i}`,
      pass: false,
      sendReady: false,
      primaryIssue,
      severity: "major",
    }),
  );
}

describe("buildEvalReport", () => {
  it("shouts when the case set is pinned at the top of its range", () => {
    const report = buildEvalReport({
      run: makeRun([...passing(19), ...failing(1, "VERBOSE_PADDING")]),
      iterations: 200,
    });

    expect(report.ceilingLevel).toBe("ceiling");
    expect(report.banner).toContain("CEILING WARNING");
    expect(report.markdown).toContain("CEILING WARNING");
    // Loud enough to survive a scroll: opens and closes the report.
    expect(report.markdown.indexOf("CEILING WARNING")).toBeLessThan(200);
    expect(report.markdown.lastIndexOf("CEILING WARNING")).toBeGreaterThan(
      report.markdown.length - report.markdown.length / 2,
    );
  });

  it("stays quiet inside the 45-70% acceptance band", () => {
    const report = buildEvalReport({
      run: makeRun([...passing(6), ...failing(4, "MISSED_ASK")]),
      iterations: 200,
    });

    expect(report.ceilingLevel).toBe("in-band");
    expect(report.banner).toBeNull();
    expect(report.markdown).not.toContain("CEILING WARNING");
  });

  it("warns at the floor too, where the harness is more likely broken than the product", () => {
    const report = buildEvalReport({
      run: makeRun([...passing(2), ...failing(8, "FULL_REWRITE")]),
      iterations: 200,
    });

    expect(report.ceilingLevel).toBe("floor");
    expect(report.banner).toContain("Floor warning");
  });

  it("aggregates failures into a histogram by primary issue", () => {
    const report = buildEvalReport({
      run: makeRun([
        ...passing(5),
        ...failing(3, "VERBOSE_PADDING"),
        ...failing(2, "MISSED_ASK"),
      ]),
      iterations: 200,
    });

    expect(report.markdown).toContain("| VERBOSE_PADDING | 3 |");
    expect(report.markdown).toContain("| MISSED_ASK | 2 |");
  });

  it("counts timeouts as failures rather than dropping them", () => {
    const report = buildEvalReport({
      run: makeRun([
        ...passing(1),
        record({
          caseId: "timed-out",
          pass: false,
          sendReady: null,
          error: "timeout",
          actual: "timeout",
        }),
      ]),
      iterations: 200,
    });

    expect(report.sendReady.estimate).toBe(0.5);
    expect(report.markdown).toContain("TIMEOUT (no verdict)");
    expect(report.markdown).toContain("Timeouts: 1");
  });

  it("clusters samples by case so k samples do not inflate the case count", () => {
    const report = buildEvalReport({
      run: makeRun([
        record({ caseId: "a", sampleIndex: 0, sendReady: true }),
        record({ caseId: "a", sampleIndex: 1, sendReady: false, pass: false }),
        record({ caseId: "b", sampleIndex: 0, sendReady: false, pass: false }),
        record({ caseId: "b", sampleIndex: 1, sendReady: false, pass: false }),
      ]),
      iterations: 200,
    });

    expect(report.sendReady.caseCount).toBe(2);
    expect(report.sendReady.estimate).toBe(0.25);
  });
});
