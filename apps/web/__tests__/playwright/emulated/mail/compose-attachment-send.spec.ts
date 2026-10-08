import { readFile } from "node:fs/promises";
import { expect } from "@playwright/test";
import { test } from "../playwright-test";
import {
  conversationWithSubject,
  openMail,
  openMailboxFromSidebar,
  readLatestMailMutation,
} from "./mail-test-helpers";

// Staging an attachment adds three round trips to the send, so this flow is
// slower than the attachment-free send the other compose specs cover.
const ATTACHMENT_SEND_TIMEOUT_MS = 180_000;
const STAGING_TIMEOUT_MS = 90_000;

const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test("sends a new message with an image attachment", async ({
  page,
}, testInfo) => {
  test.setTimeout(ATTACHMENT_SEND_TIMEOUT_MS + 120_000);
  const { conversations, emailAccountId } = await openMail(page);
  const subject = `Image attachment send ${testInfo.retry}`;
  await page.getByRole("button", { name: /^Compose/ }).click();
  const dialog = page.getByRole("dialog", { name: "New Message" });
  await dialog
    .getByRole("combobox", { name: "To", exact: true })
    .fill("recipient@example.com");
  await page.keyboard.press("Enter");
  await dialog.getByPlaceholder("Subject").fill(subject);
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

  // A send that lost the staged file on its way to the provider still
  // reports success, so read the delivered message back off the provider.
  await openMailboxFromSidebar(page, "Sent");
  const sentConversation = conversationWithSubject(
    page,
    conversations,
    subject,
  );
  await expect(sentConversation).toBeVisible({ timeout: 60_000 });
  await sentConversation.click();
  const attachment = page.getByText("image-example.png", { exact: true });
  await expect(attachment).toBeVisible({ timeout: 60_000 });

  const download = page.waitForEvent("download");
  await attachment
    .locator("..")
    .getByRole("button", { name: "Download" })
    .click();
  const savedFile = await download;
  const savedPath = await savedFile.path();
  expect(savedPath).not.toBeNull();
  expect(await readFile(savedPath!)).toEqual(PNG_BYTES);
});
