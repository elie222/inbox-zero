import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, test, vi } from "vitest";
import { z } from "zod";
import { ActionType, SystemType } from "@/generated/prisma/enums";
import type { Action } from "@/generated/prisma/client";
import {
  describeEvalMatrix,
  shouldRunEvalTests,
} from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import { getEvalDataDirs } from "@/__tests__/eval/harness/load-cases";
import { parseCsv } from "@/__tests__/eval/harness/parse-csv";
import { aiChooseRule } from "@/utils/ai/choose-rule/ai-choose-rule";
import { CONVERSATION_TRACKING_INSTRUCTIONS } from "@/utils/ai/choose-rule/run-rules";
import { getRuleConfig } from "@/utils/rule/consts";
import { getEmail, getRule } from "@/__tests__/helpers";
import { createScopedLogger } from "@/utils/logger";

// Runs the rule picker over the external categorization dataset, once with each
// rule's actions in the prompt (what ships) and once with actions stripped (the
// prompt before actions were added). Only the "with actions" arm asserts.
//
// The CSV is read from every EVAL_DATA_DIRS root that has it and merged by
// case_id, later roots overriding earlier ones (same overlay convention as
// load-cases.ts).
//
// EVAL_DATA_DIRS=/path/to/inbox-zero-evals/datasets pnpm test-ai eval/choose-rule-categorization-data
// Bounded: EVAL_SAMPLES=100 EVAL_DATA_DIRS=... pnpm test-ai eval/choose-rule-categorization-data
// Multi-model: EVAL_MODELS=all EVAL_DATA_DIRS=... pnpm test-ai eval/choose-rule-categorization-data

const DATASET_RELATIVE_PATH = path.join("categorization", "persona-v1.csv");
const SAMPLE_SEED = "choose-rule-categorization-v1";
const TIMEOUT = 180_000;
vi.setConfig({ maxConcurrency: 3 });
const logger = createScopedLogger("eval-choose-rule-categorization-data");

const datasetPaths = findDatasetPaths(getEvalDataDirs());
const shouldRunEval = shouldRunEvalTests() && datasetPaths.length > 0;

if (datasetPaths.length === 0) {
  logger.info(
    `Skipped: no ${DATASET_RELATIVE_PATH} found under EVAL_DATA_DIRS. The dataset is not part of this repository.`,
  );
}

const datasetRowSchema = z.object({
  case_id: z.string().min(1),
  from: z.string(),
  subject: z.string(),
  body: z.string(),
  gold: z.string().min(1),
  difficulty: z.string(),
  language: z.string(),
  audit_label: z.string(),
  audit_status: z.string(),
  audit_ambiguous: z.string(),
  audit_alternative: z.string(),
});

const HIDING_ACTION_TYPES = new Set<ActionType>([
  ActionType.ARCHIVE,
  ActionType.MOVE_FOLDER,
  ActionType.DELETE,
  ActionType.MARK_SPAM,
]);

// Same candidate set as choose-rule.test.ts: the default system rules with the
// actions they ship with, plus the collapsed "Conversations" meta-rule.
const systemRule = (type: SystemType) => {
  const config = getRuleConfig(type);
  const actions = [{ type: ActionType.LABEL, label: config.label }];
  if (config.categoryAction === "label_archive") {
    actions.push({ type: ActionType.ARCHIVE, label: null });
  }
  return getRule(config.instructions, actions as Action[], config.name);
};

const CONVERSATIONS_RULE_NAME = "Conversations";

const rules = [
  systemRule(SystemType.NEWSLETTER),
  systemRule(SystemType.MARKETING),
  systemRule(SystemType.CALENDAR),
  systemRule(SystemType.RECEIPT),
  systemRule(SystemType.NOTIFICATION),
  getRule(CONVERSATION_TRACKING_INSTRUCTIONS, [], CONVERSATIONS_RULE_NAME),
];

const hidingRuleNames = rules
  .filter((rule) =>
    rule.actions.some((action) => HIDING_ACTION_TYPES.has(action.type)),
  )
  .map((rule) => rule.name);

