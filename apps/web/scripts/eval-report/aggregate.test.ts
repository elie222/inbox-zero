import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  aggregateDashboardData,
  loadHistoryEntries,
  type HistoryEntry,
  type HistoryFile,
} from "./aggregate";

const GENERATED_AT = "2026-06-11T12:00:00.000Z";

describe("loadHistoryEntries", () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  });

  it("returns no entries when the history dir does not exist", () => {
    const { entries, warnings } = loadHistoryEntries("/nonexistent/history");
    expect(entries).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it("loads valid files and reports unreadable or unsupported ones", () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "eval-report-"));
    const suiteDir = path.join(tempDir, "draft-reply");
    fs.mkdirSync(suiteDir);
    fs.writeFileSync(
      path.join(suiteDir, "a.json"),
      JSON.stringify(historyFile({ createdAt: "2026-06-01T00:00:00.000Z" })),
    );
    fs.writeFileSync(path.join(suiteDir, "b.json"), "{not json");
    fs.writeFileSync(
      path.join(suiteDir, "c.json"),
      JSON.stringify({ schemaVersion: 99, records: [] }),
    );

    const { entries, warnings } = loadHistoryEntries(tempDir);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      suite: "draft-reply",
      fileName: "a.json",
    });
    expect(warnings).toEqual([
      "Skipped draft-reply/b.json: unreadable JSON",
      "Skipped draft-reply/c.json: unsupported format",
    ]);
  });
});

describe("aggregateDashboardData", () => {
  it("keeps the latest record per test and model across runs", () => {
    const data = aggregate([
      entry("choose-rule", "2026-06-01T00:00:00.000Z", [
        record({ testName: "newsletter", model: "Opus 4.8", pass: false }),
        record({ testName: "receipt", model: "Opus 4.8", pass: true }),
      ]),
      // Later filtered run only re-ran one test; the other must survive.
      entry("choose-rule", "2026-06-02T00:00:00.000Z", [
        record({ testName: "newsletter", model: "Opus 4.8", pass: true }),
      ]),
    ]);

    const suite = data.suites[0];
    expect(suite.latestTests).toHaveLength(2);
    expect(suite.latestTests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          testName: "newsletter",
          pass: true,
          createdAt: "2026-06-02T00:00:00.000Z",
        }),
        expect.objectContaining({
          testName: "receipt",
          pass: true,
          createdAt: "2026-06-01T00:00:00.000Z",
        }),
      ]),
    );
  });

  it("ranks the leaderboard by pass rate from latest results", () => {
    const data = aggregate([
      entry("choose-rule", "2026-06-01T00:00:00.000Z", [
        record({ testName: "a", model: "Opus 4.8", pass: true }),
        record({ testName: "b", model: "Opus 4.8", pass: true }),
        record({ testName: "a", model: "Kimi K2.5", pass: true }),
        record({ testName: "b", model: "Kimi K2.5", pass: false }),
      ]),
      entry("draft-reply", "2026-06-03T00:00:00.000Z", [
        record({
          testName: "c",
          model: "Opus 4.8",
          pass: true,
          durationMs: 100,
        }),
      ]),
    ]);

    expect(data.models).toEqual(["Kimi K2.5", "Opus 4.8"]);
    expect(data.leaderboard).toEqual([
      expect.objectContaining({
        model: "Opus 4.8",
        passed: 3,
        total: 3,
        suiteCount: 2,
        avgDurationMs: 100,
        lastRunAt: "2026-06-03T00:00:00.000Z",
      }),
      expect.objectContaining({
        model: "Kimi K2.5",
        passed: 1,
        total: 2,
        suiteCount: 1,
      }),
    ]);
  });

  it("summarizes per-run model stats for trends", () => {
    const data = aggregate([
      entry("choose-rule", "2026-06-01T00:00:00.000Z", [
        record({ testName: "a", model: "Opus 4.8", pass: true }),
        record({ testName: "b", model: "Opus 4.8", pass: false }),
      ]),
    ]);

    expect(data.suites[0].runs).toEqual([
      expect.objectContaining({
        createdAt: "2026-06-01T00:00:00.000Z",
        perModel: [{ model: "Opus 4.8", passed: 1, total: 2 }],
      }),
    ]);
  });

  it("aggregates spend across runs including optional reported cost", () => {
    const usageModel = {
      provider: "openrouter",
      model: "anthropic/claude-opus-4.8",
      calls: 2,
      estimatedCost: 0.01,
      inputTokens: 800,
      outputTokens: 200,
      totalTokens: 1000,
    };
    const data = aggregate([
      entry("choose-rule", "2026-06-01T00:00:00.000Z", [record({})], {
        calls: 2,
        estimatedCost: 0.01,
        inputTokens: 800,
        outputTokens: 200,
        totalTokens: 1000,
        models: [usageModel],
      }),
      entry("choose-rule", "2026-06-02T00:00:00.000Z", [record({})], {
        calls: 1,
        estimatedCost: 0.02,
        providerReportedCost: 0.03,
        inputTokens: 500,
        outputTokens: 100,
        totalTokens: 600,
        models: [
          {
            ...usageModel,
            calls: 1,
            estimatedCost: 0.02,
            providerReportedCost: 0.03,
            totalTokens: 600,
          },
        ],
      }),
    ]);

    expect(data.cost).toMatchObject({
      totalCalls: 3,
      totalEstimatedCost: 0.03,
      totalReportedCost: 0.03,
      totalTokens: 1600,
    });
    expect(data.cost.byModel).toEqual([
      expect.objectContaining({
        key: "openrouter:anthropic/claude-opus-4.8",
        calls: 3,
        estimatedCost: 0.03,
        reportedCost: 0.03,
        totalTokens: 1600,
      }),
    ]);
  });

  it("truncates oversized output details", () => {
    const data = aggregate([
      entry("draft-reply", "2026-06-01T00:00:00.000Z", [
        record({ actual: "x".repeat(5000) }),
      ]),
    ]);

    const test = data.suites[0].latestTests[0];
    expect(test.actual).toHaveLength(1500 + "… [truncated]".length);
    expect(test.actual?.endsWith("… [truncated]")).toBe(true);
  });
});

function aggregate(entries: HistoryEntry[]) {
  return aggregateDashboardData({
    entries,
    generatedAt: GENERATED_AT,
    historyDir: ".context/eval-results",
  });
}

function entry(
  suite: string,
  createdAt: string,
  records: HistoryFile["records"],
  usage?: HistoryFile["usage"],
): HistoryEntry {
  return {
    suite,
    fileName: `${createdAt}.json`,
    file: historyFile({ createdAt, evalName: suite, records, usage }),
  };
}

function historyFile(overrides: Partial<HistoryFile>): HistoryFile {
  return {
    schemaVersion: 1,
    evalName: "example",
    createdAt: "2026-06-01T00:00:00.000Z",
    cacheMode: "off",
    gitHead: "abc1234567890",
    records: [record({})],
    ...overrides,
  };
}

function record(
  overrides: Partial<HistoryFile["records"][number]>,
): HistoryFile["records"][number] {
  return {
    testName: "example case",
    model: "Opus 4.8",
    pass: true,
    ...overrides,
  };
}
