import * as fs from "node:fs";
import * as path from "node:path";
import type { JudgeResult } from "@/__tests__/eval/judge";
import { subscribeToAiUsage, type AiUsageEvent } from "@/utils/usage";

export interface EvalRecord {
  actual?: string;
  criteria?: JudgeResult[];
  durationMs?: number;
  expected?: string;
  model: string;
  pass: boolean;
  testName: string;
}

const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const numberFormatter = new Intl.NumberFormat("en-US");

class EvalReporter {
  private readonly records: EvalRecord[] = [];
  private readonly usageEvents: AiUsageEvent[] = [];
  private unsubscribeFromUsage: (() => void) | undefined;

  constructor() {
    this.unsubscribeFromUsage = subscribeToAiUsage((event) => {
      this.usageEvents.push(event);
    });
  }

  record(result: EvalRecord): void {
    this.records.push(result);
  }

  printReport(): void {
    try {
      if (this.records.length === 0) return;

      const reportParts = [
        this.generateConsoleReport(),
        this.generateCostConsoleReport(),
      ].filter((part): part is string => Boolean(part));

      console.log(`\n${reportParts.join("\n\n")}`);

      if (process.env.EVAL_REPORT_PATH) {
        this.writeReport(resolveEvalReportPath(process.env.EVAL_REPORT_PATH));
      }
    } finally {
      this.unsubscribeFromUsage?.();
      this.unsubscribeFromUsage = undefined;
    }
  }

  private writeReport(filePath: string): void {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, this.generateMarkdown());

