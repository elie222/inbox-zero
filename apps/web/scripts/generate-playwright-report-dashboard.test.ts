import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PNG } from "pngjs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let root: string;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "playwright-gallery-"));
  mkdirSync(path.join(root, "results"));
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("Playwright gallery artifact limits", () => {
  it("publishes all screenshots from a full suite exceeding 100 captures", () => {
    const png = PNG.sync.write({
      width: 1,
      height: 1,
      data: Buffer.from([23, 45, 67, 255]),
    });
    for (let index = 0; index < 156; index++) {
      writeFileSync(path.join(root, "results", `${index}.png`), png);
    }

    const result = generateGallery();
    expect(result.status, result.stderr).toBe(0);
    const manifest = JSON.parse(
      readFileSync(path.join(root, "gallery", "manifest.json"), "utf8"),
    );
    expect(manifest.screenshots).toHaveLength(156);
  });

  it("rejects excessive file counts before decoding screenshots", () => {
    for (let index = 0; index < 501; index++) {
      writeFileSync(path.join(root, "results", `${index}.png`), "invalid");
    }
    const result = generateGallery();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("maximum is 500");
  });

  it("rejects excessive total bytes before reading or decoding screenshots", () => {
    for (let index = 0; index < 8; index++) {
      const file = path.join(root, "results", `${index}.png`);
      writeFileSync(file, "");
      truncateSync(file, 15 * 1024 * 1024);
    }
    const result = generateGallery();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("maximum total screenshot size");
  });
});

function generateGallery() {
  return spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      path.join(import.meta.dirname, "generate-playwright-report-dashboard.ts"),
      path.join(root, "history.json"),
      path.join(root, "index.html"),
      path.join(root, "results"),
      path.join(root, "gallery"),
    ],
    {
      encoding: "utf8",
      timeout: 15_000,
      env: {
        ...process.env,
        PLAYWRIGHT_DASHBOARD_URL: "https://example.com/dashboard",
        PLAYWRIGHT_SCREENSHOTS_URL: "https://example.com/screenshots",
        PLAYWRIGHT_RESULT: "success",
        PLAYWRIGHT_RUN_URL: "https://example.com/run",
        PLAYWRIGHT_SHA: "test-sha",
        PLAYWRIGHT_RUN_ATTEMPT: "1",
        PLAYWRIGHT_RUN_ID: "1",
        PLAYWRIGHT_BRANCH: "test",
        PLAYWRIGHT_EVENT: "pull_request",
        PLAYWRIGHT_RUN_NUMBER: "1",
      },
    },
  );
}
