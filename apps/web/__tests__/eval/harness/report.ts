import {
  DIFFICULTY_AXES,
  DIFFICULTY_LEVELS,
  type DifficultyAxis,
  type DifficultyLevel,
} from "@/__tests__/eval/harness/case-schema";
import type {
  EvalResultRecord,
  EvalRun,
} from "@/__tests__/eval/harness/run-suite";
import {
  bootstrapPassRate,
  type PassRateInterval,
} from "@/__tests__/eval/harness/stats";

/**
 * docs/case-design.md: baseline sendReady must land roughly between 45% and 70%.
 * An instrument pinned at the top of its range is broken, and the suite that
 * reported 19/19 was pinned. Above this line the number is not reportable.
 */
export const CEILING_THRESHOLD = 0.8;
export const TARGET_BAND: [number, number] = [0.45, 0.7];

/**
 * Every report over unreviewed generated cases carries this, so the label
 * cannot drift between the reports that have to agree on what is reportable.
 */
export const PROVISIONAL_NOTE =
  "**PROVISIONAL** — includes unreviewed generated cases. Not a reportable baseline until a human has reviewed them.";

export type CeilingLevel =
  | "ceiling"
  | "near-ceiling"
  | "in-band"
  | "floor"
  | "empty";

export type EvalReport = {
  sendReady: PassRateInterval;
  casePass: PassRateInterval;
  ceilingLevel: CeilingLevel;
  banner: string | null;
  markdown: string;
};

export function buildEvalReport({
  run,
  iterations = 10_000,
  alpha = 0.05,
  seed = 20_260_726,
}: {
  run: EvalRun;
  iterations?: number;
  alpha?: number;
  seed?: number;
}): EvalReport {
  const records = run.records;
  const sendReady = bootstrapPassRate({
    cases: clusterByCase(records, (record) => record.sendReady === true),
    iterations,
    alpha,
    seed,
  });
  const casePass = bootstrapPassRate({
    cases: clusterByCase(records, (record) => record.pass),
    iterations,
    alpha,
    seed,
  });

  const ceilingLevel = classifyCeiling(sendReady.estimate);
  const banner = buildBanner(ceilingLevel, sendReady);

  const markdown = [
    `# ${run.evalName} — ${run.model} (${run.variantId})`,
    "",
    banner ? `${banner}\n` : "",
    section("Headline", [
      `**sendReady: ${pct(sendReady.estimate)}**  (95% CI ${pct(sendReady.lower)} – ${pct(sendReady.upper)}, cluster bootstrap over ${sendReady.caseCount} cases)`,
      "",
      `Case pass (assertions + criteria + sendReady): ${pct(casePass.estimate)} (${pct(casePass.lower)} – ${pct(casePass.upper)})`,
      "",
      `Split \`${run.filters.split}\` · ${run.selectedCaseCount} cases · ${records.length} samples · ${run.filters.shard ? `shard ${run.filters.shard.index}/${run.filters.shard.total} · ` : ""}${durationSummary(run)}`,
      ...(process.env.EVAL_INCLUDE_UNREVIEWED === "true"
        ? ["", PROVISIONAL_NOTE]
        : []),
    ]),
    section("Usability", usabilityTable(records)),
    section("Why it fails", failureHistogram(records)),
    section("By difficulty axis", axisTable(records)),
    section("By difficulty", difficultyTable(records)),
    section("Confidence gate", confidenceTable(records)),
    section("Assertion failures", assertionHistogram(records)),
    section("Run health", runHealth(records)),
    banner ? `\n${banner}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return { sendReady, casePass, ceilingLevel, banner, markdown };
}

export function printEvalReport(report: EvalReport) {
  console.log(`\n${report.markdown}\n`);
}

function classifyCeiling(estimate: number): CeilingLevel {
  // A run that graded nothing has a non-finite estimate. Calling that in-band
  // reports a healthy instrument for a run that measured nothing at all.
  if (!Number.isFinite(estimate)) return "empty";
  if (estimate > CEILING_THRESHOLD) return "ceiling";
  if (estimate > TARGET_BAND[1]) return "near-ceiling";
  if (estimate < TARGET_BAND[0]) return "floor";
  return "in-band";
}

function buildBanner(
  level: CeilingLevel,
  sendReady: PassRateInterval,
): string | null {
  if (level === "in-band") return null;

  if (level === "empty") {
    return box([
      "EMPTY RUN: no samples were graded.",
      "",
      "Filters may have selected no cases, or every sample errored. There is no",
      "rate here to read. Check the run health section.",
    ]);
  }

  const rate = pct(sendReady.estimate);
  const lines =
    level === "ceiling"
      ? [
          `CEILING WARNING: sendReady = ${rate}, above the ${pct(CEILING_THRESHOLD)} limit.`,
          "",
          "The case set is too easy to measure improvement. An instrument pinned at",
          "the top of its range cannot detect a regression or a win, and this is the",
          "exact condition that produced a 19/19 eval alongside a 5/10 product.",
          "",
          "Per docs/case-design.md the case set gets REGENERATED, not celebrated.",
          "Do not report this number as a result.",
        ]
      : level === "near-ceiling"
        ? [
            `Approaching ceiling: sendReady = ${rate}, above the ${pct(TARGET_BAND[1])} target band.`,
            "Headroom is thin. Add harder cases before running experiments on this set.",
          ]
        : [
            `Floor warning: sendReady = ${rate}, below the ${pct(TARGET_BAND[0])} target band.`,
            "Either the harness is broken or the cases test something the product never claimed.",
            "Check the run health section for timeouts and errors before reading anything into this.",
          ];

  return box(lines);
}

/** The tiers the drafter can return, weakest first. */
const CONFIDENCE_TIERS = ["LOW", "MEDIUM", "HIGH"] as const;

/**
 * Whether the drafter's self-report is worth gating on.
 *
 * In production it is the only thing between a bad draft and the user: the
 * account's `draftReplyConfidence` sets a minimum and anything below it is
 * never surfaced. Nothing else in this report would reveal that the scale has
 * collapsed — a model that returns HIGH for everything produces exactly the
 * same sendReady rate as a well-calibrated one, while the gate quietly stops
 * filtering and the setting keeps promising that it filters.
 *
 * So the table reports the send-ready rate *within* each tier. Equal rates
 * across tiers mean the label carries no information, whatever the headline
 * says.
 */
function confidenceTable(records: EvalResultRecord[]): string[] {
  const graded = records.filter(
    (record) => record.confidence !== null && record.sendReady !== null,
  );
  if (graded.length === 0) return ["No confidence values recorded."];

  const readyIn = (subset: EvalResultRecord[]) =>
    subset.filter((record) => record.sendReady === true).length;

  const rows = CONFIDENCE_TIERS.map((tier) => {
    const inTier = graded.filter((record) => record.confidence === tier);
    const rate =
      inTier.length === 0 ? "—" : pct(readyIn(inTier) / inTier.length);
    return `| ${tier} | ${inTier.length} | ${pct(inTier.length / graded.length)} | ${rate} |`;
  });

  const lines = [
    "| confidence | samples | share | send-ready |",
    "|---|---:|---:|---:|",
    ...rows,
    "",
  ];

  const unusedTiers = CONFIDENCE_TIERS.filter(
    (tier) => !graded.some((record) => record.confidence === tier),
  );
  if (unusedTiers.length > 0) {
    lines.push(
      `Never emitted: ${unusedTiers.join(", ")}. A tier the drafter does not use is a cut point that never cuts, so any \`draftReplyConfidence\` setting whose only effect is to exclude it does nothing at all.`,
      "",
    );
  }

  // What the strictest setting would actually buy, in drafts rather than rates.
  const high = graded.filter((record) => record.confidence === "HIGH");
  const held = graded.filter((record) => record.confidence !== "HIGH");
  if (high.length > 0 && held.length > 0) {
    lines.push(
      `\`HIGH_CONFIDENCE\` would surface ${high.length} of ${graded.length} drafts at ${pct(readyIn(high) / high.length)} send-ready, against ${pct(readyIn(graded) / graded.length)} across all of them — and would hold back ${readyIn(held)} that were send-ready.`,
    );
  }

  return lines;
}

