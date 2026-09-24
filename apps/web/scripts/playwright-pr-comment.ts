import {
  getPlaywrightSpecPathFromTargetName,
  getPlaywrightTargetName,
} from "../utils/playwright/emulated-suite-targets.mjs";
import {
  type PlaywrightScreenshot,
  screenshotBaselineKey,
} from "./playwright-report-dashboard";

export const PLAYWRIGHT_PR_COMMENT_MARKER =
  "<!-- inbox-zero-playwright-screenshots -->";
export const PLAYWRIGHT_PR_COMMENT_FRAME_LIMIT = 6;
// Timestamps, avatars, and other run-to-run drift move far fewer pixels than
// this, so anything above it is a change worth a reviewer's glance.
export const PLAYWRIGHT_PR_COMMENT_MIN_DIFFERENCE = 0.02;
export const PLAYWRIGHT_PR_COMMENT_VISUAL_CHANGE_LIMIT = 3;

const EMULATED_SPEC_PATTERN =
  /^apps\/web\/(__tests__\/playwright\/emulated\/.+\.spec\.ts)$/;

export type PlaywrightPrCommentScreenshot = Pick<
  PlaywrightScreenshot,
  | "captureType"
  | "comparison"
  | "difference"
  | "fileName"
  | "source"
  | "testId"
  | "title"
>;

export type PlaywrightPrFrame = PlaywrightPrCommentScreenshot & {
  reason: "failed" | "new" | "spec changed" | "visual change";
};

export function selectPlaywrightPrFrames(input: {
  changedPaths: readonly string[];
  limit?: number;
  minDifference?: number;
  screenshots: readonly PlaywrightPrCommentScreenshot[];
}): {
  flakyFailures: PlaywrightPrCommentScreenshot[];
  frames: PlaywrightPrFrame[];
  omittedCount: number;
  visualChanges: PlaywrightPrFrame[];
} {
  const limit = input.limit ?? PLAYWRIGHT_PR_COMMENT_FRAME_LIMIT;
  const minDifference =
    input.minDifference ?? PLAYWRIGHT_PR_COMMENT_MIN_DIFFERENCE;
  const changedTargets = new Set(
    input.changedPaths
      .map((changedPath) => EMULATED_SPEC_PATTERN.exec(changedPath)?.[1])
      .filter((specPath): specPath is string => specPath !== undefined)
      .map(getPlaywrightTargetName),
  );
  const checkpoints = input.screenshots.filter(
    (screenshot) => screenshot.captureType === "checkpoint",
  );
  const changed = checkpoints.filter(
    (screenshot) => screenshot.comparison === "changed",
  );
  const failures = input.screenshots.filter(
    (screenshot) => screenshot.captureType === "failure",
  );
  const flakyFailures = failures.filter((failure) =>
    passedOnLaterAttempt(failure, input.screenshots),
  );

  const candidates: PlaywrightPrFrame[] = [
    ...failures
      .filter((failure) => !flakyFailures.includes(failure))
      .map((screenshot) => ({ ...screenshot, reason: "failed" as const })),
    ...checkpoints
      .filter((screenshot) => screenshot.comparison === "new")
      .map((screenshot) => ({ ...screenshot, reason: "new" as const })),
    ...changed
      .filter((screenshot) =>
        changedTargets.has(targetNameFromSource(screenshot.source)),
      )
      .map((screenshot) => ({
        ...screenshot,
        reason: "spec changed" as const,
      })),
  ];

  const seen = new Set<string>();
  const frames = candidates.filter((frame) => {
    if (seen.has(frame.fileName)) return false;
    seen.add(frame.fileName);
    return true;
  });
  // Pixel diffs also catch run-to-run drift (scroll position, timing), so they
  // are kept apart from frames this PR is known to affect.
  const visualChanges = changed
    .filter(
      (screenshot) =>
        !seen.has(screenshot.fileName) &&
        (screenshot.difference ?? 0) >= minDifference,
    )
    .sort((left, right) => (right.difference ?? 0) - (left.difference ?? 0))
    .slice(0, PLAYWRIGHT_PR_COMMENT_VISUAL_CHANGE_LIMIT)
    .map((screenshot) => ({
      ...screenshot,
      reason: "visual change" as const,
    }));

  return {
    flakyFailures,
    frames: frames.slice(0, limit),
    omittedCount: Math.max(0, frames.length - limit),
    visualChanges,
  };
}

