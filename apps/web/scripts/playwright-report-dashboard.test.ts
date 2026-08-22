import { describe, expect, it } from "vitest";
import {
  compareScreenshotsWithBaseline,
  createScreenshotManifest,
  type PlaywrightRun,
  type PlaywrightScreenshot,
  renderPlaywrightDashboard,
  renderScreenshotGallery,
  shouldPublishStableMainBaseline,
  updatePlaywrightHistory,
} from "./playwright-report-dashboard";

describe("compareScreenshotsWithBaseline", () => {
  it("marks matching, changed, and new screenshots using source and SHA-256", () => {
    const unchanged = getScreenshot({
      hash: "a".repeat(64),
      source: "test-a/checkpoint.png",
    });
    const changed = getScreenshot({
      hash: "b".repeat(64),
      source: "test-b/checkpoint.png",
    });
    const added = getScreenshot({
      hash: "c".repeat(64),
      source: "test-c/checkpoint.png",
    });
    const baseline = createScreenshotManifest([
      { ...unchanged, comparison: "unavailable" },
      { ...changed, comparison: "unavailable", hash: "d".repeat(64) },
    ]);

    expect(
      compareScreenshotsWithBaseline([unchanged, changed, added], baseline),
    ).toEqual({
      baselineAvailable: true,
      screenshots: [
        { ...unchanged, comparison: "unchanged" },
        { ...changed, comparison: "changed" },
        { ...added, comparison: "new" },
      ],
    });
  });

  it("does not claim screenshots are new without a valid baseline", () => {
    const screenshot = getScreenshot();

    expect(compareScreenshotsWithBaseline([screenshot], undefined)).toEqual({
      baselineAvailable: false,
      screenshots: [{ ...screenshot, comparison: "unavailable" }],
    });
    expect(
      compareScreenshotsWithBaseline([screenshot], {
        screenshots: [{ ...screenshot, hash: "not-a-sha256" }],
        version: 1,
      }),
    ).toEqual({
      baselineAvailable: false,
      screenshots: [{ ...screenshot, comparison: "unavailable" }],
    });
  });
});

describe("updatePlaywrightHistory", () => {
  it("places the current attempt first and replaces an existing copy", () => {
    const previousRun = getRun({ id: "100", runNumber: 8 });
    const currentRun = getRun({ id: "200", runNumber: 9 });
    const existingCurrentRun = getRun({
      id: currentRun.id,
      reportUrl: "https://example.com/old-report",
      runNumber: currentRun.runNumber,
    });

    expect(
      updatePlaywrightHistory([previousRun, existingCurrentRun], currentRun),
    ).toEqual([currentRun, previousRun]);
  });

  it("keeps the latest 100 valid runs", () => {
    const previousRuns = Array.from({ length: 105 }, (_, index) =>
      getRun({ id: String(index), runNumber: index }),
    );

    const history = updatePlaywrightHistory(previousRuns, getRun());

    expect(history).toHaveLength(100);
    expect(history[0]?.id).toBe("200");
    expect(history.at(-1)?.id).toBe("6");
  });

  it("keeps delayed runs and rerun attempts in recency order", () => {
    const newestRun = getRun({ attempt: 2, id: "300", runNumber: 11 });
    const delayedRun = getRun({ id: "250", runNumber: 10 });
    const firstAttempt = getRun({ attempt: 1, id: "300", runNumber: 11 });

    expect(
      updatePlaywrightHistory([newestRun, firstAttempt], delayedRun),
    ).toEqual([newestRun, firstAttempt, delayedRun]);
  });

  it("drops malformed and unsafe history entries", () => {
    const currentRun = getRun();

    expect(
      updatePlaywrightHistory(
        [null, { id: "broken" }, getRun({ reportUrl: "javascript:alert(1)" })],
        currentRun,
      ),
    ).toEqual([currentRun]);
  });

  it("keeps screenshot-only pull request runs", () => {
    const pullRequestRun = getRun({
      branch: "contributor-branch",
      event: "pull_request",
      pullRequestNumber: 59,
      pullRequestUrl: "https://github.com/example/repository/pull/59",
      reportUrl: undefined,
    });

    expect(updatePlaywrightHistory([], pullRequestRun)).toEqual([
      pullRequestRun,
    ]);
  });
});

describe("shouldPublishStableMainBaseline", () => {
  const screenshot = getScreenshot();

  it("publishes only when the candidate is the newest successful main run", () => {
    const current = getRun({ id: "300", runNumber: 12 });
    const delayed = getRun({ id: "250", runNumber: 10 });
    const currentBaseline = createScreenshotManifest(
      [{ ...screenshot, comparison: "unavailable" }],
      current,
    );

    expect(
      shouldPublishStableMainBaseline({
        candidate: current,
        existingBaseline: undefined,
        history: updatePlaywrightHistory([delayed], current),
      }),
    ).toBe(true);
    expect(
      shouldPublishStableMainBaseline({
        candidate: delayed,
        existingBaseline: currentBaseline,
        history: updatePlaywrightHistory([current], delayed),
      }),
    ).toBe(false);
  });

  it("preserves an identity-less baseline but replaces an older identified one", () => {
    const current = getRun({ id: "300", runNumber: 12 });
    const previous = getRun({ id: "200", runNumber: 9 });
    const history = updatePlaywrightHistory([previous], current);

    expect(
      shouldPublishStableMainBaseline({
        candidate: current,
        existingBaseline: createScreenshotManifest([
          { ...screenshot, comparison: "unavailable" },
        ]),
        history,
      }),
    ).toBe(false);
    expect(
      shouldPublishStableMainBaseline({
        candidate: current,
        existingBaseline: createScreenshotManifest(
          [{ ...screenshot, comparison: "unavailable" }],
          previous,
        ),
        history,
      }),
    ).toBe(true);
  });
});

