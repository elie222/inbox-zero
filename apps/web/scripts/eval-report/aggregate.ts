import * as fs from "node:fs";
import * as path from "node:path";

// Mirrors the history files written by __tests__/eval/reporter.ts
// (writeHistoryReport). Kept structurally typed so older history files with
// missing fields still load.
export interface HistoryJudgeResult {
  criterion: string;
  pass: boolean;
  reasoning: string;
}

export interface HistoryRecord {
  actual?: string;
  cached?: boolean;
  criteria?: HistoryJudgeResult[];
  durationMs?: number;
  expected?: string;
  model: string;
  pass: boolean;
  testName: string;
}

export interface HistoryUsageModel {
  calls: number;
  estimatedCost: number;
  inputTokens: number;
  model: string;
  outputTokens: number;
  provider: string;
  providerReportedCost?: number;
  totalTokens: number;
}

export interface HistoryUsage {
  calls: number;
  estimatedCost: number;
  inputTokens: number;
  models: HistoryUsageModel[];
  outputTokens: number;
  providerReportedCost?: number;
  totalTokens: number;
}

export interface HistoryFile {
  cacheMode?: string;
  createdAt: string;
  evalName: string | null;
  gitHead?: string | null;
  records: HistoryRecord[];
  schemaVersion: number;
  usage?: HistoryUsage;
}

export interface HistoryEntry {
  file: HistoryFile;
  fileName: string;
  suite: string;
}

export interface SuiteRun {
  cacheMode?: string;
  createdAt: string;
  estimatedCost: number | null;
  gitHead: string | null;
  perModel: { model: string; passed: number; total: number }[];
}

export interface LatestTest {
  actual?: string;
  cached?: boolean;
  createdAt: string;
  criteria?: HistoryJudgeResult[];
  durationMs?: number;
  expected?: string;
  gitHead: string | null;
  model: string;
  pass: boolean;
  testName: string;
}

export interface SuiteData {
  latestTests: LatestTest[];
  name: string;
  runs: SuiteRun[];
}

export interface LeaderboardRow {
  avgDurationMs: number | null;
  lastRunAt: string;
  model: string;
  passed: number;
  suiteCount: number;
  total: number;
}

export interface CostModelRow {
  calls: number;
  estimatedCost: number;
  key: string;
  reportedCost: number | null;
  totalTokens: number;
}

export interface CostData {
  byModel: CostModelRow[];
  totalCalls: number;
  totalEstimatedCost: number;
  totalReportedCost: number | null;
  totalTokens: number;
}

export interface DashboardView {
  cost: CostData;
  gitHead: string | null;
  key: string;
  label: string;
  lastRunAt: string;
  leaderboard: LeaderboardRow[];
  models: string[];
  runCount: number;
  suites: SuiteData[];
}

export interface DashboardData {
  defaultViewKey: string;
  generatedAt: string;
  historyDir: string;
  views: DashboardView[];
  warnings: string[];
}

const MAX_DETAIL_LENGTH = 1500;

export function loadHistoryEntries(historyDir: string): {
  entries: HistoryEntry[];
  warnings: string[];
} {
  const entries: HistoryEntry[] = [];
  const warnings: string[] = [];

  if (!fs.existsSync(historyDir)) {
    return { entries, warnings };
  }

  for (const suiteDir of fs.readdirSync(historyDir).sort()) {
    const suitePath = path.join(historyDir, suiteDir);
    if (!fs.statSync(suitePath).isDirectory()) continue;

    for (const fileName of fs.readdirSync(suitePath).sort()) {
      if (!fileName.endsWith(".json")) continue;

      try {
        const parsed = JSON.parse(
          fs.readFileSync(path.join(suitePath, fileName), "utf8"),
        ) as Partial<HistoryFile>;
        if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.records)) {
          warnings.push(`Skipped ${suiteDir}/${fileName}: unsupported format`);
          continue;
        }
        entries.push({
          suite: suiteDir,
          fileName,
          file: {
            ...parsed,
            createdAt: parsed.createdAt ?? "",
            evalName: parsed.evalName ?? null,
            records: parsed.records,
            schemaVersion: 1,
          },
        });
      } catch {
        warnings.push(`Skipped ${suiteDir}/${fileName}: unreadable JSON`);
      }
    }
  }

  return { entries, warnings };
}

