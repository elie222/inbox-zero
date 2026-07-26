/**
 * Context-source ablation for the draft-reply suite.
 *
 * Each arm nulls exactly one key of `input.context` and re-runs the real
 * drafting function, so an arm answers "what does this retrieval source buy us"
 * without a line of product code changing.
 *
 * Two design points carry most of the validity:
 *
 * 1. An arm runs only on the cases where its source is actually populated.
 *    Ablating a source on a case that never had one is a no-op that costs money
 *    and dilutes the effect toward zero, which is how ablation tables end up
 *    full of meaningless p-values.
 * 2. The baseline runs ONCE over the union of eligible cases and every arm is
 *    compared against that same baseline outcome. Re-running the baseline per
 *    arm would both double the spend and break the pairing McNemar depends on.
 *
 * Usage:
 *   EVAL_DATA_DIRS=/path/to/evals/datasets EVAL_INCLUDE_UNREVIEWED=true \
 *   EVAL_SPLIT=all EVAL_SAMPLES=3 EVAL_MODELS=gpt-5.6-luna-azure \
 *   pnpm --filter inbox-zero-ai eval:ablate
 *
 * Add NEXT_PUBLIC_LOG_SCOPES=<unused-scope> to silence product logging; a full
 * run makes thousands of model calls and each one logs.
 */

import "@/__tests__/test-env";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  DRAFT_REPLY_CONTEXT_SOURCES,
  draftReplyCaseSchema,
  type DraftReplyCase,
  type DraftReplyContextSource,
} from "@/__tests__/eval/harness/draft-reply-schema";
import { runDraftReplyEval } from "@/__tests__/eval/harness/draft-reply-run";
import {
  formatLoadIssues,
  getEvalDataDirs,
  loadEvalCases,
  type LoadedCase,
} from "@/__tests__/eval/harness/load-cases";
import { PROVISIONAL_NOTE } from "@/__tests__/eval/harness/report";
import {
  readEvalFiltersFromEnv,
  selectEvalCases,
  DEFAULT_CONCURRENCY,
  type EvalResultRecord,
  type EvalRun,
} from "@/__tests__/eval/harness/run-suite";
import {
  bootstrapPassRate,
  pairedMde,
  summarizeComparison,
  type ComparisonSummary,
  type PairedCase,
} from "@/__tests__/eval/harness/stats";
import { getEvalJudgeUserAi } from "@/__tests__/eval/judge-provider";
import { getCacheMode } from "@/__tests__/eval/harness/result-cache";
import {
  getEmailAccountForModel,
  getEvalModels,
} from "@/__tests__/eval/model-catalog";
import type { EmailAccountWithAI } from "@/utils/llms/types";

const SUITE = "draft-reply";
const EVAL_NAME = "draft-reply-ablation";

/**
 * Below this an arm cannot say anything: McNemar on a handful of discordant
 * pairs has no power, and the arm still costs a full pass over the judge. The
 * skipped sources are reported so the reader sees the coverage gap instead of
 * silently getting a shorter table.
 */
const MIN_ELIGIBLE_CASES = 5;

type ArmOutcome = {
  source: DraftReplyContextSource;
  eligibleCaseCount: number;
  pairs: PairedCase[];
  summary: ComparisonSummary;
  mde: number | null;
  histogram: HistogramRow[];
};

type HistogramRow = {
  mode: string;
  baselineCount: number;
  ablatedCount: number;
  baselineShareOfSamples: number;
  ablatedShareOfSamples: number;
  baselineShareOfFailures: number;
  ablatedShareOfFailures: number;
};

