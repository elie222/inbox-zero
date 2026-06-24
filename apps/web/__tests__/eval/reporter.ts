import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import type { JudgeResult } from "@/__tests__/eval/judge";
import { subscribeToAiUsage, type AiUsageEvent } from "@/utils/usage";

export interface EvalRecord {
  actual?: string;
  cached?: boolean;
  cacheKey?: string;
  criteria?: JudgeResult[];
  durationMs?: number;
  expected?: string;
  model: string;
  pass: boolean;
  testName: string;
}

export interface EvalReporterOptions {
  evalName?: string;
}

export interface CachedEvalOptions {
  cacheKeyParts?: unknown[];
  cacheVersion?: string;
  evalName?: string;
  model: string;
  testName: string;
}

interface CachedEvalFile {
  cacheKey: string;
  createdAt: string;
  record: EvalRecord;
  schemaVersion: 1;
}

// `recordCached` always sets `model` and `testName` from its options, so the
// callback only returns the parts that vary per run.
type EvalRunResult = Omit<EvalRecord, "model" | "testName">;

const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const numberFormatter = new Intl.NumberFormat("en-US");

class EvalReporter {
  private readonly records: EvalRecord[] = [];
  private readonly usageEvents: AiUsageEvent[] = [];
  private readonly evalName: string | undefined;
  private unsubscribeFromUsage: (() => void) | undefined;

  constructor(options: EvalReporterOptions = {}) {
    this.evalName = options.evalName;
    this.unsubscribeFromUsage = subscribeToAiUsage((event) => {
      this.usageEvents.push(event);
    });
  }

  record(result: EvalRecord): void {
    this.records.push(result);
  }

  async recordCached(
    options: CachedEvalOptions,
    run: () => Promise<EvalRunResult>,
  ): Promise<EvalRecord> {
    const cacheMode = getEvalResultCacheMode();
    const cacheKey = buildEvalCacheKey({
      cacheKeyParts: options.cacheKeyParts ?? [],
      cacheVersion: options.cacheVersion,
      evalName: options.evalName ?? this.evalName,
      model: options.model,
      testName: options.testName,
    });
    const cachePath = getEvalResultCachePath(cacheKey);

    if (cacheMode !== "off" && cacheMode !== "refresh") {
      const cachedRecord = readCachedEvalRecord(cachePath);
      if (cachedRecord) {
        const record = {
          ...cachedRecord,
          cached: true,
          cacheKey,
        };
        this.record(record);
        return record;
      }

      if (cacheMode === "readonly") {
        throw new Error(
          `Eval result cache miss for ${options.testName} (${options.model})`,
        );
      }
    }

    const record = {
      ...(await run()),
      cacheKey,
      cached: false,
      model: options.model,
      testName: options.testName,
    };
    this.record(record);

    if (cacheMode === "readwrite" || cacheMode === "refresh") {
      writeCachedEvalRecord(cachePath, cacheKey, record);
    }

    return record;
  }

