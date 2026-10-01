import { expect } from "@playwright/test";
import { test } from "../playwright-test";
import { openMail, readLatestMailMutation } from "./mail-test-helpers";

// Staging an attachment adds three round trips to the send, so this flow is
// slower than the attachment-free send the other compose specs cover.
const ATTACHMENT_SEND_TIMEOUT_MS = 180_000;
const STAGING_TIMEOUT_MS = 90_000;

const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test("sends a new message with an image attachment", {
  timeout: ATTACHMENT_SEND_TIMEOUT_MS + 60_000,
}, async ({ page }) => {
  const { emailAccountId } = await openMail(page);
  await page.getByRole("button", { name: /^Compose/ }).click();
  const dialog = page.getByRole("dialog", { name: "New Message" });
  await dialog
    .getByRole("combobox", { name: "To", exact: true })
    .fill("recipient@example.com");
  await page.keyboard.press("Enter");
  await dialog.getByPlaceholder("Subject").fill("Image attachment send");
  await dialog
    .getByRole("textbox", { name: "Email message" })
    .fill("Here is the image.");
  await dialog.getByTestId("compose-attachments-input").setInputFiles({
    name: "image-example.png",
    mimeType: "image/png",
    buffer: PNG_BYTES,
  });
  await expect(dialog.getByRole("list", { name: "Attachments" })).toContainText(
    "image-example.png",
  );

  await dialog.getByRole("button", { name: "Send", exact: true }).click();

  // The composer stays open and reports the failure when staging the
  // attachment fails, so a closed composer is the first signal it worked.
  await expect(dialog).toBeHidden({ timeout: STAGING_TIMEOUT_MS });
  await expect
    .poll(
      () =>
        readLatestMailMutation(page, {
          emailAccountId,
          kind: "reply",
          threadId: "compose:new-message",
        }),
      { timeout: ATTACHMENT_SEND_TIMEOUT_MS },
    )
    .toMatchObject({ status: "succeeded" });
});
