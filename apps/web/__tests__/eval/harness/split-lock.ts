import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import {
  evalSplitSchema,
  type EvalSplit,
} from "@/__tests__/eval/harness/case-schema";

/** The lock travels with the case data, not with this repo. */
export const SPLIT_LOCK_FILENAME = "splits.lock.json";

const splitLockSchema = z.record(
  z.string(),
  z.object({ split: evalSplitSchema, contentHash: z.string() }),
);

export type SplitLock = z.infer<typeof splitLockSchema>;

export type SplitLockViolation =
  | {
      kind: "split_mismatch";
      key: string;
      locked: EvalSplit;
      actual: EvalSplit;
    }
  | { kind: "content_changed"; key: string; locked: string; actual: string };

export type HashableCase = {
  id: string;
  split: EvalSplit;
  input: unknown;
  assertions: unknown;
  judgeCriteria: unknown;
  expectedGroundTruth: unknown;
};

export function splitLockKey({
  suite,
  id,
}: {
  suite: string;
  id: string;
}): string {
  return `${suite}/${id}`;
}

/**
 * Covers everything a model sees or is graded on. Deliberately excludes tags,
 * notes, difficulty, and provenance so metadata can be corrected without
 * tripping the lock.
 */
export function contentHashForCase(evalCase: HashableCase): string {
  const canonical = stableStringify({
    input: evalCase.input,
    assertions: evalCase.assertions,
    judgeCriteria: evalCase.judgeCriteria,
    expectedGroundTruth: evalCase.expectedGroundTruth,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export function loadSplitLock(lockPath: string): SplitLock {
  if (!existsSync(lockPath)) return {};
  return splitLockSchema.parse(JSON.parse(readFileSync(lockPath, "utf8")));
}

export function writeSplitLock(lock: SplitLock, lockPath: string) {
  const sorted = Object.fromEntries(
    Object.entries(lock).sort(([a], [b]) => a.localeCompare(b)),
  );
  writeFileSync(lockPath, `${JSON.stringify(sorted, null, 2)}\n`);
}

export function buildSplitLock({
  suite,
  cases,
  existing = {},
}: {
  suite: string;
  cases: HashableCase[];
  existing?: SplitLock;
}): SplitLock {
  const next: SplitLock = { ...existing };
  for (const evalCase of cases) {
    next[splitLockKey({ suite, id: evalCase.id })] = {
      split: evalCase.split,
      contentHash: contentHashForCase(evalCase),
    };
  }
  return next;
}

/**
 * The anti-overfitting mechanism. Moving a case between splits, or editing a
 * test-split case after seeing how the model did on it, is how a held-out set
 * quietly becomes a training set. Dev-split content is free to change.
 */
export function checkSplitLock({
  suite,
  cases,
  lock,
}: {
  suite: string;
  cases: HashableCase[];
  lock: SplitLock;
}): { violations: SplitLockViolation[]; unlocked: string[] } {
  const violations: SplitLockViolation[] = [];
  const unlocked: string[] = [];

  for (const evalCase of cases) {
    const key = splitLockKey({ suite, id: evalCase.id });
    const locked = lock[key];

    if (!locked) {
      unlocked.push(key);
      continue;
    }

    if (locked.split !== evalCase.split) {
      violations.push({
        kind: "split_mismatch",
        key,
        locked: locked.split,
        actual: evalCase.split,
      });
      continue;
    }

    if (locked.split !== "test") continue;

    const actual = contentHashForCase(evalCase);
    if (locked.contentHash !== actual) {
      violations.push({
        kind: "content_changed",
        key,
        locked: locked.contentHash,
        actual,
      });
    }
  }

  return { violations, unlocked };
}

export function formatSplitLockViolation(
  violation: SplitLockViolation,
): string {
  if (violation.kind === "split_mismatch") {
    return `${violation.key}: split is "${violation.actual}" but splits.lock.json says "${violation.locked}". Move it back, or regenerate the lock deliberately.`;
  }
  return `${violation.key}: held-out test case content changed (${violation.locked.slice(0, 12)} -> ${violation.actual.slice(0, 12)}). Editing a test case after seeing results turns the held-out set into a training set.`;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !key.startsWith("__"))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`);
  return `{${entries.join(",")}}`;
}
