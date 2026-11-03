import { expect } from "@playwright/test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import { conversationWithSubject, openMail } from "../mail/mail-test-helpers";

const SUBJECT = "Project Label Message";

test("attaches the open email to a new side chat", async ({
  page,
}, testInfo) => {
  const { conversations } = await openMail(page);
  await conversationWithSubject(page, conversations, SUBJECT).click();
  await expect(page.getByRole("heading", { name: SUBJECT })).toBeVisible();

  await page.getByRole("button", { name: "Chat about this email" }).click();
  await expect(page.getByTestId("chat-input")).toBeVisible();

  const removeEmail = page.getByRole("button", {
    name: "Remove email from chat",
  });
  await expect(removeEmail).toBeVisible();
  const suggestion = page.getByRole("button", {
    name: "Help me handle my inbox today",
  });
  await expect(suggestion).toHaveCount(0);
  await capturePlaywrightCheckpoint(page, testInfo, "chat-email-context");

  await removeEmail.click();
  await expect(removeEmail).toHaveCount(0);
  await expect(suggestion).toBeVisible();
});
