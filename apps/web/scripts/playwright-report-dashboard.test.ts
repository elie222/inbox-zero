import { describe, expect, it } from "vitest";
import {
  renderPlaywrightDashboard,
  updatePlaywrightHistory,
} from "./playwright-report-dashboard";

describe("updatePlaywrightHistory", () => {
  it("places the current attempt first and replaces an existing copy", () => {
    const previousRun = getRun({ id: "100", runNumber: 8 });
    const currentRun = getRun({ id: "200", runNumber: 9 });

    const history = updatePlaywrightHistory(
      [previousRun, currentRun],
      currentRun,
    );

    expect(history).toEqual([currentRun, previousRun]);
  });

  it("keeps the latest 100 valid runs", () => {
    const previousRuns = Array.from({ length: 105 }, (_, index) =>
      getRun({ id: String(index), runNumber: index }),
    );

    const history = updatePlaywrightHistory(previousRuns, getRun());

    expect(history).toHaveLength(100);
    expect(history[0]?.id).toBe("200");
    expect(history.at(-1)?.id).toBe("98");
  });

  it("drops malformed history entries", () => {
    const currentRun = getRun();

    expect(
      updatePlaywrightHistory([null, { id: "broken" }], currentRun),
    ).toEqual([currentRun]);
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
  });
});

type PlaywrightRun = Parameters<typeof updatePlaywrightHistory>[1];

function getRun(overrides: Partial<PlaywrightRun> = {}): PlaywrightRun {
  return {
    attempt: 1,
    branch: "main",
    createdAt: "2026-08-16T10:00:00.000Z",
    event: "push",
    id: "200",
    reportUrl: "https://example.com/playwright/runs/200-1/index.html",
    result: "success",
    runNumber: 10,
    runUrl: "https://github.com/example/repository/actions/runs/200",
    sha: "abcdef1234567890",
    ...overrides,
  };
}