// Dataset gold labels are finer-grained than the system rules. The first entry
// is the rule that should win; the rest are acceptable because the system rule
// boundaries genuinely overlap there (a shipped-order update reads as either a
// status notification or a purchase record; recruiter mail is a conversation
// but interview scheduling is a fair Calendar pick).
const goldLabelToRuleNames: Record<string, string[]> = {
  receipt: [getRuleConfig(SystemType.RECEIPT).name],
  shipping: [
    getRuleConfig(SystemType.NOTIFICATION).name,
    getRuleConfig(SystemType.RECEIPT).name,
  ],
  newsletter: [getRuleConfig(SystemType.NEWSLETTER).name],
  marketing: [getRuleConfig(SystemType.MARKETING).name],
  calendar: [getRuleConfig(SystemType.CALENDAR).name],
  security: [getRuleConfig(SystemType.NOTIFICATION).name],
  automated_alert: [getRuleConfig(SystemType.NOTIFICATION).name],
  personal_request: [CONVERSATIONS_RULE_NAME],
  support: [CONVERSATIONS_RULE_NAME],
  recruiting: [
    CONVERSATIONS_RULE_NAME,
    getRuleConfig(SystemType.CALENDAR).name,
  ],
};

const ruleContextVariants = [
  { label: "with actions", rules, gate: true },
  {
    label: "without actions",
    rules: rules.map((rule) => ({ ...rule, actions: [] })),
    gate: false,
  },
] as const;

type Outcome = {
  model: string;
  variant: string;
  caseId: string;
  gold: string;
  difficulty: string;
  gated: boolean;
  expectedRule: string;
  actualRule: string;
  pass: boolean;
  wronglyHidden: boolean;
};

describe.runIf(shouldRunEval)("Eval: Choose Rule (categorization data)", () => {
  const evalReporter = createEvalReporter({
    evalName: "choose-rule-categorization-data",
  });
  // The stripped-actions arm is reported separately so the headline numbers
  // and history only reflect the prompt that ships.
  const baselineReporter = createEvalReporter({
    evalName: "choose-rule-categorization-data-without-actions",
    reportPathSuffix: "-without-actions",
  });
  const outcomes: Outcome[] = [];

  // describe.runIf still runs the collector when skipped, so only read the
  // dataset when the suite is actually going to run.
  const dataset = loadDataset(shouldRunEval ? datasetPaths : []);
  const cases = sampleStratified(dataset.cases, readSampleSize());

  // A broken or empty dataset must not produce a green run with no records.
  test("dataset loaded and mapped to at least one case", () => {
    const fileLevelIssues = dataset.issues.filter((issue) => !issue.caseId);
    expect(fileLevelIssues).toEqual([]);
    expect(cases.length).toBeGreaterThan(0);
  });

  describeEvalMatrix("choose-rule categorization", (model, emailAccount) => {
    for (const variant of ruleContextVariants) {
      for (const evalCase of cases) {
        const testName = `${variant.label} | ${evalCase.id}`;
        test.concurrent(
          testName,
          async () => {
            const result = await aiChooseRule({
              email: evalCase.email,
              rules: variant.rules,
              emailAccount,
              logger,
            });

            const primaryRule = result.rules.find((r) => r.isPrimary);
            const actual =
              primaryRule?.rule.name ??
              result.rules[0]?.rule.name ??
              "no match";
            const selectedRuleNames = result.rules.map((r) => r.rule.name);
            const forbiddenSelected = selectedRuleNames.filter((name) =>
              evalCase.forbiddenRules.includes(name),
            );
            const wronglyHidden = forbiddenSelected.length > 0;
            const pass =
              evalCase.acceptableRules.includes(actual) && !wronglyHidden;

            (variant.gate ? evalReporter : baselineReporter).record({
              testName,
              model: model.label,
              pass,
              expected: evalCase.acceptableRules.join(" | "),
              actual: wronglyHidden
                ? `${actual} [hidden by ${forbiddenSelected.join(", ")}]`
                : actual,
            });
            outcomes.push({
              model: model.label,
              variant: variant.label,
              caseId: evalCase.id,
              gold: evalCase.gold,
              difficulty: evalCase.difficulty,
              gated: evalCase.gate,
              expectedRule: evalCase.acceptableRules[0],
              actualRule: actual,
              pass,
              wronglyHidden,
            });

            if (!variant.gate || !evalCase.gate) return;

            expect(evalCase.acceptableRules).toContain(actual);
            expect(forbiddenSelected).toEqual([]);
          },
          TIMEOUT,
        );
      }
    }
  });

  afterAll(() => {
    evalReporter.printReport();
    baselineReporter.printReport();
    logDatasetSummary(dataset, cases);
    logOutcomeSummary(outcomes);
  });
});

