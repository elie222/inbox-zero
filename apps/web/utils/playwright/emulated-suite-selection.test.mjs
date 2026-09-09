import path from "node:path";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { describe, expect, test } from "vitest";
import {
  fullSuites,
  selectChangedPlaywrightTargets,
} from "./emulated-suite-selection.mjs";
import { expandPlaywrightTargets } from "./emulated-suite-targets.mjs";

const appRoot = path.resolve(import.meta.dirname, "../..");

describe("emulated Playwright suite selection", () => {
  test.each([
    "components/CommandK.tsx",
    "hooks/useCommandPaletteCommands.ts",
    "store/command-palette.ts",
  ])("selects explicit shared-feature coverage for %s", (file) => {
    const selection = selectChangedPlaywrightTargets(
      `apps/web/${file}`,
      appRoot,
    );
    expect(selection.runFullSuite).toBe(false);
    expect(selection.targetFiles.sort()).toEqual([
      "__tests__/playwright/emulated/mail/command-palette.spec.ts",
      "__tests__/playwright/emulated/mail/starring.spec.ts",
      "__tests__/playwright/emulated/mail/theme.spec.ts",
      "__tests__/playwright/emulated/settings/settings-dialog.spec.ts",
    ]);
  });

  test("unions shared-feature coverage with other changes in the same PR", () => {
    const selection = selectChangedPlaywrightTargets(
      [
        "apps/web/hooks/useCommandPaletteCommands.ts",
        "apps/web/app/(app)/[emailAccountId]/mail/ThreadList.tsx",
        "apps/web/__tests__/playwright/emulated/settings/settings-dialog.spec.ts",
      ].join("\n"),
      appRoot,
    );
    expect(
      expandPlaywrightTargets(selection.targetFiles, appRoot),
    ).toHaveLength(5);
    expect(selection.targetFiles).toContain(
      "__tests__/playwright/emulated/mail/layout.spec.ts",
    );
    expect(selection.reason).toContain("hooks/useCommandPaletteCommands.ts");
  });

  test("keeps broad coverage when a shared feature's test coverage is missing", () => {
    withFeatureFixture((root, write) => {
      write("app/layout.tsx", 'import "@/components/CommandK";');
      write("components/CommandK.tsx", "");
      const selection = selectChangedPlaywrightTargets(
        "apps/web/components/CommandK.tsx",
        root,
      );
      expect(selection.targetFiles).toEqual(
        fullSuites.map((suite) => `__tests__/playwright/emulated/${suite}`),
      );
    });
  });

  test("a shared-feature edit does not narrow other foundational changes", () => {
    const selection = selectChangedPlaywrightTargets(
      [
        "apps/web/hooks/useCommandPaletteCommands.ts",
        "apps/web/components/SideNavWithTopNav.tsx",
      ].join("\n"),
      appRoot,
    );
    expect(expandPlaywrightTargets(selection.targetFiles, appRoot)).toEqual(
      expandPlaywrightTargets(
        fullSuites.map((suite) => `__tests__/playwright/emulated/${suite}`),
        appRoot,
      ),
    );
  });

  test("selects the split feature instead of every mail spec", () => {
    const selection = selectChangedPlaywrightTargets(
      "apps/web/app/(app)/[emailAccountId]/mail/SplitTabs.tsx",
      appRoot,
    );
    expect(selection.runFullSuite).toBe(false);
    expect(selection.targetFiles).toEqual([
      "__tests__/playwright/emulated/mail/split-tabs.spec.ts",
    ]);
  });

  test("selects queue diagnostics coverage when its reader changes", () => {
    const selection = selectChangedPlaywrightTargets(
      "apps/web/utils/email-cache/mail-queue-diagnostics.ts",
      appRoot,
    );
    expect(selection).toMatchObject({
      runFullSuite: false,
      targetFiles: ["__tests__/playwright/emulated/mail/mail-queue.spec.ts"],
    });
  });

  test("follows nested feature imports and unions coverage across specs", () => {
    withFeatureFixture((root) => {
      const selection = selectChangedPlaywrightTargets(
        "apps/web/hooks/useFeature.ts",
        root,
      );
      expect(selection.targetFiles).toEqual([
        "__tests__/playwright/emulated/mail/first.spec.ts",
        "__tests__/playwright/emulated/mail/second.spec.ts",
      ]);
    });
  });

  test.each([
    "utils/feature.ts",
    "lib/feature.ts",
  ])("selects feature dependencies outside component directories: %s", (file) => {
    withFeatureFixture((root, write) => {
      write("hooks/useFeature.ts", `import "@/${file}";`);
      write(file, "");
      expect(
        selectChangedPlaywrightTargets(`apps/web/${file}`, root).targetFiles,
      ).toEqual([
        "__tests__/playwright/emulated/mail/first.spec.ts",
        "__tests__/playwright/emulated/mail/second.spec.ts",
      ]);
    });
  });

  test("keeps shared layout dependencies broad even with feature declarations", () => {
    withFeatureFixture((root, write) => {
      write("app/layout.tsx", 'import "@/hooks/useFeature";');
      expect(
        selectChangedPlaywrightTargets("apps/web/hooks/useFeature.ts", root)
          .targetFiles,
      ).toEqual(
        fullSuites.map((suite) => `__tests__/playwright/emulated/${suite}`),
      );
    });
  });

  test.each([
    "unknown.tsx",
    "MailShell.tsx",
    "deleted.tsx",
  ])("keeps area coverage for unowned or shared mail code: %s", (file) => {
    withFeatureFixture((root) => {
      const selection = selectChangedPlaywrightTargets(
        `apps/web/app/(app)/[emailAccountId]/mail/${file}`,
        root,
      );
      expect(selection.targetFiles).toEqual([
        "__tests__/playwright/emulated/mail",
      ]);
    });
  });

  test("does not narrow an area with a new, undeclared spec", () => {
    withFeatureFixture((root, write) => {
      write("__tests__/playwright/emulated/mail/new.spec.ts", "");
      expect(
        selectChangedPlaywrightTargets(
          "apps/web/app/(app)/[emailAccountId]/mail/First.tsx",
          root,
        ).targetFiles,
      ).toEqual(["__tests__/playwright/emulated/mail"]);
    });
  });

  test("does not narrow coverage when a declared entry point is missing", () => {
    withFeatureFixture((root) => {
      rmSync(path.join(root, "app/(app)/[emailAccountId]/mail/Second.tsx"));
      expect(
        selectChangedPlaywrightTargets(
          "apps/web/app/(app)/[emailAccountId]/mail/First.tsx",
          root,
        ).targetFiles,
      ).toEqual(["__tests__/playwright/emulated/mail"]);
    });
  });

  test.each([
    "null",
    "[]",
    "{",
  ])("falls back to the area for an invalid manifest: %s", (source) => {
    withFeatureFixture((root, write) => {
      write("__tests__/playwright/emulated/mail/coverage.json", source);
      expect(
        selectChangedPlaywrightTargets(
          "apps/web/app/(app)/[emailAccountId]/mail/First.tsx",
          root,
        ).targetFiles,
      ).toEqual(["__tests__/playwright/emulated/mail"]);
    });
  });

  test("preserves explicitly changed specs alongside selected features", () => {
    const selection = selectChangedPlaywrightTargets(
      [
        "apps/web/app/(app)/[emailAccountId]/mail/SplitTabs.tsx",
        "apps/web/__tests__/playwright/emulated/mail/reader-visuals.spec.ts",
      ].join("\n"),
      appRoot,
    );
    expect(
      expandPlaywrightTargets(selection.targetFiles, appRoot),
    ).toHaveLength(2);
  });
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

  test("keeps compose changes in the mail area", () => {
    const selection = selectChangedPlaywrightTargets(
      "apps/web/app/(app)/[emailAccountId]/compose/ComposeEmailForm.tsx",
      appRoot,
    );

    expect(selection).toMatchObject({
      runFullSuite: false,
      targetFiles: ["__tests__/playwright/emulated/mail"],
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

  test("keeps shared Playwright runtime utilities on the full suite", () => {
    const selection = selectChangedPlaywrightTargets(
      "apps/web/utils/playwright/browser-diagnostics.ts",
      appRoot,
    );

    expect(selection.runFullSuite).toBe(true);
    expect(selection.targetFiles).toEqual([]);
  });

  test("does not try to run a deleted spec", () => {
    const selection = selectChangedPlaywrightTargets(
      "apps/web/__tests__/playwright/emulated/mail/deleted.spec.ts",
      appRoot,
    );

    expect(selection).toMatchObject({
      runFullSuite: false,
      targetFiles: [],
    });
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

function withFeatureFixture(run) {
  const root = mkdtempSync(path.join(tmpdir(), "playwright-coverage-"));
  const mail = "app/(app)/[emailAccountId]/mail";
  const specs = "__tests__/playwright/emulated/mail";
  const write = (file, source) => {
    const absolutePath = path.join(root, file);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, source);
  };
  try {
    write(`${mail}/page.tsx`, 'import "./MailShell";');
    write(`${mail}/MailShell.tsx`, 'import "./First"; import "./Second";');
    write(`${mail}/First.tsx`, 'import "@/hooks/useFeature";');
    write(`${mail}/Second.tsx`, 'import "@/hooks/useFeature";');
    write(`${mail}/Unrelated.tsx`, "");
    write(`${mail}/unknown.tsx`, "");
    write("hooks/useFeature.ts", "");
    for (const name of ["first", "second", "unrelated"]) {
      write(`${specs}/${name}.spec.ts`, "");
    }
    write(
      `${specs}/coverage.json`,
      JSON.stringify({
        "first.spec.ts": [`${mail}/First.tsx`],
        "second.spec.ts": [`${mail}/Second.tsx`],
        "unrelated.spec.ts": [`${mail}/Unrelated.tsx`],
      }),
    );
    run(root, write);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
