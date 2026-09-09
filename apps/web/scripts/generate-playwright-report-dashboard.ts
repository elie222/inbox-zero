import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import {
  MAX_PNG_SCREENSHOT_BYTES,
  validatePngScreenshot,
} from "./png-validation";
import {
  compareScreenshotsWithBaseline,
  createScreenshotManifest,
  galleryFileName,
  isScreenshotManifest,
  type PlaywrightScreenshot,
  renderPlaywrightDashboard,
  renderScreenshotGallery,
  shouldPublishStableMainBaseline,
  updatePlaywrightHistory,
} from "./playwright-report-dashboard";
import { measureScreenshotDifference } from "./playwright-screenshot-diff";

const [
  historyPath,
  dashboardPath,
  testResultsPath,
  galleryPath,
  baselineManifestPath,
  baselineImagesPath,
] = process.argv.slice(2);
const MAX_SCREENSHOT_COUNT = 500;
const MAX_TOTAL_SCREENSHOT_BYTES = 100 * 1024 * 1024;
const MAX_ARTIFACT_ENTRIES = 2000;
const MAX_ARTIFACT_DEPTH = 12;

if (!historyPath || !dashboardPath || !testResultsPath || !galleryPath) {
  throw new Error(
    "Usage: generate-playwright-report-dashboard <history-path> <dashboard-path> <test-results-path> <gallery-path>",
  );
}

generateDashboard();