export function aggregateDashboardData({
  entries,
  generatedAt,
  historyDir,
  warnings = [],
}: {
  entries: HistoryEntry[];
  generatedAt: string;
  historyDir: string;
  warnings?: string[];
}): DashboardData {
  const viewKeys = listViewKeys(entries);
  const views =
    viewKeys.length > 0
      ? viewKeys.map((key) => buildDashboardView(entries, key))
      : [buildDashboardView(entries, "all")];

  return {
    generatedAt,
    historyDir,
    defaultViewKey: pickDefaultViewKey(entries, viewKeys),
    views,
    warnings,
  };
}

/** View keys: a git sha, or "all" for cross-commit latest-wins. */
export function listViewKeys(entries: HistoryEntry[]): string[] {
  const keys = new Set<string>();
  for (const entry of entries) {
    keys.add(gitHeadToViewKey(entry.file.gitHead));
  }
  if (entries.length > 0) keys.add("all");
  return Array.from(keys).sort((a, b) => {
    if (a === "all") return 1;
    if (b === "all") return -1;
    return b.localeCompare(a);
  });
}

function pickDefaultViewKey(
  entries: HistoryEntry[],
  viewKeys: string[],
): string {
  const latestSha = entries
    .filter((entry) => entry.file.gitHead)
    .sort((a, b) => b.file.createdAt.localeCompare(a.file.createdAt))[0]
    ?.file.gitHead;

  if (latestSha) {
    const key = gitHeadToViewKey(latestSha);
    if (viewKeys.includes(key)) return key;
  }

  return viewKeys.includes("all") ? "all" : (viewKeys[0] ?? "all");
}

function buildDashboardView(
  entries: HistoryEntry[],
  viewKey: string,
): DashboardView {
  const filtered =
    viewKey === "all"
      ? entries
      : entries.filter(
          (entry) => gitHeadToViewKey(entry.file.gitHead) === viewKey,
        );

  const suiteNames = Array.from(new Set(filtered.map((e) => e.suite))).sort();
  const suites = suiteNames.map((name) =>
    buildSuiteData(
      name,
      filtered.filter((e) => e.suite === name),
    ),
  );

  const lastRunAt =
    filtered
      .map((entry) => entry.file.createdAt)
      .sort()
      .at(-1) ?? "";

  return {
    key: viewKey,
    label: viewKeyLabel(viewKey),
    gitHead: viewKey === "all" || viewKey === "legacy" ? null : viewKey,
    lastRunAt,
    runCount: filtered.length,
    models: collectModels(suites),
    suites,
    leaderboard: buildLeaderboard(suites),
    cost: buildCostData(filtered),
  };
}

function gitHeadToViewKey(gitHead: string | null | undefined): string {
  return gitHead?.trim() || "legacy";
}

function viewKeyLabel(viewKey: string): string {
  if (viewKey === "all") return "All commits (mixed)";
  if (viewKey === "legacy") return "Legacy (no commit)";
  return viewKey.slice(0, 7);
}

function buildSuiteData(name: string, entries: HistoryEntry[]): SuiteData {
  const sorted = [...entries].sort((a, b) =>
    a.file.createdAt.localeCompare(b.file.createdAt),
  );

  const runs = sorted.map((entry) => buildSuiteRun(entry.file));

  // Latest record wins per (test, model). Runs are processed oldest-first so
  // a later run (even a filtered subset) overrides only the tests it ran.
  const latestByKey = new Map<string, LatestTest>();
  for (const entry of sorted) {
    for (const record of entry.file.records) {
      latestByKey.set(JSON.stringify([record.testName, record.model]), {
        testName: record.testName,
        model: record.model,
        pass: record.pass,
        cached: record.cached,
        durationMs: record.durationMs,
        actual: truncateDetail(record.actual),
        expected: truncateDetail(record.expected),
        criteria: record.criteria?.map((criterion) => ({
          ...criterion,
          reasoning: truncateDetail(criterion.reasoning) ?? "",
        })),
        createdAt: entry.file.createdAt,
        gitHead: entry.file.gitHead ?? null,
      });
    }
  }

  const latestTests = Array.from(latestByKey.values()).sort(
    (a, b) =>
      a.testName.localeCompare(b.testName) || a.model.localeCompare(b.model),
  );

  return { name, runs, latestTests };
}