    const jsonPath = filePath.endsWith(".md")
      ? filePath.replace(/\.md$/, ".json")
      : `${filePath}.json`;
    fs.writeFileSync(jsonPath, JSON.stringify(this.records, null, 2));
  }

  private generateConsoleReport(): string {
    const models = Array.from(new Set(this.records.map((r) => r.model)));
    const tests = Array.from(new Set(this.records.map((r) => r.testName)));

    if (models.length <= 1) {
      return this.generateSingleModelConsole(models[0] ?? "Default", tests);
    }
    return this.generateComparisonConsole(models, tests);
  }

  private generateCostConsoleReport(): string | null {
    const summary = summarizeUsageEvents(this.usageEvents);
    if (summary.calls === 0) return null;

    const lines = [
      bold("Eval Cost"),
      "",
      `  Estimated total: ${formatUsd(summary.estimatedCost)}`,
    ];

    if (summary.providerReportedCost !== undefined) {
      lines.push(
        `  Provider-reported total: ${formatUsd(summary.providerReportedCost)}`,
      );
    }

    if (summary.providerUpstreamInferenceCost !== undefined) {
      lines.push(
        `  Upstream inference total: ${formatUsd(summary.providerUpstreamInferenceCost)}`,
      );
    }

    lines.push(`  ${formatTokenBreakdown(summary)}`, "");

    for (const model of summary.models) {
      lines.push(
        `  ${formatUsageModelKey(model)} - ${model.calls} calls | estimated ${formatUsd(model.estimatedCost)}${formatReportedCostSuffix(model.providerReportedCost)}`,
      );
    }

    return lines.join("\n");
  }

  private generateSingleModelConsole(model: string, tests: string[]): string {
    const lines = [bold(`Eval Results: ${model}`), ""];

    for (const testName of tests) {
      const record = this.records.find(
        (r) => r.testName === testName && r.model === model,
      );
      const status = record?.pass ? green("PASS") : red("FAIL");
      const detail =
        !record?.pass && record?.actual ? dim(` (got: ${record.actual})`) : "";
      lines.push(`  ${status}  ${testName}${detail}`);
    }

    const passed = this.records.filter(
      (r) => r.model === model && r.pass,
    ).length;
    const total = tests.length;
    const summary =
      passed === total
        ? green(`${passed}/${total} passed`)
        : red(`${passed}/${total} passed`);
    lines.push("", bold(summary));
    return lines.join("\n");
  }

  private generateComparisonConsole(models: string[], tests: string[]): string {
    const colWidth = Math.max(...models.map((m) => m.length), 10);
    const pad = (s: string, w: number) => s.padEnd(w);

    const header = `  ${"Test".padEnd(40)} ${models.map((m) => pad(m, colWidth)).join("  ")}`;
    const separator = `  ${"─".repeat(40)} ${models.map(() => "─".repeat(colWidth)).join("  ")}`;

    const rows = tests.map((testName) => {
      const displayName =
        testName.length > 38 ? `${testName.slice(0, 38)}…` : testName;
      const cells = models.map((model) => {
        const record = this.records.find(
          (r) => r.testName === testName && r.model === model,
        );
        if (record?.pass) return pad(green("PASS"), colWidth + 9);
        const actual = record?.actual
          ? red(`FAIL (${record.actual})`)
          : red("FAIL");
        return pad(actual, colWidth + 9);
      });
      return `  ${displayName.padEnd(40)} ${cells.join("  ")}`;
    });

    const totals = models.map((model) => {
      const passed = this.records.filter(
        (r) => r.model === model && r.pass,
      ).length;
      const total = tests.length;
      const text = `${passed}/${total}`;
      return pad(passed === total ? green(text) : red(text), colWidth + 9);
    });
    const totalRow = `  ${bold("Total".padEnd(40))} ${totals.join("  ")}`;

    return [
      bold("Eval Comparison"),
      "",
      header,
      separator,
      ...rows,
      separator,
      totalRow,
    ].join("\n");
  }

  private generateMarkdown(): string {
    const models = Array.from(new Set(this.records.map((r) => r.model)));
    const tests = Array.from(new Set(this.records.map((r) => r.testName)));

    const resultMarkdown =
      models.length <= 1
        ? this.generateSingleModelMarkdown(models[0] ?? "Default", tests)
        : this.generateComparisonMarkdown(models, tests);
    const costMarkdown = this.generateCostMarkdown();
    if (!costMarkdown) return resultMarkdown;

    return `${resultMarkdown}\n\n${costMarkdown}`;
  }

  private generateCostMarkdown(): string | null {
    const summary = summarizeUsageEvents(this.usageEvents);
    if (summary.calls === 0) return null;

    const totals = [
      `Estimated total: ${formatUsd(summary.estimatedCost)}`,
      summary.providerReportedCost === undefined
        ? null
        : `Provider-reported total: ${formatUsd(summary.providerReportedCost)}`,
      summary.providerUpstreamInferenceCost === undefined
        ? null
        : `Upstream inference total: ${formatUsd(summary.providerUpstreamInferenceCost)}`,
      `Calls: ${summary.calls}`,
      `Tokens: ${formatNumber(summary.totalTokens)}`,
    ].filter((total): total is string => total !== null);

    const lines = [
      "## Eval Cost",
      "",
      totals.join(" | "),
      "",
      "| Model | Calls | Estimated | Provider Reported | Tokens |",
      "|------|------:|------:|------:|------:|",
    ];

    for (const model of summary.models) {
      lines.push(formatCostMarkdownRow(model));
    }

    return lines.join("\n");
  }

  private generateSingleModelMarkdown(model: string, tests: string[]): string {
    const passed = this.records.filter(
      (r) => r.model === model && r.pass,
    ).length;

    const lines = [
      `## Eval Results: ${model}`,
      "",
      "| Test | Result | Actual |",
      "|------|--------|--------|",
    ];

    for (const testName of tests) {
      const record = this.records.find(
        (r) => r.testName === testName && r.model === model,
      );
      const result = record?.pass ? "PASS" : "FAIL";
      const actual = record?.actual ?? "-";
      lines.push(`| ${testName} | ${result} | ${actual} |`);
    }

    lines.push("", `**${passed}/${tests.length} passed**`);
    return lines.join("\n");
  }

  private generateComparisonMarkdown(
    models: string[],
    tests: string[],
  ): string {
    const header = `| Test | ${models.join(" | ")} |`;
    const separator = `|------|${models.map(() => ":---:").join("|")}|`;

    const rows = tests.map((testName) => {
      const cells = models.map((model) => {
        const record = this.records.find(
          (r) => r.testName === testName && r.model === model,
        );
        if (record?.pass) return "PASS";
        return record?.actual ? `FAIL (${record.actual})` : "FAIL";
      });
      return `| ${testName} | ${cells.join(" | ")} |`;
    });

    const totals = models.map((model) => {
      const passed = this.records.filter(
        (r) => r.model === model && r.pass,
      ).length;
      return `${passed}/${tests.length}`;
    });

    return [
      "## Eval Comparison",
      "",
      header,
      separator,
      ...rows,
      `| **Total** | ${totals.join(" | ")} |`,
    ].join("\n");
  }
}

export function createEvalReporter(): EvalReporter {
  return new EvalReporter();
}

