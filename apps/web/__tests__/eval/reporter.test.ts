import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEvalReporter } from "@/__tests__/eval/reporter";

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
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "eval-reporter-"));
    const workspaceRoot = path.join(tempRoot, "workspace");
    const packageDir = path.join(workspaceRoot, "apps", "web");

    fs.mkdirSync(packageDir, { recursive: true });
    fs.writeFileSync(
      path.join(workspaceRoot, "pnpm-workspace.yaml"),
      "packages:",
    );

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
});
