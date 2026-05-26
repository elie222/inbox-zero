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

  afterEach(() => {
    process.chdir(originalCwd);

    if (originalEvalReportPath === undefined) {
      delete process.env.EVAL_REPORT_PATH;
    } else {
      process.env.EVAL_REPORT_PATH = originalEvalReportPath;
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
