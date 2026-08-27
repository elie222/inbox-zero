import { expect, test } from "@playwright/test";
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

  await page.screenshot({
    path: testInfo.outputPath("mail-reader-rich-message.png"),
  });

  await page.getByRole("button", { name: "Show details", exact: true }).click();
  await expect(page.getByText("From:", { exact: true })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("mail-reader-message-details.png"),
  });

  await page.getByRole("button", { name: "Show quoted content" }).click();
  await expect(
    emailFrame.getByText(
      "This earlier quoted message is hidden until expanded.",
    ),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("mail-reader-quoted-content.png"),
  });
});
