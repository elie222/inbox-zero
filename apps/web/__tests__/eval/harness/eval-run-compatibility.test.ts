import { describe, expect, it } from "vitest";
import { assertComparableEvalRuns } from "@/__tests__/eval/harness/eval-run-compatibility";
import type {
  EvalResultRecord,
  EvalRun,
} from "@/__tests__/eval/harness/run-suite";

describe("assertComparableEvalRuns", () => {
  it("accepts runs that differ only by experiment code and variant", () => {
    expect(() =>
      assertComparableEvalRuns(
        makeRun(),
        makeRun({ variantId: "prompt-v2", codeFingerprint: "code-b" }),
      ),
    ).not.toThrow();
  });

  it.each([
    ["judge", { judgeFingerprint: "judge-b" }, "judge fingerprints differ"],
    [
      "judge provider",
      { judgeProvider: "provider-b" },
      "judge providers differ",
    ],
    ["judge model", { judgeModel: "judge-model-b" }, "judge models differ"],
    [
      "environment",
      { environmentFingerprint: "environment-b" },
      "environment fingerprints differ",
    ],
    [
      "case contents",
      { caseFingerprint: "case-content-b" },
      "case fingerprints differ",
    ],
    ["sample layout", { sampleIndexes: [0, 2] }, "sample indexes differ"],
    ["case set", { caseIds: ["case-a"] }, "case-id sets differ"],
    ["model", { model: "model-b" }, "generator models differ"],
  ])("rejects a different %s", (_label, overrides, message) => {
    expect(() =>
      assertComparableEvalRuns(makeRun(), makeRun(overrides)),
    ).toThrow(message);
  });

  it("allows an intentional cross-model comparison", () => {
    expect(() =>
      assertComparableEvalRuns(makeRun(), makeRun({ model: "model-b" }), {
        allowModelChange: true,
      }),
    ).not.toThrow();
  });

  it("rejects legacy runs without provenance instead of guessing", () => {
    const legacy = makeRun();
    legacy.judgeFingerprint = null;
    legacy.records = legacy.records.map((record) => ({
      ...record,
      judgeFingerprint: null,
    }));

    expect(() => assertComparableEvalRuns(legacy, makeRun())).toThrow(
      "missing judge fingerprint",
    );
  });
});

function makeRun({
  model = "model-a",
  variantId = "baseline",
  codeFingerprint = "code-a",
  judgeProvider = "openrouter",
  judgeModel = "judge-model-a",
  judgeFingerprint = "judge-a",
  environmentFingerprint = "environment-a",
  caseFingerprint = "case-content-a",
  caseIds = ["case-a", "case-b"],
  sampleIndexes = [0, 1],
}: {
  model?: string;
  variantId?: string;
  codeFingerprint?: string;
  judgeProvider?: string;
  judgeModel?: string;
  judgeFingerprint?: string;
  environmentFingerprint?: string;
  caseFingerprint?: string;
  caseIds?: string[];
  sampleIndexes?: number[];
} = {}): EvalRun {
  const records = caseIds.flatMap((caseId) =>
    sampleIndexes.map((sampleIndex) =>
      record({
        caseId,
        model,
        variantId,
        sampleIndex,
        codeFingerprint,
        judgeFingerprint,
        environmentFingerprint,
        caseFingerprint: `${caseFingerprint}-${caseId}`,
      }),
    ),
  );

  return {
    evalName: "draft-reply",
    model,
    variantId,
    filters: { split: "dev", tags: [], caseIds: [], shard: null },
    startedAt: "2026-08-09T00:00:00.000Z",
    finishedAt: "2026-08-09T00:01:00.000Z",
    selectedCaseCount: caseIds.length,
    codeFingerprint,
    judgeProvider,
    judgeModel,
    judgeFingerprint,
    environmentFingerprint,
    records,
    historyPath: null,
  };
}

function record(overrides: Partial<EvalResultRecord>): EvalResultRecord {
  return {
    evalName: "draft-reply",
    caseId: "case-a",
    suite: "draft-reply",
    split: "dev",
    tags: [],
    difficultyAxes: [],
    difficulty: "medium",
    model: "model-a",
    variantId: "baseline",
    sampleIndex: 0,
    pass: true,
    sendReady: true,
    usability: "send-ready",
    primaryIssue: null,
    severity: "none",
    confidence: "HIGH",
    assertionFailures: [],
    criteriaFailures: [],
    durationMs: 1,
    judgeReasoning: "fine",
    actual: "A draft",
    error: null,
    sourceRoot: null,
    codeFingerprint: "code-a",
    judgeFingerprint: "judge-a",
    environmentFingerprint: "environment-a",
    caseFingerprint: "case-content-a",
    ...overrides,
  };
}
