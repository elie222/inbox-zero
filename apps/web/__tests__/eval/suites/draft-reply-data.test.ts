import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  describeEvalMatrix,
  shouldRunEvalTests,
} from "@/__tests__/eval/models";
import { runDraftReplyEval } from "@/__tests__/eval/harness/draft-reply-run";
import { draftReplyCaseSchema } from "@/__tests__/eval/harness/draft-reply-schema";
import {
  formatLoadIssues,
  getEvalDataDirs,
  loadEvalCases,
} from "@/__tests__/eval/harness/load-cases";
import {
  buildEvalReport,
  printEvalReport,
} from "@/__tests__/eval/harness/report";
import {
  checkSplitLock,
  formatSplitLockViolation,
  loadSplitLock,
  SPLIT_LOCK_FILENAME,
  type SplitLock,
} from "@/__tests__/eval/harness/split-lock";

// EVAL_DATA_DIRS=/path/to/inbox-zero-evals/datasets pnpm test-ai eval/suites/draft-reply-data

const SUITE = "draft-reply";
const TIMEOUT_MS = 15 * 60 * 1000;

const roots = getEvalDataDirs();
const shouldRun = shouldRunEvalTests() && roots.length > 0;

if (roots.length === 0) {
  console.info(
    `[${SUITE}] skipped: no dataset roots. Set EVAL_DATA_DIRS to colon-separated dataset directories, each containing a "${SUITE}/" folder of .jsonl cases. The case data is not part of this repository.`,
  );
}

describe.runIf(shouldRun)("draft-reply data suite", () => {
  const loaded = loadEvalCases({
    suite: SUITE,
    schema: draftReplyCaseSchema,
    roots,
  });

  it("loads every case cleanly", () => {
    expect(formatLoadIssues(loaded.issues)).toBe("");
    expect(loaded.cases.length).toBeGreaterThan(0);
  });

  it("has not edited a held-out test case since it was locked", () => {
    const lock = mergeSplitLocks(roots);
    const heldOut = loaded.cases.filter(
      (evalCase) => evalCase.split === "test",
    );

    // Without a lock there is nothing stopping a held-out case being softened
    // until it passes, which is the whole point of holding it out. Warning and
    // returning left the run green with the guarantee silently absent, so an
    // unlocked dataset that has held-out cases fails instead.
    if (Object.keys(lock).length === 0) {
      expect(
        heldOut.length === 0
          ? ""
          : `${heldOut.length} held-out cases but no ${SPLIT_LOCK_FILENAME} in any dataset root (${roots.join(", ")}). Run the dataset lock script.`,
      ).toBe("");
      return;
    }

    const { violations } = checkSplitLock({
      suite: SUITE,
      cases: loaded.cases,
      lock,
    });
    expect(violations.map(formatSplitLockViolation).join("\n")).toBe("");
  });

  describeEvalMatrix("draft-reply send-ready", (model, emailAccount) => {
    it(
      "reports the send-ready rate of the real drafting function",
      async () => {
        const run = await runDraftReplyEval({
          evalName: SUITE,
          model: model.label,
          cases: loaded.cases,
          emailAccount,
        });

        printEvalReport(buildEvalReport({ run }));

        // This suite reports a rate rather than passing or failing on it: a
        // threshold here would just be a second, worse version of the ceiling
        // and floor warnings. A run where nothing was graded is a broken
        // harness, and that does fail.
        expect(run.records.length).toBeGreaterThan(0);
        expect(
          run.records.filter((record) => record.sendReady !== null).length,
          "no sample produced a judge verdict",
        ).toBeGreaterThan(0);
      },
      TIMEOUT_MS,
    );
  });
});

/** Later roots override earlier ones, matching how cases themselves overlay. */
function mergeSplitLocks(dataRoots: string[]): SplitLock {
  const merged: SplitLock = {};
  for (const root of dataRoots) {
    Object.assign(merged, loadSplitLock(path.join(root, SPLIT_LOCK_FILENAME)));
  }
  return merged;
}