function buildSuiteRun(file: HistoryFile): SuiteRun {
  const perModelMap = new Map<string, { passed: number; total: number }>();
  for (const record of file.records) {
    const stats = perModelMap.get(record.model) ?? { passed: 0, total: 0 };
    stats.total += 1;
    if (record.pass) stats.passed += 1;
    perModelMap.set(record.model, stats);
  }

  return {
    createdAt: file.createdAt,
    cacheMode: file.cacheMode,
    gitHead: file.gitHead ?? null,
    estimatedCost: file.usage ? file.usage.estimatedCost : null,
    perModel: Array.from(perModelMap.entries())
      .map(([model, stats]) => ({ model, ...stats }))
      .sort((a, b) => a.model.localeCompare(b.model)),
  };
}

function collectModels(suites: SuiteData[]): string[] {
  const models = new Set<string>();
  for (const suite of suites) {
    for (const test of suite.latestTests) {
      models.add(test.model);
    }
  }
  return Array.from(models).sort();
}

function buildLeaderboard(suites: SuiteData[]): LeaderboardRow[] {
  const rows = new Map<
    string,
    LeaderboardRow & { durationTotal: number; durationCount: number }
  >();

  for (const suite of suites) {
    const suiteModels = new Set<string>();
    for (const test of suite.latestTests) {
      const row = rows.get(test.model) ?? {
        model: test.model,
        passed: 0,
        total: 0,
        suiteCount: 0,
        avgDurationMs: null,
        lastRunAt: "",
        durationTotal: 0,
        durationCount: 0,
      };
      row.total += 1;
      if (test.pass) row.passed += 1;
      if (typeof test.durationMs === "number") {
        row.durationTotal += test.durationMs;
        row.durationCount += 1;
      }
      if (test.createdAt > row.lastRunAt) row.lastRunAt = test.createdAt;
      if (!suiteModels.has(test.model)) {
        suiteModels.add(test.model);
        row.suiteCount += 1;
      }
      rows.set(test.model, row);
    }
  }

  return Array.from(rows.values())
    .map(({ durationTotal, durationCount, ...row }) => ({
      ...row,
      avgDurationMs:
        durationCount > 0 ? Math.round(durationTotal / durationCount) : null,
    }))
    .sort(
      (a, b) =>
        b.passed / b.total - a.passed / a.total ||
        b.total - a.total ||
        a.model.localeCompare(b.model),
    );
}

function buildCostData(entries: HistoryEntry[]): CostData {
  const totals = {
    totalCalls: 0,
    totalEstimatedCost: 0,
    totalReportedCost: null as number | null,
    totalTokens: 0,
  };
  const byModel = new Map<string, CostModelRow>();

  for (const entry of entries) {
    const usage = entry.file.usage;
    if (!usage) continue;

    totals.totalCalls += usage.calls;
    totals.totalEstimatedCost += usage.estimatedCost;
    totals.totalTokens += usage.totalTokens;
    if (usage.providerReportedCost !== undefined) {
      totals.totalReportedCost =
        (totals.totalReportedCost ?? 0) + usage.providerReportedCost;
    }

    for (const model of usage.models ?? []) {
      const key = `${model.provider}:${model.model}`;
      const row = byModel.get(key) ?? {
        key,
        calls: 0,
        estimatedCost: 0,
        reportedCost: null,
        totalTokens: 0,
      };
      row.calls += model.calls;
      row.estimatedCost += model.estimatedCost;
      row.totalTokens += model.totalTokens;
      if (model.providerReportedCost !== undefined) {
        row.reportedCost = (row.reportedCost ?? 0) + model.providerReportedCost;
      }
      byModel.set(key, row);
    }
  }

  return {
    ...totals,
    byModel: Array.from(byModel.values()).sort(
      (a, b) => b.estimatedCost - a.estimatedCost,
    ),
  };
}

function truncateDetail(value: string | undefined): string | undefined {
  if (value === undefined) return;
  if (value.length <= MAX_DETAIL_LENGTH) return value;
  return `${value.slice(0, MAX_DETAIL_LENGTH)}… [truncated]`;
}