/**
 * needs-fill and not-usable both fail sendReady, but only one is safe. Keeping
 * them apart is what lets a "leave a placeholder when you do not know" change
 * show up as progress: it should move drafts out of not-usable into needs-fill
 * without moving anything into it from send-ready.
 */
function usabilityTable(records: EvalResultRecord[]): string[] {
  const graded = records.filter((record) => record.usability !== null);
  if (graded.length === 0) return ["No usability verdicts recorded."];

  const counts = new Map<string, number>();
  for (const record of graded) {
    const key = record.usability ?? "unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const order = ["send-ready", "needs-fill", "not-usable"];
  const rows = order
    .filter((outcome) => counts.has(outcome))
    .map(
      (outcome) =>
        `| ${outcome} | ${counts.get(outcome)} | ${pct((counts.get(outcome) ?? 0) / graded.length)} |`,
    );

  const safe =
    (counts.get("send-ready") ?? 0) + (counts.get("needs-fill") ?? 0);

  return [
    "| outcome | samples | share |",
    "|---|---:|---:|",
    ...rows,
    "",
    `Safe to surface (send-ready + needs-fill): ${pct(safe / graded.length)}. A needs-fill draft leaves the sender one slot to complete; a not-usable one has to be rewritten or would go out wrong.`,
  ];
}

function failureHistogram(records: EvalResultRecord[]): string[] {
  const failures = records.filter((record) => record.sendReady !== true);
  if (failures.length === 0) return ["No sendReady failures."];

  const counts = new Map<string, number>();
  for (const record of failures) {
    const key = record.error
      ? `${record.error.toUpperCase()} (no verdict)`
      : (record.primaryIssue ?? "UNCLASSIFIED");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const rows = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(
      ([mode, count]) =>
        `| ${mode} | ${count} | ${pct(count / failures.length)} | ${pct(count / records.length)} |`,
    );

  return [
    `${failures.length} of ${records.length} samples were not send-ready.`,
    "",
    "| primaryIssue | count | share of failures | share of all samples |",
    "|---|---:|---:|---:|",
    ...rows,
  ];
}

function axisTable(records: EvalResultRecord[]): string[] {
  const rows = DIFFICULTY_AXES.map((axis) =>
    axisRow(
      axis,
      records.filter((record) => record.difficultyAxes.includes(axis)),
    ),
  ).filter((row): row is string => row !== null);

  if (rows.length === 0) return ["No cases declare a difficulty axis."];

  return [
    "| axis | cases | samples | sendReady |",
    "|---|---:|---:|---:|",
    ...rows,
  ];
}

function axisRow(
  axis: DifficultyAxis,
  matching: EvalResultRecord[],
): string | null {
  if (matching.length === 0) return null;
  return `| ${axis} | ${countCases(matching)} | ${matching.length} | ${rateOf(matching)} |`;
}

function difficultyTable(records: EvalResultRecord[]): string[] {
  const rows = DIFFICULTY_LEVELS.map((level) =>
    difficultyRow(
      level,
      records.filter((record) => record.difficulty === level),
    ),
  ).filter((row): row is string => row !== null);

  if (rows.length === 0) return ["No records."];

  return [
    "| difficulty | cases | samples | sendReady |",
    "|---|---:|---:|---:|",
    ...rows,
  ];
}

function difficultyRow(
  level: DifficultyLevel,
  matching: EvalResultRecord[],
): string | null {
  if (matching.length === 0) return null;
  return `| ${level} | ${countCases(matching)} | ${matching.length} | ${rateOf(matching)} |`;
}

function assertionHistogram(records: EvalResultRecord[]): string[] {
  const counts = new Map<string, number>();
  for (const record of records) {
    for (const failure of record.assertionFailures) {
      const name = failure.split(":")[0] ?? failure;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    for (const failure of record.criteriaFailures) {
      const key = `criterion:${failure}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  if (counts.size === 0) return ["No assertion or criterion failures."];

  return [
    "| check | failures |",
    "|---|---:|",
    ...[...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => `| ${name} | ${count} |`),
  ];
}

function runHealth(records: EvalResultRecord[]): string[] {
  const timeouts = records.filter(
    (record) => record.error === "timeout",
  ).length;
  const errors = records.filter(
    (record) => record.error !== null && record.error !== "timeout",
  ).length;
  const unjudged = records.filter(
    (record) => record.sendReady === null && record.error === null,
  ).length;

  const lines = [
    `Timeouts: ${timeouts} · other errors: ${errors} · samples with no judge verdict: ${unjudged}`,
  ];

  // A bug in the harness surfaces as a wave of errored samples, and because
  // errors count as failures it reads as a low score rather than as a broken
  // run. A ReferenceError once turned every sample into a "failure" this way.
  const errorRate =
    records.length > 0 ? (timeouts + errors) / records.length : 0;
  if (errorRate > 0.1) {
    lines.push(
      "",
      `!! ${pct(errorRate)} of samples errored or timed out. This is a broken run, not a low score. Fix the harness before reading any number above.`,
    );
  }

  if (timeouts + errors > 0) {
    lines.push(
      "",
      "Timed-out and errored samples are counted as failures, not dropped. Dropping them would inflate the rate.",
    );
  }
  return lines;
}

function clusterByCase(
  records: EvalResultRecord[],
  passed: (record: EvalResultRecord) => boolean,
): { caseId: string; passes: boolean[] }[] {
  const byCase = new Map<string, boolean[]>();
  for (const record of records) {
    const passes = byCase.get(record.caseId) ?? [];
    passes.push(passed(record));
    byCase.set(record.caseId, passes);
  }
  return [...byCase.entries()].map(([caseId, passes]) => ({ caseId, passes }));
}

function countCases(records: EvalResultRecord[]): number {
  return new Set(records.map((record) => record.caseId)).size;
}

function rateOf(records: EvalResultRecord[]): string {
  const passed = records.filter((record) => record.sendReady === true).length;
  return `${pct(passed / records.length)} (${passed}/${records.length})`;
}

function durationSummary(run: EvalRun): string {
  const seconds = Math.round(
    (Date.parse(run.finishedAt) - Date.parse(run.startedAt)) / 1000,
  );
  return `${seconds}s wall`;
}

function section(title: string, body: string[]): string {
  return `## ${title}\n\n${body.join("\n")}\n`;
}

function box(lines: string[]): string {
  const rule = "=".repeat(78);
  return [
    rule,
    ...lines.map((line) => (line ? `!! ${line}` : "!!")),
    rule,
  ].join("\n");
}

function pct(value: number): string {
  if (!Number.isFinite(value)) return "n/a";
  return `${(value * 100).toFixed(1)}%`;
}
