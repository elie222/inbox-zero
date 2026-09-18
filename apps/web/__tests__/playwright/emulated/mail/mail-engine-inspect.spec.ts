import { expect } from "@playwright/test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import { openMail } from "./mail-test-helpers";

test("exposes engine diagnostics after metadata coverage or keeps the legacy list", async ({
  page,
}, testInfo) => {
  const { conversations, emailAccountId } = await openMail(page);
  await expect(conversations.getByRole("option").first()).toBeVisible({
    timeout: 60_000,
  });
  await expect
    .poll(
      async () =>
        page.evaluate(async () => {
          const seam = window.__inboxZeroMailInspect;
          if (!seam) return { present: false, coverageComplete: false };
          const diagnostics = (await seam.read()) as {
            coverage?: Array<{ metadata: string }>;
          };
          return {
            present: true,
            coverageComplete:
              (diagnostics.coverage?.length ?? 0) > 0 &&
              diagnostics.coverage?.every(
                (item) => item.metadata === "complete",
              ),
          };
        }),
      { timeout: 60_000 },
    )
    .toMatchObject({ present: true, coverageComplete: true });
  const inspect = await page.evaluate(async () => {
    const seam = window.__inboxZeroMailInspect;
    if (!seam) return { present: false as const };
    const diagnostics = (await seam.read()) as {
      accountId?: string;
      coverage?: Array<{ metadata: string }>;
      commands?: unknown[];
    };
    return {
      present: true as const,
      accountId: diagnostics.accountId ?? seam.accountId,
      coverageComplete:
        (diagnostics.coverage?.length ?? 0) > 0 &&
        diagnostics.coverage?.every((item) => item.metadata === "complete"),
      commandCount: diagnostics.commands?.length ?? 0,
    };
  });
  await capturePlaywrightCheckpoint(page, testInfo, "mail-engine-inspect");
  expect(await conversations.getByRole("option").count()).toBeGreaterThan(0);
  expect(inspect.present).toBe(true);
  expect(inspect.accountId).toBe(emailAccountId);
  expect(inspect.coverageComplete).toBe(true);
});
