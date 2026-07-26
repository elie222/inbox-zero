import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  isCountableCase,
  type DifficultyAxis,
  type DifficultyLevel,
  type EvalCaseEnvelope,
  type EvalSplit,
} from "@/__tests__/eval/harness/case-schema";
import type { AssertionOutcome } from "@/__tests__/eval/harness/assertions";
import {
  buildCacheKey,
  getCodeFingerprint,
  readCachedRecord,
  rehydrate,
  writeCachedRecord,
} from "@/__tests__/eval/harness/result-cache";
import type { EditFailureMode } from "@/__tests__/eval/harness/taxonomy";

export const DEFAULT_CONCURRENCY = 8;
export const DEFAULT_TIMEOUT_MS = 120_000;

export type EvalFilters = {
  split: EvalSplit | "all";
  tags: string[];
  caseIds: string[];
  shard: { index: number; total: number } | null;
};

export type EvalJudgeOutcome = {
  sendReady: boolean;
  usability: string | null;
  primaryIssue: EditFailureMode | null;
  severity: string | null;
  reasoning: string;
  criteriaFailures?: string[];
};

export type EvalResultRecord = {
  evalName: string;
  caseId: string;
  suite: string;
  split: EvalSplit;
  tags: string[];
  difficultyAxes: DifficultyAxis[];
  difficulty: DifficultyLevel;
  model: string;
  variantId: string;
  sampleIndex: number;
  pass: boolean;
  sendReady: boolean | null;
  /**
   * send-ready / needs-fill / not-usable. Separates a draft that honestly
   * leaves a gap from one that invented the missing value; both fail
   * sendReady, but only one is safe to ship behind a placeholder strategy.
   */
  usability: string | null;
  primaryIssue: EditFailureMode | null;
  severity: string | null;
  /**
   * The drafter's own self-reported confidence. Recorded because it gates
   * whether a draft is shown at all in production, via the account's
   * draftReplyConfidence threshold. If it does not track send-readiness, that
   * threshold is not protecting anyone.
   */
  confidence: string | null;
  assertionFailures: string[];
  criteriaFailures: string[];
  durationMs: number;
  judgeReasoning: string | null;
  actual: string | null;
  error: string | null;
  sourceRoot: string | null;
  /**
   * Hash of the files that shape a draft, so a stored record says which build
   * produced it.
   *
   * The cache already keys on this, which stops a stale verdict being served.
   * It does not make a record self-describing: two runs of the same model under
   * different prompts land in separate cache files whose contents are identical
   * in every field, so a before/after comparison cannot be told apart
   * afterwards. Since run history goes to a gitignored directory and the cache
   * outlives it, that meant the evidence for a prompt change disappeared as
   * soon as the run ended.
   */
  codeFingerprint: string | null;
};

export type EvalRun = {
  evalName: string;
  model: string;
  variantId: string;
  filters: EvalFilters;
  startedAt: string;
  finishedAt: string;
  selectedCaseCount: number;
  records: EvalResultRecord[];
  historyPath: string | null;
};

export function readEvalFiltersFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): EvalFilters {
  return {
    split: parseSplit(env.EVAL_SPLIT),
    tags: splitList(env.EVAL_TAGS),
    caseIds: splitList(env.EVAL_CASE_ID),
    shard: parseShard(env.EVAL_SHARD),
  };
}

export function selectEvalCases<TCase extends EvalCaseEnvelope>({
  cases,
  filters,
}: {
  cases: TCase[];
  filters: EvalFilters;
}): TCase[] {
  // Unreviewed synthetic cases are excluded by default: a large generated set
  // moves the measured number without moving the product, which is the failure
  // this harness exists to prevent. The opt-in exists so a freshly generated
  // set can be read provisionally before someone has reviewed it; every report
  // from such a run is labelled provisional.
  const includeUnreviewed = process.env.EVAL_INCLUDE_UNREVIEWED === "true";

  return cases.filter((evalCase) => {
    if (!includeUnreviewed && !isCountableCase(evalCase)) return false;
    if (filters.split !== "all" && evalCase.split !== filters.split)
      return false;
    if (filters.caseIds.length > 0 && !filters.caseIds.includes(evalCase.id))
      return false;
    if (
      filters.tags.length > 0 &&
      !filters.tags.some((tag) => evalCase.tags.includes(tag))
    )
      return false;
    if (filters.shard && !isInShard(evalCase.id, filters.shard)) return false;
    return true;
  });
}

/**
 * Deliberately not vitest-based. A thousand cases at k samples with bounded
 * concurrency, sharding, per-invocation timeouts, and aggregate reporting all
 * fight vitest's one-assertion-per-test model, and a suite that reports a rate
 * is not a suite that should go red on the first case.
 */
