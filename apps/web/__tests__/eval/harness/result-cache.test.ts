import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildCacheKey,
  readCachedRecord,
  rehydrate,
  writeCachedRecord,
} from "@/__tests__/eval/harness/result-cache";
import type { EvalResultRecord } from "@/__tests__/eval/harness/run-suite";

const BASE_KEY = {
  caseFingerprint: "case-a",
  judgeFingerprint: "judge-1",
  model: "model-x",
  sampleIndex: 0,
  variantId: "baseline",
};

let cacheDir: string;

beforeEach(() => {
  cacheDir = mkdtempSync(path.join(tmpdir(), "eval-cache-"));
  process.env.EVAL_CACHE_DIR = cacheDir;
  process.env.EVAL_CACHE = "readwrite";
});

afterEach(() => {
  rmSync(cacheDir, { recursive: true, force: true });
  delete process.env.EVAL_CACHE_DIR;
  delete process.env.EVAL_CACHE;
});

describe("result cache keys", () => {
  /**
   * Each of these is something that changes what the draft looks like or how it
   * is graded. Serving a cached verdict across any of them would report a
   * result nothing currently produces, which is worse than not caching at all.
   */
  it.each([
    ["the case", { caseFingerprint: "case-b" }],
    ["the judge", { judgeFingerprint: "judge-2" }],
    ["the model", { model: "model-y" }],
    ["the sample index", { sampleIndex: 1 }],
    ["the variant", { variantId: "no-calendar" }],
  ])("changes when %s changes", (_label, override) => {
    expect(buildCacheKey({ ...BASE_KEY, ...override })).not.toBe(
      buildCacheKey(BASE_KEY),
    );
  });

  it("is stable for identical inputs", () => {
    expect(buildCacheKey(BASE_KEY)).toBe(buildCacheKey(BASE_KEY));
  });
});

describe("result cache storage", () => {
  it("round-trips a record", () => {
    const key = buildCacheKey(BASE_KEY);
    writeCachedRecord(key, record({ sendReady: true }));
    expect(readCachedRecord(key)?.sendReady).toBe(true);
  });

  /**
   * An errored sample describes the provider that day, not the draft. Caching
   * it would make a transient outage look permanent on every later run.
   */
  it("refuses to cache an errored sample", () => {
    const key = buildCacheKey(BASE_KEY);
    writeCachedRecord(key, record({ error: "timeout", sendReady: null }));
    expect(readCachedRecord(key)).toBeNull();
  });

  it("reads nothing in refresh mode, so a forced rerun really reruns", () => {
    const key = buildCacheKey(BASE_KEY);
    writeCachedRecord(key, record({ sendReady: true }));
    process.env.EVAL_CACHE = "refresh";
    expect(readCachedRecord(key)).toBeNull();
  });

  it("writes nothing in readonly mode", () => {
    const key = buildCacheKey(BASE_KEY);
    process.env.EVAL_CACHE = "readonly";
    writeCachedRecord(key, record({ sendReady: true }));
    process.env.EVAL_CACHE = "readwrite";
    expect(readCachedRecord(key)).toBeNull();
  });

  it("is off unless asked for", () => {
    const key = buildCacheKey(BASE_KEY);
    delete process.env.EVAL_CACHE;
    writeCachedRecord(key, record({ sendReady: true }));
    expect(readCachedRecord(key)).toBeNull();
  });

  it("survives a truncated file rather than crashing the run", () => {
    const key = buildCacheKey(BASE_KEY);
    writeCachedRecord(key, record({ sendReady: true }));
    writeFileSync(
      path.join(cacheDir, key.slice(0, 2), `${key}.json`),
      "{trunc",
    );
    expect(readCachedRecord(key)).toBeNull();
  });

  /**
   * The graded outcome is reusable; which run produced it is not. Keeping the
   * old model or sample index would misattribute the result in the report.
   */
  it("rehydrates run-scoped fields onto a cached outcome", () => {
    const cached = record({ sendReady: true });
    const fresh = rehydrate(cached, {
      evalName: "later-run",
      model: "model-y",
      sampleIndex: 2,
      variantId: "no-calendar",
    });

    expect(fresh.sendReady).toBe(true);
    expect(fresh.model).toBe("model-y");
    expect(fresh.sampleIndex).toBe(2);
    expect(fresh.variantId).toBe("no-calendar");
    expect(fresh.durationMs).toBe(0);
  });
});

function record(overrides: Partial<EvalResultRecord>): EvalResultRecord {
  return {
    evalName: "draft-reply",
    caseId: "case-a",
    suite: "draft-reply",
    split: "dev",
    tags: [],
    difficultyAxes: [],
    difficulty: "medium",
    model: "model-x",
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
    durationMs: 1234,
    judgeReasoning: "fine",
    actual: "Yes, that works.",
    error: null,
    sourceRoot: null,
    ...overrides,
  };
}
