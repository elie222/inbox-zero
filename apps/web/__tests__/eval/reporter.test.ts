import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import { saveAiUsage } from "@/utils/usage";

vi.mock("@inboxzero/tinybird-ai-analytics", () => ({
  publishAiCall: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/utils/redis/usage", () => ({
  saveUsage: vi.fn().mockResolvedValue(undefined),
}));

describe("eval reporter", () => {
  const originalCwd = process.cwd();
  const originalEvalReportPath = process.env.EVAL_REPORT_PATH;
  const originalEvalHistoryDir = process.env.EVAL_HISTORY_DIR;
  const originalEvalResultCache = process.env.EVAL_RESULT_CACHE;
  const originalEvalResultCacheDir = process.env.EVAL_RESULT_CACHE_DIR;
  const originalRunAiTests = process.env.RUN_AI_TESTS;

  afterEach(() => {
    process.chdir(originalCwd);

    if (originalEvalReportPath === undefined) {
      delete process.env.EVAL_REPORT_PATH;
    } else {
      process.env.EVAL_REPORT_PATH = originalEvalReportPath;
    }

    if (originalEvalHistoryDir === undefined) {
      delete process.env.EVAL_HISTORY_DIR;
    } else {
      process.env.EVAL_HISTORY_DIR = originalEvalHistoryDir;
    }

    if (originalEvalResultCache === undefined) {
      delete process.env.EVAL_RESULT_CACHE;
    } else {
      process.env.EVAL_RESULT_CACHE = originalEvalResultCache;
    }

    if (originalEvalResultCacheDir === undefined) {
      delete process.env.EVAL_RESULT_CACHE_DIR;
    } else {
      process.env.EVAL_RESULT_CACHE_DIR = originalEvalResultCacheDir;
    }

    if (originalRunAiTests === undefined) {
      delete process.env.RUN_AI_TESTS;
    } else {
      process.env.RUN_AI_TESTS = originalRunAiTests;
    }

    vi.restoreAllMocks();
  });

  it("writes relative report paths from the workspace root", () => {
    const { workspaceRoot, packageDir } = createTempWorkspace();
    process.chdir(packageDir);
    process.env.EVAL_REPORT_PATH = ".context/evals/report.md";
    vi.spyOn(console, "log").mockImplementation(() => {});

    const reporter = createEvalReporter();
    reporter.record({
      testName: "example",
      model: "Gemini 3 Flash",
      pass: true,
    });

    reporter.printReport();

    expect(
      fs.existsSync(path.join(workspaceRoot, ".context", "evals", "report.md")),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(workspaceRoot, ".context", "evals", "report.json"),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(packageDir, ".context", "evals", "report.md")),
    ).toBe(false);
  });

  it("includes usage cost totals in the markdown report", async () => {
    const { workspaceRoot, packageDir } = createTempWorkspace();
    process.chdir(packageDir);
    process.env.EVAL_REPORT_PATH = ".context/evals/report.md";
    vi.spyOn(console, "log").mockImplementation(() => {});

    const reporter = createEvalReporter();
    await saveAiUsage({
      userId: "user-1",
      email: "user@example.com",
      emailAccountId: "email-account-1",
      provider: "openrouter",
      model: "deepseek/deepseek-v4-flash",
      usage: {
        inputTokens: 1000,
        outputTokens: 500,
        totalTokens: 1500,
      },
      label: "eval-test",
      providerReportedCost: 0.0002,
    });
    reporter.record({
      testName: "example",
      model: "DeepSeek V4 Flash",
      pass: true,
    });

    reporter.printReport();

    const markdown = fs.readFileSync(
      path.join(workspaceRoot, ".context", "evals", "report.md"),
      "utf8",
    );
    expect(markdown).toContain("## Eval Cost");
    expect(markdown).toContain("Provider-reported total: $0.000200");
    expect(markdown).toContain("openrouter:deepseek/deepseek-v4-flash");
  });

  it("writes eval history when AI tests are enabled", () => {
    const { workspaceRoot, packageDir } = createTempWorkspace();
    process.chdir(packageDir);
    process.env.RUN_AI_TESTS = "true";
    vi.spyOn(console, "log").mockImplementation(() => {});

    const reporter = createEvalReporter({ evalName: "example eval" });
    reporter.record({
      testName: "example case",
      model: "Gemini 3 Flash",
      pass: true,
    });

    reporter.printReport();

    const historyDir = path.join(
      workspaceRoot,
      ".context",
      "eval-results",
      "example-eval",
    );
    const historyFiles = fs.readdirSync(historyDir);
    expect(historyFiles).toHaveLength(1);

    const history = JSON.parse(
      fs.readFileSync(path.join(historyDir, historyFiles[0]!), "utf8"),
    );
    expect(history).toMatchObject({
      schemaVersion: 1,
      evalName: "example eval",
      records: [
        {
          testName: "example case",
          model: "Gemini 3 Flash",
          pass: true,
        },
      ],
    });
  });

  it("reuses cached eval records in readwrite mode", async () => {
    const { workspaceRoot, packageDir } = createTempWorkspace();
    process.chdir(packageDir);
    process.env.EVAL_RESULT_CACHE = "readwrite";
    process.env.EVAL_RESULT_CACHE_DIR = ".context/cache";
    process.env.EVAL_REPORT_PATH = ".context/evals/report.md";

    const firstRun = vi.fn().mockResolvedValue({
      testName: "example case",
      model: "Gemini 3 Flash",
      pass: true,
      actual: "live result",
    });
    const secondRun = vi.fn();
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});

    const firstReporter = createEvalReporter({ evalName: "example eval" });
    const firstRecord = await firstReporter.recordCached(
      {
        testName: "example case",
        model: "Gemini 3 Flash",
        cacheKeyParts: [{ input: "hello" }],
      },
      firstRun,
    );

    const secondReporter = createEvalReporter({ evalName: "example eval" });
    const secondRecord = await secondReporter.recordCached(
      {
        testName: "example case",
        model: "Gemini 3 Flash",
        cacheKeyParts: [{ input: "hello" }],
      },
      secondRun,
    );
    secondReporter.printReport();

    expect(firstRun).toHaveBeenCalledTimes(1);
    expect(secondRun).not.toHaveBeenCalled();
    expect(firstRecord).toMatchObject({
      actual: "live result",
      cached: false,
    });
    expect(secondRecord).toMatchObject({
      actual: "live result",
      cached: true,
    });
    expect(consoleLog.mock.calls.at(-1)?.[0]).toContain("Cached records: 1/1");

    const markdown = fs.readFileSync(
      path.join(workspaceRoot, ".context", "evals", "report.md"),
      "utf8",
    );
    expect(markdown).toContain("## Eval Cache");
    expect(markdown).toContain("Cached records: 1/1");
  });
});

function createTempWorkspace(): {
  packageDir: string;
  workspaceRoot: string;
} {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "eval-reporter-"));
  const workspaceRoot = path.join(tempRoot, "workspace");
  const packageDir = path.join(workspaceRoot, "apps", "web");

  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(
    path.join(workspaceRoot, "pnpm-workspace.yaml"),
    "packages:",
  );

  return { packageDir, workspaceRoot };
}