export async function runEvalSuite<
  TCase extends EvalCaseEnvelope & { __sourceRoot?: string },
  TOutput,
>({
  evalName,
  cases,
  invoke,
  assert,
  judge,
  describeOutput,
  confidenceOf,
  caseFingerprintOf,
  judgeFingerprint,
  model,
  variantId = defaultVariantId(),
  samples = defaultSamples(),
  concurrency = DEFAULT_CONCURRENCY,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  filters = readEvalFiltersFromEnv(),
  writeHistory = true,
  onRecord,
}: {
  evalName: string;
  cases: TCase[];
  invoke: (args: {
    evalCase: TCase;
    sampleIndex: number;
    signal: AbortSignal;
  }) => Promise<TOutput>;
  assert?: (args: { evalCase: TCase; output: TOutput }) => AssertionOutcome[];
  judge?: (args: {
    evalCase: TCase;
    output: TOutput;
    signal: AbortSignal;
  }) => Promise<EvalJudgeOutcome>;
  describeOutput?: (output: TOutput) => string;
  confidenceOf?: (output: TOutput) => string | null;
  /**
   * Enables the result cache. Both must be supplied: a cache keyed on the case
   * but not the judge would reuse a verdict from a judge that no longer exists.
   */
  caseFingerprintOf?: (evalCase: TCase) => string;
  judgeFingerprint?: string;
  model: string;
  variantId?: string;
  samples?: number;
  concurrency?: number;
  timeoutMs?: number;
  filters?: EvalFilters;
  writeHistory?: boolean;
  onRecord?: (record: EvalResultRecord) => void;
}): Promise<EvalRun> {
  const startedAt = new Date().toISOString();
  const selected = selectEvalCases({ cases, filters });

  const tasks = selected.flatMap((evalCase) =>
    Array.from({ length: evalCase.samples ?? samples }, (_, sampleIndex) => ({
      evalCase,
      sampleIndex,
    })),
  );

  const records = await mapWithConcurrency(tasks, concurrency, async (task) => {
    const record = await runOne({
      evalName,
      model,
      variantId,
      timeoutMs,
      invoke,
      assert,
      judge,
      describeOutput,
      confidenceOf,
      caseFingerprintOf,
      judgeFingerprint,
      ...task,
    });
    onRecord?.(record);
    return record;
  });

  const finishedAt = new Date().toISOString();
  const run: EvalRun = {
    evalName,
    model,
    variantId,
    filters,
    startedAt,
    finishedAt,
    selectedCaseCount: selected.length,
    records,
    historyPath: null,
  };

  if (writeHistory) run.historyPath = writeRunHistory(run);
  return run;
}

export function writeRunHistory(run: EvalRun): string {
  const dir = path.join(
    process.cwd(),
    ".context",
    "eval-results",
    run.evalName,
  );
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${run.startedAt.replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, `${JSON.stringify(run, null, 2)}\n`);
  return file;
}

async function runOne<
  TCase extends EvalCaseEnvelope & { __sourceRoot?: string },
  TOutput,