type UsageSummary = {
  cachedInputTokens: number;
  calls: number;
  estimatedCost: number;
  inputTokens: number;
  models: UsageSummaryByModel[];
  outputTokens: number;
  providerReportedCost?: number;
  providerUpstreamInferenceCost?: number;
  reasoningTokens: number;
  totalTokens: number;
};

type UsageTotals = Omit<UsageSummary, "models">;

type UsageSummaryByModel = UsageTotals & {
  model: string;
  provider: string;
};

function summarizeUsageEvents(events: AiUsageEvent[]): UsageSummary {
  const summary = emptyUsageTotals();
  const modelSummaries = new Map<string, UsageSummaryByModel>();

  for (const event of events) {
    addUsageEvent(summary, event);
    const modelSummary = getOrCreateModelSummary(modelSummaries, event);
    addUsageEvent(modelSummary, event);
  }

  return {
    ...summary,
    models: Array.from(modelSummaries.values()).sort((a, b) =>
      formatUsageModelKey(a).localeCompare(formatUsageModelKey(b)),
    ),
  };
}

function emptyUsageTotals(): UsageTotals {
  return {
    cachedInputTokens: 0,
    calls: 0,
    estimatedCost: 0,
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
  };
}

function addUsageEvent(summary: UsageTotals, event: AiUsageEvent): void {
  summary.calls += 1;
  summary.estimatedCost += event.estimatedCost;
  summary.inputTokens += event.inputTokens;
  summary.outputTokens += event.outputTokens;
  summary.cachedInputTokens += event.cachedInputTokens;
  summary.reasoningTokens += event.reasoningTokens;
  summary.totalTokens += event.totalTokens;

  if (event.providerReportedCost !== undefined) {
    summary.providerReportedCost =
      (summary.providerReportedCost ?? 0) + event.providerReportedCost;
  }

  if (event.providerUpstreamInferenceCost !== undefined) {
    summary.providerUpstreamInferenceCost =
      (summary.providerUpstreamInferenceCost ?? 0) +
      event.providerUpstreamInferenceCost;
  }
}

function getOrCreateModelSummary(
  modelSummaries: Map<string, UsageSummaryByModel>,
  event: AiUsageEvent,
): UsageSummaryByModel {
  const key = formatUsageModelKey(event);
  const existingSummary = modelSummaries.get(key);
  if (existingSummary) return existingSummary;

  const modelSummary = {
    ...emptyUsageTotals(),
    provider: event.provider,
    model: event.model,
  } satisfies UsageSummaryByModel;
  modelSummaries.set(key, modelSummary);
  return modelSummary;
}

function formatTokenBreakdown(summary: UsageTotals): string {
  return `Calls: ${summary.calls} | Tokens: ${formatNumber(summary.totalTokens)} total (${formatNumber(summary.inputTokens)} in, ${formatNumber(summary.outputTokens)} out, ${formatNumber(summary.cachedInputTokens)} cached, ${formatNumber(summary.reasoningTokens)} reasoning)`;
}

function formatCostMarkdownRow(model: UsageSummaryByModel): string {
  return `| ${formatUsageModelKey(model)} | ${model.calls} | ${formatUsd(model.estimatedCost)} | ${formatUsdOrDash(model.providerReportedCost)} | ${formatNumber(model.totalTokens)} |`;
}

function formatUsageModelKey({
  provider,
  model,
}: {
  provider: string;
  model: string;
}): string {
  return `${provider}:${model}`;
}

function formatReportedCostSuffix(value: number | undefined): string {
  if (value === undefined) return "";
  return ` | reported ${formatUsd(value)}`;
}

function formatUsdOrDash(value: number | undefined): string {
  if (value === undefined) return "-";
  return formatUsd(value);
}

function formatUsd(value: number): string {
  if (value === 0) return "$0.00";
  return `$${value.toFixed(6)}`;
}

function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

function resolveEvalReportPath(filePath: string): string {
  if (path.isAbsolute(filePath)) return filePath;

  return path.join(findWorkspaceRoot(process.cwd()), filePath);
}

function findWorkspaceRoot(startDir: string): string {
  let currentDir = startDir;

  while (true) {
    if (
      fs.existsSync(path.join(currentDir, "pnpm-workspace.yaml")) ||
      fs.existsSync(path.join(currentDir, ".git"))
    ) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return startDir;
    }

    currentDir = parentDir;
  }
}
