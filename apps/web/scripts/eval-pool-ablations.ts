/**
 * Pools several ablation runs over the same cases into one better-powered
 * result.
 *
 * Two independent k=1 runs are two samples of the same case, so concatenating
 * their per-case outcomes is arithmetically the same as one k=2 run. That
 * matters because most arms in a single run are underpowered, and re-running
 * costs nothing but time we have already spent.
 *
 * It also makes disagreement visible. An arm whose sign flips between runs is
 * measuring noise no matter how clean its individual p-values looked, and the
 * per-run column is there so that shows up rather than being averaged away.
 *
 *   pnpm -F inbox-zero-ai eval:pool-ablations              # every full run
 *   pnpm -F inbox-zero-ai eval:pool-ablations a.json b.json
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  summarizeComparison,
  type PairedCase,
} from "@/__tests__/eval/harness/stats";

type ArmPair = { caseId: string; baseline: boolean[]; variant: boolean[] };
type AblationFile = {
  samples: number;
  model: string;
  /** Absent on runs written before cache reporting existed. */
  cacheMode?: string;
  filters?: { split?: string; shard?: { index: number; total: number } | null };
  arms: { source: string; eligibleCaseCount: number; pairs: ArmPair[] }[];
};

const RUN_DIR = path.join(process.cwd(), ".context", "eval-ablation");
/** A shard or smoke run has few arms and would skew a pool. */
const MIN_ARMS_FOR_FULL_RUN = 5;

main();

function main() {
  const files = resolveFiles();
  if (files.length < 2) {
    console.error(
      `Need at least two full ablation runs to pool. Found ${files.length} in ${RUN_DIR}.`,
    );
    process.exit(1);
  }

  const runs = files.map(
    (file) => JSON.parse(readFileSync(file, "utf8")) as AblationFile,
  );

  const refusal = poolingRefusal(runs, files);
  if (refusal) {
    console.error(refusal);
    process.exit(1);
  }

  const totalSamples = runs.reduce((sum, run) => sum + run.samples, 0);

  console.log(
    `# Pooled ablation — ${runs.length} runs, effective k=${totalSamples}\n`,
  );
  for (const [index, file] of files.entries()) {
    console.log(
      `- run ${letter(index)}: ${path.basename(file)} (k=${runs[index]?.samples})`,
    );
  }
  console.log("");

  const pooled = poolBySource(runs);
  const perRun = perRunDeltas(runs);

  const entries = [...pooled.entries()];

  // The verdict depends on the Holm-adjusted p, and Holm needs the whole family
  // of arms, so the raw McNemar p-values are collected in a first pass. Judging
  // each arm against a family of one would report IMPROVED or REGRESSED for
  // arms that do not survive correction.
  const rawPValues = entries.map(
    ([, pairs]) => summarizeComparison({ pairs }).mcnemar.pValue,
  );

  const rows = entries
    .map(([source, pairs], index) => ({
      source,
      pairs,
      summary: summarizeComparison({
        pairs,
        otherPValuesInFamily: rawPValues.filter((_, other) => other !== index),
      }),
    }))
    .sort((a, b) => Math.abs(b.summary.delta) - Math.abs(a.summary.delta));

  console.log(
    "| source | n | pooled delta (95% CI) | exact p | Holm p | per-run deltas | verdict |",
  );
  console.log("|---|---:|---|---:|---:|---|---|");
  for (const row of rows) {
    const deltas = (perRun.get(row.source) ?? [])
      .map((delta) => (delta === null ? "n/a" : formatDelta(delta)))
      .join(" / ");
    const flipped = signFlipped(perRun.get(row.source) ?? []);
    console.log(
      `| \`${row.source}\` | ${row.pairs.length} | ${formatDelta(row.summary.delta)} [${formatDelta(row.summary.lower)}, ${formatDelta(row.summary.upper)}] | ${row.summary.mcnemar.pValue.toFixed(3)} | ${row.summary.adjustedPValue.toFixed(3)} | ${deltas}${flipped ? " **flips**" : ""} | ${flipped ? "NOISE — sign not stable across runs" : row.summary.verdict} |`,
    );
  }

  console.log(
    "\nAn arm whose per-run deltas disagree in sign is reported as noise regardless of its pooled p-value: pooling raises power, it does not rescue an unstable measurement.",
  );
}

/**
 * Pooling treats each run as an independent sample of every case. Two things
 * break that, and both make the interval narrower rather than wider, so the
 * result looks better instead of obviously wrong.
 *
 * A run that replayed cached verdicts is the earlier run's numbers again: the
 * cache key covers the case, model, code, judge, and sample index, so a hit
 * returns an identical record. Pooling it doubles k and adds nothing.
 *
 * Runs over different models, splits, or shards are not measuring the same
 * thing at all, and their per-case sets may not even overlap.
 */