>({
  evalName,
  evalCase,
  sampleIndex,
  model,
  variantId,
  timeoutMs,
  invoke,
  assert,
  judge,
  describeOutput,
  confidenceOf,
  caseFingerprintOf,
  judgeFingerprint,
}: {
  evalName: string;
  evalCase: TCase;
  sampleIndex: number;
  model: string;
  variantId: string;
  timeoutMs: number;
  confidenceOf?: (output: TOutput) => string | null;
  caseFingerprintOf?: (evalCase: TCase) => string;
  judgeFingerprint?: string;
  invoke: (args: {
    evalCase: TCase;
    sampleIndex: number;
    signal: AbortSignal;
  }) => Promise<TOutput>;
  assert?: (args: { evalCase: TCase; output: TOutput }) => AssertionOutcome[];
  judge?: (args: {
    evalCase: TCase;
    output: TOutput;
    signal: AbortSignal;
  }) => Promise<EvalJudgeOutcome>;
  describeOutput?: (output: TOutput) => string;
}): Promise<EvalResultRecord> {
  const startedAt = Date.now();
  const base = {
    evalName,
    caseId: evalCase.id,
    suite: evalCase.suite,
    split: evalCase.split,
    tags: evalCase.tags,
    difficultyAxes: evalCase.difficultyAxes,
    difficulty: evalCase.difficulty,
    model,
    variantId,
    sampleIndex,
    sourceRoot: evalCase.__sourceRoot ?? null,
    // Safe to stamp the current fingerprint even on a rehydrated cache hit: the
    // fingerprint is part of the cache key, so a hit can only have been written
    // under this same one.
    codeFingerprint: getCodeFingerprint(),
  };

  const cacheKey =
    caseFingerprintOf && judgeFingerprint
      ? buildCacheKey({
          caseFingerprint: caseFingerprintOf(evalCase),
          judgeFingerprint,
          model,
          sampleIndex,
          variantId,
        })
      : null;

  if (cacheKey) {
    const cached = readCachedRecord(cacheKey);
    if (cached) return rehydrate(cached, base);
  }

  const signal = AbortSignal.timeout(timeoutMs);

  try {
    const output = await race(
      invoke({ evalCase, sampleIndex, signal }),
      signal,
    );

    const assertionFailures = (assert?.({ evalCase, output }) ?? [])
      .filter((outcome) => !outcome.pass)
      .map((outcome) => `${outcome.name}: ${outcome.detail}`);

    const verdict = judge
      ? await race(judge({ evalCase, output, signal }), signal)
      : null;
    const criteriaFailures = verdict?.criteriaFailures ?? [];

    const record: EvalResultRecord = {
      ...base,
      pass:
        assertionFailures.length === 0 &&
        criteriaFailures.length === 0 &&
        (verdict === null || verdict.sendReady),
      sendReady: verdict?.sendReady ?? null,
      usability: verdict?.usability ?? null,
      primaryIssue: verdict?.primaryIssue ?? null,
      severity: verdict?.severity ?? null,
      confidence: confidenceOf ? confidenceOf(output) : null,
      assertionFailures,
      criteriaFailures,
      durationMs: Date.now() - startedAt,
      judgeReasoning: verdict?.reasoning ?? null,
      actual: describeOutput ? describeOutput(output) : null,
      error: null,
    };

    if (cacheKey) writeCachedRecord(cacheKey, record);
    return record;
  } catch (error) {
    // A dropped case silently inflates the pass rate, so a timeout or a crash
    // is recorded as a failed sample rather than removed from the denominator.
    const timedOut = isTimeout(error, signal);
    return {
      ...base,
      pass: false,
      sendReady: null,
      usability: null,
      primaryIssue: null,
      severity: null,
      confidence: null,
      assertionFailures: [],
      criteriaFailures: [],
      durationMs: Date.now() - startedAt,
      judgeReasoning: null,
      actual: timedOut ? "timeout" : null,
      error: timedOut ? "timeout" : errorMessage(error),
    };
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  const runners = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    async () => {
      while (true) {
        const index = cursor++;
        const item = items[index];
        if (index >= items.length || item === undefined) return;
        results[index] = await worker(item);
      }
    },
  );

  await Promise.all(runners);
  return results;
}

function race<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return Promise.race([promise, abortRejection(signal)]);
}

function abortRejection(signal: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("eval_timeout"));
      return;
    }
    signal.addEventListener("abort", () => reject(new Error("eval_timeout")), {
      once: true,
    });
  });
}

function isTimeout(error: unknown, signal: AbortSignal): boolean {
  if (signal.aborted) return true;
  if (error instanceof Error) {
    return error.message === "eval_timeout" || error.name === "TimeoutError";
  }
  return false;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return "unknown_error";
}

function defaultSamples(): number {
  const raw = Number(process.env.EVAL_SAMPLES);
  return Number.isInteger(raw) && raw > 0 ? raw : 1;
}

/**
 * Names the arm a run belongs to. Part of the cache key, so two arms never
 * share a cached verdict, and stored on every record so a finished experiment
 * can still be told apart from the run it was compared against.
 */
function defaultVariantId(): string {
  return process.env.EVAL_VARIANT_ID?.trim() || "baseline";
}

function parseSplit(value: string | undefined): EvalSplit | "all" {
  const split = value?.trim() || "dev";
  if (split === "dev" || split === "test" || split === "all") return split;
  throw new Error(`EVAL_SPLIT must be dev, test, or all (got "${split}")`);
}

function splitList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseShard(
  value: string | undefined,
): { index: number; total: number } | null {
  const raw = value?.trim();
  if (!raw) return null;

  const match = raw.match(/^(\d+)\/(\d+)$/);
  const index = Number(match?.[1]);
  const total = Number(match?.[2]);
  if (!match || total < 1 || index < 1 || index > total) {
    throw new Error(`EVAL_SHARD must look like 2/4 (got "${raw}")`);
  }
  return { index, total };
}

/**
 * Hash the id rather than using position: shard membership then stays stable as
 * cases are added or removed, and the split is balanced without needing the
 * case list to be sorted the same way on every machine.
 */
function isInShard(
  id: string,
  shard: { index: number; total: number },
): boolean {
  const digest = createHash("sha256").update(id).digest();
  return digest.readUInt32BE(0) % shard.total === shard.index - 1;
}