type EvalCase = {
  id: string;
  email: ReturnType<typeof getEmail>;
  gold: string;
  difficulty: string;
  language: string;
  acceptableRules: string[];
  forbiddenRules: string[];
  gate: boolean;
  auditDisagrees: boolean;
};

type DatasetIssue = {
  file: string;
  caseId: string | null;
  message: string;
};

type Dataset = {
  cases: EvalCase[];
  issues: DatasetIssue[];
  rowsPerFile: Record<string, number>;
  skippedGoldCounts: Record<string, number>;
  ruleCounts: Record<string, number>;
};

function findDatasetPaths(roots: string[]): string[] {
  return roots
    .map((root) => path.join(root, DATASET_RELATIVE_PATH))
    .filter((candidate) => existsSync(candidate));
}

function loadDataset(filePaths: string[]): Dataset {
  const cases: EvalCase[] = [];
  const issues: DatasetIssue[] = [];
  const rowsPerFile: Record<string, number> = {};
  const skippedGoldCounts: Record<string, number> = {};
  const ruleCounts: Record<string, number> = {};
  const rowsById = new Map<string, z.infer<typeof datasetRowSchema>>();

  for (const file of filePaths) {
    // parseCsv rejects the whole file on a field-count mismatch, so a
    // structurally broken overlay is skipped as a unit rather than per row.
    const rawRows = readCsvRows(file);
    // Later roots may override earlier ones by case_id, but a repeated id
    // inside one file is a data error, not an overlay.
    const seenInFile = new Set<string>();
    if (!rawRows.ok) {
      issues.push({ file, caseId: null, message: rawRows.message });
      continue;
    }

    rowsPerFile[file] = rawRows.rows.length;
    for (const raw of rawRows.rows) {
      const parsed = datasetRowSchema.safeParse(raw);
      if (!parsed.success) {
        issues.push({
          file,
          caseId: raw.case_id || null,
          message: parsed.error.issues
            .map(
              (issue) =>
                `${issue.path.join(".") || "<root>"}: ${issue.message}`,
            )
            .join("; "),
        });
        continue;
      }
      if (seenInFile.has(parsed.data.case_id)) {
        issues.push({
          file,
          caseId: parsed.data.case_id,
          message: "duplicate case_id within the same file; later copy ignored",
        });
        continue;
      }
      seenInFile.add(parsed.data.case_id);
      rowsById.set(parsed.data.case_id, parsed.data);
    }
  }

  for (const row of rowsById.values()) {
    const goldRules = goldLabelToRuleNames[row.gold];
    if (!goldRules) {
      skippedGoldCounts[row.gold] = (skippedGoldCounts[row.gold] ?? 0) + 1;
      continue;
    }

    // When the audit relabeled the row, either label is a fair answer; the
    // audit's alternative label is likewise accepted where one was recorded.
    const auditDisagrees = row.audit_status === "disagree";
    const acceptableRules = unique([
      ...goldRules,
      ...(auditDisagrees ? (goldLabelToRuleNames[row.audit_label] ?? []) : []),
      ...(goldLabelToRuleNames[row.audit_alternative] ?? []),
    ]);
    const forbiddenRules = hidingRuleNames.filter(
      (name) => !acceptableRules.includes(name),
    );

    ruleCounts[goldRules[0]] = (ruleCounts[goldRules[0]] ?? 0) + 1;
    cases.push({
      id: row.case_id,
      email: getEmail({
        from: row.from,
        subject: row.subject,
        content: row.body,
      }),
      gold: row.gold,
      difficulty: row.difficulty,
      language: row.language,
      acceptableRules,
      forbiddenRules,
      gate: row.audit_ambiguous !== "true",
      auditDisagrees,
    });
  }

  return { cases, issues, rowsPerFile, skippedGoldCounts, ruleCounts };
}

function readCsvRows(
  file: string,
):
  | { ok: true; rows: Record<string, string>[] }
  | { ok: false; message: string } {
  try {
    return { ok: true, rows: parseCsv(readFileSync(file, "utf8")) };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "unreadable CSV",
    };
  }
}

function readSampleSize(): number | null {
  const raw = process.env.EVAL_SAMPLES;
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`EVAL_SAMPLES must be a positive integer, got "${raw}"`);
  }
  return parsed;
}

