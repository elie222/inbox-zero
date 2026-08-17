import { expect, test } from "@playwright/test";
import {
  openAttachments,
  resetAttachmentTestState,
  setupAttachmentTestState,
} from "./attachment-test-helpers";

test.beforeEach(async () => {
  await setupAttachmentTestState();
});

test.afterEach(async () => {
  await resetAttachmentTestState();
});

test("uses Drive folders to complete auto-file attachment setup", async ({
  page,
}, testInfo) => {
  test.setTimeout(360_000);
  await openAttachments(page);

  await expect(
    page.getByRole("heading", { name: "Let's set up auto-filing" }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Google Drive", { exact: true })).toBeVisible();
  await expect(page.getByText("Smoke Docs", { exact: true })).toBeVisible({
    timeout: 60_000,
  });

  const createdFolderName = `Playwright Receipts ${process.env.PLAYWRIGHT_RUN_ID}-${testInfo.retry}`;
  await page.getByRole("button", { name: "Add folder" }).click();
  const createFolderDialog = page.getByRole("dialog", {
    name: "Create folder",
  });
  await createFolderDialog.getByLabel("Folder name").fill(createdFolderName);
  await createFolderDialog
    .getByRole("button", { name: "Create folder" })
    .click();
  await expect(page.getByText("Folder created!", { exact: true })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText(createdFolderName, { exact: true })).toBeVisible({
    timeout: 60_000,
  });

  const smokeDocsCheckbox = page.locator("#folder-drv_root_child");
  await smokeDocsCheckbox.click();
  await expect(smokeDocsCheckbox).toBeChecked();

  await page
    .locator('textarea[name="filingPrompt"]')
    .fill("File receipts and invoices in Smoke Docs.");
  const previewButton = page.getByRole("button", {
    name: "Preview with my recent emails",
  });
  await expect(previewButton).toBeEnabled({ timeout: 60_000 });
  await previewButton.click();

  await expectEmptyPreview(page);
  await page.getByRole("button", { name: "Start auto-filing anyway" }).click();

  await expect(
    page.getByRole("heading", { name: "Auto-file attachments" }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Google Drive", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Allowed folders", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Smoke Docs", { exact: true })).toBeVisible();
});

async function expectEmptyPreview(page: Parameters<typeof openAttachments>[0]) {
  const emptyPreview = page.getByText(
    "We couldn't find recent emails with attachments to preview.",
    { exact: true },
  );

  try {
    await expect(emptyPreview).toBeVisible({ timeout: 90_000 });
  } catch {
    await openAttachments(page);
    const previewButton = page.getByRole("button", {
      name: "Preview with my recent emails",
    });
    await expect(previewButton).toBeEnabled({ timeout: 120_000 });
    await previewButton.click();
    await expect(emptyPreview).toBeVisible({ timeout: 120_000 });
  }
}
