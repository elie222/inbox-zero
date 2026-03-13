import * as fs from "node:fs";
import * as path from "node:path";
import type { JudgeResult } from "@/__tests__/eval/judge";

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

class EvalReporter {
  private readonly records: EvalRecord[] = [];

  record(result: EvalRecord): void {
    this.records.push(result);
  }

  printReport(): void {
    if (this.records.length === 0) return;
    console.log(`\n${this.generateConsoleReport()}`);

    if (process.env.EVAL_REPORT_PATH) {
      this.writeReport(process.env.EVAL_REPORT_PATH);
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

    if (models.length <= 1) {
      return this.generateSingleModelMarkdown(models[0] ?? "Default", tests);
    }
    return this.generateComparisonMarkdown(models, tests);
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