function poolingRefusal(runs: AblationFile[], files: string[]): string | null {
  const cached = runs
    .map((run, index) => ({ run, file: files[index] }))
    .filter(({ run }) => run.cacheMode && run.cacheMode !== "off");
  if (cached.length > 0) {
    return [
      "Refusing to pool: these runs replayed cached verdicts, so they are the",
      "same numbers more than once. Pooling would narrow the interval without",
      "adding information.",
      "",
      ...cached.map(
        ({ run, file }) =>
          `  ${path.basename(file ?? "?")} — EVAL_CACHE=${run.cacheMode}`,
      ),
      "",
      "Re-run with EVAL_CACHE=refresh or EVAL_CACHE=off to get fresh samples.",
    ].join("\n");
  }

  const models = new Set(runs.map((run) => run.model));
  if (models.size > 1) {
    return `Refusing to pool runs from different models: ${[...models].join(", ")}. They are not samples of the same measurement.`;
  }

  const scopes = new Set(
    runs.map((run) =>
      JSON.stringify([
        run.filters?.split ?? "unknown",
        run.filters?.shard
          ? `${run.filters.shard.index}/${run.filters.shard.total}`
          : "full",
      ]),
    ),
  );
  if (scopes.size > 1) {
    return `Refusing to pool runs over different case scopes: ${[...scopes].join(" vs ")}. They do not cover the same cases.`;
  }

  return null;
}

function poolBySource(runs: AblationFile[]): Map<string, PairedCase[]> {
  const byCase = new Map<string, Map<string, PairedCase>>();

  for (const run of runs) {
    for (const arm of run.arms) {
      const cases = byCase.get(arm.source) ?? new Map<string, PairedCase>();
      for (const pair of arm.pairs) {
        const existing = cases.get(pair.caseId) ?? {
          caseId: pair.caseId,
          baseline: [],
          variant: [],
        };
        existing.baseline.push(...pair.baseline);
        existing.variant.push(...pair.variant);
        cases.set(pair.caseId, existing);
      }
      byCase.set(arm.source, cases);
    }
  }

  return new Map(
    [...byCase.entries()].map(([source, cases]) => [
      source,
      [...cases.values()],
    ]),
  );
}

/**
 * One entry per run, in run order, so the column lines up with the run list
 * printed above the table. An arm missing from a run gets null on both sides of
 * where it does appear, including the runs before it was first seen.
 */
function perRunDeltas(runs: AblationFile[]): Map<string, (number | null)[]> {
  const deltas = new Map<string, (number | null)[]>();
  for (const [index, run] of runs.entries()) {
    for (const arm of run.arms) {
      const list: (number | null)[] =
        deltas.get(arm.source) ?? Array.from({ length: index }, () => null);
      list.push(rateOf(arm.pairs, "variant") - rateOf(arm.pairs, "baseline"));
      deltas.set(arm.source, list);
    }
    for (const list of deltas.values()) {
      if (list.length <= index) list.push(null);
    }
  }
  return deltas;
}

function rateOf(pairs: ArmPair[], arm: "baseline" | "variant"): number {
  const rates = pairs.map((pair) => {
    const samples = pair[arm];
    if (samples.length === 0) return 0;
    return samples.filter(Boolean).length / samples.length;
  });
  if (rates.length === 0) return Number.NaN;
  return rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
}

function signFlipped(deltas: (number | null)[]): boolean {
  const present = deltas.filter((delta): delta is number => delta !== null);
  if (present.length < 2) return false;
  const positive = present.some((delta) => delta > 0.001);
  const negative = present.some((delta) => delta < -0.001);
  return positive && negative;
}

function resolveFiles(): string[] {
  const fromArgs = process.argv.slice(2).filter((arg) => arg.endsWith(".json"));
  if (fromArgs.length > 0) return fromArgs;
  if (!existsSync(RUN_DIR)) return [];

  return readdirSync(RUN_DIR)
    .filter((name) => name.endsWith(".json"))
    .map((name) => path.join(RUN_DIR, name))
    .filter((file) => {
      const parsed = JSON.parse(readFileSync(file, "utf8")) as AblationFile;
      return (parsed.arms?.length ?? 0) >= MIN_ARMS_FOR_FULL_RUN;
    })
    .sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs);
}

function formatDelta(value: number): string {
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}pp`;
}

function letter(index: number): string {
  return String.fromCharCode(65 + index);
}