  printReport(): void {
    try {
      if (this.records.length === 0) return;

      const reportParts = [
        this.generateConsoleReport(),
        this.generateCacheConsoleReport(),
        this.generateCostConsoleReport(),
      ].filter((part): part is string => Boolean(part));

      console.log(`\n${reportParts.join("\n\n")}`);

      if (process.env.EVAL_REPORT_PATH) {
        this.writeReport(resolveEvalReportPath(process.env.EVAL_REPORT_PATH));
      }

      this.writeHistoryReport();
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

  private writeHistoryReport(): void {
    const historyDir = getEvalHistoryDir();
    if (!historyDir) return;

    const evalName = slugify(this.evalName ?? "eval-run");
    const outDir = path.join(historyDir, evalName);
    fs.mkdirSync(outDir, { recursive: true });

    const createdAt = new Date().toISOString();
    const fileName = `${createdAt.replace(/[:.]/g, "-")}--${process.pid}.json`;
    fs.writeFileSync(
      path.join(outDir, fileName),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          evalName: this.evalName ?? null,
          createdAt,
          cacheMode: getEvalResultCacheMode(),
          gitHead: readGitOutput(findWorkspaceRoot(process.cwd()), [
            "rev-parse",
            "HEAD",
          ]),
          records: this.records,
          usage: summarizeUsageEvents(this.usageEvents),
        },
        null,
        2,
      )}\n`,
    );
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

  private generateCacheConsoleReport(): string | null {
    const cached = this.records.filter((record) => record.cached).length;
    if (cached === 0) return null;

    const total = this.records.length;
    return [
      bold("Eval Cache"),
      "",
      `  Cached records: ${cached}/${total}`,
    ].join("\n");
  }

  private generateSingleModelConsole(model: string, tests: string[]): string {
    const lines = [bold(`Eval Results: ${model}`), ""];

    for (const testName of tests) {
      const record = this.records.find(
        (r) => r.testName === testName && r.model === model,
      );
      const status = record?.pass ? green("PASS") : red("FAIL");
      const cacheDetail = record?.cached ? dim(" (cached)") : "";
      const detail =
        !record?.pass && record?.actual ? dim(` (got: ${record.actual})`) : "";
      lines.push(`  ${status}  ${testName}${cacheDetail}${detail}`);
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
        const cached = record?.cached ? " (cached)" : "";
        if (record?.pass) return pad(green(`PASS${cached}`), colWidth + 9);
        const actual = record?.actual
          ? red(`FAIL${cached} (${record.actual})`)
          : red(`FAIL${cached}`);
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
    const cacheMarkdown = this.generateCacheMarkdown();
    const costMarkdown = this.generateCostMarkdown();
    const extraMarkdown = [cacheMarkdown, costMarkdown].filter(
      (part): part is string => Boolean(part),
    );
    if (extraMarkdown.length === 0) return resultMarkdown;

    return `${resultMarkdown}\n\n${extraMarkdown.join("\n\n")}`;
  }

  private generateCacheMarkdown(): string | null {
    const cached = this.records.filter((record) => record.cached).length;
    if (cached === 0) return null;

    return [
      "## Eval Cache",
      "",
      `Cached records: ${cached}/${this.records.length}`,
    ].join("\n");
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
      const result = `${record?.pass ? "PASS" : "FAIL"}${record?.cached ? " (cached)" : ""}`;
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
        const cached = record?.cached ? " (cached)" : "";
        if (record?.pass) return `PASS${cached}`;
        return record?.actual
          ? `FAIL${cached} (${record.actual})`
          : `FAIL${cached}`;
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

export function createEvalReporter(
  options: EvalReporterOptions = {},
): EvalReporter {
  return new EvalReporter(options);
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

type EvalResultCacheMode = "off" | "readonly" | "readwrite" | "refresh";

function getEvalResultCacheMode(): EvalResultCacheMode {
  const value = process.env.EVAL_RESULT_CACHE;
  if (value === "readonly" || value === "readwrite" || value === "refresh") {
    return value;
  }
  return "off";
}

function getEvalHistoryDir(): string | null {
  if (process.env.EVAL_HISTORY_DIR === "off") return null;
  if (process.env.EVAL_HISTORY_DIR) {
    return resolveEvalReportPath(process.env.EVAL_HISTORY_DIR);
  }
  if (process.env.RUN_AI_TESTS === "true") {
    return resolveEvalReportPath(".context/eval-results");
  }
  return null;
}

function getEvalResultCachePath(cacheKey: string): string {
  const cacheDir = resolveEvalReportPath(
    process.env.EVAL_RESULT_CACHE_DIR ?? ".context/eval-result-cache",
  );
  return path.join(cacheDir, `${cacheKey}.json`);
}

function readCachedEvalRecord(filePath: string): EvalRecord | null {
  try {
    const file = JSON.parse(
      fs.readFileSync(filePath, "utf8"),
    ) as Partial<CachedEvalFile>;
    if (file.schemaVersion !== 1 || !file.record) return null;
    return file.record;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }
    throw error;
  }
}

function writeCachedEvalRecord(
  filePath: string,
  cacheKey: string,
  record: EvalRecord,
): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(
    tempPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        cacheKey,
        createdAt: new Date().toISOString(),
        record,
      } satisfies CachedEvalFile,
      null,
      2,
    )}\n`,
  );
  fs.renameSync(tempPath, filePath);
}

function buildEvalCacheKey({
  cacheKeyParts,
  cacheVersion,
  evalName,
  model,
  testName,
}: {
  cacheKeyParts: unknown[];
  cacheVersion?: string;
  evalName?: string;
  model: string;
  testName: string;
}): string {
  return hashJson({
    schemaVersion: 1,
    cacheVersion: cacheVersion ?? "1",
    evalName: evalName ?? null,
    testName,
    model,
    cacheKeyParts,
    git: getGitFingerprint(),
  });
}

function getGitFingerprint(): { diffHash: string | null; head: string | null } {
  const repoRoot = findWorkspaceRoot(process.cwd());
  return {
    head: readGitOutput(repoRoot, ["rev-parse", "HEAD"]),
    diffHash: hashString(readGitOutput(repoRoot, ["diff", "--no-ext-diff"])),
  };
}

function readGitOutput(cwd: string, args: string[]): string | null {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function hashJson(value: unknown): string {
  return hashString(stableStringify(value));
}

function hashString(value: string | null): string | null {
  if (value == null) return null;
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  return `{${Object.entries(value)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(",")}}`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
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
