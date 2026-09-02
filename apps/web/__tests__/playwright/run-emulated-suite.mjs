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
const requestedTargets = getRequestedPlaywrightTargets(process.argv.slice(2));
const changedSelection = requestedTargets.length
  ? undefined
  : selectChangedPlaywrightTargets(
      process.env.PLAYWRIGHT_CHANGED_FILES,
      process.cwd(),
    );
const changedTargetFiles = changedSelection?.targetFiles ?? [];
const targets = requestedTargets.length
  ? requestedTargets
  : changedSelection?.runFullSuite
    ? getFullSuiteTargets()
    : getChangedPlaywrightTargets(changedTargetFiles);
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

if (requestedTargets.length) {
  console.log(`Running ${targets.length} requested Playwright target(s).`);
} else {
  console.log(changedSelection.reason);
  console.log(`Running ${targets.length} Playwright target(s).`);
}

if (!dryRun && !targets.length) {
  writeFileSync(
    path.join(testResultsDir, "selection.json"),
    `${JSON.stringify({ reason: changedSelection.reason }, null, 2)}\n`,
  );
}

for (const target of targets) {
  console.log(`\n=== Running Playwright target: ${target.name} ===\n`);
  const targetRunId = dryRun
    ? `dry-run-${target.name}`
    : `${process.pid}-${target.name}-${Date.now()}`;
  const targetRunDir = path.join(playwrightRunRootDir, targetRunId);
  let result;

  try {
    result = runPlaywright(
      [
        "test",
        "-c",
        "playwright.config.mjs",
        "--project=emulated",
        ...target.paths,
      ],
      {
        PLAYWRIGHT_BLOB_REPORT_FILE: path.join(
          blobReportDir,
          `${target.name}.zip`,
        ),
        PLAYWRIGHT_OUTPUT_DIR: path.join(testResultsDir, target.name),
        PLAYWRIGHT_RUN_ID: targetRunId,
        ...(target.paths.some(isIntegrationsTarget)
          ? { NEXT_PUBLIC_INTEGRATIONS_ENABLED: "true" }
          : {}),
        ...(target.paths.some(isAutomationTarget)
          ? {
              NEXT_PUBLIC_INTEGRATIONS_ENABLED: "true",
              NEXT_PUBLIC_INTEGRATION_ACTION_ENABLED: "true",
              PLAYWRIGHT_TODOIST_ENABLED: "true",
            }
          : {}),
        ...(target.paths.some(isSettingsTarget)
          ? { NEXT_PUBLIC_EXTERNAL_API_ENABLED: "true" }
          : {}),
      },
    );
  } finally {
    if (!dryRun) rmSync(targetRunDir, { force: true, recursive: true });
  }

  if (result.status !== 0) failed = true;
}

if (!dryRun && targets.length) {
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

function getRequestedPlaywrightTargets(args) {
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

      return {
        name: normalizedArgument.replaceAll(/[/.]/g, "-"),
        paths: [targetPath],
      };
    });
}

function getFullSuiteTargets() {
  return fullSuites.map((suite) => ({
    name: suite.replaceAll(/[/.]/g, "-"),
    paths: [`__tests__/playwright/emulated/${suite}`],
  }));
}

function getChangedPlaywrightTargets(files) {
  const filesByBoundary = new Map();

  for (const file of files) {
    const boundary = getChangedFileBoundary(file);
    const existingFiles = filesByBoundary.get(boundary) ?? [];
    existingFiles.push(file);
    filesByBoundary.set(boundary, existingFiles);
  }

  const knownBoundaries = new Set(fullSuites);
  const orderedTargets = fullSuites
    .map((suite) => {
      const filesForSuite = filesByBoundary.get(suite);
      if (!filesForSuite?.length) return;
      const suitePath = getPlaywrightTargetPath(suite);

      return {
        name: suite.replaceAll(/[/.]/g, "-"),
        paths: filesForSuite.includes(suitePath) ? [suitePath] : filesForSuite,
      };
    })
    .filter(Boolean);

  const extraTargets = [...filesByBoundary.entries()]
    .filter(([boundary]) => !knownBoundaries.has(boundary))
    .map(([boundary, filesForBoundary]) => ({
      name: boundary.replaceAll(/[/.]/g, "-"),
      paths: filesForBoundary.includes(getPlaywrightTargetPath(boundary))
        ? [getPlaywrightTargetPath(boundary)]
        : filesForBoundary,
    }));

  return [...orderedTargets, ...extraTargets];
}

function getChangedFileBoundary(file) {
  const relativePath = file.replace(/^__tests__\/playwright\/emulated\//, "");

  if (relativePath.startsWith("cleanup/")) return relativePath;

  return relativePath.split("/")[0];
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
  return /\/integrations(?:\/|$)/.test(targetPath);
}

function isAutomationTarget(targetPath) {
  return /[\\/]automation(?:[\\/]|$)/.test(targetPath);
}

function isSettingsTarget(targetPath) {
  return /[\\/]settings(?:[\\/]|$)/.test(targetPath);
}
