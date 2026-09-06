import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import {
  fullSuites,
  selectChangedPlaywrightTargets,
} from "../../utils/playwright/emulated-suite-selection.mjs";
import { expandPlaywrightTargets } from "../../utils/playwright/emulated-suite-targets.mjs";
const listTargets = process.argv.includes("--list-targets");
const requestedPaths = getRequestedPlaywrightPaths(
  process.argv.slice(2).filter((argument) => argument !== "--list-targets"),
);
const changedSelection = requestedPaths.length
  ? undefined
  : selectChangedPlaywrightTargets(
      process.env.PLAYWRIGHT_CHANGED_FILES,
      process.cwd(),
    );
const selectedPaths = requestedPaths.length
  ? requestedPaths
  : changedSelection?.runFullSuite
    ? fullSuites.map(getPlaywrightTargetPath)
    : (changedSelection?.targetFiles ?? []);
const targets = expandPlaywrightTargets(selectedPaths, process.cwd());
if (listTargets) {
  await new Promise((resolve, reject) => {
    process.stdout.write(`${JSON.stringify(targets)}\n`, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
  process.exit(0);
}
const dryRun = process.env.PLAYWRIGHT_DRY_RUN === "1";
const playwrightRunRootDir = path.resolve(".tmp/playwright");
const blobReportDir = path.join(playwrightRunRootDir, "blob-report");
const htmlReportDir = path.resolve("playwright-report");
const testResultsDir = path.resolve("test-results");

if (!dryRun) {
  rmSync(blobReportDir, { force: true, recursive: true });
  rmSync(htmlReportDir, { force: true, recursive: true });
  rmSync(testResultsDir, { force: true, recursive: true });
  mkdirSync(blobReportDir, { recursive: true });
  mkdirSync(testResultsDir, { recursive: true });
}

let failed = false;
const timings = [];

if (requestedPaths.length) {
  console.log(`Running ${targets.length} requested Playwright target(s).`);
} else {
  console.log(changedSelection.reason);
  console.log(`Running ${targets.length} Playwright target(s).`);
}

if (!dryRun && !targets.length) {
  writeFileSync(
    path.join(testResultsDir, "selection.json"),
    `${JSON.stringify({ reason: changedSelection?.reason ?? "No browser specs selected." }, null, 2)}\n`,
  );
}

for (const target of targets) {
  console.log(`\n=== Running Playwright target: ${target.name} ===\n`);
  const targetRunId = dryRun
    ? `dry-run-${target.name}`
    : `${process.pid}-${target.name}-${Date.now()}`;
  const targetRunDir = path.join(playwrightRunRootDir, targetRunId);
  let result;
  const startedAt = Date.now();

  try {
    result = runPlaywright(
      [
        "test",
        "-c",
        "playwright.config.mjs",
        "--project=emulated",
        target.path,
      ],
      {
        PLAYWRIGHT_BLOB_REPORT_FILE: path.join(
          blobReportDir,
          `${target.name}.zip`,
        ),
        PLAYWRIGHT_OUTPUT_DIR: path.join(testResultsDir, target.name),
        PLAYWRIGHT_RUN_ID: targetRunId,
        ...(isIntegrationsTarget(target.path)
          ? { NEXT_PUBLIC_INTEGRATIONS_ENABLED: "true" }
          : {}),
        ...(isAutomationTarget(target.path)
          ? {
              NEXT_PUBLIC_INTEGRATIONS_ENABLED: "true",
              NEXT_PUBLIC_INTEGRATION_ACTION_ENABLED: "true",
              PLAYWRIGHT_TODOIST_ENABLED: "true",
            }
          : {}),
        ...(isSettingsTarget(target.path)
          ? { NEXT_PUBLIC_EXTERNAL_API_ENABLED: "true" }
          : {}),
      },
    );
  } finally {
    if (!dryRun) rmSync(targetRunDir, { force: true, recursive: true });
  }

  const seconds = Math.round((Date.now() - startedAt) / 1000);
  timings.push({ target: target.name, seconds, status: result.status });
  console.log(
    `Finished ${target.name} in ${seconds}s (exit ${result.status}).`,
  );
  if (!dryRun) {
    writeFileSync(
      path.join(testResultsDir, `timings-${target.name}.json`),
      JSON.stringify(timings, null, 2),
    );
  }
  if (result.status !== 0) failed = true;
}

if (!dryRun && targets.length && !process.env.PLAYWRIGHT_SKIP_REPORT_MERGE) {
  const mergeResult = runPlaywright(
    ["merge-reports", "--reporter=html", blobReportDir],
    { PLAYWRIGHT_HTML_OPEN: "never" },
  );

  if (mergeResult.status !== 0) failed = true;
}
process.exitCode = failed ? 1 : 0;

function runPlaywright(args, extraEnv) {
  const pnpmExecutable = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const pnpmArgs = ["exec", "playwright", ...args];
  const command = [pnpmExecutable, ...pnpmArgs];

  if (dryRun) {
    console.log(command.join(" "));
    if (Object.keys(extraEnv).length) {
      console.log(JSON.stringify(extraEnv, null, 2));
    }
    return { status: 0 };
  }

  const result = spawnSync(pnpmExecutable, pnpmArgs, {
    env: { ...process.env, ...extraEnv },
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  return result;
}

function getRequestedPlaywrightPaths(args) {
  return args
    .filter((argument) => argument !== "--")
    .map((argument) => {
      const normalizedArgument = argument
        .replace(/^\.\//, "")
        .replace(/^apps\/web\//, "")
        .replace(/\/$/, "");
      const targetPath = getPlaywrightTargetPath(normalizedArgument);
      const resolvedPath = path.resolve(targetPath);
      const emulatedTestsPath = path.resolve("__tests__/playwright/emulated");

      if (
        !resolvedPath.startsWith(`${emulatedTestsPath}${path.sep}`) ||
        !existsSync(resolvedPath) ||
        !isRequestedPlaywrightTarget(resolvedPath)
      ) {
        throw new Error(
          `Unknown emulated Playwright target: ${argument}. Use an area such as "mail" or a spec path relative to __tests__/playwright/emulated.`,
        );
      }

      return targetPath;
    });
}

function getPlaywrightTargetPath(target) {
  if (target.startsWith("__tests__/playwright/")) return target;
  return `__tests__/playwright/emulated/${target}`;
}

function isRequestedPlaywrightTarget(targetPath) {
  const stats = statSync(targetPath);
  if (stats.isFile()) return isPlaywrightSpecFile(targetPath);
  if (!stats.isDirectory()) return false;

  return readdirSync(targetPath, { withFileTypes: true }).some((entry) => {
    const entryPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) return isRequestedPlaywrightTarget(entryPath);
    return entry.isFile() && isPlaywrightSpecFile(entry.name);
  });
}

function isPlaywrightSpecFile(file) {
  return /\.spec\.[cm]?[jt]sx?$/.test(file);
}

function isIntegrationsTarget(targetPath) {
  return /[\\\\/]integrations(?:[\\\\/]|$)/.test(targetPath);
}

function isAutomationTarget(targetPath) {
  return /[\\/]automation(?:[\\/]|$)/.test(targetPath);
}

function isSettingsTarget(targetPath) {
  return /[\\/]settings(?:[\\/]|$)/.test(targetPath);
}