export function buildPlaywrightPrComment(input: {
  changedPaths: readonly string[];
  dashboardUrl: string;
  galleryUrl: string;
  limit?: number;
  minDifference?: number;
  runUrl: string;
  screenshots: readonly PlaywrightPrCommentScreenshot[];
  screenshotsUrl: string;
  sha: string;
}): string {
  const { flakyFailures, frames, omittedCount, visualChanges } =
    selectPlaywrightPrFrames(input);
  const galleryBaseUrl = new URL(".", input.screenshotsUrl);
  const lines = [
    PLAYWRIGHT_PR_COMMENT_MARKER,
    "### Playwright screenshots",
    [
      `[Open screenshot gallery](${input.galleryUrl})`,
      `[Dashboard](${input.dashboardUrl})`,
      `[CI run](${input.runUrl})`,
    ].join(" · "),
    "",
    summarizeScreenshots(input.screenshots),
  ];

  const pushFrame = (frame: PlaywrightPrFrame) => {
    const imageUrl = new URL(frame.fileName, galleryBaseUrl).toString();
    const title = escapeMarkdown(frame.title);
    lines.push(
      "",
      `**${title}** · ${escapeMarkdown(specPathFromSource(frame.source))} · ${describeReason(frame)}`,
      "",
      `![${title}](${imageUrl})`,
    );
  };

  const unmeasuredChanges = input.screenshots.filter(
    (screenshot) =>
      screenshot.captureType === "checkpoint" &&
      screenshot.comparison === "changed" &&
      screenshot.difference === undefined,
  ).length;
  if (frames.length > 0) {
    lines.push("", "#### Frames to review");
    for (const frame of frames) pushFrame(frame);
    if (omittedCount > 0) {
      lines.push("", `${omittedCount} more to review in the gallery.`);
    }
  } else if (visualChanges.length > 0) {
    lines.push(
      "",
      "No failures, new captures, or captures from specs changed in this PR.",
    );
  } else {
    lines.push(
      "",
      unmeasuredChanges > 0
        ? `${unmeasuredChanges} changed captures could not be measured against main; review them in the gallery.`
        : "Nothing stood out against main; browse every capture in the gallery.",
    );
  }

  if (flakyFailures.length > 0) {
    const specs = [
      ...new Set(
        flakyFailures.map((failure) => specPathFromSource(failure.source)),
      ),
    ];
    lines.push(
      "",
      `${flakyFailures.length} flaky failure captures from tests that passed on retry: ${specs.map(escapeMarkdown).join(", ")}.`,
    );
  }

  if (visualChanges.length > 0) {
    lines.push(
      "",
      "<details>",
      `<summary>Largest pixel differences from main (${visualChanges.length}). These can be run-to-run drift such as scroll position.</summary>`,
    );
    for (const frame of visualChanges) pushFrame(frame);
    lines.push("", "</details>");
  }

  lines.push("", `Updated for commit \`${input.sha.slice(0, 7)}\`.`);
  return lines.join("\n");
}

function summarizeScreenshots(
  screenshots: readonly PlaywrightPrCommentScreenshot[],
): string {
  const total = screenshots.length;
  if (total === 0) return "No screenshots were captured.";

  const count = (
    predicate: (screenshot: PlaywrightPrCommentScreenshot) => boolean,
  ) => screenshots.filter(predicate).length;
  const failed = count((screenshot) => screenshot.captureType === "failure");
  const failureNote = failed > 0 ? `, ${failed} failure captures` : "";
  const baselineAvailable = screenshots.some(
    (screenshot) => screenshot.comparison !== "unavailable",
  );
  if (!baselineAvailable) {
    return `${total} screenshots captured${failureNote}. No main baseline was available for comparison.`;
  }
  const checkpoints = (
    comparison: PlaywrightPrCommentScreenshot["comparison"],
  ) =>
    count(
      (screenshot) =>
        screenshot.captureType === "checkpoint" &&
        screenshot.comparison === comparison,
    );
  return `${total} screenshots captured: ${checkpoints("new")} new, ${checkpoints("changed")} changed, ${checkpoints("unchanged")} unchanged compared with main${failureNote}.`;
}

function describeReason(frame: PlaywrightPrFrame): string {
  switch (frame.reason) {
    case "failed":
      return "failed test capture";
    case "new":
      return "new checkpoint";
    case "spec changed":
      return "spec changed in this PR";
    case "visual change":
      return `${Math.round((frame.difference ?? 0) * 100)}% of pixels differ from main`;
  }
}

function passedOnLaterAttempt(
  failure: PlaywrightPrCommentScreenshot,
  screenshots: readonly PlaywrightPrCommentScreenshot[],
): boolean {
  const test = testDirectoryKey(failure.source);
  const failedAttempt = retryAttempt(failure.source);
  const attempts = screenshots.filter(
    (screenshot) => testDirectoryKey(screenshot.source) === test,
  );
  const finalAttempt = Math.max(
    ...attempts.map((screenshot) => retryAttempt(screenshot.source)),
  );
  return (
    finalAttempt > failedAttempt &&
    !attempts.some(
      (screenshot) =>
        screenshot.captureType === "failure" &&
        retryAttempt(screenshot.source) === finalAttempt,
    )
  );
}

function testDirectoryKey(source: string): string {
  return screenshotBaselineKey(source).split(/[\\/]/).slice(0, -1).join("/");
}

function retryAttempt(source: string): number {
  const attempt = /-retry(\d+)[\\/][^\\/]+$/.exec(source)?.[1];
  return attempt === undefined ? 0 : Number(attempt);
}

function targetNameFromSource(source: string): string {
  return source.split(/[\\/]/)[0] ?? source;
}

function specPathFromSource(source: string): string {
  return getPlaywrightSpecPathFromTargetName(targetNameFromSource(source));
}

function escapeMarkdown(value: string): string {
  const normalized = value.replaceAll(/\s+/g, " ").trim();
  return (normalized.length > 0 ? normalized : "screenshot").replaceAll(
    /[\\`*_[\]<>#|]/g,
    (character) => `\\${character}`,
  );
}