describe("renderPlaywrightDashboard", () => {
  it("embeds run history without allowing a script breakout", () => {
    const html = renderPlaywrightDashboard([
      getRun({ branch: "</script><script>alert(1)</script>" }),
    ]);

    expect(html).not.toContain("</script><script>alert(1)</script>");
    expect(html).toContain(
      "\\u003c/script>\\u003cscript>alert(1)\\u003c/script>",
    );
    expect(html).toContain(
      "latestScreenshots.href = history[0].screenshotsUrl",
    );
  });
});

describe("renderScreenshotGallery", () => {
  it("renders checkpoint images and escapes artifact labels", () => {
    const html = renderScreenshotGallery({
      baselineAvailable: true,
      createdAt: "2026-08-16T10:00:00.000Z",
      dashboardUrl: "https://example.com/playwright/index.html",
      reportUrl: "https://example.com/report",
      result: "success",
      runUrl: "https://github.com/example/repository/actions/runs/200",
      screenshots: [
        {
          captureType: "checkpoint",
          comparison: "new",
          fileName: "images/001-shell.png",
          hash: "a".repeat(64),
          source: "golden/<script>.png",
          testId: "golden shell",
          title: "main <script>alert(1)</script>",
        },
      ],
      screenshotsUrl:
        "https://example.com/playwright/runs/200-1/screenshots/index.html",
      sha: "abcdef1234567890",
    });

    expect(html).toContain(
      'src="https://example.com/playwright/runs/200-1/screenshots/images/001-shell.png"',
    );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("main &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain('<span class="badge checkpoint">CHECKPOINT</span>');
    expect(html).toContain('<span class="badge new">NEW</span>');
    expect(html).toContain('data-filter="review" aria-pressed="true"');
  });

  it("links a pull request without exposing its untrusted HTML report", () => {
    const html = renderScreenshotGallery({
      baselineAvailable: false,
      createdAt: "2026-08-16T10:00:00.000Z",
      dashboardUrl: "https://example.com/playwright/index.html",
      pullRequestNumber: 59,
      pullRequestUrl: "https://github.com/example/repository/pull/59",
      result: "success",
      runUrl: "https://github.com/example/repository/actions/runs/200",
      screenshots: [],
      screenshotsUrl:
        "https://example.com/playwright/runs/200-1/screenshots/index.html",
      sha: "abcdef1234567890",
    });

    expect(html).toContain(
      'href="https://github.com/example/repository/pull/59">PR #59</a>',
    );
    expect(html).not.toContain("Full report");
    expect(html).toContain("PR #59 screenshots");
  });

  it("labels automatic failure captures without inventing a comparison", () => {
    const html = renderScreenshotGallery({
      baselineAvailable: false,
      createdAt: "2026-08-16T10:00:00.000Z",
      dashboardUrl: "https://example.com/playwright/index.html",
      result: "failure",
      runUrl: "https://github.com/example/repository/actions/runs/200",
      screenshots: [
        {
          captureType: "failure",
          comparison: "unavailable",
          fileName: "images/001-test-failed-1.png",
          hash: "f".repeat(64),
          source: "mail-chromium/test-failed-1.png",
          testId: "mail chromium",
          title: "test failed 1",
        },
      ],
      screenshotsUrl:
        "https://example.com/playwright/runs/200-1/screenshots/index.html",
      sha: "abcdef1234567890",
    });

    expect(html).toContain('<span class="badge failure">FAILED</span>');
    expect(html).toContain(
      '<span class="badge unavailable">NO BASELINE</span>',
    );
    expect(html).toContain("Automatic failure capture");
    expect(html).toContain('data-filter="new" aria-pressed="false" disabled');
  });
});

function getRun(overrides: Partial<PlaywrightRun> = {}): PlaywrightRun {
  return {
    attempt: 1,
    branch: "main",
    createdAt: "2026-08-16T10:00:00.000Z",
    event: "push",
    id: "200",
    reportUrl: "https://example.com/playwright/runs/200-1/report/index.html",
    result: "success",
    runNumber: 10,
    runUrl: "https://github.com/example/repository/actions/runs/200",
    screenshotCount: 12,
    screenshotsUrl:
      "https://example.com/playwright/runs/200-1/screenshots/index.html",
    sha: "abcdef1234567890",
    ...overrides,
  };
}

function getScreenshot(
  overrides: Partial<Omit<PlaywrightScreenshot, "comparison">> = {},
): Omit<PlaywrightScreenshot, "comparison"> {
  return {
    captureType: "checkpoint",
    fileName: "images/001-checkpoint.png",
    hash: "a".repeat(64),
    source: "mail-chromium/checkpoint.png",
    testId: "mail chromium",
    title: "checkpoint",
    ...overrides,
  };
}
