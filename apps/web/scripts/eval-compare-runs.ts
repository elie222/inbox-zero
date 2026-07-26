/**
 * Paired comparison of two eval runs over the same cases.
 *
 * This is the thing the harness exists for: change one variable — the model,
 * a prompt, a retrieval strategy — rerun, and get a verdict that accounts for
 * multiple testing and for the fact that a case is either easy or hard for
 * both arms.
 *
 * Pairing on caseId matters. Comparing two headline rates ignores that the
 * same cases appear in both, which is most of the shared variance; the paired
 * test only looks at cases where the two arms disagreed, so it needs far fewer
 * cases to reach the same confidence.
 *
 *   pnpm -F inbox-zero-ai eval:compare baseline.json variant.json
 *   pnpm -F inbox-zero-ai eval:compare            # two most recent runs
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import type {
  EvalResultRecord,
  EvalRun,
} from "@/__tests__/eval/harness/run-suite";
import {
  summarizeComparison,
  type PairedCase,
} from "@/__tests__/eval/harness/stats";

const RUN_DIR = path.join(
  process.cwd(),
  ".context",
  "eval-results",
  "draft-reply",
);

main();

function main() {
  const [baselinePath, variantPath] = resolveRuns();
  if (!(baselinePath && variantPath)) {
    console.error(`Need two runs. Found fewer in ${RUN_DIR}.`);
    process.exit(1);
  }

  const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as EvalRun;
  const variant = JSON.parse(readFileSync(variantPath, "utf8")) as EvalRun;

  const pairs = pairByCase(baseline.records, variant.records);
  if (pairs.length === 0) {
    console.error(
      "No shared case ids. The two runs did not cover the same cases, so they cannot be paired.",
    );
    process.exit(1);
  }

  const summary = summarizeComparison({ pairs });
  const dropped =
    countCases(baseline.records) +
    countCases(variant.records) -
    2 * pairs.length;

  console.log("# Paired comparison\n");
  console.log(`baseline  ${label(baseline)}  ${path.basename(baselinePath)}`);
  console.log(`variant   ${label(variant)}  ${path.basename(variantPath)}`);
  console.log(
    `\n${pairs.length} paired cases${dropped > 0 ? `, ${dropped} unpaired and excluded from both arms` : ""}\n`,
  );

  console.log(`baseline send-ready   ${pct(summary.baselineRate)}`);
  console.log(`variant  send-ready   ${pct(summary.variantRate)}`);
  console.log(
    `delta                 ${signed(summary.delta)} [${signed(summary.lower)}, ${signed(summary.upper)}]`,
  );
  console.log(
    `\nMcNemar   variant fixed ${summary.mcnemar.variantOnly} · variant broke ${summary.mcnemar.baselineOnly} · exact p ${summary.mcnemar.pValue.toFixed(4)}`,
  );
  console.log(`Wilcoxon  p ${summary.wilcoxon.pValue.toFixed(4)}`);
  console.log(`\nVERDICT   ${summary.verdict}`);

  if (summary.verdict === "NO_EFFECT_DETECTED") {
    console.log(
      `          At this n the smallest effect detectable is about ${summary.mde === null ? "unknown" : signed(summary.mde)}.`,
    );
    console.log(
      "          That is a ceiling on what this comparison could have seen, not proof of no difference.",
    );
  }

  const shifts = modeShifts(pairs, baseline.records, variant.records);
  if (shifts.length > 0) {
    console.log("\n## Failure-mode shift\n");
    console.log("| primaryIssue | baseline | variant | delta |");
    console.log("|---|---:|---:|---:|");
    for (const shift of shifts) {
      console.log(
        `| ${shift.mode} | ${shift.baseline} | ${shift.variant} | ${shift.variant - shift.baseline >= 0 ? "+" : ""}${shift.variant - shift.baseline} |`,
      );
    }
  }
}

/**
 * Majority vote per case per arm. A case the two runs do not share is dropped
 * from both rather than counted on one side, since an unpaired case carries no
 * information about the difference.
 */
function pairByCase(
  baselineRecords: EvalResultRecord[],
  variantRecords: EvalResultRecord[],
): PairedCase[] {
  const baseline = groupByCase(baselineRecords);
  const variant = groupByCase(variantRecords);

  const pairs: PairedCase[] = [];
  for (const [caseId, baselineOutcomes] of baseline) {
    const variantOutcomes = variant.get(caseId);
    if (!variantOutcomes) continue;
    pairs.push({
      caseId,
      baseline: baselineOutcomes,
      variant: variantOutcomes,
    });
  }
  return pairs;
}

function groupByCase(records: EvalResultRecord[]): Map<string, boolean[]> {
  const byCase = new Map<string, boolean[]>();
  for (const record of records) {
    const outcomes = byCase.get(record.caseId) ?? [];
    outcomes.push(record.sendReady === true);
    byCase.set(record.caseId, outcomes);
  }
  return byCase;
}

function modeShifts(
  pairs: PairedCase[],
  baselineRecords: EvalResultRecord[],
  variantRecords: EvalResultRecord[],
): { mode: string; baseline: number; variant: number }[] {
  const shared = new Set(pairs.map((pair) => pair.caseId));
  const count = (records: EvalResultRecord[]) => {
    const counts = new Map<string, number>();
    for (const record of records) {
      if (!shared.has(record.caseId)) continue;
      if (record.sendReady !== false) continue;
      const mode = record.primaryIssue ?? "UNCLASSIFIED";
      counts.set(mode, (counts.get(mode) ?? 0) + 1);
    }
    return counts;
  };

  const baseline = count(baselineRecords);
  const variant = count(variantRecords);
  const modes = new Set([...baseline.keys(), ...variant.keys()]);

  return [...modes]
    .map((mode) => ({
      mode,
      baseline: baseline.get(mode) ?? 0,
      variant: variant.get(mode) ?? 0,
    }))
    .sort(
      (a, b) =>
        Math.abs(b.variant - b.baseline) - Math.abs(a.variant - a.baseline),
    );
}

function resolveRuns(): [string | undefined, string | undefined] {
  const fromArgs = process.argv.slice(2).filter((arg) => arg.endsWith(".json"));
  if (fromArgs.length >= 2) return [fromArgs[0], fromArgs[1]];

  const files = readdirSync(RUN_DIR)
    .filter((name) => name.endsWith(".json"))
    .map((name) => path.join(RUN_DIR, name))
    .sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs);

  return [files.at(-2), files.at(-1)];
}

function countCases(records: EvalResultRecord[]): number {
  return new Set(records.map((record) => record.caseId)).size;
}

function label(run: EvalRun): string {
  return `${run.model} (${run.variantId})`.padEnd(34);
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function signed(value: number): string {
  if (!Number.isFinite(value)) return "n/a";
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}pp`;
}
