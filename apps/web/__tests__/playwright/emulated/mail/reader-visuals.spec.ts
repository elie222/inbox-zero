import { expect } from "@playwright/test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import { conversationWithSubject, openMail } from "./mail-test-helpers";

test("captures the rich message reader states", async ({ page }, testInfo) => {
  const { conversations } = await openMail(page);
  await conversationWithSubject(
    page,
    conversations,
    "Re: Reader Visual Message",
  ).click();

  await expect(
    page.getByRole("heading", { name: "Re: Reader Visual Message" }),
  ).toBeVisible();

  const emailFrame = page.frameLocator('iframe[title="Email content preview"]');
  await expect(
    emailFrame.getByText("The current reply stays concise and easy to scan."),
  ).toBeVisible();
  await expect(
    emailFrame.getByText(
      "This earlier quoted message is hidden until expanded.",
    ),
  ).toHaveCount(0);

  const archiveButton = page.getByRole("button", { name: /^Archive/ });
  await expect(archiveButton.locator("kbd")).toBeHidden();
  await archiveButton.hover();
  await expect(archiveButton.locator("kbd")).toBeVisible();
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "mail-reader-toolbar-shortcut-hover",
  );

  await page.getByRole("button", { name: /^More actions/ }).click();
  await expect(
    page.getByRole("menuitem", { name: "Auto archive future emails" }),
  ).toBeVisible();
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "mail-reader-sender-actions",
  );
  await page.keyboard.press("Escape");

  const attachmentPreview = page.getByRole("img", {
    name: "reader-preview.png",
  });
  await expect(attachmentPreview).toBeVisible();
  await expect
    .poll(() =>
      attachmentPreview.evaluate(
        (image) => (image as HTMLImageElement).naturalWidth,
      ),
    )
    .toBeGreaterThan(0);

  const sentMessage = page
    .getByText("Me", { exact: true })
    .first()
    .locator("..");
  await expect(sentMessage.locator("img")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Show quoted content" }),
  ).toBeVisible();

  await capturePlaywrightCheckpoint(page, testInfo, "mail-reader-rich-message");

  await page.getByRole("button", { name: "Show details", exact: true }).click();
  await expect(page.getByText("From:", { exact: true })).toBeVisible();
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "mail-reader-message-details",
  );

  await page.getByRole("button", { name: "Show quoted content" }).click();
  await expect(
    emailFrame.getByText(
      "This earlier quoted message is hidden until expanded.",
    ),
  ).toBeVisible();
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "mail-reader-quoted-content",
  );
});
