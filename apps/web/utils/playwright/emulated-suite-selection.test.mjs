import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  fullSuites,
  selectChangedPlaywrightTargets,
} from "./emulated-suite-selection.mjs";

const appRoot = path.resolve(import.meta.dirname, "../..");

describe("emulated Playwright suite selection", () => {
  test("selects a route's product area", () => {
    const selection = selectChangedPlaywrightTargets(
      "apps/web/app/(app)/[emailAccountId]/calendars/BookingLinksSection.tsx",
      appRoot,
    );

    expect(selection).toMatchObject({
      runFullSuite: false,
      targetFiles: ["__tests__/playwright/emulated/calendars"],
    });
  });

  test("uses imports to select every area affected by a shared hook", () => {
    const selection = selectChangedPlaywrightTargets(
      "apps/web/hooks/useCalendars.ts",
      appRoot,
    );

    expect(selection.runFullSuite).toBe(false);
    expect(selection.targetFiles).toEqual([
      "__tests__/playwright/emulated/calendars",
      "__tests__/playwright/emulated/meetings",
    ]);
  });

  test("runs only a changed spec when product code did not change", () => {
    const spec = "__tests__/playwright/emulated/mail/command-palette.spec.ts";
    const selection = selectChangedPlaywrightTargets(
      `apps/web/${spec}`,
      appRoot,
    );

    expect(selection).toMatchObject({
      runFullSuite: false,
      targetFiles: [spec],
    });
  });

  test("runs all cleanup specs when their shared helper changes", () => {
    const selection = selectChangedPlaywrightTargets(
      "apps/web/__tests__/playwright/emulated/cleanup/cleanup-test-helpers.ts",
      appRoot,
    );

    expect(selection.runFullSuite).toBe(false);
    expect(selection.targetFiles).toEqual([
      "__tests__/playwright/emulated/cleanup/analytics.spec.ts",
      "__tests__/playwright/emulated/cleanup/bulk-archive.spec.ts",
      "__tests__/playwright/emulated/cleanup/bulk-unsubscribe.spec.ts",
    ]);
  });

  test("keeps shared Playwright infrastructure on the full suite", () => {
    const selection = selectChangedPlaywrightTargets(
      "apps/web/__tests__/playwright/emulated/playwright-test.ts",
      appRoot,
    );

    expect(selection.runFullSuite).toBe(true);
    expect(selection.targetFiles).toEqual([]);
  });

  test("selects all areas when a common app dependency changes", () => {
    const selection = selectChangedPlaywrightTargets(
      "apps/web/components/SideNavWithTopNav.tsx",
      appRoot,
    );

    expect(selection.runFullSuite).toBe(false);
    expect(selection.targetFiles).toHaveLength(fullSuites.length);
  });

  test("skips colocated unit tests and uncovered product files", () => {
    const selection = selectChangedPlaywrightTargets(
      [
        "apps/web/app/(app)/MailMutationOutboxManager.test.tsx",
        "apps/web/hooks/useCalendarUpcomingEvents.tsx",
      ].join("\n"),
      appRoot,
    );

    expect(selection).toMatchObject({
      runFullSuite: false,
      targetFiles: [],
    });
  });

  test("uses the full suite outside pull requests", () => {
    const selection = selectChangedPlaywrightTargets("", appRoot);

    expect(selection.runFullSuite).toBe(true);
  });
});
