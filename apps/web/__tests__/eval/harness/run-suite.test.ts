import { describe, expect, it } from "vitest";
import type { EvalCaseEnvelope } from "@/__tests__/eval/harness/case-schema";
import {
  readEvalFiltersFromEnv,
  runEvalSuite,
  selectEvalCases,
} from "@/__tests__/eval/harness/run-suite";

function makeCase(overrides: Partial<EvalCaseEnvelope> = {}): EvalCaseEnvelope {
  return {
    id: "case-a",
    suite: "draft-reply",
    split: "dev",
    tags: [],
    difficultyAxes: ["verbosity-pressure"],
    difficulty: "medium",
    provenance: { kind: "handwritten", reviewedBy: null },
    notes: "",
    enabled: true,
    ...overrides,
  };
}

const noFilters = {
  split: "all" as const,
  tags: [],
  caseIds: [],
  shard: null,
};

describe("selectEvalCases", () => {
  const cases = [
    makeCase({ id: "dev-one", split: "dev", tags: ["billing"] }),
    makeCase({ id: "test-one", split: "test", tags: ["billing"] }),
    makeCase({ id: "disabled", split: "dev", enabled: false }),
    makeCase({
      id: "unreviewed-synthetic",
      split: "dev",
      provenance: {
        kind: "synthetic",
        reviewedBy: null,
        specId: null,
        generatorModel: null,
        verifierModel: null,
      },
    }),
  ];

  it("defaults to the dev split and drops disabled and unreviewed cases", () => {
    const selected = selectEvalCases({
      cases,
      filters: readEvalFiltersFromEnv({}),
    });
    expect(selected.map((c) => c.id)).toEqual(["dev-one"]);
  });

  it("filters by tag and by case id", () => {
    expect(
      selectEvalCases({
        cases,
        filters: { ...noFilters, tags: ["billing"] },
      }).map((c) => c.id),
    ).toEqual(["dev-one", "test-one"]);

    expect(
      selectEvalCases({
        cases,
        filters: { ...noFilters, caseIds: ["test-one"] },
      }).map((c) => c.id),
    ).toEqual(["test-one"]);
  });

  it("partitions cases across shards without overlap or loss", () => {
    const many = Array.from({ length: 200 }, (_, i) =>
      makeCase({ id: `case-${i}` }),
    );
    const total = 4;
    const shards = Array.from({ length: total }, (_, i) =>
      selectEvalCases({
        cases: many,
        filters: { ...noFilters, shard: { index: i + 1, total } },
      }).map((c) => c.id),
    );

    expect(shards.flat().sort()).toEqual(many.map((c) => c.id).sort());
    for (const shard of shards) expect(shard.length).toBeGreaterThan(20);
  });

  it("rejects a malformed shard spec", () => {
    expect(() => readEvalFiltersFromEnv({ EVAL_SHARD: "5/4" })).toThrow();
    expect(() => readEvalFiltersFromEnv({ EVAL_SHARD: "half" })).toThrow();
  });
});

describe("runEvalSuite", () => {
  it("records every sample separately and respects the concurrency bound", async () => {
    let inFlight = 0;
    let peak = 0;

    const run = await runEvalSuite({
      evalName: "unit",
      model: "test-model",
      writeHistory: false,
      concurrency: 3,
      samples: 4,
      filters: noFilters,
      cases: [makeCase({ id: "a" }), makeCase({ id: "b" })],
      invoke: async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return "reply";
      },
      judge: async () => ({
        sendReady: true,
        primaryIssue: null,
        severity: "none",
        reasoning: "fine",
      }),
    });

    expect(run.records).toHaveLength(8);
    expect(new Set(run.records.map((r) => r.sampleIndex))).toEqual(
      new Set([0, 1, 2, 3]),
    );
    expect(peak).toBeLessThanOrEqual(3);
    expect(run.records.every((r) => r.pass)).toBe(true);
  });

  it("records a timeout as a failed sample instead of dropping it", async () => {
    const run = await runEvalSuite({
      evalName: "unit",
      model: "test-model",
      writeHistory: false,
      timeoutMs: 10,
      filters: noFilters,
      cases: [makeCase({ id: "slow" })],
      invoke: () => new Promise((resolve) => setTimeout(resolve, 200, "late")),
    });

    expect(run.records).toHaveLength(1);
    expect(run.records[0]?.pass).toBe(false);
    expect(run.records[0]?.actual).toBe("timeout");
    expect(run.records[0]?.error).toBe("timeout");
  });

  it("fails a sample when an assertion fails, even if the judge passes it", async () => {
    const run = await runEvalSuite({
      evalName: "unit",
      model: "test-model",
      writeHistory: false,
      filters: noFilters,
      cases: [makeCase({ id: "a" })],
      invoke: async () => "reply",
      assert: () => [
        {
          name: "replyWordCountAtMost",
          pass: false,
          detail: "40 words, max 20",
        },
      ],
      judge: async () => ({
        sendReady: true,
        primaryIssue: null,
        severity: "none",
        reasoning: "fine",
      }),
    });

    expect(run.records[0]?.pass).toBe(false);
    expect(run.records[0]?.sendReady).toBe(true);
    expect(run.records[0]?.assertionFailures).toHaveLength(1);
  });

  it("records an invoke error as a failure and keeps the case in the denominator", async () => {
    const run = await runEvalSuite({
      evalName: "unit",
      model: "test-model",
      writeHistory: false,
      filters: noFilters,
      cases: [makeCase({ id: "a" }), makeCase({ id: "b" })],
      invoke: async ({ evalCase }) => {
        if (evalCase.id === "a") throw new Error("provider exploded");
        return "reply";
      },
    });

    expect(run.records).toHaveLength(2);
    const failed = run.records.find((r) => r.caseId === "a");
    expect(failed?.pass).toBe(false);
    expect(failed?.error).toContain("provider exploded");
  });
});
