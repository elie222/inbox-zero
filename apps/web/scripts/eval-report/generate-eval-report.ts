// Builds a self-contained HTML dashboard from eval run history.
// Run with: `pnpm --filter inbox-zero-ai eval-report` (add `-- --open` to launch it)
import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { parseArgs } from "node:util";
import { aggregateDashboardData, loadHistoryEntries } from "./aggregate";
import { renderDashboardHtml } from "./render-html";

async function main() {
  const { values } = parseArgs({
    options: {
      "history-dir": { type: "string" },
      out: { type: "string" },
      open: { type: "boolean", default: false },
    },
  });

  const workspaceRoot = findWorkspaceRoot(process.cwd());
  const historyDir = resolvePath(
    workspaceRoot,
    values["history-dir"] ??
      process.env.EVAL_HISTORY_DIR ??
      ".context/eval-results",
  );
  const outPath = resolvePath(
    workspaceRoot,
    values.out ?? "eval-results/eval-dashboard.html",
  );

  const { entries, warnings } = loadHistoryEntries(historyDir);
  const data = aggregateDashboardData({
    entries,
    generatedAt: new Date().toISOString(),
    historyDir: path.relative(workspaceRoot, historyDir) || historyDir,
    warnings,
  });

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, renderDashboardHtml(data));

  if (entries.length === 0) {
    console.log(`No eval history found in ${historyDir}.`);
    console.log(
      "Run evals first, e.g.: EVAL_RESULT_CACHE=readwrite pnpm test-ai eval/your-feature",
    );
  }
  for (const warning of warnings) {
    console.warn(`Warning: ${warning}`);
  }
  console.log(
    `Eval dashboard written to ${outPath} (${entries.length} runs, ${data.suites.length} suites, ${data.models.length} models).`,
  );

  if (values.open) {
    const opener = process.platform === "darwin" ? "open" : "xdg-open";
    execFile(opener, [outPath]);
  }
}

function resolvePath(workspaceRoot: string, filePath: string): string {
  return path.isAbsolute(filePath)
    ? filePath
    : path.join(workspaceRoot, filePath);
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

main();
