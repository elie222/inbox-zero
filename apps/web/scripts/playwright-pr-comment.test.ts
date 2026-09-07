import { describe, expect, it } from "vitest";
import {
  buildPlaywrightPrComment,
  PLAYWRIGHT_PR_COMMENT_MARKER,
  type PlaywrightPrCommentScreenshot,
  selectPlaywrightPrFrames,
} from "./playwright-pr-comment";

describe("selectPlaywrightPrFrames", () => {
  it("orders failures, new checkpoints, changed specs, then the largest visual changes", () => {
    const selection = selectPlaywrightPrFrames({
      changedPaths: [
        "apps/web/__tests__/playwright/emulated/mail/split-tabs.spec.ts",
        "apps/web/styles/globals.css",
      ],
      screenshots: [
        screenshot({
          comparison: "changed",
          difference: 0.35,
          fileName: "images/001-dark-mode.png",
          source: "mail_stheme.spec.ts/theme-dark/dark-mode.png",
          title: "dark mode",
        }),
        screenshot({
          comparison: "changed",
          difference: 0.004,
          fileName: "images/002-final-state.png",
          source: "mail_ssearch.spec.ts/search/final-state.png",
          title: "search drift",
        }),
        screenshot({
          comparison: "changed",
          difference: 0.01,
          fileName: "images/003-split-tabs.png",
          source: "mail_ssplit-tabs.spec.ts/split/tabs.png",
          title: "split tabs",
        }),
        screenshot({
          comparison: "new",
          fileName: "images/004-new-checkpoint.png",
          source: "mail_sstarring.spec.ts/star/new-checkpoint.png",
          title: "new checkpoint",
        }),
        screenshot({
          captureType: "failure",
          comparison: "unavailable",
          fileName: "images/005-test-failed-1.png",
          source: "mail_ssearch.spec.ts/search/test-failed-1.png",
          title: "test failed 1",
        }),
        screenshot({
          comparison: "changed",
          difference: 0.6,
          fileName: "images/006-reader.png",
          source: "mail_sreader-visuals.spec.ts/reader/reader.png",
          title: "reader",
        }),
      ],
    });

    expect(
      selection.frames.map((frame) => [frame.title, frame.reason]),
    ).toEqual([
      ["test failed 1", "failed"],
      ["new checkpoint", "new"],
      ["split tabs", "spec changed"],
      ["reader", "visual change"],
      ["dark mode", "visual change"],
    ]);
    expect(selection.omittedCount).toBe(0);
  });

  it("does not list a frame twice and reports how many were cut by the limit", () => {
    const selection = selectPlaywrightPrFrames({
      changedPaths: [
        "apps/web/__tests__/playwright/emulated/mail/theme.spec.ts",
      ],
      limit: 2,
      screenshots: [
        screenshot({
          comparison: "changed",
          difference: 0.5,
          fileName: "images/001-dark.png",
          source: "mail_stheme.spec.ts/theme/dark.png",
          title: "dark",
        }),
        screenshot({
          comparison: "changed",
          difference: 0.4,
          fileName: "images/002-light.png",
          source: "mail_stheme.spec.ts/theme/light.png",
          title: "light",
        }),
        screenshot({
          comparison: "changed",
          difference: 0.3,
          fileName: "images/003-reader.png",
          source: "mail_sreader-visuals.spec.ts/reader/reader.png",
          title: "reader",
        }),
      ],
    });

    expect(selection.frames.map((frame) => frame.title)).toEqual([
      "dark",
      "light",
    ]);
    expect(selection.omittedCount).toBe(1);
  });
});

describe("buildPlaywrightPrComment", () => {
  const links = {
    dashboardUrl: "https://example.com/playwright/index.html",
    galleryUrl: "https://example.com/playwright/prs/42/index.html",
    runUrl: "https://github.com/example/repo/actions/runs/1",
    screenshotsUrl:
      "https://example.com/playwright/runs/1-1/screenshots/index.html",
    sha: "0123456789abcdef",
  };

  it("embeds the selected frames with their spec path and reason", () => {
    const comment = buildPlaywrightPrComment({
      ...links,
      changedPaths: [],
      screenshots: [
        screenshot({
          comparison: "changed",
          difference: 0.412,
          fileName: "images/001-Mail-in-dark-mode.png",
          source: "mail_stheme.spec.ts/theme-dark/Mail-in-dark-mode.png",
          title: "Mail in dark mode",
        }),
        screenshot({
          comparison: "unchanged",
          fileName: "images/002-final-state.png",
          source: "mail_ssearch.spec.ts/search/final-state.png",
          title: "final state",
        }),
      ],
    });

    expect(comment.startsWith(PLAYWRIGHT_PR_COMMENT_MARKER)).toBe(true);
    expect(comment).toContain(
      "2 screenshots captured: 0 new, 1 changed, 1 unchanged compared with main.",
    );
    expect(comment).toContain(
      "**Mail in dark mode** · mail/theme.spec.ts · 41% of pixels differ from main",
    );
    expect(comment).toContain(
      "![Mail in dark mode](https://example.com/playwright/runs/1-1/screenshots/images/001-Mail-in-dark-mode.png)",
    );
    expect(comment).toContain(`[Open screenshot gallery](${links.galleryUrl})`);
    expect(comment).toContain("Updated for commit `0123456`.");
  });

  it("explains when no baseline exists and escapes markdown in titles", () => {
    const comment = buildPlaywrightPrComment({
      ...links,
      changedPaths: [],
      screenshots: [
        screenshot({
          captureType: "failure",
          comparison: "unavailable",
          fileName: "images/001-test-failed-1.png",
          source: "mail_ssearch.spec.ts/[search]_x/test-failed-1.png",
          title: "test failed [1]",
        }),
      ],
    });

    expect(comment).toContain(
      "1 screenshots captured, 1 failure captures. No main baseline was available for comparison.",
    );
    expect(comment).toContain("**test failed \\[1\\]** · mail/search.spec.ts");
    expect(comment).toContain("![test failed \\[1\\]](");
  });

  it("points at the gallery when nothing stands out", () => {
    const comment = buildPlaywrightPrComment({
      ...links,
      changedPaths: [],
      screenshots: [
        screenshot({
          comparison: "changed",
          difference: 0.001,
          fileName: "images/001-final-state.png",
          source: "mail_ssearch.spec.ts/search/final-state.png",
          title: "final state",
        }),
      ],
    });

    expect(comment).toContain(
      "Nothing stood out against main; browse every capture in the gallery.",
    );
    expect(comment).not.toContain("![");
  });
});

function screenshot(
  overrides: Partial<PlaywrightPrCommentScreenshot> &
    Pick<PlaywrightPrCommentScreenshot, "fileName" | "source" | "title">,
): PlaywrightPrCommentScreenshot {
  return {
    captureType: "checkpoint",
    comparison: "unchanged",
    testId: overrides.source.split("/").slice(0, -1).join(" / "),
    ...overrides,
  };
}
