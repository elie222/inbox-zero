import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const suites = [
  "attachments",
  "automation",
  "calendars",
  "channels",
  "chat",
  "cleanup/analytics.spec.ts",
  "cleanup/bulk-archive.spec.ts",
  "cleanup/bulk-unsubscribe.spec.ts",
  "integrations",
  "mail",
  "meetings",
  "onboarding",
  "settings",
];
const blobReportDir = path.resolve(".tmp/playwright/blob-report");
const htmlReportDir = path.resolve("playwright-report");
const testResultsDir = path.resolve("test-results");

rmSync(blobReportDir, { force: true, recursive: true });
rmSync(htmlReportDir, { force: true, recursive: true });
rmSync(testResultsDir, { force: true, recursive: true });
mkdirSync(blobReportDir, { recursive: true });
mkdirSync(testResultsDir, { recursive: true });

let failed = false;

for (const suite of suites) {
  const suiteName = suite.replaceAll(/[/.]/g, "-");
  const result = runPlaywright(
    [
      "test",
      "-c",
      "playwright.config.mjs",
      "--project=emulated",
      `__tests__/playwright/emulated/${suite}`,
    ],
    {
      PLAYWRIGHT_BLOB_REPORT_FILE: path.join(blobReportDir, `${suiteName}.zip`),
      PLAYWRIGHT_OUTPUT_DIR: path.join(testResultsDir, suiteName),
      ...(suite === "integrations"
        ? { NEXT_PUBLIC_INTEGRATIONS_ENABLED: "true" }
        : {}),
    },
  );

  if (result.status !== 0) failed = true;
}

const mergeResult = runPlaywright(
  ["merge-reports", "--reporter=html", blobReportDir],
  { PLAYWRIGHT_HTML_OPEN: "never" },
);

if (mergeResult.status !== 0) failed = true;
process.exitCode = failed ? 1 : 0;

function runPlaywright(args, extraEnv) {
  const pnpmExecutable = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const result = spawnSync(pnpmExecutable, ["exec", "playwright", ...args], {
    env: { ...process.env, ...extraEnv },
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  return result;
}