async function generateDashboard() {
  const collectedScreenshots = await collectScreenshots(
    testResultsPath,
    galleryPath,
  );
  const baseline = await readOptionalJson(baselineManifestPath);
  const comparison = compareScreenshotsWithBaseline(
    collectedScreenshots,
    baseline,
  );
  const screenshots = await measureDifferences(
    comparison.screenshots,
    baseline,
    galleryPath,
  );
  const createdAt = new Date().toISOString();
  const dashboardUrl = getRequiredEnvironmentVariable(
    "PLAYWRIGHT_DASHBOARD_URL",
  );
  const reportUrl = getOptionalHttpsEnvironmentVariable(
    "PLAYWRIGHT_REPORT_URL",
  );
  const screenshotsUrl = getRequiredEnvironmentVariable(
    "PLAYWRIGHT_SCREENSHOTS_URL",
  );
  const result = getRequiredEnvironmentVariable("PLAYWRIGHT_RESULT");
  const runUrl = getRequiredEnvironmentVariable("PLAYWRIGHT_RUN_URL");
  const sha = getRequiredEnvironmentVariable("PLAYWRIGHT_SHA");
  const pullRequestNumber = getOptionalNumber("PLAYWRIGHT_PR_NUMBER");
  const pullRequestUrl =
    getOptionalHttpsEnvironmentVariable("PLAYWRIGHT_PR_URL");
  const existingHistory = await readHistory(historyPath);
  const runIdentity = {
    attempt: getRequiredNumber("PLAYWRIGHT_RUN_ATTEMPT"),
    id: getRequiredEnvironmentVariable("PLAYWRIGHT_RUN_ID"),
  };
  const history = updatePlaywrightHistory(existingHistory, {
    ...runIdentity,
    branch: getRequiredEnvironmentVariable("PLAYWRIGHT_BRANCH"),
    createdAt,
    event: getRequiredEnvironmentVariable("PLAYWRIGHT_EVENT"),
    pullRequestNumber,
    pullRequestUrl,
    reportUrl,
    result,
    runNumber: getRequiredNumber("PLAYWRIGHT_RUN_NUMBER"),
    runUrl,
    screenshotCount: screenshots.length,
    screenshotsUrl,
    sha,
  });

  await mkdir(path.dirname(historyPath), { recursive: true });
  await mkdir(path.dirname(dashboardPath), { recursive: true });
  await mkdir(galleryPath, { recursive: true });
  await writeFile(historyPath, `${JSON.stringify(history, null, 2)}\n`);
  await writeFile(dashboardPath, renderPlaywrightDashboard(history));
  await writeFile(
    path.join(galleryPath, "manifest.json"),
    `${JSON.stringify(createScreenshotManifest(screenshots, runIdentity), null, 2)}\n`,
  );
  // Consumed by the pull request comment step, which runs after publication.
  await writeFile(
    path.join(galleryPath, "review.json"),
    `${JSON.stringify(
      {
        screenshots: screenshots.map(
          ({
            captureType,
            comparison,
            difference,
            fileName,
            source,
            testId,
            title,
          }) => ({
            captureType,
            comparison,
            difference,
            fileName,
            source,
            testId,
            title,
          }),
        ),
        screenshotsUrl,
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    path.join(galleryPath, "publish-stable-baseline"),
    `${shouldPublishStableMainBaseline({
      candidate: runIdentity,
      existingBaseline: await readOptionalJson(
        process.env.PLAYWRIGHT_EXISTING_STABLE_BASELINE_PATH,
      ),
      history,
    })}\n`,
  );
  await writeFile(
    path.join(galleryPath, "index.html"),
    renderScreenshotGallery({
      baselineAvailable: comparison.baselineAvailable,
      createdAt,
      dashboardUrl,
      pullRequestNumber,
      pullRequestUrl,
      reportUrl,
      result,
      runUrl,
      screenshots,
      screenshotsUrl,
      sha,
    }),
  );

  console.log(
    `Playwright dashboard generated with ${history.length} runs and ${screenshots.length} screenshots.`,
  );
}

async function collectScreenshots(
  resultsPath: string,
  outputPath: string,
): Promise<Array<Omit<PlaywrightScreenshot, "comparison">>> {
  const files = (await findPngFiles(resultsPath)).sort((left, right) =>
    path.basename(left).localeCompare(path.basename(right)),
  );
  if (files.length > MAX_SCREENSHOT_COUNT) {
    throw new Error(
      `Playwright artifact contains ${files.length} screenshots; maximum is ${MAX_SCREENSHOT_COUNT}`,
    );
  }
  // Full-suite galleries exceed 100 captures; bound total bytes before decoding.
  let totalBytes = 0;
  for (const file of files) {
    const info = await stat(file);
    if (
      !info.isFile() ||
      info.size <= 0 ||
      info.size > MAX_PNG_SCREENSHOT_BYTES
    ) {
      throw new Error(`Invalid screenshot size for ${file}`);
    }
    totalBytes += info.size;
    if (totalBytes > MAX_TOTAL_SCREENSHOT_BYTES) {
      throw new Error(
        `Playwright artifact exceeds maximum total screenshot size of ${MAX_TOTAL_SCREENSHOT_BYTES} bytes`,
      );
    }
  }
  const imagePath = path.join(outputPath, "images");
  await mkdir(imagePath, { recursive: true });

  const screenshots: Array<Omit<PlaywrightScreenshot, "comparison">> = [];
  for (const [index, file] of files.entries()) {
    const screenshot = await readFile(file);
    validatePngScreenshot(screenshot, file);
    const source = path.relative(resultsPath, file);
    const fileName = galleryFileName(index, source);
    await copyFile(file, path.join(outputPath, fileName));
    screenshots.push({
      captureType: isFailureCapture(file) ? "failure" : "checkpoint",
      fileName,
      hash: createHash("sha256").update(screenshot).digest("hex"),
      source,
      testId: testIdFromSource(source),
      title: titleFromFileName(path.basename(file)),
    });
  }
  return screenshots;
}

async function findPngFiles(
  directory: string,
  depth = 0,
  budget = { entries: 0 },
): Promise<string[]> {
  if (depth > MAX_ARTIFACT_DEPTH) {
    throw new Error(
      `Playwright artifact exceeds maximum directory depth of ${MAX_ARTIFACT_DEPTH}`,
    );
  }
  let entries: Dirent[];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return [];
    throw error;
  }
  budget.entries += entries.length;
  if (budget.entries > MAX_ARTIFACT_ENTRIES) {
    throw new Error(
      `Playwright artifact exceeds maximum entry count of ${MAX_ARTIFACT_ENTRIES}`,
    );
  }

  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory() && entry.name === "attachments") return [];
      if (entry.isDirectory())
        return findPngFiles(entryPath, depth + 1, budget);
      return entry.isFile() && entry.name.toLowerCase().endsWith(".png")
        ? [entryPath]
        : [];
    }),
  );
  return files.flat();
}

async function measureDifferences(
  screenshots: PlaywrightScreenshot[],
  baseline: unknown,
  outputPath: string,
): Promise<PlaywrightScreenshot[]> {
  if (!baselineImagesPath || !isScreenshotManifest(baseline)) {
    return screenshots;
  }
  const baselineFileNames = new Map(
    baseline.screenshots.map((screenshot, index) => [
      screenshot.source,
      galleryFileName(index, screenshot.source),
    ]),
  );
  // Sequential on purpose: a full suite decodes hundreds of image pairs and
  // holding them all at once would exhaust the runner's memory.
  const measured: PlaywrightScreenshot[] = [];
  for (const screenshot of screenshots) {
    const baselineFileName = baselineFileNames.get(screenshot.source);
    if (screenshot.comparison !== "changed" || !baselineFileName) {
      measured.push(screenshot);
      continue;
    }
    const baselineFile = path.join(
      baselineImagesPath,
      path.basename(baselineFileName),
    );
    try {
      const baselineImage = await readFile(baselineFile);
      validatePngScreenshot(baselineImage, baselineFile);
      measured.push({
        ...screenshot,
        difference: measureScreenshotDifference(
          await readFile(path.join(outputPath, screenshot.fileName)),
          baselineImage,
        ),
      });
    } catch (error) {
      console.warn(
        `Skipping visual difference for ${screenshot.source}: ${error instanceof Error ? error.message : String(error)}`,
      );
      measured.push(screenshot);
    }
  }
  return measured;
}

function titleFromFileName(fileName: string): string {
  return fileName
    .replace(/\.png$/i, "")
    .replace(/^\d+-/, "")
    .replaceAll(/[-_]+/g, " ");
}

function isFailureCapture(fileName: string): boolean {
  return /^test-failed(?:-\d+)?\.png$/i.test(path.basename(fileName));
}

function testIdFromSource(source: string): string {
  const directory = path.dirname(source);
  return directory === "."
    ? "Unknown test"
    : directory.split(path.sep).join(" / ");
}

function getRequiredEnvironmentVariable(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function getOptionalHttpsEnvironmentVariable(name: string): string | undefined {
  const value = process.env[name]?.trim();
  if (!value) return;
  if (!URL.canParse(value) || new URL(value).protocol !== "https:") {
    throw new Error(`${name} must use HTTPS`);
  }
  return value;
}

function getRequiredNumber(name: string): number {
  const value = Number(getRequiredEnvironmentVariable(name));
  if (!Number.isFinite(value)) throw new Error(`${name} must be a number`);
  return value;
}

function getOptionalNumber(name: string): number | undefined {
  const value = process.env[name]?.trim();
  if (!value) return;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0)
    throw new Error(`${name} must be a positive integer`);
  return parsed;
}

async function readHistory(filePath: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return [];
    throw error;
  }
}

async function readOptionalJson(
  filePath: string | undefined,
): Promise<unknown> {
  if (!filePath) return;
  try {
    const info = await stat(filePath);
    if (!info.isFile() || info.size > 1_000_000) {
      console.warn(
        "Ignoring an invalid or oversized Playwright baseline manifest.",
      );
      return;
    }
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return;
    if (error instanceof SyntaxError) {
      console.warn("Ignoring an invalid Playwright baseline manifest.");
      return null;
    }
    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
