import { expect } from "@playwright/test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import { getEmailAccountId } from "../account-test-helpers";

test("shows received attachments above the message body", async ({
  page,
}, testInfo) => {
  const emailAccountId = await getEmailAccountId(page);
  await page.goto(
    `/${emailAccountId}/mail?thread-id=thr_playwright_reader_visual`,
  );
  const attachment = page.getByRole("img", { name: "reader-preview.png" });
  await expect(attachment).toBeVisible({ timeout: 120_000 });
  const body = page.locator('iframe[title="Email content preview"]').first();
  await expect(body).toBeVisible();
  const attachmentBox = await attachment.boundingBox();
  const bodyBox = await body.boundingBox();
  expect(attachmentBox).not.toBeNull();
  expect(bodyBox).not.toBeNull();
  expect(attachmentBox!.y + attachmentBox!.height).toBeLessThanOrEqual(
    bodyBox!.y,
  );
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "received-attachments-above-body",
  );
});
