import { readFile } from "node:fs/promises";
import {
  buildPlaywrightPrComment,
  type PlaywrightPrCommentScreenshot,
} from "./playwright-pr-comment";

const [reviewPath, changedPathsPath] = process.argv.slice(2);

if (!reviewPath || !changedPathsPath) {
  throw new Error(
    "Usage: build-playwright-pr-comment <review-json-path> <changed-paths-file>",
  );
}

buildComment(reviewPath, changedPathsPath);

async function buildComment(reviewFile: string, changedPathsFile: string) {
  const review = JSON.parse(await readFile(reviewFile, "utf8")) as {
    screenshots?: PlaywrightPrCommentScreenshot[];
    screenshotsUrl?: string;
  };
  if (!Array.isArray(review.screenshots)) {
    throw new Error("review.json must include a screenshots array");
  }
  if (!isHttpsUrl(review.screenshotsUrl)) {
    throw new Error("review.json must include an https screenshotsUrl");
  }

  const changedPaths = (await readFile(changedPathsFile, "utf8"))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  process.stdout.write(
    `${buildPlaywrightPrComment({
      changedPaths,
      dashboardUrl: getRequiredHttpsEnvironmentVariable(
        "PLAYWRIGHT_DASHBOARD_URL",
      ),
      galleryUrl: getRequiredHttpsEnvironmentVariable("PLAYWRIGHT_GALLERY_URL"),
      runUrl: getRequiredHttpsEnvironmentVariable("PLAYWRIGHT_RUN_URL"),
      screenshots: review.screenshots,
      screenshotsUrl: review.screenshotsUrl,
      sha: getRequiredEnvironmentVariable("PLAYWRIGHT_SHA"),
    })}\n`,
  );
}

function getRequiredEnvironmentVariable(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function getRequiredHttpsEnvironmentVariable(name: string): string {
  const value = getRequiredEnvironmentVariable(name);
  if (!isHttpsUrl(value)) throw new Error(`${name} must use HTTPS`);
  return value;
}

function isHttpsUrl(value: unknown): value is string {
  return (
    typeof value === "string" &&
    URL.canParse(value) &&
    new URL(value).protocol === "https:"
  );
}