// Proportional allocation per gold label (largest remainder), then a seeded
// order within each label so the same EVAL_SAMPLES picks the same rows every run.
function sampleStratified(cases: EvalCase[], size: number | null): EvalCase[] {
  if (size === null || size >= cases.length) return cases;

  const strata = new Map<string, EvalCase[]>();
  for (const evalCase of cases) {
    const stratum = strata.get(evalCase.gold) ?? [];
    stratum.push(evalCase);
    strata.set(evalCase.gold, stratum);
  }

  const allocations = [...strata.entries()].map(([gold, stratum]) => {
    const exact = (size * stratum.length) / cases.length;
    return { gold, stratum, take: Math.floor(exact), remainder: exact % 1 };
  });
  let remaining = size - allocations.reduce((sum, a) => sum + a.take, 0);
  for (const allocation of [...allocations].sort(
    (a, b) => b.remainder - a.remainder || a.gold.localeCompare(b.gold),
  )) {
    if (remaining <= 0) break;
    allocation.take += 1;
    remaining -= 1;
  }

  return allocations.flatMap(({ stratum, take }) =>
    [...stratum]
      .sort((a, b) => seededKey(a.id).localeCompare(seededKey(b.id)))
      .slice(0, take),
  );
}

function seededKey(id: string): string {
  return createHash("sha256").update(`${SAMPLE_SEED}:${id}`).digest("hex");
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function logDatasetSummary(dataset: Dataset, cases: EvalCase[]) {
  const skipped = Object.values(dataset.skippedGoldCounts).reduce(
    (sum, count) => sum + count,
    0,
  );
  logger.info("Dataset summary", {
    datasetRoots: Object.keys(dataset.rowsPerFile).length,
    rowsPerFile: dataset.rowsPerFile,
    mergedRows: dataset.cases.length + skipped,
    mappedRows: dataset.cases.length,
    skippedInvalidRows: dataset.issues.length,
    invalidRowReasons: dataset.issues
      .slice(0, 5)
      .map(
        (issue) =>
          `${issue.file}${issue.caseId ? ` [${issue.caseId}]` : ""}: ${issue.message}`,
      ),
    rowsPerRule: dataset.ruleCounts,
    skippedUnmappableRows: skipped,
    skippedGoldValues: dataset.skippedGoldCounts,
    sampledRows: cases.length,
    sampleSize: readSampleSize() ?? "all",
    nonGatingAmbiguousRows: cases.filter((c) => !c.gate).length,
    auditDisagreeRows: cases.filter((c) => c.auditDisagrees).length,
    byDifficulty: countBy(cases, (c) => c.difficulty),
    byLanguage: countBy(cases, (c) => c.language),
  });
}

function logOutcomeSummary(outcomes: Outcome[]) {
  if (outcomes.length === 0) return;

  const models = unique(outcomes.map((o) => o.model));
  const variants = unique(outcomes.map((o) => o.variant));

  for (const model of models) {
    for (const variant of variants) {
      const subset = outcomes.filter(
        (o) => o.model === model && o.variant === variant,
      );
      if (subset.length === 0) continue;

      const misses = subset.filter((o) => !o.pass);
      logger.info("Accuracy", {
        model,
        variant,
        total: subset.length,
        correct: subset.length - misses.length,
        accuracy: formatRate(subset.length - misses.length, subset.length),
        gatedAccuracy: formatRate(
          subset.filter((o) => o.gated && o.pass).length,
          subset.filter((o) => o.gated).length,
        ),
        wronglyHidden: subset.filter((o) => o.wronglyHidden).length,
        accuracyByGold: rateBy(subset, (o) => o.gold),
        accuracyByDifficulty: rateBy(subset, (o) => o.difficulty),
        confusionOnMisses: countBy(
          misses,
          (o) => `${o.gold} (${o.expectedRule}) -> ${o.actualRule}`,
        ),
        wronglyHiddenCaseIds: subset
          .filter((o) => o.wronglyHidden)
          .map((o) => o.caseId),
      });
    }
  }
}

function countBy<T>(items: T[], key: (item: T) => string) {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const k = key(item);
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([, a], [, b]) => b - a),
  );
}

function rateBy(outcomes: Outcome[], key: (outcome: Outcome) => string) {
  const groups = new Map<string, Outcome[]>();
  for (const outcome of outcomes) {
    const k = key(outcome);
    groups.set(k, [...(groups.get(k) ?? []), outcome]);
  }
  return Object.fromEntries(
    [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, group]) => [
        k,
        formatRate(group.filter((o) => o.pass).length, group.length),
      ]),
  );
}

function formatRate(numerator: number, denominator: number): string {
  if (denominator === 0) return "n/a";
  return `${numerator}/${denominator} (${((100 * numerator) / denominator).toFixed(1)}%)`;
}