async function main() {
  const roots = getEvalDataDirs();
  if (roots.length === 0) {
    throw new Error(
      "EVAL_DATA_DIRS is not set. Point it at the dataset roots; case data is not in this repo.",
    );
  }

  const models = getEvalModels();
  const model = models[0];
  if (!model || models.length > 1) {
    throw new Error(
      `EVAL_MODELS must resolve to exactly one known model, got ${models.length}. Ablation compares arms of one model against each other, so "all" or a list would silently run only the first.`,
    );
  }
  const emailAccount = getEmailAccountForModel(model);

  const loaded = loadEvalCases({
    suite: SUITE,
    schema: draftReplyCaseSchema,
    roots,
  });
  if (loaded.issues.length > 0) {
    throw new Error(`case load failed:\n${formatLoadIssues(loaded.issues)}`);
  }

  const filters = readEvalFiltersFromEnv();
  const selected = selectEvalCases({ cases: loaded.cases, filters });
  if (selected.length === 0) {
    throw new Error(
      "no cases selected. Generated cases carry reviewedBy: null, so EVAL_INCLUDE_UNREVIEWED=true is required to read them.",
    );
  }

  const eligibility = DRAFT_REPLY_CONTEXT_SOURCES.map((source) => ({
    source,
    cases: selected.filter(
      (evalCase) => evalCase.input.context[source] != null,
    ),
  }));
  const arms = eligibility.filter(
    (entry) => entry.cases.length >= MIN_ELIGIBLE_CASES,
  );
  if (arms.length === 0) {
    throw new Error(
      `no context source is populated on at least ${MIN_ELIGIBLE_CASES} selected cases`,
    );
  }

  const unionCases = selected.filter((evalCase) =>
    arms.some((arm) => evalCase.input.context[arm.source] != null),
  );

  const samples = parsePositiveInt(process.env.EVAL_SAMPLES) ?? 1;
  const concurrency =
    parsePositiveInt(process.env.EVAL_CONCURRENCY) ?? DEFAULT_CONCURRENCY;
  const startedAt = new Date().toISOString();

  console.log(
    [
      `model ${model.label} (${model.provider}:${model.model})`,
      `split ${filters.split} · ${selected.length} cases selected · ${unionCases.length} eligible for at least one arm`,
      `${arms.length} arms · k=${samples} · concurrency ${concurrency}`,
      `${(unionCases.length + arms.reduce((total, arm) => total + arm.cases.length, 0)) * samples} drafting calls, each with 2 judge calls`,
      "",
    ].join("\n"),
  );

  const baselineRun = await runArm({
    label: "baseline",
    cases: unionCases,
    emailAccount,
    model: model.label,
    variantId: "baseline",
    samples,
    concurrency,
  });

  const armRuns: { source: DraftReplyContextSource; run: EvalRun }[] = [];
  for (const arm of arms) {
    const run = await runArm({
      label: `ablate ${arm.source}`,
      cases: arm.cases.map((evalCase) => ablate(evalCase, arm.source)),
      emailAccount,
      model: model.label,
      variantId: `ablate:${arm.source}`,
      samples,
      concurrency,
    });
    armRuns.push({ source: arm.source, run });
  }

  const outcomes = summarizeArms({ baselineRun, armRuns, samples });
  const skipped = eligibility
    .filter((entry) => entry.cases.length < MIN_ELIGIBLE_CASES)
    .map((entry) => ({ source: entry.source, caseCount: entry.cases.length }));

  const markdown = renderReport({
    model: model.label,
    samples,
    baselineRun,
    unionCaseCount: unionCases.length,
    selectedCaseCount: selected.length,
    outcomes,
    skipped,
  });

  const outPath = writeRun({
    startedAt,
    model: model.label,
    samples,
    filters,
    outcomes,
    skipped,
    baselineRun,
    armRuns,
    markdown,
  });

  console.log(`\n${markdown}\n`);
  console.log(`full run written to ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

// ---------------------------------------------------------------------------
// Running
// ---------------------------------------------------------------------------

async function runArm({
  label,
  cases,
  emailAccount,
  model,
  variantId,
  samples,
  concurrency,
}: {
  label: string;
  cases: LoadedCase<DraftReplyCase>[];
  emailAccount: EmailAccountWithAI;
  model: string;
  variantId: string;
  samples: number;
  concurrency: number;
}): Promise<EvalRun> {
  const total = cases.length * samples;
  let done = 0;
  process.stdout.write(`${label}: 0/${total}`);

  const run = await runDraftReplyEval({
    evalName: EVAL_NAME,
    cases,
    emailAccount,
    model,
    variantId,
    samples,
    concurrency,
    // Cases are already filtered here; re-applying env filters inside the
    // runner would silently drop the ablated arm's eligible set.
    filters: { split: "all", tags: [], caseIds: [], shard: null },
    writeHistory: false,
    onRecord: () => {
      done++;
      if (done % 10 === 0 || done === total) {
        process.stdout.write(`\r${label}: ${done}/${total}   `);
      }
    },
  });

  const sendReady = run.records.filter(
    (record) => record.sendReady === true,
  ).length;
  const errors = run.records.filter((record) => record.error !== null).length;
  process.stdout.write(
    `\r${label}: ${total}/${total} · sendReady ${formatPercent(sendReady / total)} · errors ${errors}\n`,
  );
  return run;
}

/**
 * Setting the key to null is the whole ablation: the adapter passes
 * `input.context` straight through to the drafting call, and every context
 * parameter is nullable there.
 */
function ablate(
  evalCase: LoadedCase<DraftReplyCase>,
  source: DraftReplyContextSource,
): LoadedCase<DraftReplyCase> {
  return {
    ...evalCase,
    input: {
      ...evalCase.input,
      context: { ...evalCase.input.context, [source]: null },
    },
  };
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

function summarizeArms({
  baselineRun,
  armRuns,
  samples,
}: {
  baselineRun: EvalRun;
  armRuns: { source: DraftReplyContextSource; run: EvalRun }[];
  samples: number;
}): ArmOutcome[] {
  const armPairs = armRuns.map((arm) => ({
    source: arm.source,
    run: arm.run,
    pairs: buildPairs({
      baseline: baselineRun.records,
      variant: arm.run.records,
    }),
  }));

  // Holm needs the whole family, and summarizeComparison needs Holm to decide a
  // verdict, so the raw McNemar p-values are collected in a first pass.
  const rawPValues = armPairs.map(
    (arm) => summarizeComparison({ pairs: arm.pairs }).mcnemar.pValue,
  );

  return armPairs.map((arm, index) => {
    const summary = summarizeComparison({
      pairs: arm.pairs,
      otherPValuesInFamily: rawPValues.filter((_, other) => other !== index),
    });
    const pairedCaseIds = new Set(arm.pairs.map((pair) => pair.caseId));

    return {
      source: arm.source,
      eligibleCaseCount: arm.pairs.length,
      pairs: arm.pairs,
      summary,
      mde: isDetected(summary) ? null : mdeFor({ summary, samples }),
      histogram: buildHistogramDiff({
        baseline: baselineRun.records.filter((record) =>
          pairedCaseIds.has(record.caseId),
        ),
        ablated: arm.run.records,
      }),
    };
  });
}

/**
 * summarizeComparison only fills in an MDE for NO_EFFECT_DETECTED. An
 * INCONCLUSIVE arm is just as underpowered and needs the same number, otherwise
 * "we measured nothing" reads as "there is nothing".
 */
function mdeFor({
  summary,
  samples,
}: {
  summary: ComparisonSummary;
  samples: number;
}): number | null {
  if (summary.mde !== null) return summary.mde;
  return pairedMde({
    caseCount: summary.caseCount,
    baselineRate: summary.baselineRate,
    discordanceRate: summary.mcnemar.discordant / summary.caseCount,
    samplesPerCase: samples,
  });
}

function buildPairs({
  baseline,
  variant,
}: {
  baseline: EvalResultRecord[];
  variant: EvalResultRecord[];
}): PairedCase[] {
  const baselineByCase = groupSendReady(baseline);
  const variantByCase = groupSendReady(variant);

  const pairs: PairedCase[] = [];
  for (const [caseId, variantPasses] of variantByCase) {
    const baselinePasses = baselineByCase.get(caseId);
    if (!baselinePasses) continue;
    pairs.push({ caseId, baseline: baselinePasses, variant: variantPasses });
  }
  return pairs.sort((a, b) => a.caseId.localeCompare(b.caseId));
}

function groupSendReady(records: EvalResultRecord[]): Map<string, boolean[]> {
  const byCase = new Map<string, boolean[]>();
  for (const record of records) {
    const passes = byCase.get(record.caseId) ?? [];
    passes.push(record.sendReady === true);
    byCase.set(record.caseId, passes);
  }
  return byCase;
}

/**
 * Which failure modes move, not just how many failures there are. A source can
 * leave the rate flat while shifting failures from one mode to another, and the
 * shift is usually the more actionable finding.
 */
function buildHistogramDiff({
  baseline,
  ablated,
}: {
  baseline: EvalResultRecord[];
  ablated: EvalResultRecord[];
}): HistogramRow[] {
  const baselineCounts = countModes(baseline);
  const ablatedCounts = countModes(ablated);
  const baselineFailures = failureCount(baseline);
  const ablatedFailures = failureCount(ablated);

  const modes = [
    ...new Set([...baselineCounts.keys(), ...ablatedCounts.keys()]),
  ];

  return modes
    .map((mode) => {
      const baselineCount = baselineCounts.get(mode) ?? 0;
      const ablatedCount = ablatedCounts.get(mode) ?? 0;
      return {
        mode,
        baselineCount,
        ablatedCount,
        baselineShareOfSamples: share(baselineCount, baseline.length),
        ablatedShareOfSamples: share(ablatedCount, ablated.length),
        baselineShareOfFailures: share(baselineCount, baselineFailures),
        ablatedShareOfFailures: share(ablatedCount, ablatedFailures),
      };
    })
    .sort(
      (a, b) =>
        Math.abs(b.ablatedShareOfSamples - b.baselineShareOfSamples) -
        Math.abs(a.ablatedShareOfSamples - a.baselineShareOfSamples),
    );
}

function countModes(records: EvalResultRecord[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const record of records) {
    if (record.sendReady === true) continue;
    const mode = record.error
      ? `${record.error.toUpperCase()} (no verdict)`
      : (record.primaryIssue ?? "UNCLASSIFIED");
    counts.set(mode, (counts.get(mode) ?? 0) + 1);
  }
  return counts;
}

function failureCount(records: EvalResultRecord[]): number {
  return records.filter((record) => record.sendReady !== true).length;
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function renderReport({
  model,
  samples,
  baselineRun,
  unionCaseCount,
  selectedCaseCount,
  outcomes,
  skipped,
}: {
  model: string;
  samples: number;
  baselineRun: EvalRun;
  unionCaseCount: number;
  selectedCaseCount: number;
  outcomes: ArmOutcome[];
  skipped: { source: DraftReplyContextSource; caseCount: number }[];
}): string {
  const baselineOverall = bootstrapPassRate({
    cases: [...groupSendReady(baselineRun.records)].map(([caseId, passes]) => ({
      caseId,
      passes,
    })),
  });

  const sorted = [...outcomes].sort(
    (a, b) => Math.abs(b.summary.delta) - Math.abs(a.summary.delta),
  );

  return [
    `# Context-source ablation — ${SUITE} — ${model}`,
    "",
    // This runner is normally pointed at freshly generated cases, so the same
    // provisional label the standard report carries has to appear here too.
    ...(process.env.EVAL_INCLUDE_UNREVIEWED === "true"
      ? [PROVISIONAL_NOTE, ""]
      : []),
    `Baseline over the union of eligible cases: **${formatPercent(baselineOverall.estimate)} send-ready** (95% CI ${formatPercent(baselineOverall.lower)} – ${formatPercent(baselineOverall.upper)}, ${unionCaseCount} cases, k=${samples}).`,
    "",
    `${selectedCaseCount} cases selected · ${unionCaseCount} carry at least one ablatable source · one shared baseline arm · ${outcomes.length} ablated arms.`,
    "",
    "Delta is ablated minus baseline, so a **negative delta means removing the source made drafts worse** (the source helps).",
    "Rows are sorted by absolute effect size. Holm p corrects across all arms in this table.",
    "",
    "| source | eligible n | baseline | ablated | delta (95% CI) | exact p | Holm p | verdict |",
    "|---|---:|---:|---:|---|---:|---:|---|",
    ...sorted.map(renderArmRow),
    "",
    ...(skipped.length > 0
      ? [
          `Not tested (fewer than ${MIN_ELIGIBLE_CASES} populated cases): ${skipped
            .map((entry) => `\`${entry.source}\` n=${entry.caseCount}`)
            .join(", ")}.`,
          "",
        ]
      : []),
    "## Failure-mode shift per arm",
    "",
    "Share of samples uses every graded sample as the denominator; share of failures uses only the not-send-ready ones. A mode can grow as a share of failures while the overall rate barely moves.",
    "",
    ...sorted.flatMap((outcome) => renderHistogram(outcome)),
  ].join("\n");
}

function renderArmRow(outcome: ArmOutcome): string {
  const { summary } = outcome;
  const delta = `${formatPoints(summary.delta)} [${formatPoints(summary.lower)}, ${formatPoints(summary.upper)}]`;
  return `| \`${outcome.source}\` | ${outcome.eligibleCaseCount} | ${formatPercent(summary.baselineRate)} | ${formatPercent(summary.variantRate)} | ${delta} | ${formatP(summary.mcnemar.pValue)} | ${formatP(summary.adjustedPValue)} | ${describeVerdict(outcome)} |`;
}

/**
 * "no effect" and "we could not have seen an effect" are different claims and
 * the table has to keep them apart, so a non-significant arm reports the
 * smallest effect its n could have detected instead of a null result.
 */
function describeVerdict(outcome: ArmOutcome): string {
  const { summary } = outcome;
  if (summary.verdict === "REGRESSED")
    return "**source helps** (removal hurts)";
  if (summary.verdict === "IMPROVED") return "**source hurts** (removal helps)";

  const mde =
    outcome.mde === null
      ? "MDE above 40pp, i.e. off the grid"
      : `MDE ±${formatPoints(outcome.mde)}`;
  const label =
    summary.verdict === "INCONCLUSIVE"
      ? "inconclusive (CI and p disagree)"
      : "underpowered";
  return `${label} — ${mde}`;
}

function isDetected(summary: ComparisonSummary): boolean {
  return summary.verdict === "IMPROVED" || summary.verdict === "REGRESSED";
}

function renderHistogram(outcome: ArmOutcome): string[] {
  if (outcome.histogram.length === 0) {
    return [`### \`${outcome.source}\``, "", "No failures in either arm.", ""];
  }

  return [
    `### \`${outcome.source}\` (n=${outcome.eligibleCaseCount})`,
    "",
    "| primaryIssue | baseline | ablated | Δ share of samples | Δ share of failures |",
    "|---|---:|---:|---:|---:|",
    ...outcome.histogram.map(
      (row) =>
        `| ${row.mode} | ${row.baselineCount} (${formatPercent(row.baselineShareOfSamples)}) | ${row.ablatedCount} (${formatPercent(row.ablatedShareOfSamples)}) | ${formatPoints(row.ablatedShareOfSamples - row.baselineShareOfSamples)} | ${formatPoints(row.ablatedShareOfFailures - row.baselineShareOfFailures)} |`,
    ),
    "",
  ];
}

function writeRun({
  startedAt,
  model,
  samples,
  filters,
  outcomes,
  skipped,
  baselineRun,
  armRuns,
  markdown,
}: {
  startedAt: string;
  model: string;
  samples: number;
  filters: ReturnType<typeof readEvalFiltersFromEnv>;
  outcomes: ArmOutcome[];
  skipped: { source: DraftReplyContextSource; caseCount: number }[];
  baselineRun: EvalRun;
  armRuns: { source: DraftReplyContextSource; run: EvalRun }[];
  markdown: string;
}): string {
  const dir = path.join(process.cwd(), ".context", "eval-ablation");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${startedAt.replace(/[:.]/g, "-")}.json`);

  writeFileSync(
    file,
    `${JSON.stringify(
      {
        evalName: EVAL_NAME,
        model,
        samples,
        filters,
        startedAt,
        finishedAt: new Date().toISOString(),
        judgeModel: getEvalJudgeUserAi()?.aiModel ?? null,
        // Recorded so pooling can refuse a run that replayed cached verdicts.
        // Two cache-hit runs are the same numbers twice: pooling them doubles
        // the apparent sample size while adding no information.
        cacheMode: getCacheMode(),
        arms: outcomes.map((outcome) => ({
          source: outcome.source,
          eligibleCaseCount: outcome.eligibleCaseCount,
          summary: outcome.summary,
          mde: outcome.mde,
          histogram: outcome.histogram,
          pairs: outcome.pairs,
        })),
        skipped,
        baselineRun,
        armRuns,
        markdown,
      },
      null,
      2,
    )}\n`,
  );
  return file;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function share(count: number, total: number): number {
  return total === 0 ? 0 : count / total;
}

function formatPercent(value: number): string {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "n/a";
}

function formatPoints(value: number): string {
  if (!Number.isFinite(value)) return "n/a";
  const points = value * 100;
  return `${points >= 0 ? "+" : ""}${points.toFixed(1)}pp`;
}

function formatP(value: number): string {
  if (!Number.isFinite(value)) return "n/a";
  return value < 0.001 ? "<0.001" : value.toFixed(3);
}

function parsePositiveInt(value: string | undefined): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
