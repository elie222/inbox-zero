import { expect } from "@playwright/test";
import { getEmailAccountId } from "../account-test-helpers";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import { conversationWithSubject, openMail } from "./mail-test-helpers";

test("opens mail with settings cached before the split condition upgrade", async ({
  page,
}, testInfo) => {
  const emailAccountId = await getEmailAccountId(page);
  await page.addInitScript((accountId) => {
    localStorage.setItem(
      `inbox-zero:swr:v2:${accountId}`,
      JSON.stringify({
        "/api/mail/settings": {
          layout: "LIST",
          expandedPreview: false,
          splits: [
            {
              id: "old-split",
              name: "Saved",
              kind: "LABEL",
              values: ["Label_project"],
            },
          ],
        },
      }),
    );
  }, emailAccountId);

  let releaseSettings!: () => void;
  const settingsReady = new Promise<void>((resolve) => {
    releaseSettings = resolve;
  });
  await page.route("**/api/mail/settings", async (route) => {
    await settingsReady;
    await route.continue();
  });

  try {
    const { conversations } = await openMail(page);
    await expect(
      conversationWithSubject(page, conversations, "Archive Action Message"),
    ).toBeVisible();
    await expect(
      page.getByText("Something went wrong", { exact: true }),
    ).toBeHidden();
    await capturePlaywrightCheckpoint(
      page,
      testInfo,
      "mail-with-outdated-cached-settings",
    );

    const responsePromise = page.waitForResponse("**/api/mail/settings");
    releaseSettings();
    const response = await responsePromise;
    expect(response.ok()).toBe(true);
    const settings = await response.json();
    expect(settings.splits.length).toBeGreaterThan(0);
    for (const split of settings.splits) {
      await expect(
        page.getByRole("button", { name: split.name, exact: true }),
      ).toBeVisible();
    }
    await capturePlaywrightCheckpoint(
      page,
      testInfo,
      "mail-with-refreshed-split-settings",
    );
  } finally {
    releaseSettings();
    await page.unrouteAll({ behavior: "wait" });
  }
});
