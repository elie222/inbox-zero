import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "../playwright-test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { openMail } from "./mail-test-helpers";

test("saves device download controls and rejects an attachment budget above the total", async ({
  page,
}, testInfo) => {
  const { emailAccountId } = await openMail(page);
  await page
    .getByRole("button", { name: "Local mail settings", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Mail on this device" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("region", { name: "Local mail status" }),
  ).toBeVisible();
  await dialog.getByLabel("Mail storage (MiB)", { exact: true }).fill("128");
  await dialog.getByLabel("Attachments (MiB)", { exact: true }).fill("256");
  await dialog
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Attachment storage must fit",
  );
  await dialog.getByLabel("Attachments (MiB)", { exact: true }).fill("32");
  await dialog.getByRole("switch", { name: "Download older mail" }).uncheck();
  await dialog.getByRole("switch", { name: "Faster mail updates" }).uncheck();
  await dialog
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toHaveText("Saved for this device.");
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(
          localStorage.getItem("inbox-zero:local-mail-settings") ?? "null",
        ),
      ),
    )
    .toEqual({
      budgetBytes: 128 * 1024 * 1024,
      attachmentBudgetBytes: 32 * 1024 * 1024,
      backfillEnabled: false,
      pushEnabled: false,
    });
  await dialog
    .getByRole("switch", { name: "Sync this account on this device" })
    .uncheck();
  expect(
    await page.evaluate(
      (accountId) =>
        localStorage.getItem(`inbox-zero:mail-activation:${accountId}`),
      emailAccountId,
    ),
  ).toBe("0");
  await expectDialogWithinViewport(page, dialog);
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "local-storage-settings-saved",
  );
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await page.reload();
  await page
    .getByRole("button", { name: "Local mail settings", exact: true })
    .click();
  await expect(
    dialog.getByLabel("Mail storage (MiB)", { exact: true }),
  ).toHaveValue("128");
  await expect(
    dialog.getByRole("switch", { name: "Download older mail" }),
  ).not.toBeChecked();
  await expect(
    dialog.getByRole("switch", { name: "Sync this account on this device" }),
  ).not.toBeChecked();
  await dialog
    .getByRole("switch", { name: "Sync this account on this device" })
    .check();
  expect(
    await page.evaluate(
      (accountId) =>
        localStorage.getItem(`inbox-zero:mail-activation:${accountId}`),
      emailAccountId,
    ),
  ).toBe("1");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    dialog.getByRole("button", { name: "Save settings", exact: true }),
  ).toBeVisible();
  await expectDialogWithinViewport(page, dialog);
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "local-storage-settings-mobile",
  );
  await dialog
    .getByRole("switch", { name: "Sync this account on this device" })
    .uncheck();
  await dialog
    .getByRole("button", { name: "Clear downloaded mail", exact: true })
    .click();
  const confirmation = page.getByRole("alertdialog");
  await confirmation
    .getByRole("button", { name: "Clear downloads", exact: true })
    .click();
  await expect(
    dialog.getByText("Downloaded mail was removed from this device.", {
      exact: true,
    }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    dialog.getByRole("switch", { name: "Sync this account on this device" }),
  ).not.toBeChecked();
  await expect(
    dialog.getByRole("region", { name: "Local mail status" }),
  ).toContainText("0 messages stored locally");
  await dialog
    .getByText("Downloaded mail was removed from this device.", { exact: true })
    .scrollIntoViewIfNeeded();
  await capturePlaywrightCheckpoint(page, testInfo, "local-storage-cleared");
});

async function expectDialogWithinViewport(page: Page, dialog: Locator) {
  const bounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.y).toBeGreaterThanOrEqual(15);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(
    page.viewportSize()!.height - 15,
  );
  await dialog.evaluate((element) => {
    element.scrollTop = 0;
  });
}
