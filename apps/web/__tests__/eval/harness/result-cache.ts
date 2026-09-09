/**
 * Caches one graded sample so an unchanged run costs nothing.
 *
 * A cached verdict is only reusable if nothing that could have changed the
 * output has changed. Five things can:
 *
 *   the case      — its input, context, assertions, and ground truth
 *   the model     — plus which sample index this is, so k>1 stays distinct
 *   the code      — the drafter, its prompt, and the adapter that calls it
 *   the judge     — its prompt and its model, since the verdict is its opinion
 *   the runtime   — settings such as the public base URL and timezone
 *
 * All five go into the key. Miss any of them and the cache serves a stale
 * verdict that looks exactly like a fresh one, which is worse than no cache:
 * an eval that silently reports yesterday's answer cannot be trusted at all.
 *
 * The code fingerprint hashes a declared list of files rather than the git
 * diff. Hashing the working tree meant an unrelated edit anywhere invalidated
 * an expensive run; hashing the files that actually feed the draft means only
 * a real change does.
 */

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import type { EvalResultRecord } from "@/__tests__/eval/harness/run-suite";

export type CacheMode = "readwrite" | "readonly" | "refresh" | "off";

/**
 * Files whose contents change what a draft looks like or how it is graded.
 * Relative to apps/web. Adding a file here invalidates the whole cache once,
 * which is correct: it means something that shapes the output was not being
 * tracked before.
 */
const FINGERPRINTED_FILES = [
  "utils/ai/reply/draft-reply.ts",
  "__tests__/eval/harness/draft-reply-adapter.ts",
  "__tests__/eval/harness/draft-reply-run.ts",
  "__tests__/eval/harness/send-ready-judge-contract.ts",
  "__tests__/eval/harness/criteria-judge.ts",
  "__tests__/eval/harness/assertions.ts",
];

/** Fields of a record that describe the run rather than its outcome. */
const RUN_SCOPED_FIELDS = [
  "durationMs",
  "sampleIndex",
  "model",
  "evalName",
  "variantId",
  "codeFingerprint",
  "caseFingerprint",
  "judgeFingerprint",
  "environmentFingerprint",
];

export function getCacheMode(): CacheMode {
  const raw = process.env.EVAL_CACHE?.toLowerCase();
  if (raw === "readwrite" || raw === "readonly" || raw === "refresh")
    return raw;
  return "off";
}

export function getCacheDir(): string {
  return (
    process.env.EVAL_CACHE_DIR ??
    path.join(process.cwd(), ".context", "eval-cache")
  );
}

/**
 * Hashes the files that shape a draft. Computed once per process: reading six
 * files per sample would dominate the runtime of a cache hit.
 */
let codeFingerprintCache: string | null = null;

export function getCodeFingerprint(): string {
  if (codeFingerprintCache) return codeFingerprintCache;

  const hash = createHash("sha256");
  for (const file of FINGERPRINTED_FILES) {
    const full = path.join(process.cwd(), file);
    hash.update(file);
    hash.update(existsSync(full) ? readFileSync(full) : "missing");
  }
  codeFingerprintCache = hash.digest("hex").slice(0, 16);
  return codeFingerprintCache;
}

export function buildCacheKey({
  caseFingerprint,
  judgeFingerprint,
  environmentFingerprint,
  model,
  sampleIndex,
  variantId,
}: {
  caseFingerprint: string;
  judgeFingerprint: string;
  environmentFingerprint: string;
  model: string;
  sampleIndex: number;
  variantId: string;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        caseFingerprint,
        judgeFingerprint,
        environmentFingerprint,
        getCodeFingerprint(),
        model,
        variantId,
        sampleIndex,
      ]),
    )
    .digest("hex");
}

export function readCachedRecord(key: string): EvalResultRecord | null {
  const mode = getCacheMode();
  if (mode === "off" || mode === "refresh") return null;

  const file = cacheFile(key);
  if (!existsSync(file)) return null;

  try {
    return JSON.parse(readFileSync(file, "utf8")) as EvalResultRecord;
  } catch {
    // A truncated write from an interrupted run should re-run, not crash.
    return null;
  }
}

export function writeCachedRecord(key: string, record: EvalResultRecord): void {
  const mode = getCacheMode();
  if (mode === "off" || mode === "readonly") return;
  // An errored sample says more about the provider than about the draft, and
  // caching it would make a transient outage permanent.
  if (record.error !== null) return;

  const file = cacheFile(key);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(record)}\n`);
}

/**
 * A cached record was written under a different sample index or run name, so
 * the run-scoped fields are replaced with the current ones and only the graded
 * outcome is reused.
 */
export function rehydrate(
  cached: EvalResultRecord,
  base: Pick<
    EvalResultRecord,
    | "evalName"
    | "model"
    | "sampleIndex"
    | "variantId"
    | "codeFingerprint"
    | "caseFingerprint"
    | "judgeFingerprint"
    | "environmentFingerprint"
  >,
): EvalResultRecord {
  return { ...cached, ...base, durationMs: 0 };
}

export function countCachedRecords(): number {
  const dir = getCacheDir();
  if (!existsSync(dir)) return 0;
  let total = 0;
  for (const shard of readdirSync(dir)) {
    const shardPath = path.join(dir, shard);
    try {
      total += readdirSync(shardPath).length;
    } catch {
      // Not a directory; ignore.
    }
  }
  return total;
}

function cacheFile(key: string): string {
  // Sharded because a full run at k=3 across several models puts tens of
  // thousands of files in one directory otherwise.
  return path.join(getCacheDir(), key.slice(0, 2), `${key}.json`);
}

export { RUN_SCOPED_FIELDS };
