import fs from "node:fs";
import path from "node:path";
import {
  renderPlaywrightDashboard,
  updatePlaywrightHistory,
} from "./playwright-report-dashboard";

const [historyPath, dashboardPath] = process.argv.slice(2);

if (!historyPath || !dashboardPath) {
  throw new Error(
    "Usage: generate-playwright-report-dashboard <history-path> <dashboard-path>",
  );
}

const existingHistory = readHistory(historyPath);
const history = updatePlaywrightHistory(existingHistory, {
  attempt: getRequiredNumber("PLAYWRIGHT_RUN_ATTEMPT"),
  branch: getRequiredEnvironmentVariable("PLAYWRIGHT_BRANCH"),
  createdAt: new Date().toISOString(),
  event: getRequiredEnvironmentVariable("PLAYWRIGHT_EVENT"),
  id: getRequiredEnvironmentVariable("PLAYWRIGHT_RUN_ID"),
  reportUrl: getRequiredEnvironmentVariable("PLAYWRIGHT_REPORT_URL"),
  result: getRequiredEnvironmentVariable("PLAYWRIGHT_RESULT"),
  runNumber: getRequiredNumber("PLAYWRIGHT_RUN_NUMBER"),
  runUrl: getRequiredEnvironmentVariable("PLAYWRIGHT_RUN_URL"),
  sha: getRequiredEnvironmentVariable("PLAYWRIGHT_SHA"),
});

fs.mkdirSync(path.dirname(historyPath), { recursive: true });
fs.mkdirSync(path.dirname(dashboardPath), { recursive: true });
fs.writeFileSync(historyPath, `${JSON.stringify(history, null, 2)}\n`);
fs.writeFileSync(dashboardPath, renderPlaywrightDashboard(history));

console.log(`Playwright dashboard generated with ${history.length} runs.`);

function getRequiredEnvironmentVariable(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function getRequiredNumber(name: string): number {
  const value = Number(getRequiredEnvironmentVariable(name));
  if (!Number.isFinite(value)) throw new Error(`${name} must be a number`);
  return value;
}

function readHistory(filePath: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}
